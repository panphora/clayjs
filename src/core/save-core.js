/**
 * save-core.js — Network save functionality
 *
 * This module handles sending page contents to the server.
 * It uses snapshot.js for capturing the DOM state.
 *
 * For full save system with state management, use save.js instead.
 */

import { isEditMode } from "./is-edit-mode.js";
import { consumeUserDriven, consumeExplicitSave, markUserDriven } from "../lib/user-gesture.js";
import { saveToken } from "./host-attrs.js";
import { lastSeenEtag, conditionalSaves, recordEtag } from "./etag.js";
import {
  getPageContents,
  onSnapshot,
  addDocumentTransform
} from "./snapshot.js";

// =============================================================================
// STATE
// =============================================================================

let saveInProgress = false;
const SAVE_PATH = '/_/save';
const SAVE_TIMEOUT_MS = 12000;

/**
 * Check if a save is currently in progress.
 * @returns {boolean}
 */
export function isSaveInProgress() {
  return saveInProgress;
}

// =============================================================================
// RE-EXPORTS FROM SNAPSHOT (for backwards compat)
// =============================================================================

export { getPageContents, onSnapshot, addDocumentTransform };

// =============================================================================
// THE RESULT
// =============================================================================
// One shape from every entry point: {ok, msg, msgType, code, etag}. There used to
// be three shapes — two callback conventions and a hand-built third — which is how
// a skipped save came to be read as a successful one.
//
// `ok` is the OUTCOME: did these bytes reach the server and get accepted. `msgType`
// is the SEVERITY, and it belongs to the server, which can answer a perfectly good
// save with 'warning' (htmlclay does, when an outside process touched the file).
// Reading the severity as the outcome means treating that warning as a failure.

function successResult(data) {
  return {
    ok: true,
    msg: data.msg ?? 'Saved',
    msgType: data.msgType || 'success',
    code: data.code ?? null,
    etag: data.etag ?? null
  };
}

// Set by a save whose fate this client cannot know, and cleared by the next save
// the host actually answers with a write. It exists so a later 412 can say WHY it
// might be refusing a change the person believes is their own, which is the thing
// the old reconcile-on-timeout was for. That reconcile took the host's current
// stamp on the guess that our own write was what moved the document. When the
// guess was wrong the stamp described a peer's bytes this tab had never seen, and
// the next save overwrote them with no refusal and no notice, which is the exact
// loss `conditional` exists to prevent. A stale stamp only ever costs a refusal,
// so the refusal is what this keeps, and the notice explains it instead.
let fateUnknown = false;

/** True while an earlier save may or may not have landed (spec §7). */
export function saveFateIsUnknown() {
  return fateUnknown;
}

function errorResult(err) {
  const timedOut = err.name === 'AbortError';
  // Spec §6: a 412 is a REFUSED save, not a failed one. The host wrote nothing and
  // its document is byte-identical to what it was, and the bytes we tried to write
  // are still on this page. Reporting that as 'error' would give the one outcome
  // where nothing went wrong the one severity that means something did, and would
  // put it through the same retry-and-toast path as a dead server.
  // The status is authoritative (§3), so the 412 alone decides this. Reading `code`
  // as well let any other status claim a conflict, and it bought nothing: a proxy
  // answering 412 with no body carries no code to read, so the fallback never
  // covered the case it was written for. What it did cover was htmlclay's
  // truncation refusal, a 409 that lifts itself within a second, which suspended
  // autosave over a condition that had already cleared.
  const conflicted = !timedOut && err.status === 412;
  return {
    ok: false,
    msg: timedOut ? 'Server not responding' : (err.message || 'Save failed'),
    // A timeout is not evidence the write failed. The request may well have landed,
    // so this reports "we do not know" rather than asserting something false.
    msgType: timedOut ? 'unknown' : (conflicted ? 'conflict' : 'error'),
    code: timedOut ? 'timeout' : (conflicted ? 'conflict' : (err.code ?? null)),
    changedBy: conflicted ? (err.changedBy ?? null) : null,
    // A refusal that may be answering this tab's own timed-out write. Only the
    // notice uses it, and only to word itself; nothing decides anything on it.
    afterTimeout: conflicted && fateUnknown,
    etag: null
  };
}

function skippedResult(msg) {
  return { ok: false, msg, msgType: 'skipped', code: null, etag: null };
}

// =============================================================================
// THE WIRE
// =============================================================================
// One request builder and one response decoder. Keeping two copies of the request
// is what let four separate wire bugs hide at once, each of which had to be found
// twice.

