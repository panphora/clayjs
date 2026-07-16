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
const saveEndpoint = '/_/save';

/**
 * Check if a save is currently in progress.
 * @returns {boolean}
 */
export function isSaveInProgress() {
  return saveInProgress;
}

/**
 * Resolve the save endpoint for the current host.
 *
 * htmlclay (the local Go app for .htmlclay files) authenticates each save with
 * a per-file token injected as the `htmlclaytoken` attribute on <html>, and
 * carries it in the URL path so the same token works for fetch and EventSource.
 * When that attribute is present, save to `/_/save/{token}`; otherwise use the
 * bare `/_/save` (platform and Hyperclay Local, which authenticate by cookie).
 *
 * @returns {string} The endpoint URL for the current save.
 */
function getSaveEndpoint() {
  const htmlclayToken = document.documentElement.getAttribute('htmlclaytoken');
  return htmlclayToken ? `${saveEndpoint}/${htmlclayToken}` : saveEndpoint;
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
// SAVE FUNCTIONS
// =============================================================================

/**
 * Save the current page contents to the server.
 *
 * Returns a Promise that resolves with {msg, msgType} — the same object
 * passed to the callback. Promise never rejects; errors resolve with
 * msgType: 'error', skipped early-returns resolve with msgType: 'skipped'.
 *
 * @param {Function} callback - Called with {msg, msgType} on completion
 *   msgType will be 'success', 'error', or 'skipped'
 * @returns {Promise<{msg: string, msgType: string}>}
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

    // Add timeout - abort if server doesn't respond within 12 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    // Check if running on Hyperclay Local - send JSON with both versions for platform sync
    const isHyperclayLocal = window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';

    // Read-and-reset the data-guard provenance bit at the ACTUAL send (past the
    // early returns above), so it's never consumed on a save that never ships.
    const userDriven = consumeUserDriven();

    const fetchOptions = {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Page-URL': window.location.href, 'X-Hyperclay-User-Driven': userDriven ? '1' : '0' }
    };

    if (isHyperclayLocal && window.__hyperclaySnapshotHtml) {
      // Send JSON with both stripped content and full snapshot for platform live sync
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify({
        content: currentContents,
        snapshotHtml: window.__hyperclaySnapshotHtml,
        userDriven
      });
    } else {
      // Platform: send plain text as before
      fetchOptions.body = currentContents;
    }

    fetch(getSaveEndpoint(), fetchOptions)
      .then(res => {
        clearTimeout(timeoutId);
        return res.json().then(data => {
          if (!res.ok) {
            throw new Error(data.msg || data.error || `HTTP ${res.status}: ${res.statusText}`);
          }
          return data;
        });
      })
      .then(data => {
        // Clear the snapshot only once the save actually landed (a failed save
        // keeps it so a retry still carries the provenance snapshot).
        window.__hyperclaySnapshotHtml = null;
        const result = { msg: data.msg, msgType: data.msgType || 'success' };
        if (typeof callback === 'function') {
          callback(result);
        }
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('Failed to save page:', err);

        // The save never landed: re-arm the user-driven bit so the next (retry)
        // save still reports the human gesture instead of reading as background.
        if (userDriven) markUserDriven();

        const msg = err.name === 'AbortError'
          ? 'Server not responding'
          : 'Save failed';

        const result = { msg, msgType: "error" };
        if (typeof callback === 'function') {
          callback(result);
        }
        resolve(result);
      })
      .finally(() => {
        clearTimeout(timeoutId);
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

    // Add timeout - abort if server doesn't respond within 12 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    // Check if running on Hyperclay Local - send JSON with both versions for platform sync
    const isHyperclayLocal = window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';

    const userDriven = consumeUserDriven();

    const fetchOptions = {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Page-URL': window.location.href, 'X-Hyperclay-User-Driven': userDriven ? '1' : '0' }
    };

    if (isHyperclayLocal && window.__hyperclaySnapshotHtml) {
      // Send JSON with both stripped content and full snapshot for platform live sync
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify({
        content: html,
        snapshotHtml: window.__hyperclaySnapshotHtml,
        userDriven
      });
    } else {
      // Platform: send plain text as before
      fetchOptions.body = html;
    }

    fetch(getSaveEndpoint(), fetchOptions)
      .then(res => {
        clearTimeout(timeoutId);
        return res.json().then(data => {
          if (!res.ok) {
            throw new Error(data.msg || data.error || `HTTP ${res.status}: ${res.statusText}`);
          }
          return data;
        });
      })
      .then(data => {
        // Clear the snapshot only once the save actually landed (a failed save
        // keeps it so a retry still carries the provenance snapshot).
        window.__hyperclaySnapshotHtml = null;
        if (typeof callback === 'function') {
          callback(null, data);
        }
        resolve({ err: null, data });
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.error('Failed to save page:', err);

        // The save never landed: re-arm the user-driven bit so the next (retry)
        // save still reports the human gesture instead of reading as background.
        if (userDriven) markUserDriven();

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
        clearTimeout(timeoutId);
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
