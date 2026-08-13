/**
 * Save system for clayjs
 *
 * Manual save with change detection, state management,
 * keyboard shortcuts, and save button support.
 *
 * For auto-save on DOM changes, also load the 'autosave' module.
 *
 * Built on top of save-core.js
 */

import throttle from "../lib/throttle.js";
import Mutation from "../lib/mutation.js";
import { isEditMode, isOwner } from "./is-edit-mode.js";
import {
  saveHtml,
  getPageContents,
  replacePageWith as replacePageWithCore,
  addDocumentTransform,
  isSaveInProgress
} from "./save-core.js";
import { captureForComparison, captureForSaveAndComparison } from "./snapshot.js";
import { logSaveCheck, logBaseline } from "../lib/autosave-debug.js";

// Reset savestatus to 'saved' in snapshots (each module cleans up its own attrs)
addDocumentTransform(clone => {
  clone.setAttribute('savestatus', 'saved');
});

// ============================================
// SAVE STATE MANAGEMENT
// ============================================

let savingTimeout = null;

/**
 * Sets the save status on <html> and dispatches an event.
 *
 * @param {string} state - One of: 'saving', 'saved', 'offline', 'error'
 * @param {string} msg - Optional message (e.g., error details)
 * @param {string} msgType - Optional severity from the server (e.g., 'warning')
 */
function setSaveState(state, msg = '', msgType = '') {
  if (savingTimeout) {
    clearTimeout(savingTimeout);
    savingTimeout = null;
  }

  document.documentElement.setAttribute('savestatus', state);

  const event = new CustomEvent(`clay:save-${state}`, {
    detail: { msg, msgType, timestamp: Date.now() }
  });
  document.dispatchEvent(event);
}

/**
 * Sets DOM state to 'offline' immediately, but does NOT fire an event.
 * Used for instant UI feedback before we know the final state.
 */
function setOfflineStateQuiet() {
  if (savingTimeout) {
    clearTimeout(savingTimeout);
    savingTimeout = null;
  }
  document.documentElement.setAttribute('savestatus', 'offline');
}

/**
 * Starts a debounced 'saving' state.
 * Only shows 'saving' if the save takes longer than 500ms.
 * This prevents UI flicker on fast saves.
 */
function setSavingState() {
  savingTimeout = setTimeout(() => {
    setSaveState('saving');
  }, 500);
}

// ============================================
// OFFLINE DETECTION
// ============================================

window.addEventListener('offline', () => {
  setOfflineStateQuiet();
});

window.addEventListener('online', () => {
  if (document.documentElement.getAttribute('savestatus') === 'offline') {
    savePage();
  }
});

// ============================================
// THE BASELINE IS THE BYTES WE SENT
// ============================================
// There is deliberately no post-save re-read of the live DOM here.
//
// One used to exist, because [onaftersave] handlers mutate the page after a save
// lands (cacheBust rewrites ?v= query params) and without it the page read dirty
// forever. But a re-read cannot tell that churn apart from something the user typed
// while the request was in flight, so it recorded those keystrokes as saved without
// ever sending them: the edit was gone, with no error, no dirty flag, and no
// close-tab warning.
//
// Post-save mutators are made invisible to the comparison instead — they mark what
// they touch `no-trigger-autosave`, which strips it from every comparison capture
// (see cache-bust.js and refetch-on-save.js). That leaves the baseline free to stay
// exactly what savePage sent, which is the only value that is true by construction.

// Re-export from core for backward compatibility
export { addDocumentTransform, getPageContents };

let unsavedChanges = false;
let lastSavedContents = '';
// A save was requested while one was on the wire; run one more when it settles.
let pendingSave = false;

function skipped_(msg) {
  return { ok: false, msg, msgType: 'skipped', code: null, etag: null };
}

/**
 * Apply one save result to the page's state.
 *
 * A 'skipped' result means the bytes never reached the wire, so the baseline must
 * NOT advance: recording content as saved when it was never sent is the same defect
 * as re-reading the live DOM after a save, one layer down. 'unknown' is a timeout,
 * where the write may or may not have landed, so it is not treated as success
 * either.
 */
