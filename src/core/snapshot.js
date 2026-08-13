/**
 * snapshot.js — The source of truth for page state
 *
 * THE SAVE/SYNC PIPELINE:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  1. CLONE         document.documentElement.cloneNode()  │
 *   └─────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  2. SNAPSHOT HOOKS       onSnapshot callbacks           │
 *   │                          (form value sync)              │
 *   │                                                         │
 *   │     ✓ Used by: SAVE and LIVE-SYNC                       │
 *   └─────────────────────────────────────────────────────────┘
 *                              │
 *              ┌───────────────┴───────────────┐
 *              ▼                               ▼
 *   ┌─────────────────────────┐     ┌─────────────────────────┐
 *   │  3a. PREPARE HOOKS      │     │  3b. DONE               │
 *   │  addDocumentTransform   │     │  (live-sync stops here) │
 *   │  [onbeforesave]         │     │                         │
 *   │  [save-remove]          │     │  → emits snapshot-ready │
 *   │                         │     └─────────────────────────┘
 *   │  ✓ Used by: SAVE only   │
 *   └─────────────────────────┘
 *              │
 *              ▼
 *   ┌─────────────────────────┐
 *   │  4. SERIALIZE           │
 *   │  "<!DOCTYPE html>"      │
 *   │  + outerHTML            │
 *   │                         │
 *   │  → sent to server       │
 *   └─────────────────────────┘
 */

import { stripExtensionNoise } from '../lib/extension-noise.js';
import { STRIP_FROM_SAVE, STRIP_FROM_COMPARISON, SNAPSHOT_REMOVE_SELECTOR } from '../lib/region-policy.js';
import { saveTransport, DESKTOP_JSON } from './host-attrs.js';
import { TAB_LOCAL_ROOT_ATTRS } from '../lib/root-attrs.js';

// =============================================================================
// HOOK REGISTRIES
// =============================================================================

const snapshotHooks = [];       // Phase 2: Always run (form sync)
const documentTransforms = [];  // Phase 3a: Save only (strip admin)

/**
 * Run every authored handler of one kind over a clone, and never let one of them
 * take the page down with it.
 *
 * These attributes hold page-author JavaScript, and the capture pipeline runs on
 * the boot path: save.js captures a baseline during module evaluation, inside the
 * dynamic import the loader awaits. An unguarded throw in one page attribute
 * therefore cost the document its entire client rather than costing that one
 * handler its effect.
 *
 * @param {HTMLElement} clone
 * @param {string} attr - e.g. 'onbeforesave'
 */
function runAuthoredHandlers(clone, attr) {
  for (const el of clone.querySelectorAll(`[${attr}]`)) {
    try {
      new Function(el.getAttribute(attr)).call(el);
    } catch (err) {
      console.error(`[${attr}] handler failed:`, err);
    }
  }
}

/**
 * Register a hook that runs on EVERY snapshot (save AND sync).
 * Use for: syncing form values to the clone.
 *
 * @param {Function} callback - Receives the cloned document element
 */
export function onSnapshot(callback) {
  snapshotHooks.push(callback);
}

/**
 * Register a transform that runs over a detached clone when preparing to save.
 * Use for: stripping admin elements, cleanup.
 *
 * It is a TRANSFORM, not a save lifecycle event: it runs over the clone that
 * gets saved AND over the clone used to answer "has anything changed", and that
 * second one runs on dirty checks that never become a save. So it must be pure
 * and repeatable — no counters, no logging, no network. The two clones have
 * different visibility rules, which is why neither run can be skipped.
 *
 * @param {Function} callback - Receives the cloned document element
 */
export function addDocumentTransform(callback) {
  documentTransforms.push(callback);
}

// =============================================================================
// CAPTURE FUNCTIONS
// =============================================================================

/**
 * PHASE 1-2: Clone the DOM and run snapshot hooks.
 *
 * This is the "canonical" state — form values synced, nothing stripped.
 * Used as the base for both saving and syncing.
 *
 * @returns {HTMLElement} Cloned document element with snapshot hooks applied
 */