/**
 * Build the save request for this host.
 *
 * htmlclay (the local Go app for .htmlclay files) authenticates each save with a
 * per-file token on the root and carries it in the URL path, so the same token
 * works for fetch and EventSource. The platform and Hyperclay Local authenticate
 * by cookie and use the bare endpoint.
 *
 * A token save asks for no cookies at all. The token IS the credential, and a
 * credentialed cross-origin request needs Access-Control-Allow-Credentials back;
 * a host that mints per-document tokens must never send that header, because
 * `Origin: null` is forgeable and must not buy ambient authority. Asking anyway
 * gets every sandboxed save blocked before it leaves the browser.
 *
 * The endpoint is resolved against the real origin rather than left relative,
 * because a <base href> anywhere in the authored document would otherwise redirect
 * the save — and the per-document token in its path — to an origin the document
 * itself chose.
 *
 * The body is the document, as text, always. Spec §3: this route has exactly one
 * body shape. Everything else about the save travels in a header, which is how
 * §6's `conditional` capability added `If-Match` without touching the body, and
 * how anything later will be added too. There used to be a JSON envelope here
 * carrying the document alongside an unstripped snapshot; the snapshot's home is
 * the §10 relay, which the live-sync plugin already posts it to.
 *
 * @param {string} content - HTML to save
 * @param {boolean} userDriven - Whether a human gesture is behind this save
 * @param {AbortSignal} signal
 * @returns {{url: string, options: Object}}
 */
function buildSaveRequest(content, userDriven, signal) {
  const token = saveToken();
  const path = token ? `${SAVE_PATH}/${token}` : SAVE_PATH;
  const options = {
    method: 'POST',
    credentials: token ? 'omit' : 'same-origin',
    signal,
    headers: {
      'Document-URL': window.location.href,
      // The older spelling of the same header, which htmlclay reads today.
      'Page-URL': window.location.href,
      // Spec §9's name for the provenance bit. `X-Hyperclay-User-Driven` was the
      // pre-spec spelling; every host reads Save-Trigger first and falls back to
      // it, so stored documents running an older client keep working.
      'Save-Trigger': userDriven ? 'user' : 'auto'
    },
    body: content
  };

  // Spec §6: the stamp this tab last saw, so a host that advertises `conditional`
  // can refuse rather than overwrite a version nobody here has read.
  //
  // Two gates, and both are the point. The capability must have been announced by
  // name, because §5 forbids inferring one any other way, and a host that never
  // promised to honour If-Match may do anything at all with it. And a stamp must
  // actually be held: a host reads this header's PRESENCE, so an empty value is
  // not a softer version of the request, it is a save asking to be refused.
  const etag = lastSeenEtag();
  if (conditionalSaves() && etag) options.headers['If-Match'] = etag;

  return { url: resolveSaveUrl(path), options };
}

/**
 * The absolute URL a save goes to.
 *
 * A relative path is resolved by fetch against the DOCUMENT's base URL, which
 * `<base href>` sets and the author of a malleable document controls. Left
 * relative, a `<base href="https://elsewhere.example/">` sends the document and
 * the per-document token in the path to an origin the document picked. Pinning to
 * the real origin is the whole fix.
 *
 * The guard is not defensive noise. `window.location.origin` is the STRING "null"
 * on a file:// document, and `new URL(path, "null")` throws a TypeError, which
 * would escape synchronously here rather than becoming a failed save. Documents
 * opened from disk are a first-class case (an exported app is just a file), and
 * there is no origin to pin to and no host to save to there anyway, so the
 * relative path is both the honest answer and the one that cannot throw.
 *
 * @param {string} path - Root-relative save path
 * @returns {string}
 */
function resolveSaveUrl(path) {
  const origin = window.location.origin;
  if (!origin || origin === "null") return path;
  return new URL(path, origin).href;
}

/**
 * Send one save and decode one response.
 *
 * Resolves with the server's JSON body: `msg` and `msgType` everywhere, plus
 * `code` and `etag` from a host that follows the spec. Rejects with the raw error,
 * carrying the server's message and `code` when it answered at all.
 *
 * The body is read as text and parsed defensively BEFORE the status is consulted.
 * Calling res.json() first meant a 200 with an empty body reported failure over a
 * save that had landed, and a 502 HTML error page surfaced as "Unexpected token '<'"
 * instead of the status.
 *
 * @param {string} content - HTML to save
 * @returns {Promise<Object>} The server's response body
 */
