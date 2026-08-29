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
import { restoreAuthoredUrls } from '../lib/authored-url.js';
import { STRIP_FROM_SAVE, STRIP_FROM_COMPARISON, STRIP_FROM_DIRTY_CHECK, NO_TRIGGER_AUTOSAVE_SELECTOR, SNAPSHOT_REMOVE_SELECTOR } from '../lib/region-policy.js';
import { TAB_LOCAL_ROOT_ATTRS } from '../lib/root-attrs.js';

// =============================================================================
// HOOK REGISTRIES
// =============================================================================

const snapshotHooks = [];       // Phase 2: Always run (form sync)
const documentTransforms = [];  // Phase 3a: Save and change check (strip admin)

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
function clonePreventingOnclone(node, deep = true) {
  const prev = window.__preventOnclone;
  window.__preventOnclone = true;
  try { return node.cloneNode(deep); }
  finally { window.__preventOnclone = prev; }
}

export function captureSnapshot({ flushUndo = true } = {}) {
  // Force-close any pending undo idle batch BEFORE cloning the DOM, so the
  // snapshot reflects a clean undo boundary. Without this, a save that fires
  // mid-typing would leave the idle batch open across the save boundary, and
  // Cmd+Z after save would restore to a state earlier than the last save.
  // No-op when undo isn't loaded or no batch is pending.
  // flushUndo: false is for captures that are not save boundaries (the scoped
  // live-sync dirty oracle runs per incoming frame, and flushing there would
  // shatter the user's undo batches mid-typing).
  if (flushUndo && typeof window !== 'undefined' && window.clay?.undo?.flush) {
    window.clay.undo.flush();
  }

  const clone = clonePreventingOnclone(document.documentElement);

  for (const hook of snapshotHooks) {
    hook(clone);
  }

  // Put back any URL clay rewrote at runtime (cache-bust, refetch-on-save) so
  // the file keeps what the page author wrote. Before onbeforesnapshot, so an
  // authored handler sees the same URLs the file will.
  restoreAuthoredUrls(clone);

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
export function captureForComparison({ flushUndo = true } = {}) {
  const clone = captureSnapshot({ flushUndo });

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
 * Capture in the DIRTY domain: like captureForComparison, but it KEEPS
 * no-trigger-autosave regions.
 *
 * The two domains answer different questions. "Should this edit start an
 * autosave?" is the autosave domain (captureForComparison). "Is there anything
 * here the person would lose?" is this one — an edit inside a batching region is
 * a real edit that an explicit save must write and a close must warn about.
 *
 * On a document with no such region this returns bytes identical to
 * captureForComparison, which is what keeps the two baselines comparable.
 *
 * @returns {string}
 */
export function captureForDirtyCheck({ flushUndo = true } = {}) {
  const clone = captureSnapshot({ flushUndo });

  runAuthoredHandlers(clone, 'onbeforesave');

  for (const el of clone.querySelectorAll(STRIP_FROM_DIRTY_CHECK)) {
    el.remove();
  }

  for (const hook of documentTransforms) {
    hook(clone);
  }

  return "<!DOCTYPE html>" + clone.outerHTML;
}

/**
 * Both comparison domains from ONE snapshot, with no save clone and no
 * snapshot-ready event.
 *
 * For the callers that need to install or check both baselines without sending
 * anything: the load-time baseline capture and live-sync's post-morph baseline
 * setter. Taking two separate snapshots there would cost two full DOM clones per
 * boot and per applied frame, for bytes that are usually identical.
 *
 * @returns {{ forComparison: string, forDirty: string }}
 */
export function captureForComparisonAndDirty({ flushUndo = true } = {}) {
  const clone = captureSnapshot({ flushUndo });

  runAuthoredHandlers(clone, 'onbeforesave');

  const dirtyClone = clone.querySelector(NO_TRIGGER_AUTOSAVE_SELECTOR)
    ? clonePreventingOnclone(clone)
    : null;

  for (const el of clone.querySelectorAll(STRIP_FROM_COMPARISON)) {
    el.remove();
  }
  for (const hook of documentTransforms) {
    hook(clone);
  }
  const forComparison = "<!DOCTYPE html>" + clone.outerHTML;

  let forDirty = forComparison;
  if (dirtyClone) {
    for (const el of dirtyClone.querySelectorAll(STRIP_FROM_DIRTY_CHECK)) {
      el.remove();
    }
    for (const hook of documentTransforms) {
      hook(dirtyClone);
    }
    forDirty = "<!DOCTYPE html>" + dirtyClone.outerHTML;
  }

  return { forComparison, forDirty };
}

/**
 * Single-capture function for both saving and comparison.
 *
 * Clones the DOM once, then clones that clone for comparison.
 * More efficient than calling captureForSave() and captureForComparison() separately.
 *
 * @param {Object} options
 * @param {boolean} options.emitForSync - Whether to emit snapshot-ready event (default: true)
 * @returns {{ forSave: string, forComparison: string, forDirty: string }}
 */
export function captureForSaveAndComparison({ emitForSync = true } = {}) {
  const clone = captureSnapshot();

  // Emit for live-sync before any stripping.
  //
  // A listener gets the very clone this function goes on to serialize into
  // forSave, forComparison and forDirty — that sharing is the point, it saves a
  // second full DOM clone per save. So a listener may READ it and must not write
  // to it: anything it changes lands in the saved bytes and in both baselines,
  // and a baseline the dirty check cannot reproduce warns on close forever.
  if (emitForSync) {
    document.dispatchEvent(new CustomEvent('clay:snapshot-ready', {
      detail: { documentElement: clone }
    }));
  }

  // Run inline [onbeforesave] handlers
  runAuthoredHandlers(clone, 'onbeforesave');

  // Clone for comparison before stripping (cheaper than cloning live DOM)
  const compareClone = clonePreventingOnclone(clone);

  // The dirty domain differs from the autosave domain only inside
  // no-trigger-autosave regions, so a document without one pays nothing: the two
  // strip sets remove exactly the same nodes and one string serves both. The
  // predicate reads the captured clone after authored handlers have run, and
  // covers all three spellings via the policy's own selector.
  const dirtyClone = clone.querySelector(NO_TRIGGER_AUTOSAVE_SELECTOR)
    ? clonePreventingOnclone(clone)
    : null;

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

  // Dirty clone: same shape as the compare clone, one selector weaker.
  let forDirty = forComparison;
  if (dirtyClone) {
    for (const el of dirtyClone.querySelectorAll(STRIP_FROM_DIRTY_CHECK)) {
      el.remove();
    }
    for (const hook of documentTransforms) {
      hook(dirtyClone);
    }
    forDirty = "<!DOCTYPE html>" + dirtyClone.outerHTML;
  }

  return { forSave, forComparison, forDirty };
}

/**
 * Capture for a protected live-sync merge: the save-domain and loss-domain
 * clones of ONE snapshot, plus a WeakMap pairing every loss-domain element to
 * its save-clone twin.
 *
 * The pairing is recorded immediately after the compare clone is created,
 * while the two trees are still isomorphic; each side's strips then remove
 * nodes independently without disturbing it.
 *
 * The compare clone strips STRIP_FROM_DIRTY_CHECK, not STRIP_FROM_COMPARISON:
 * the merge asks "would applying this frame destroy work?", which is the same
 * question the close warning asks, so it must use the same domain. The autosave
 * domain is the wrong one here because it strips no-trigger-autosave, and an
 * unsaved edit in a batching region is exactly the work the merge exists to
 * protect. Disposable churn stays out of both domains via no-dirty, which is
 * what keeps a self-churning region from promoting a dirty root to <body> and
 * holding every frame forever.
 *
 * Dirty roots map through pairMap to save-domain subtrees (the same domain as
 * the file on disk), which still carry the freeze / no-watch children the
 * compare clone strips.
 *
 * Never emits snapshot-ready (this capture must not feed the send pipeline)
 * and never flushes the undo batch (it runs per incoming frame, not per save).
 *
 * @returns {{ saveClone: HTMLElement, compareClone: HTMLElement, pairMap: WeakMap }}
 */
export function captureForMerge() {
  const clone = captureSnapshot({ flushUndo: false });

  runAuthoredHandlers(clone, 'onbeforesave');

  const compareClone = clonePreventingOnclone(clone);

  const pairMap = new WeakMap();
  (function pair(compareEl, saveEl) {
    pairMap.set(compareEl, saveEl);
    const compareKids = compareEl.children;
    const saveKids = saveEl.children;
    for (let i = 0; i < compareKids.length; i++) {
      pair(compareKids[i], saveKids[i]);
    }
  })(compareClone, clone);

  for (const hook of documentTransforms) {
    hook(clone);
  }
  for (const el of clone.querySelectorAll(STRIP_FROM_SAVE)) {
    el.remove();
  }

  for (const el of compareClone.querySelectorAll(STRIP_FROM_DIRTY_CHECK)) {
    el.remove();
  }
  for (const hook of documentTransforms) {
    hook(compareClone);
  }

  return { saveClone: clone, compareClone, pairMap };
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
 * It must not write to the clone. The caller derives forSave and both comparison
 * baselines from this same object once every listener has returned, so anything
 * left behind lands in the saved bytes and in both baselines.
 *
 * This used to strip the tab-local attributes in place and set them again in a
 * finally, which looked exact and was not: an attribute list is ordered by
 * insertion, so putting a name back appended it. On htmlclay, whose injectAttr
 * splices the token and file id in right after `<html`, every save then installed
 * a baseline whose root tag was ordered differently from the one any later dirty
 * check builds off the live DOM — same names, same values, same length, never
 * equal again. Closing an already-saved document warned every time, and
 * savePageThrottled's "no changes to save" short-circuit never fired.
 *
 * The open tag is serialized from a childless copy instead, so the shared clone is
 * never touched and there is no restore to get wrong. The copy is one element, not
 * the tree.
 */
export function serializeForSync(clone) {
  const bareRoot = clonePreventingOnclone(clone, false);
  for (const name of TAB_LOCAL_ROOT_ATTRS) bareRoot.removeAttribute(name);

  // Split the end tag off by LENGTH rather than searching for one: an authored
  // attribute value holding "</html>" would fool any indexOf-based split and
  // truncate the broadcast.
  const shell = bareRoot.outerHTML;
  const endTag = `</${bareRoot.localName}>`;
  return shell.slice(0, shell.length - endTag.length) + clone.innerHTML + endTag;
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
