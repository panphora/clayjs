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
import { captureForComparison, captureForComparisonAndDirty, captureForSaveAndComparison } from "./snapshot.js";
import { seedEtag } from "./etag.js";
import { gateCaptureToken, gateClearIfUnchanged } from "../lib/dirty-gate.js";
import { ROOT_LIBRARY_ATTRS } from "../lib/root-attrs.js";
import { logSaveCheck, logBaseline } from "../lib/autosave-debug.js";
import { initUserGesture, markExplicitSave, clearExplicitSave } from "../lib/user-gesture.js";

// Keep this library's own root state out of the saved bytes.
//
// This used to write `savestatus="saved"` onto the clone instead of removing it,
// which stopped a mid-save "saving" from being baked in but still put a library
// attribute on disk. It is there today in four LOCAL_APPS documents. These three
// are this tab's UI truth, re-stamped on every load by edit-mode and by the save
// lane itself, so a stored copy is at best noise and at worst a lie: a file whose
// disk bytes say `savestatus="saved"` reads as saved before clayjs has booted.
//
// Scoped to the ROOT on purpose. `savestatus` on any other element is an authored
// attribute that `option:savestatus` reads, and stripping those would delete page
// content. Both clones get this, so the dirty comparison sees no difference.
addDocumentTransform(clone => {
  for (const name of ROOT_LIBRARY_ATTRS) clone.removeAttribute(name);
});

// ============================================
// SAVE STATE MANAGEMENT
// ============================================

let savingTimeout = null;

/**
 * Sets the save status on <html> and dispatches an event.
 *
 * @param {string} state - One of: 'saving', 'saved', 'offline', 'error', 'conflict'
 * @param {string} msg - Optional message (e.g., error details)
 * @param {string} msgType - Optional severity from the server (e.g., 'warning')
 * @param {Object} [extra] - Extra detail fields for the event (e.g. `changedBy`)
 */
