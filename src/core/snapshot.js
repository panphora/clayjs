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
 *   │  onPrepareForSave       │     │  (live-sync stops here) │
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

// =============================================================================
// HOOK REGISTRIES
// =============================================================================

const snapshotHooks = [];       // Phase 2: Always run (form sync)
const prepareForSaveHooks = []; // Phase 3a: Save only (strip admin)

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
 * Register a hook that runs ONLY when preparing for save.
 * Use for: stripping admin elements, cleanup.
 *
 * @param {Function} callback - Receives the cloned document element
 */
export function onPrepareForSave(callback) {
  prepareForSaveHooks.push(callback);
}

// Backwards compat alias
export const beforeSave = onPrepareForSave;

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
  if (typeof window !== 'undefined' && window.hyperclay && window.hyperclay.undo && window.hyperclay.undo.flush) {
    window.hyperclay.undo.flush();
  }

  const clone = clonePreventingOnclone(document.documentElement);

  for (const hook of snapshotHooks) {
    hook(clone);
  }

  for (const el of clone.querySelectorAll('[onbeforesnapshot]')) {
    new Function(el.getAttribute('onbeforesnapshot')).call(el);
  }

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
  for (const el of clone.querySelectorAll('[onbeforesave]')) {
    new Function(el.getAttribute('onbeforesave')).call(el);
  }

  // Remove elements that shouldn't be saved ([no-save] / legacy [save-remove])
  for (const el of clone.querySelectorAll(STRIP_FROM_SAVE)) {
    el.remove();
  }

  // Run registered prepare hooks ([freeze]/[save-freeze] innerHTML restore lives here)
  for (const hook of prepareForSaveHooks) {
    hook(clone);
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
  for (const el of clone.querySelectorAll('[onbeforesave]')) {
    new Function(el.getAttribute('onbeforesave')).call(el);
  }

  // Strip before hooks (hooks see the "final" state)
  for (const el of clone.querySelectorAll(STRIP_FROM_COMPARISON)) {
    el.remove();
  }

  // Run registered prepare hooks
  for (const hook of prepareForSaveHooks) {
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
 * @returns {{ forSave: string, forComparison: string }}
 */
export function captureForSaveAndComparison({ emitForSync = true } = {}) {
  const clone = captureSnapshot();

  // Emit for live-sync before any stripping
  if (emitForSync) {
    document.dispatchEvent(new CustomEvent('clay:snapshot-ready', {
      detail: { documentElement: clone }
    }));

    // Store snapshot HTML for Hyperclay Local platform sync
    // This allows the save system to send both stripped and full versions
    const isHyperclayLocal = window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';
    if (isHyperclayLocal) {
      window.__hyperclaySnapshotHtml = '<!DOCTYPE html>' + clone.outerHTML;
    }
  }

  // Run inline [onbeforesave] handlers
  for (const el of clone.querySelectorAll('[onbeforesave]')) {
    new Function(el.getAttribute('onbeforesave')).call(el);
  }

  // Clone for comparison before stripping (cheaper than cloning live DOM)
  const compareClone = clonePreventingOnclone(clone);

  // Save clone: strip [no-save]/[save-remove], then run hooks (freeze restore in hooks)
  for (const el of clone.querySelectorAll(STRIP_FROM_SAVE)) {
    el.remove();
  }
  for (const hook of prepareForSaveHooks) {
    hook(clone);
  }
  const forSave = "<!DOCTYPE html>" + clone.outerHTML;

  // Compare clone: strip every autosave-off region, then run hooks
  for (const el of compareClone.querySelectorAll(STRIP_FROM_COMPARISON)) {
    el.remove();
  }
  for (const hook of prepareForSaveHooks) {
    hook(compareClone);
  }
  const forComparison = "<!DOCTYPE html>" + compareClone.outerHTML;

  return { forSave, forComparison };
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
