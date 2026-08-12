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
  captureForSave,
  beforeSave,
  getPageContents,
  onSnapshot,
  onPrepareForSave
} from "./snapshot.js";

// =============================================================================
// STATE
// =============================================================================

let saveInProgress = false;
const SAVE_ENDPOINT = '/_/save';
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
// INTERNAL: GET PAGE CONTENTS
// =============================================================================

/**
 * Get the current page contents as HTML string for saving.
 * Emits snapshot-ready event for live-sync.
 *
 * @returns {string} HTML string of current page
 */
function getContentsForSave() {
  // Emit for live-sync when actually saving
  return captureForSave({ emitForSync: true });
}

// =============================================================================
// THE WIRE
// =============================================================================
// One request builder and one response decoder, shared by both entry points
// below. They differ only in where the HTML comes from and in the callback shape
// each was born with. Keeping two copies of the request is what let four
// separate wire bugs hide at once, each of which had to be found twice.

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
 * @param {string} content - HTML to save
 * @param {boolean} userDriven - Whether a human gesture is behind this save
 * @param {AbortSignal} signal
 * @returns {{url: string, options: Object}}
 */
function buildSaveRequest(content, userDriven, signal) {
  const token = saveToken();
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
  // out only when the served document DECLARES that transport: this used to key
  // off `location.hostname === 'localhost'`, which sent the envelope to every
  // host that happened to be local, including ones whose save lane takes text
  // and answers 415.
  if (saveTransport() === DESKTOP_JSON && window.__hyperclaySnapshotHtml) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({
      content,
      snapshotHtml: window.__hyperclaySnapshotHtml,
      userDriven
    });
  } else {
    options.body = content;
  }

  return { url: token ? `${SAVE_ENDPOINT}/${token}` : SAVE_ENDPOINT, options };
}

/**
 * Send one save and decode one response.
 *
 * Resolves with the server's JSON body: `msg` and `msgType` everywhere, plus
 * `code` and `etag` from a host that follows the spec. Rejects with the raw
 * error, so each entry point below can keep the error shape its API promised —
 * a server that answered gets its message and its `code` onto the Error.
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
  const userDriven = consumeUserDriven();
  const { url, options } = buildSaveRequest(content, userDriven, controller.signal);

  return fetch(url, options)
    .then(res => res.json().then(data => {
      if (!res.ok) {
        const error = new Error(data.msg || data.error || `HTTP ${res.status}: ${res.statusText}`);
        error.code = data.code ?? null;
        throw error;
      }
      // Clear the snapshot only once the save actually landed (a failed save
      // keeps it so a retry still carries the provenance snapshot).
      window.__hyperclaySnapshotHtml = null;
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
 * Save the current page contents to the server.
 *
 * Returns a Promise that resolves with {msg, msgType, code, etag} — the same
 * object passed to the callback. Promise never rejects; errors resolve with
 * msgType: 'error', skipped early-returns resolve with msgType: 'skipped'.
 * `code` and `etag` are null on a host that does not send them.
 *
 * @param {Function} callback - Called with {msg, msgType, code, etag} on completion
 *   msgType will be 'success', 'error', or 'skipped'
 * @returns {Promise<{msg: string, msgType: string, code: ?string, etag: ?string}>}
 *
 * @example
 * // Callback form (unchanged)
 * savePage(({msg, msgType}) => {
 *   if (msgType === 'error') console.error('Save failed:', msg);
 * });
 *
 * @example
 * // Promise form
 * const {msg, msgType} = await savePage();
 * if (msgType === 'error') console.error('Save failed:', msg);
 */