function clonePreventingOnclone(node) {
  const prev = window.__preventOnclone;
  window.__preventOnclone = true;
  try { return node.cloneNode(true); }
  finally { window.__preventOnclone = prev; }
}

export function captureSnapshot() {
  // Force-close any pending undo idle batch BEFORE cloning the DOM, so the
  // snapshot reflects a clean undo boundary. Without this, a save that fires
  // mid-typing would leave the idle batch open across the save boundary, and
  // Cmd+Z after save would restore to a state earlier than the last save.
  // No-op when undo isn't loaded or no batch is pending.
  if (typeof window !== 'undefined' && window.clay?.undo?.flush) {
    window.clay.undo.flush();
  }

  const clone = clonePreventingOnclone(document.documentElement);

  for (const hook of snapshotHooks) {
    hook(clone);
  }

  runAuthoredHandlers(clone, 'onbeforesnapshot');

  for (const el of clone.querySelectorAll(SNAPSHOT_REMOVE_SELECTOR)) {
    el.remove();
  }

  // Browser-extension noise (password-manager menus, Grammarly overlays, and
  // marker attributes on real inputs) is not page content. Drop it from every
  // snapshot so it never reaches a save, a comparison, or a live-sync broadcast.
  stripExtensionNoise(clone);

  return clone;
}

/**
 * Prepare an already-captured snapshot for saving.
 * Mutates the clone — only call once per snapshot.
 *
 * @param {HTMLElement} clone - A snapshot from captureSnapshot()
 * @returns {string} Full HTML string ready for server
 */
function prepareCloneForSave(clone) {
  // Run inline [onbeforesave] handlers
  runAuthoredHandlers(clone, 'onbeforesave');

  // Run registered prepare hooks ([freeze]/[save-freeze] innerHTML restore lives here)
  for (const hook of documentTransforms) {
    hook(clone);
  }

  // Strip [no-save] / legacy [save-remove] LAST (snapshot-algorithm step 7): a
  // prepare hook (freeze restore) can re-inject [no-save] content into the clone,
  // so the strip must run after the hooks or that content leaks to disk.
  for (const el of clone.querySelectorAll(STRIP_FROM_SAVE)) {
    el.remove();
  }

  return "<!DOCTYPE html>" + clone.outerHTML;
}

/**
 * Capture snapshot prepared for dirty/change comparison.
 *
 * Like captureForSave but also strips every region whose autosave-trigger is off
 * (no-trigger-autosave, freeze, no-watch, plus the legacy equivalents), so their
 * churn never marks the page dirty.
 *
 * @returns {string} HTML string with all autosave-off regions stripped
 */
export function captureForComparison() {
  const clone = captureSnapshot();

  // Run inline [onbeforesave] handlers
  runAuthoredHandlers(clone, 'onbeforesave');

  // Strip before hooks (hooks see the "final" state)
  for (const el of clone.querySelectorAll(STRIP_FROM_COMPARISON)) {
    el.remove();
  }

  // Run registered prepare hooks
  for (const hook of documentTransforms) {
    hook(clone);
  }

  return "<!DOCTYPE html>" + clone.outerHTML;
}

/**
 * Single-capture function for both saving and comparison.
 *
 * Clones the DOM once, then clones that clone for comparison.
 * More efficient than calling captureForSave() and captureForComparison() separately.
 *
 * @param {Object} options
 * @param {boolean} options.emitForSync - Whether to emit snapshot-ready event (default: true)
 * @returns {{ forSave: string, forComparison: string, snapshotHtml: ?string }}
 */