function setSaveState(state, msg = '', msgType = '', extra = null) {
  if (savingTimeout) {
    clearTimeout(savingTimeout);
    savingTimeout = null;
  }

  document.documentElement.setAttribute('savestatus', state);

  const event = new CustomEvent(`clay:save-${state}`, {
    detail: { msg, msgType, timestamp: Date.now(), ...(extra || {}) }
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
  if (document.documentElement.getAttribute('savestatus') !== 'offline') return;
  savePage().then((result) => {
    // The page went offline with everything already saved, so there is nothing
    // to send and the offline chip is simply stale. Clear it directly rather
    // than through setSaveState: no save happened, and dispatching
    // clay:save-saved would run every [onaftersave] handler and light every
    // status chip as though one had.
    if (result.msgType === 'skipped' &&
        document.documentElement.getAttribute('savestatus') === 'offline') {
      document.documentElement.setAttribute('savestatus', 'saved');
    }
  });
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
// Post-save mutators are made invisible to the comparison instead. They remember
// what the URL was authored as and restore it on every snapshot clone, so the live
// DOM carries the busted URL and the file carries the authored one (authored-url.js,
// used by cache-bust.js and refetch-on-save.js). That leaves the baseline free to
// stay exactly what savePage sent, which is the only value true by construction.
//
// They used to mark what they touched `no-trigger-autosave` instead. That hid the
// rewrite from the comparison only once the marker had reached the baseline, so the
// FIRST save on any page using either helper was followed by a spurious dirty state
// and a false close warning. It self-healed on the next save, which is why it went
// unnoticed.

// Re-export from core for backward compatibility
export { addDocumentTransform, getPageContents };

let unsavedChanges = false;
// TWO SAVED BASELINES, one per comparison domain.
//
//   lastSavedContents — the AUTOSAVE domain (no-trigger-autosave stripped).
//     Answers "should this edit start a save on its own?" Autosave, the load
//     settle guard, the live-sync baseline and the scoped-sync merge oracle all
//     read this one, and none of them changes.
//   lastSavedDirty — the DIRTY domain (no-trigger-autosave kept). Answers "is
//     there anything here the person would lose?" Only an explicit savePage()
//     and the close warning read it.
//
// On a page with no batching region the two are byte-identical, so nothing about
// the split is observable there.
let lastSavedContents = '';
let lastSavedDirty = '';
// A save was requested while one was on the wire; run one more when it settles.
let pendingSave = false;

// ============================================
// AUTOSAVE SUSPENSION
// ============================================
//
// clay.wire holds this for the length of an agent request. The save is
// last-writer-wins with a backup, so an autosave landing while a local process is
// writing the same file posts the pre-agent document: the server backs the agent's
// bytes up and writes the browser's, the watcher's revalidation then fails, and
// the agent's work exists only in Backups while the page reports success.
//
// It suspends AUTOsave only. An explicit savePage — Cmd+S, a [trigger-save]
// button, or the wire's own pre-send flush — is a deliberate act and still runs.
//
// Reference counted, because two overlapping requests each hold it. A save
// skipped while suspended is replayed on release, or the user's edits would sit
// unsaved until something else happened to mutate the page.
let autosaveSuspended = 0;
let autosaveMissed = false;

export function suspendAutosave() {
  autosaveSuspended++;
}

export function resumeAutosave() {
  if (autosaveSuspended === 0) return;
  autosaveSuspended--;
  if (autosaveSuspended > 0 || !autosaveMissed) return;
  autosaveMissed = false;
  savePageThrottled();
}

// ============================================
// THE CONFLICT HOLD
// ============================================
//
// A 412 refuses this tab's bytes because the document changed since this tab last
// saw it (spec §6). Two things have to follow, and the second is the one that is
// easy to leave out.
//
// Nothing may be thrown away. The baselines do not advance on a refused save, so
// the edits stay dirty, the close warning still fires, and the person keeps what
// they typed. That falls out of applySaveResult and needs no special case.
//
// And autosave has to stop. Every autosave from here sends the same stamp and is
// refused for the same reason, so leaving it running means a save attempt every
// throttle window, forever, each one toasting a failure the person can do nothing
// about. The suspension clay.wire already owns is exactly the right lever: it
// stops AUTOsave only, so an explicit Cmd+S still goes out, and it replays one
// missed save on release so nothing typed during the hold is stranded.
//
// The hold is released when a save lands, whatever produced it: clay.save.overwrite,
// a live-sync frame that brought the page back in step, or the other tab going away.
let conflictHold = false;

function holdForConflict() {
  if (conflictHold) return;
  conflictHold = true;
  suspendAutosave();
}

function releaseConflictHold() {
  if (!conflictHold) return;
  conflictHold = false;
  resumeAutosave();
}

/** True while this tab is refusing to autosave over a version it has not seen. */
export function isSaveConflicted() {
  return conflictHold;
}

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
function applySaveResult(result, forComparison, forDirty, label, gateToken) {
  if (result.ok) {
    // Both baselines advance from the SAME pre-request capture, never from the
    // live DOM, so an edit made while the request was on the wire stays unsaved.
    lastSavedContents = forComparison;
    lastSavedDirty = forDirty;
    unsavedChanges = false;
    // Generation-checked: clears the scoped-sync dirty gate only if nothing
    // changed while this save was on the wire.
    gateClearIfUnchanged(gateToken);
    // The server's severity rides through untouched: a save can land AND carry a
    // warning, and the UI module is what decides how to render that.
    setSaveState('saved', result.msg || 'Saved', result.msgType);
    logBaseline(label, `${lastSavedContents.length} chars`);
    releaseConflictHold();
  } else if (result.msgType === 'conflict') {
    holdForConflict();
    setSaveState('conflict', result.msg, result.msgType, {
      changedBy: result.changedBy ?? null,
      afterTimeout: result.afterTimeout === true,
    });
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
export function getLastSavedDirty() { return lastSavedDirty; }

/**
 * Install both saved baselines from one post-morph capture.
 *
 * live-sync calls this after applying a frame it verified clean, where the page
 * now IS the file on disk. Setting only the autosave baseline would leave the
 * dirty baseline describing the pre-frame page, and the close warning would then
 * warn about the frame's own content.
 */
export function setLastSavedBaselines(forComparison, forDirty) {
  lastSavedContents = forComparison;
  lastSavedDirty = forDirty;
}

// Kept for back-compat: a caller with one string means the page has no batching
// region, or it does not know about the split. Setting both from it is the safe
// reading, since the domains coincide exactly when there is no such region.
export function setLastSavedContents(val) {
  lastSavedContents = val;
  lastSavedDirty = val;
}

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
      clearExplicitSave();
      const skipped = skipped_('Not in edit mode');
      callback(skipped);
      return resolve(skipped);
    }

    // A save is already on the wire. Remember that a newer state is waiting rather
    // than dropping it: the in-flight request carries the older bytes, and if no
    // further mutation happens to retrigger autosave, the newer ones would never
    // reach disk at all.
    // Not cleared here: pendingSave means this request is deferred, not
    // abandoned, and drainPendingSave is what eventually sends it.
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
    let forSave, forComparison, forDirty;
    const gateToken = gateCaptureToken();
    try {
      ({ forSave, forComparison, forDirty } = captureForSaveAndComparison());
    } catch (err) {
      console.error('savePage: captureForSaveAndComparison failed', err);
      clearExplicitSave();
      setSaveState('error', err.message);
      const result = { msg: err.message, msgType: 'error', code: null, etag: null };
      if (typeof callback === 'function') {
        callback(result);
      }
      return resolve(result);
    }

    // An explicit save asks the DIRTY question: write anything the person would
    // otherwise lose, including an edit inside a batching region that was never
    // going to autosave itself.
    unsavedChanges = (forDirty !== lastSavedDirty);
    logSaveCheck('savePage dirty check', !unsavedChanges);

    // Skip if content hasn't changed. Clearing the explicit intent here is the
    // whole point of scoping it: pressing Save on a clean page sends nothing, and
    // leaving "a human asked for this" armed would hand it to the next
    // background write and hide exactly the clobber the guard watches for.
    if (!unsavedChanges) {
      clearExplicitSave();
      gateClearIfUnchanged(gateToken);
      const skipped = skipped_('No changes to save');
      callback(skipped);
      return resolve(skipped);
    }

    // Start debounced 'saving' state (only shows if save takes >500ms)
    setSavingState();

    // Use saveHtml directly with our pre-captured content (avoids double capture)
    saveHtml(forSave, (result) => {
      applySaveResult(result, forComparison, forDirty, 'updated after save', gateToken);
      if (typeof callback === 'function') {
        callback(result);
      }
      resolve(result);
      drainPendingSave();
    });
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

    let forSave, forComparison, forDirty;
    const gateToken = gateCaptureToken();
    try {
      ({ forSave, forComparison, forDirty } = captureForSaveAndComparison());
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
      applySaveResult(result, forComparison, forDirty, 'updated after force save', gateToken);
      if (typeof callback === 'function') {
        callback(result);
      }
      resolve(result);
      drainPendingSave();
    });
  });
}