function applySaveResult(result, forComparison, label) {
  if (result.ok) {
    lastSavedContents = forComparison;
    unsavedChanges = false;
    // The server's severity rides through untouched: a save can land AND carry a
    // warning, and the UI module is what decides how to render that.
    setSaveState('saved', result.msg || 'Saved', result.msgType);
    logBaseline(label, `${lastSavedContents.length} chars`);
  } else if (result.msgType !== 'skipped') {
    if (!navigator.onLine) {
      setSaveState('offline', result.msg);
    } else {
      setSaveState('error', result.msg);
    }
  }
}

// Run the save that arrived while this one was in flight. savePage does its own
// dirty check, so if nothing actually changed it resolves 'skipped' and stops:
// this cannot spin.
function drainPendingSave() {
  if (!pendingSave) return;
  pendingSave = false;
  savePage();
}

// State accessors for autosave module
export function getUnsavedChanges() { return unsavedChanges; }
export function setUnsavedChanges(val) { unsavedChanges = val; }
export function getLastSavedContents() { return lastSavedContents; }
export function setLastSavedContents(val) { lastSavedContents = val; }

/**
 * Save the current page with change detection and state management.
 *
 * Returns a Promise that resolves with {msg, msgType} — the same object
 * passed to the callback. Promise never rejects; errors resolve with
 * msgType: 'error', skipped early-returns resolve with msgType: 'skipped'.
 *
 * @param {Function} callback - Optional callback for custom handling
 * @returns {Promise<{msg: string, msgType: string}>}
 */
export function savePage(callback = () => {}) {
  return new Promise((resolve) => {
    if (!isEditMode && !window.clay?.testMode) {
      const skipped = skipped_('Not in edit mode');
      callback(skipped);
      return resolve(skipped);
    }

    // A save is already on the wire. Remember that a newer state is waiting rather
    // than dropping it: the in-flight request carries the older bytes, and if no
    // further mutation happens to retrigger autosave, the newer ones would never
    // reach disk at all.
    if (isSaveInProgress()) {
      pendingSave = true;
      const skipped = skipped_('Save already in progress');
      callback(skipped);
      return resolve(skipped);
    }

    // Check if offline - set DOM state immediately for UI feedback
    // but still try the fetch (navigator.onLine can be wrong)
    const wasOffline = !navigator.onLine;
    if (wasOffline) {
      setOfflineStateQuiet();
    }

    // Single capture: clone once, get both versions
    // forSave strips non-persisted regions ([no-save]/[save-remove])
    // forComparison additionally strips every autosave-off region
    let forSave, forComparison, snapshotHtml;
    try {
      ({ forSave, forComparison, snapshotHtml } = captureForSaveAndComparison());
    } catch (err) {
      console.error('savePage: captureForSaveAndComparison failed', err);
      setSaveState('error', err.message);
      const result = { msg: err.message, msgType: 'error', code: null, etag: null };
      if (typeof callback === 'function') {
        callback(result);
      }
      return resolve(result);
    }

    // Compare directly - lastSavedContents is already stripped
    unsavedChanges = (forComparison !== lastSavedContents);
    logSaveCheck('savePage dirty check', !unsavedChanges);

    // Skip if content hasn't changed
    if (!unsavedChanges) {
      const skipped = skipped_('No changes to save');
      callback(skipped);
      return resolve(skipped);
    }

    // Start debounced 'saving' state (only shows if save takes >500ms)
    setSavingState();

    // Use saveHtml directly with our pre-captured content (avoids double capture)
    saveHtml(forSave, (result) => {
      applySaveResult(result, forComparison, 'updated after save');
      if (typeof callback === 'function') {
        callback(result);
      }
      resolve(result);
      drainPendingSave();
    }, { snapshotHtml });
  });
}

/**
 * Force-save the current page (skips dirty check).
 *
 * @param {Function} callback - Optional callback for custom handling
 * @returns {Promise<{msg: string, msgType: string}>}
 */
