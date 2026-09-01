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
import { hostMeta } from "./host-meta.js";
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

// =============================================================================
// THE ATTEMPT ID (spec §6, `receipts`)
// =============================================================================
// A save that times out leaves two questions open at once: did our write land,
// and did somebody else write. The client cannot answer either from the outside.
// Guessing "it was me" is what the old reconcile-on-timeout did, and when the
// guess was wrong it adopted a stamp describing a peer's bytes this tab had never
// seen, so the next save overwrote them with no refusal and no notice. Refusing to
// guess is safe but shows a person a conflict bar for a few seconds of bad wifi.
//
// So this tab stamps every attempt with an opaque id and asks the host the one
// question only the host can answer: are the bytes you are storing the ones this
// save sent? A host that answers turns an indeterminate save into a determinate
// one, and the person sees nothing at all.
//
// The ids this tab has sent, newest last. A 412 carrying one of them is the host
// saying "your OWN earlier save is what moved this document", which is a late
// duplicate and not a conflict with anybody. Bounded because it is only ever
// searched for a recent send.
const sentIds = [];
const SENT_ID_MEMORY = 8;

// The attempt whose answer never arrived, or null. It holds only what is needed to
// ask about it later: which id it carried, and which stamp it was sent against.
//
// It survives ONLY while the question is genuinely open. A host that answers, in
// either direction, closes it, which is what keeps the conflict bar from claiming
// a refusal might be the person's own save when the host has already said it is
// not. An unreachable host leaves it set, and that is the honest old behaviour:
// the stamp is kept, the next save is refused rather than accepted, and the notice
// says so.
let unknownAttempt = null;

/** True while an earlier save may or may not have landed (spec §7). */
export function saveFateIsUnknown() {
  return unknownAttempt !== null;
}

/**
 * A fresh id for one save attempt.
 *
 * Uniqueness per attempt is the whole property: two tabs sharing an id would each
 * read the other's receipt as proof of their own write. `getRandomValues` into a
 * zeroed array is the failure that would do exactly that, silently, so a missing
 * crypto implementation falls back to something random rather than to zeros.
 */
function mintSaveId() {
  const uuid = window.crypto?.randomUUID?.();
  if (uuid) return uuid;
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }
  // Three segments, not one: §6 asks for at least 128 bits, and one `Math.random()`
  // truncated to ten base-36 characters carries about 52. A timestamp is not entropy,
  // so it cannot make up the difference between two tabs minting in the same
  // millisecond, which is the collision that matters.
  const segment = () => Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `${Date.now().toString(36)}-${segment()}${segment()}${segment()}`;
}

function rememberSentId(saveId) {
  sentIds.push(saveId);
  if (sentIds.length > SENT_ID_MEMORY) sentIds.shift();
}

/**
 * Did this tab send this id at all?
 *
 * The weaker of the two questions asked of a receipt, and it belongs only to the
 * late-duplicate rule: a 412 naming ANY id this tab sent means this tab's own
 * earlier save is what moved the document, which is enough to adopt that stamp and
 * send again, because sending again is all that follows. It is never enough to
 * conclude that a particular save landed. That needs identity with that save's own
 * id, which is what recoverUnknownSave asks.
 */
function sentByThisTab(saveId) {
  return typeof saveId === "string" && saveId !== "" && sentIds.includes(saveId);
}

/** Test-only: forget every id and any open question. */
export function resetSaveAttempts() {
  sentIds.length = 0;
  unknownAttempt = null;
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
    afterTimeout: conflicted && unknownAttempt !== null,
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
 * @param {string} saveId - this attempt's §6 receipt id
 * @param {?string} etag - the stamp to send as If-Match, or null
 * @returns {{url: string, options: Object}}
 */
function buildSaveRequest(content, userDriven, signal, saveId, etag) {
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
      'Save-Trigger': userDriven ? 'user' : 'auto',
      // Spec §6 (`receipts`): which attempt this is. Sent to every host, because a
      // host that does not implement receipts ignores an unknown header, and
      // gating it on discovery would mean holding the save until an async lookup
      // resolved. Nothing is inferred from the header being accepted: only a host
      // that ANSWERS with the id has said anything.
      'Save-ID': saveId
    },
    body: content
  };

  if (etag) options.headers['If-Match'] = etag;

  return { url: resolveSaveUrl(path), options };
}

