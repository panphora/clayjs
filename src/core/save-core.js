/**
 * save-core.js — Network save functionality
 *
 * This module handles sending page contents to the server.
 * It uses snapshot.js for capturing the DOM state.
 *
 * For full save system with state management, use save.js instead.
 */

import { isEditMode } from "./is-edit-mode.js";
import { consumeUserDriven, markUserDriven } from "../lib/user-gesture.js";
import { saveToken, saveTransport, DESKTOP_JSON } from "./host-attrs.js";
import {
  beforeSave,
  getPageContents,
  onSnapshot,
  onPrepareForSave
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

export { beforeSave, getPageContents, onSnapshot, onPrepareForSave };

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

function errorResult(err) {
  const timedOut = err.name === 'AbortError';
  return {
    ok: false,
    msg: timedOut ? 'Server not responding' : (err.message || 'Save failed'),
    // A timeout is not evidence the write failed. The request may well have landed,
    // so this reports "we do not know" rather than asserting something false.
    msgType: timedOut ? 'unknown' : 'error',
    code: timedOut ? 'timeout' : (err.code ?? null),
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
 * @param {string} content - HTML to save
 * @param {?string} snapshotHtml - unstripped snapshot, for the desktop envelope
 * @param {boolean} userDriven - Whether a human gesture is behind this save
 * @param {AbortSignal} signal
 * @returns {{url: string, options: Object}}
 */
function buildSaveRequest(content, snapshotHtml, userDriven, signal) {
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
      'X-Hyperclay-User-Driven': userDriven ? '1' : '0'
    }
  };

  // The desktop JSON envelope carries the unstripped snapshot alongside the
  // document, so a sync engine can replay what the browser actually had. It goes
  // out only when the served document DECLARES that transport, and it is passed in
  // from the capture that produced `content` — it used to be left on a window
  // global that was cleared only on success, so two captures without an intervening
  // successful save would pair a stale snapshot with fresh content.
  if (saveTransport() === DESKTOP_JSON && snapshotHtml) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ content, snapshotHtml, userDriven });
  } else {
    options.body = content;
  }

  return { url: new URL(path, window.location.origin).href, options };
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
 * @param {?string} snapshotHtml
 * @returns {Promise<Object>} The server's response body
 */
function sendSave(content, snapshotHtml) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);

  // Read-and-reset the data-guard provenance bit at the ACTUAL send (past the
  // early returns in the callers), so it's never consumed on a save that never
  // ships.
  const userDriven = consumeUserDriven();
  const { url, options } = buildSaveRequest(content, snapshotHtml, userDriven, controller.signal);

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
        throw error;
      }
      return data;
    }))
    .catch(err => {
      console.error('Failed to save page:', err);
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
 * @param {Object} [options]
 * @param {?string} [options.snapshotHtml] - unstripped snapshot from the same capture
 * @returns {Promise<{msg: string, msgType: string, code: ?string, etag: ?string}>}
 *
 * @example
 * const {msg, msgType} = await saveHtml(myHtml);
 * if (msgType === 'error') console.error('Save failed:', msg);
 */
export function saveHtml(html, callback = () => {}, { snapshotHtml = null } = {}) {
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

    sendSave(html, snapshotHtml)
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