function sendSave(content) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);

  // Read-and-reset the data-guard provenance bit at the ACTUAL send (past the
  // early returns in the callers), so it's never consumed on a save that never
  // ships.
  // Two independent ways a save is human: an edit made in a trusted turn, or a
  // person pressing Save. Both are consumed here, at the one point past every
  // early return, so neither can survive into an unrelated later save.
  const gestureDriven = consumeUserDriven();
  const explicitlyAsked = consumeExplicitSave();
  const userDriven = gestureDriven || explicitlyAsked;
  const { url, options } = buildSaveRequest(content, userDriven, controller.signal);

  return fetch(url, options)
    .then(res => res.text().then(text => {
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          if (res.ok) throw new Error('Server sent a response that was not JSON');
        }
      }
      if (!res.ok) {
        const error = new Error(data.msg || data.error || `HTTP ${res.status}: ${res.statusText}`);
        error.code = data.code ?? null;
        error.status = res.status;
        // Spec §6: a conflict may name what moved the document. Only the host can
        // know, and it often cannot, so this rides through as-is and the notice
        // falls back to a phrase that is true either way.
        error.changedBy = data.changedBy ?? null;
        throw error;
      }
      // The one place a stamp is ever learned from a save (§6). A response with no
      // etag clears it rather than keeping the old one, because the write we just
      // made means any stamp held here describes bytes the host no longer stores.
      recordEtag(data.etag ?? null);
      // A write the host answered: whatever an earlier timeout left uncertain,
      // this document's version is known again.
      fateUnknown = false;
      return data;
    }))
    .catch(err => {
      console.error('Failed to save page:', err);
      // Spec §7: a timeout is INDETERMINATE, so this write may well have landed,
      // and the stamp held here may already describe bytes the host has replaced.
      // The stamp is deliberately NOT reconciled against the host: see fateUnknown
      // above. The old stamp is kept, the next save is refused rather than
      // accepted, and the notice says the refusal may be answering this save.
      if (err.name === 'AbortError') fateUnknown = true;
      // The save never landed: re-arm the user-driven bit so the next (retry)
      // save still reports the human gesture instead of reading as background.
      if (userDriven) markUserDriven();
      throw err;
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

// =============================================================================
// SAVE FUNCTIONS
// =============================================================================

/**
 * Save specific HTML content to the server.
 *
 * Returns a Promise resolving with {msg, msgType, code, etag} — the same object
 * passed to the callback. Never rejects.
 *
 * @param {string} html - HTML string to save
 * @param {Function} callback - Called with the result on completion
 * @returns {Promise<{msg: string, msgType: string, code: ?string, etag: ?string}>}
 *
 * @example
 * const {msg, msgType} = await saveHtml(myHtml);
 * if (msgType === 'error') console.error('Save failed:', msg);
 */
export function saveHtml(html, callback = () => {}) {
  return new Promise((resolve) => {
    const done = (result) => {
      if (typeof callback === 'function') callback(result);
      resolve(result);
    };

    if (!isEditMode && !window.clay?.testMode) {
      return done(skippedResult('Not in edit mode'));
    }
    if (saveInProgress) {
      return done(skippedResult('Save already in progress'));
    }

    saveInProgress = true;

    // Test mode: skip network request, return mock success
    if (window.clay?.testMode) {
      setTimeout(() => {
        saveInProgress = false;
        done(successResult({ msg: 'Test mode: save skipped' }));
      }, 0);
      return;
    }

    sendSave(html)
      .then(successResult, errorResult)
      // Clear the flag BEFORE handing the result back, so a caller that queues a
      // follow-up save can start it immediately rather than being told the lane
      // is busy by the save that just finished.
      .then(result => {
        saveInProgress = false;
        done(result);
      });
  });
}

/**
 * Fetch HTML from a URL and save it to replace the current page.
 *
 * Returns a Promise resolving with {msg, msgType, code, etag}. Never rejects.
 *
 * The fetch status is checked before the body is used: without that, pointing this
 * at a path that 404s saved the server's error page over the user's document.
 *
 * @param {string} url - URL to fetch HTML from
 * @param {Function} callback - Called with the result on completion
 * @returns {Promise<{msg: string, msgType: string, code: ?string, etag: ?string}>}
 */
export function replacePageWith(url, callback = () => {}) {
  return new Promise((resolve) => {
    const done = (result) => {
      if (typeof callback === 'function') callback(result);
      resolve(result);
    };

    if (!isEditMode) return done(skippedResult('Not in edit mode'));
    if (saveInProgress) return done(skippedResult('Save already in progress'));

    // Resolved against the document's real location, not a <base href> the page
    // may have set.
    fetch(new URL(url, window.location.href).href)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Template fetch failed: HTTP ${res.status} ${res.statusText}`);
        }
        return res.text();
      })
      .then(html => saveHtml(html))
      .then(done)
      .catch(err => {
        console.error('Failed to fetch template:', err);
        done(errorResult(err));
      });
  });
}