export function captureForSaveAndComparison({ emitForSync = true } = {}) {
  const clone = captureSnapshot();

  // The unstripped snapshot, for a host that asked for the desktop JSON envelope:
  // the save then sends both the stripped document and this. Returned to the caller
  // rather than parked on a window global, so it can only ever be paired with the
  // content captured alongside it. As a global it was cleared on success only, so
  // two captures without an intervening successful save shipped a stale snapshot
  // next to fresh content. Captured only when the document DECLARES the transport;
  // this used to key off `location.hostname`, which set it on every localhost page
  // whether or not its host wanted it.
  const snapshotHtml = saveTransport() === DESKTOP_JSON
    ? '<!DOCTYPE html>' + clone.outerHTML
    : null;

  // Emit for live-sync before any stripping
  if (emitForSync) {
    document.dispatchEvent(new CustomEvent('clay:snapshot-ready', {
      detail: { documentElement: clone }
    }));
  }

  // Run inline [onbeforesave] handlers
  runAuthoredHandlers(clone, 'onbeforesave');

  // Clone for comparison before stripping (cheaper than cloning live DOM)
  const compareClone = clonePreventingOnclone(clone);

  // Save clone: run hooks (freeze restore lives here), THEN strip [no-save]/[save-remove]
  // LAST (snapshot-algorithm step 7) so freeze-restored [no-save] content can't leak to disk.
  for (const hook of documentTransforms) {
    hook(clone);
  }
  for (const el of clone.querySelectorAll(STRIP_FROM_SAVE)) {
    el.remove();
  }
  const forSave = "<!DOCTYPE html>" + clone.outerHTML;

  // Compare clone: strip every autosave-off region, then run hooks
  for (const el of compareClone.querySelectorAll(STRIP_FROM_COMPARISON)) {
    el.remove();
  }
  for (const hook of documentTransforms) {
    hook(compareClone);
  }
  const forComparison = "<!DOCTYPE html>" + compareClone.outerHTML;

  return { forSave, forComparison, snapshotHtml };
}

/**
 * PHASE 1-4: Full pipeline for saving to server.
 *
 * Captures snapshot, emits for live-sync, then prepares for save.
 * This is the main entry point for the save process.
 *
 * @param {Object} options
 * @param {boolean} options.emitForSync - Whether to emit snapshot-ready event (default: true)
 * @returns {string} Full HTML string ready for server
 */
export function captureForSave({ emitForSync = true } = {}) {
  const clone = captureSnapshot();

  // Emit for live-sync before stripping admin elements
  // Sends full cloned documentElement so live-sync can extract head and body
  if (emitForSync) {
    document.dispatchEvent(new CustomEvent('clay:snapshot-ready', {
      detail: { documentElement: clone }
    }));
  }

  return prepareCloneForSave(clone);
}

/**
 * The bytes a live-sync broadcast carries: the snapshot, minus the root
 * attributes that belong to this tab alone. A third serialization of the same
 * clone alongside the snapshot and the document, and the only one that crosses
 * into another person's browser.
 *
 * Takes the clone rather than capturing one, because the caller already has the
 * snapshot-ready clone and capturing again would run every hook a second time.
 * (Not to be confused with captureBodyForSync below, which is the older
 * body-innerHTML helper and unrelated to the live-sync lane.)
 *
 * The clone is detached and unobserved, so removing the attributes in place and
 * putting them back is exact, and far cheaper than cloning the tree again. The
 * finally is load-bearing: the save path reads this same clone afterwards.
 */
export function serializeForSync(clone) {
  const removed = [];
  for (const name of TAB_LOCAL_ROOT_ATTRS) {
    if (!clone.hasAttribute(name)) continue;
    removed.push([name, clone.getAttribute(name)]);
    clone.removeAttribute(name);
  }
  try {
    return clone.outerHTML;
  } finally {
    for (const [name, value] of removed) clone.setAttribute(name, value);
  }
}

/**
 * PHASE 1-2 (body only): For live-sync between admin users.
 *
 * Includes admin elements — no stripping.
 * Note: Prefer listening to 'clay:snapshot-ready' event instead,
 * which reuses the save's clone.
 *
 * @returns {string} Body innerHTML with form values synced
 */
export function captureBodyForSync() {
  const clone = captureSnapshot();
  return clone.querySelector('body').innerHTML;
}

/**
 * Get page contents for change detection.
 * Does NOT emit snapshot-ready event (safe for comparison).
 *
 * Returns full HTML via snapshot pipeline.
 */
export function getPageContents() {
  return captureForSave({ emitForSync: false });
}