/**
 * The stamp to send as If-Match, or null for a save that goes out unconditional.
 *
 * Two gates, and both are the point. The capability must have been announced by
 * name, because §5 forbids inferring one any other way, and a host that never
 * promised to honour If-Match may do anything at all with it. And a stamp must
 * actually be held: a host reads the header's PRESENCE, so an empty value is not a
 * softer version of the request, it is a save asking to be refused.
 */
function stampToSend() {
  const etag = lastSeenEtag();
  return conditionalSaves() && etag ? etag : null;
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
function sendOnce(content, saveId, etag) {
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
  const { url, options } = buildSaveRequest(content, userDriven, controller.signal, saveId, etag);
  rememberSentId(saveId);

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
        // §6: the stamp of the bytes that caused the refusal, and the receipt for
        // them. Both are what let a refusal be recovered from instead of merely
        // reported: the stamp is what the retry has to carry, and the receipt says
        // whether the document was moved by this tab's own earlier save.
        error.etag = data.etag ?? null;
        error.saveId = data.saveId ?? null;
        throw error;
      }
      // The one place a stamp is ever learned from a save (§6). A response with no
      // etag clears it rather than keeping the old one, because the write we just
      // made means any stamp held here describes bytes the host no longer stores.
      recordEtag(data.etag ?? null);
      // A write the host answered: whatever an earlier timeout left uncertain,
      // this document's version is known again.
      unknownAttempt = null;
      return data;
    }))
    .catch(err => {
      console.error('Failed to save page:', err);
      // Spec §7: a timeout is INDETERMINATE. The stamp is deliberately NOT
      // reconciled against the host here; what this records is the question, so
      // recovery below can ask it. The old code adopted the host's current stamp
      // on the guess that our own write was what moved the document, which was
      // wrong exactly when somebody else wrote.
      if (err.name === 'AbortError') unknownAttempt = { saveId, etag };
      // The save never landed: re-arm the user-driven bit so the next (retry)
      // save still reports the human gesture instead of reading as background.
      if (userDriven) markUserDriven();
      throw err;
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

/**
 * Ask the host what became of the attempt whose answer never arrived (spec §7).
 *
 * One question, one round trip, and only two things to do with the answer:
 *
 *   - the host's receipt is ours, so the bytes it stores are the ones this save
 *     sent. The save landed. Adopt the stamp for those bytes and report success:
 *     the person sees a save that worked, because one did.
 *   - anything else, including a host that keeps no receipts at all: send the save
 *     again, under the ORIGINAL If-Match.
 *
 * The second case looks like it needs to know more than it does, and it does not,
 * because the stamp is what makes it safe. If our write did land, the stamp is now
 * stale and the re-send is REFUSED, carrying the host's receipt for the bytes that
 * refused it; that receipt is ours, and the late-duplicate rule in sendSave turns
 * it back into a finished save without a word to anybody. If somebody else wrote,
 * the same refusal carries their bytes and becomes an honest conflict. And if
 * nothing landed, the stamp still matches and the save simply goes through.
 *
 * So there is no branch here that guesses. Every outcome is decided by a host
 * answering a conditional request, which is the one thing in this protocol that
 * cannot be wrong.
 *
 * A host that cannot be reached leaves the question open, which is the older
 * behaviour and the honest one: the stamp is kept, the next save is refused rather
 * than accepted, and the notice says the refusal may be answering this tab's own
 * timed-out save.
 *
 * @returns {Promise<{landed: ?Object, resend: boolean}>}
 */
async function recoverUnknownSave() {
  const attempt = unknownAttempt;
  if (!attempt) return { landed: null, resend: false };

  const meta = await hostMeta({ fresh: true });
  const doc = meta.document;
  const stored = typeof doc?.etag === 'string' && doc.etag ? doc.etag : null;
  if (!stored) return { landed: null, resend: false };

  // THIS attempt's id, and no other. A receipt is proof about the save that carried
  // that exact id, so an earlier save of this same tab naming itself proves only
  // that the earlier save landed, which is a thing already known and says nothing
  // about this one. Matching any id this tab has sent turns the most ordinary
  // failure there is, a request that never left the browser, into a reported
  // success: the tab shows Saved, advances its baselines, drops the close warning,
  // and the bytes are on no disk anywhere. Membership is the right test one line
  // down in sendSave, where a 412 only ever leads to another conditional send.
  if (doc.saveId && doc.saveId === attempt.saveId) {
    // Proof, not inference: the host is saying the bytes it stores are the stored
    // form of the body THIS save sent. §6 lets a client adopt a stamp on exactly that.
    recordEtag(stored);
    unknownAttempt = null;
    return { landed: { msg: 'Saved', msgType: 'success', etag: stored }, resend: false };
  }

  // Positive proof, and nothing weaker, closes the question. A non-empty id that is
  // not ours names another save as the author of these bytes. An ABSENT id proves
  // nothing at all: §6 lets a host lose its pair to a restart or an eviction and stay
  // conforming, so a host that keeps receipts can report none for bytes this tab
  // really did write. Reading absence as "somebody else wrote" makes the notice tell
  // a person their own save was somebody else's change.
  if (doc.saveId) unknownAttempt = null;

  // The re-send carries the stamp the ORIGINAL save carried, which is the normative
  // rule and not a detail: the stamp this tab holds is mutable and moves for reasons
  // that have nothing to do with this save, because a disk-sourced live-sync frame
  // records the stamp of the bytes it applied. Re-sending under that one is a write
  // conditional on a version this save was never judged against, and the host accepts
  // it, replacing bytes the person has just been shown with bytes captured before
  // they arrived.
  //
  // No stamp at all means there is nothing to re-send under, so nothing is re-sent.
  // An unconditional recovery write has no comparison to refuse it and would replace
  // whatever landed while this tab was waiting, which is the loss this whole
  // capability exists to prevent.
  return { landed: null, resend: !!attempt.etag, etag: attempt.etag };
}

/**
 * Send one save, and see it through.
 *
 * Two things can happen that are not the save's own outcome, and both are handled
 * here rather than reported:
 *
 *   - the request timed out, so the host is asked what became of it,
 *   - the host refused with a receipt this tab recognises, which means its own
 *     earlier save is what moved the document. That is a late duplicate, not a
 *     conflict with anybody: take the stamp the refusal handed back and finish
 *     the save that was refused.
 *
 * Each recovery sends at most one further request, so a save can never loop.
 *
 * @param {string} content - HTML to save
 * @returns {Promise<Object>} The server's response body
 */
async function sendSave(content) {
  // The re-send below is a RETRY of this attempt, so it carries this same id:
  // whichever of the two requests the host ends up storing, its receipt then
  // answers for this save. A fresh id on the re-send would leave the first
  // request's landing unprovable.
  let saveId = mintSaveId();
  let etag = stampToSend();
  // Each recovery runs at most once, and they are counted apart because they are
  // different things. Re-sending after a timeout is worth doing once: a second
  // timeout says the host is not answering this document in time, and sending a
  // whole document a third time will not change that. Resolving a late duplicate
  // is fast and conclusive, so it gets its own turn regardless.
  let reSent = false;
  let duplicateResolved = false;
  for (;;) {
    try {
      return await sendOnce(content, saveId, etag);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (reSent) throw err;
        const { landed, resend, etag: original } = await recoverUnknownSave();
        if (landed) return landed;
        if (!resend) throw err;
        // Explicitly the original, never `stampToSend()` again.
        etag = original;
        reSent = true;
        continue;
      }

      if (err.status === 412 && !duplicateResolved && sentByThisTab(err.saveId)) {
        // Our own earlier save is what the host is refusing us against: a late
        // duplicate, not a conflict with anybody. Adopt the stamp for those bytes
        // and send the current ones on top of it. The retry is still conditional,
        // so anything that arrives in between still refuses it.
        recordEtag(err.etag ?? null);
        unknownAttempt = null;
        saveId = mintSaveId();
        // A new attempt, deliberately on the base the host just proved is this tab's
        // own work, rather than on the stamp the refused attempt carried.
        etag = stampToSend();
        duplicateResolved = true;
        continue;
      }

      throw err;
    }
  }
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