export function savePageForce(callback = () => {}) {
  return new Promise((resolve) => {
    if (!isEditMode && !window.clay?.testMode) {
      const skipped = skipped_('Not in edit mode');
      callback(skipped);
      return resolve(skipped);
    }

    if (isSaveInProgress()) {
      pendingSave = true;
      const skipped = skipped_('Save already in progress');
      callback(skipped);
      return resolve(skipped);
    }

    const wasOffline = !navigator.onLine;
    if (wasOffline) {
      setOfflineStateQuiet();
    }

    let forSave, forComparison, snapshotHtml;
    try {
      ({ forSave, forComparison, snapshotHtml } = captureForSaveAndComparison());
    } catch (err) {
      console.error('savePageForce: captureForSaveAndComparison failed', err);
      setSaveState('error', err.message);
      const result = { msg: err.message, msgType: 'error', code: null, etag: null };
      if (typeof callback === 'function') {
        callback(result);
      }
      return resolve(result);
    }

    setSavingState();

    saveHtml(forSave, (result) => {
      applySaveResult(result, forComparison, 'updated after force save');
      if (typeof callback === 'function') {
        callback(result);
      }
      resolve(result);
      drainPendingSave();
    }, { snapshotHtml });
  });
}

/**
 * Fetch HTML from a URL and save it, then reload
 * Emits error event if save fails
 *
 * @param {string} url - URL to fetch from
 */
export function replacePageWith(url) {
  if (!isEditMode) {
    return;
  }

  replacePageWithCore(url, (result) => {
    // Reload ONLY on a save that actually landed. A skipped result means the
    // replacement never happened (busy lane, or not in edit mode), and reloading
    // then presented a no-op as a completed swap.
    if (result.ok) {
      window.location.reload();
    } else if (result.msgType === 'skipped') {
      setSaveState('error', result.msg || 'Template not saved');
    } else {
      setSaveState('error', result.msg || 'Failed to save template');
    }
  });
}

// Throttled version of savePage for auto-save
const throttledSave = throttle(savePage, 1200);

// Baseline for autosave comparison
let baselineContents = '';
// The baseline veto only guards the load-time settle window; captureBaseline
// disarms it. See the comment there.
let baselineActive = true;

// ============================================
// BASELINE CAPTURE (Settled Signal)
// ============================================
//
// WHY SETTLED SIGNAL:
// Modules run on load and mutate the DOM (add styles, modify attributes).
// A fixed delay (e.g., 1500ms) is arbitrary and either too short (misses slow
// mutations) or too long (delays baseline). Instead, we wait for mutations to
// stop, meaning all modules have finished their setup work.
//
// WHY IMMEDIATE + CONDITIONAL UPDATE:
// We set baseline immediately as a safety net. If the user edits or saves
// before settle completes, we don't overwrite their work. The settled snapshot
// only replaces baseline if nothing changed (lastSavedContents === immediateContents).

const SETTLE_MS = 500;        // Wait for no mutations for this long
const MAX_SETTLE_MS = 3000;   // Max time to wait before forcing capture

function initBaselineCapture() {
  if (!isEditMode) return;

  let userEdited = false;
  let settled = false;
  let unsubscribeMutation = null;

  // Take immediate snapshot and set as baseline right away
  // This ensures saves during settle window work correctly
  // Store stripped version so comparisons are direct (no parsing needed)
  const immediateContents = captureForComparison();
  lastSavedContents = immediateContents;
  baselineContents = immediateContents;
  logBaseline('immediate capture', `${immediateContents.length} chars`);

  // Track user edits to avoid overwriting real changes
  const userEditEvents = ['input', 'change', 'paste'];
  const markUserEdited = (e) => {
    const target = e.target;
    const isEditable = target.isContentEditable ||
                       target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.tagName === 'SELECT';
    if (isEditable) userEdited = true;
  };
  userEditEvents.forEach(evt => document.addEventListener(evt, markUserEdited, true));

  // Called when mutations settle OR max timeout reached
  const captureBaseline = () => {
    if (settled) return;
    settled = true;

    // Cleanup listeners
    if (unsubscribeMutation) unsubscribeMutation();
    userEditEvents.forEach(evt => document.removeEventListener(evt, markUserEdited, true));

    // Only update if no user edits AND no saves occurred during settle
    // (if a save happened, lastSavedContents would differ from immediateContents)
    if (!userEdited && lastSavedContents === immediateContents) {
      // Store stripped version so comparisons are direct (no parsing needed)
      const contents = captureForComparison();
      lastSavedContents = contents;
      baselineContents = contents;
      logBaseline('settled capture', `${contents.length} chars`);
    } else {
      logBaseline('settled skipped', userEdited ? 'user edited' : 'save occurred during settle');
    }

    // The load-time veto has done its job. It exists so setup churn from modules
    // booting cannot trigger a save, and that window is over once mutations have
    // settled. Leaving it armed for the life of the tab is what made an undo back
    // to the page's original state unsaveable: it differed from lastSavedContents
    // but matched baselineContents, so autosave vetoed it forever and only a manual
    // save could persist the revert.
    baselineActive = false;

    document.documentElement.setAttribute('savestatus', 'saved');
  };

  // Start settle observer - fires when no mutations for SETTLE_MS.
  // require:'autosave' so churn in no-save / save-* / no-watch regions doesn't
  // keep resetting the settle timer or count toward the baseline.
  unsubscribeMutation = Mutation.onAnyChange(
    { debounce: SETTLE_MS, omitChangeDetails: true, require: 'autosave' },
    captureBaseline
  );

  // Max timeout fallback
  setTimeout(() => {
    if (!settled) captureBaseline();
  }, MAX_SETTLE_MS);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBaselineCapture);
} else {
  initBaselineCapture();
}