/**
 * Keep this tab's version, over the one the host is holding.
 *
 * The only exit from a conflict that keeps what is on screen. It asks the host for
 * the document's current stamp and force-saves with it, so the save that follows
 * carries a value the host will accept. If the host answers with no stamp at all,
 * the save goes out unconditional, which is last write wins, which is what the
 * person just asked for by name.
 *
 * Deliberately not automatic, and deliberately not what a second Cmd+S does. A
 * person pressing Save again has not been shown the other version, and reading
 * that as consent to replace it destroys exactly the copy this capability exists
 * to protect. The other two answers to a conflict need nothing from this library:
 * `location.reload()` takes the host's version, and a page that wants to merge
 * merges into its own DOM and then calls this.
 *
 * @param {Function} callback - Optional callback for custom handling
 * @returns {Promise<{ok: boolean, msg: string, msgType: string}>}
 */
export async function saveOverwritingConflict(callback = () => {}) {
  await seedEtag({ fresh: true });
  return savePageForce(callback);
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
  const { forComparison: immediateContents, forDirty: immediateDirty } = captureForComparisonAndDirty();
  lastSavedContents = immediateContents;
  lastSavedDirty = immediateDirty;
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

    // Only update if no user edits AND no saves occurred during settle.
    // BOTH baselines have to be untouched, not just the autosave one: a save
    // whose only change was inside a batching region advances lastSavedDirty
    // while leaving lastSavedContents byte-identical to the immediate capture.
    // Checking one would let a second, unsent edit in that region be captured
    // here as though it had been saved.
    if (!userEdited && lastSavedContents === immediateContents && lastSavedDirty === immediateDirty) {
      // Store stripped version so comparisons are direct (no parsing needed)
      const gateToken = gateCaptureToken();
      const { forComparison: contents, forDirty: contentsDirty } = captureForComparisonAndDirty();
      lastSavedContents = contents;
      lastSavedDirty = contentsDirty;
      baselineContents = contents;
      // Boot churn (modules rewriting attributes at DOM-ready) counted toward
      // the scoped-sync gate; the settled baseline is the proof it wasn't edits.
      gateClearIfUnchanged(gateToken);
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

  // Every autosave path lands here — the mutation-driven one, the [persist] input
  // timer, and live-sync's convergence save after a protected apply — which is
  // why the suspension lives at this one entry rather than at each caller.
  if (autosaveSuspended > 0) {
    autosaveMissed = true;
    const skipped = skipped_('Autosave suspended');
    callback(skipped);
    return Promise.resolve(skipped);
  }

  // For autosave: while the page is still settling, content must differ from BOTH
  // the load-time baseline and the last save, so module setup churn cannot trigger
  // a save. Once settled, the baseline veto is disarmed and only the last save
  // matters — otherwise undoing back to the page's original state can never be
  // persisted, because it matches the baseline forever.
  // Compare directly - stored versions are already stripped
  const gateToken = gateCaptureToken();
  const currentForCompare = captureForComparison();
  const differsFromBaseline = !baselineActive || currentForCompare !== baselineContents;
  const differsFromLastSave = currentForCompare !== lastSavedContents;

  logSaveCheck('throttled vs baseline', !differsFromBaseline);
  logSaveCheck('throttled vs lastSave', !differsFromLastSave);

  if (!(differsFromBaseline && differsFromLastSave)) {
    if (!differsFromLastSave) gateClearIfUnchanged(gateToken);
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
      // isTrusted, so a script calling dispatchEvent cannot manufacture human
      // provenance for a write the person never asked for.
      if (event.isTrusted) markExplicitSave();
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
      // el.click() is isTrusted:false, so this cannot be faked from script.
      if (event.isTrusted) markExplicitSave();
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

  // §6's stamp for a page that has never saved. Fired here and never awaited: the
  // request a person feels is the save, and a host with no /_/meta would make every
  // first save wait out a discovery timeout for an answer that was never coming.
  // Until the seed lands the first save goes out unconditional, which is last write
  // wins, which is what every save did before this existed. This is also the only
  // moment the seed can be useful at all: ask for it lazily at the first save and
  // it can never arrive in time for that save, and from the second save onward the
  // first save's own response has already supplied one.
  seedEtag();

  // Every editable page, not just autosave pages. A manual-save page makes
  // exactly the saves a person asked for, and used to report all of them as
  // background writes because this was installed behind the autosave gate.
  initUserGesture();
  initSaveKeyboardShortcut();
  initHyperclaySaveButton();
}

// Auto-init when module is imported
init();

export default savePage;