export function savePage(callback = () => {}) {
  return new Promise((resolve) => {
    if (saveInProgress) {
      const skipped = { msg: 'Save already in progress', msgType: 'skipped' };
      callback(skipped);
      return resolve(skipped);
    }
    if (!isEditMode && !window.clay?.testMode) {
      const skipped = { msg: 'Not in edit mode', msgType: 'skipped' };
      callback(skipped);
      return resolve(skipped);
    }

    let currentContents;
    try {
      currentContents = getContentsForSave();
    } catch (err) {
      console.error('savePage: getContentsForSave failed', err);
      const result = { msg: err.message, msgType: "error" };
      callback(result);
      return resolve(result);
    }
    saveInProgress = true;

    // Test mode: skip network request, return mock success
    if (window.clay?.testMode) {
      setTimeout(() => {
        saveInProgress = false;
        const result = { msg: "Test mode: save skipped", msgType: "success" };
        if (typeof callback === 'function') {
          callback(result);
        }
        resolve(result);
      }, 0);
      return;
    }

    sendSave(currentContents)
      .then(data => {
        const result = {
          msg: data.msg,
          msgType: data.msgType || 'success',
          code: data.code ?? null,
          etag: data.etag ?? null
        };
        if (typeof callback === 'function') {
          callback(result);
        }
        resolve(result);
      })
      .catch(err => {
        const msg = err.name === 'AbortError'
          ? 'Server not responding'
          : 'Save failed';

        const result = { msg, msgType: "error", code: err.code ?? null, etag: null };
        if (typeof callback === 'function') {
          callback(result);
        }
        resolve(result);
      })
      .finally(() => {
        saveInProgress = false;
      });
  });
}

/**
 * Save specific HTML content to the server.
 *
 * Returns a Promise that resolves with {err, data} — same arguments
 * passed to the callback. Promise never rejects; errors resolve with
 * truthy err. Skipped early-returns resolve with data.msgType: 'skipped'.
 *
 * @param {string} html - HTML string to save
 * @param {Function} callback - Called with (err, data) on completion
 * @returns {Promise<{err: ?Error, data: ?{msg: string, msgType: string}}>}
 *
 * @example
 * // Callback form (unchanged)
 * saveHtml(myHtml, (err, data) => {
 *   if (err) console.error('Save failed:', err);
 * });
 *
 * @example
 * // Promise form
 * const {err, data} = await saveHtml(myHtml);
 * if (err) console.error('Save failed:', err);
 */
export function saveHtml(html, callback = () => {}) {
  return new Promise((resolve) => {
    if (!isEditMode || saveInProgress) {
      const data = {
        msg: saveInProgress ? 'Save already in progress' : 'Not in edit mode',
        msgType: 'skipped'
      };
      callback(null, data);
      return resolve({ err: null, data });
    }

    saveInProgress = true;

    // Test mode: skip network request, return mock success
    if (window.clay?.testMode) {
      setTimeout(() => {
        saveInProgress = false;
        const data = { msg: "Test mode: save skipped", msgType: "success" };
        if (typeof callback === 'function') {
          callback(null, data);
        }
        resolve({ err: null, data });
      }, 0);
      return;
    }

    sendSave(html)
      .then(data => {
        if (typeof callback === 'function') {
          callback(null, data);
        }
        resolve({ err: null, data });
      })
      .catch(err => {
        // Normalize timeout errors
        const error = err.name === 'AbortError'
          ? new Error('Server not responding')
          : err;

        if (typeof callback === 'function') {
          callback(error);
        }
        resolve({ err: error, data: null });
      })
      .finally(() => {
        saveInProgress = false;
      });
  });
}

/**
 * Fetch HTML from a URL and save it to replace the current page.
 *
 * Returns a Promise that resolves with {err, data} — same arguments
 * passed to the callback. Promise never rejects.
 *
 * @param {string} url - URL to fetch HTML from
 * @param {Function} callback - Called with (err, data) on completion
 * @returns {Promise<{err: ?Error, data: ?{msg: string, msgType: string}}>}
 *
 * @example
 * // Callback form (unchanged)
 * replacePageWith('/templates/blog.html', (err, data) => {
 *   if (err) console.error('Failed:', err);
 *   else window.location.reload();
 * });
 *
 * @example
 * // Promise form
 * const {err, data} = await replacePageWith('/templates/blog.html');
 * if (!err) window.location.reload();
 */
export function replacePageWith(url, callback = () => {}) {
  return new Promise((resolve) => {
    if (!isEditMode || saveInProgress) {
      const data = {
        msg: saveInProgress ? 'Save already in progress' : 'Not in edit mode',
        msgType: 'skipped'
      };
      callback(null, data);
      return resolve({ err: null, data });
    }

    fetch(url)
      .then(res => res.text())
      .then(html => {
        saveHtml(html, (err, data) => {
          if (typeof callback === 'function') {
            callback(err, data);
          }
          resolve({ err: err || null, data: data || null });
        });
      })
      .catch(err => {
        console.error('Failed to fetch template:', err);
        if (typeof callback === 'function') {
          callback(err);
        }
        resolve({ err, data: null });
      });
  });
}