/**
 * Save the page with throttling, for use with auto-save.
 * Checks both baseline and last saved content to prevent saves from initial setup.
 *
 * Returns a Promise resolving with {msg, msgType}. Within-throttle-window calls
 * piggyback on the trailing-edge save and resolve with its result.
 *
 * @param {Function} callback - Optional callback
 * @returns {Promise<{msg: string, msgType: string}>}
 */
export function savePageThrottled(callback = () => {}) {
  if (!isEditMode) {
    const skipped = skipped_('Not in edit mode');
    callback(skipped);
    return Promise.resolve(skipped);
  }

  // For autosave: while the page is still settling, content must differ from BOTH
  // the load-time baseline and the last save, so module setup churn cannot trigger
  // a save. Once settled, the baseline veto is disarmed and only the last save
  // matters — otherwise undoing back to the page's original state can never be
  // persisted, because it matches the baseline forever.
  // Compare directly - stored versions are already stripped
  const currentForCompare = captureForComparison();
  const differsFromBaseline = !baselineActive || currentForCompare !== baselineContents;
  const differsFromLastSave = currentForCompare !== lastSavedContents;

  logSaveCheck('throttled vs baseline', !differsFromBaseline);
  logSaveCheck('throttled vs lastSave', !differsFromLastSave);

  if (!(differsFromBaseline && differsFromLastSave)) {
    const skipped = skipped_('No changes to save');
    callback(skipped);
    return Promise.resolve(skipped);
  }

  unsavedChanges = true;
  // The throttled promise can reject now that a throwing save no longer strands
  // its callers (see throttle.js), and both autosave call sites are fire-and-forget,
  // with no reach into this module's error path. Catch it here, the one place that
  // owns that path, so every caller keeps the never-rejects contract savePage
  // documents and a throw surfaces as a failed save instead of an unhandled rejection.
  return throttledSave(callback).catch(err => {
    const result = { ok: false, msg: err?.message || 'Save failed', msgType: 'error', code: null, etag: null };
    setSaveState('error', result.msg);
    return result;
  });
}

/**
 * Initialize keyboard shortcut for save (CMD/CTRL+S)
 */
export function initSaveKeyboardShortcut() {
  document.addEventListener("keydown", function(event) {
    let isMac = window.navigator.platform.match("Mac");
    let metaKeyPressed = isMac ? event.metaKey : event.ctrlKey;
    if (metaKeyPressed && event.keyCode == 83) {
      event.preventDefault();
      savePage();
    }
  });
}

/**
 * Initialize save button handler
 * Looks for elements with [trigger-save] attribute
 */
export function initHyperclaySaveButton() {
  document.addEventListener("click", event => {
    if (event.target.closest("[trigger-save]")) {
      savePage();
    }
  });
}

/**
 * Initialize the save system (keyboard shortcut and save button)
 * For auto-save, also load the 'autosave' module
 */
export function init() {
  if (!isEditMode) return;

  initSaveKeyboardShortcut();
  initHyperclaySaveButton();
}

// Auto-init when module is imported
init();

export default savePage;
