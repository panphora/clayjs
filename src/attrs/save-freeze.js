/**
 * [freeze] / [save-freeze] Custom Attribute
 *
 * Freezes an element's innerHTML for save purposes.
 * The live DOM can change freely, but the saved HTML always
 * contains the original content captured when the element first appeared.
 *
 * Usage:
 *   <div clay="freeze">Content that JS will modify at runtime</div>
 *
 * The original innerHTML is captured:
 *   - On page load, for all existing freeze elements
 *   - On DOM insertion, for dynamically added freeze elements
 *
 * At save time, the clone's innerHTML is replaced with the stored original.
 * Changes inside freeze elements do not trigger autosave dirty checks.
 */

import { onSnapshot, onPrepareForSave } from "../core/snapshot.js";
import { isEditMode } from "../core/is-edit-mode.js";
import { FREEZE_SELECTOR } from "../lib/region-policy.js";
import Mutation from "../lib/mutation.js";

const originals = new WeakMap();

const saveFreeze = { debug: false };

function log(...args) {
  if (saveFreeze.debug) console.log('[save-freeze]', ...args);
}

function capture(el) {
  if (!originals.has(el)) {
    originals.set(el, el.innerHTML);
    log('captured original', el.innerHTML.substring(0, 80) + '...');
  }
}

function captureAll() {
  const els = document.querySelectorAll(FREEZE_SELECTOR);
  log('captureAll found', els.length, 'elements');
  for (const el of els) {
    capture(el);
  }
}

// Which cloned element holds which authored innerHTML, for the current snapshot.
// Keyed by the cloned element itself: the prepare phase runs on the same clone
// object the snapshot phase saw, so identity is the pairing. An attribute marker
// would work too, right up until clay:snapshot-ready — which fires BETWEEN the two
// phases — hands the still-marked clone to live-sync and demo mode, both of which
// serialize it on the spot.
let pending = new WeakMap();

// Phase 2. The clone is a verbatim cloneNode of the live root and nothing has been
// stripped from it yet, so pairing by position is sound HERE and nowhere else.
function freezeSnapshot(clone) {
  pending = new WeakMap();

  const liveElements = document.querySelectorAll(FREEZE_SELECTOR);
  const cloneElements = clone.querySelectorAll(FREEZE_SELECTOR);

  log('freezing clone — live:', liveElements.length, 'clone:', cloneElements.length);

  // Counts can only differ if an earlier onSnapshot hook added or removed
  // elements, which means alignment is already gone. Restoring nothing beats
  // restoring one element's authored content into a different element.
  if (liveElements.length !== cloneElements.length) {
    console.warn('[save-freeze] live/clone freeze counts differ, skipping freeze restore');
    return;
  }

  for (let i = 0; i < cloneElements.length; i++) {
    if (!originals.has(liveElements[i])) continue;
    const original = originals.get(liveElements[i]);
    pending.set(cloneElements[i], original);
    if (cloneElements[i].innerHTML !== original) {
      log('element', i, '— restoring original');
      cloneElements[i].innerHTML = original;
    }
  }
}

// Phase 3a. Re-freeze anything an [onbeforesave] handler changed between the two
// phases. Nothing to clean up: the pairing never entered the document.
function freezePrepare(clone) {
  for (const el of clone.querySelectorAll(FREEZE_SELECTOR)) {
    const original = pending.get(el);
    if (original !== undefined && el.innerHTML !== original) {
      log('re-restoring original after prepare-phase change');
      el.innerHTML = original;
    }
  }
}

function init() {
  log('init, isEditMode:', isEditMode);
  if (!isEditMode) return;

  captureAll();

  // Capture the original innerHTML of dynamically added [freeze]/[save-freeze]
  // regions. Folded onto the single Mutation observer (Phase 2 — was its own).
  // debounce:0 so we snapshot the authored content before any runtime edit
  // mutates it; the callback is a pure read into a WeakMap (no DOM writes).
  // require:'observed' (skip only no-watch); pausable:false so a morphed-in
  // freeze region is still captured. Mutation observes document.documentElement,
  // so a [freeze] added directly to <head> at runtime is captured like any other.
  Mutation.onAddElement({
    selectorFilter: FREEZE_SELECTOR,
    require: 'observed',
    pausable: false,
    debounce: 0
  }, (changes) => {
    changes.forEach(({ element }) => capture(element));
  });

  // Phase 2: Freeze in snapshot — before snapshot-ready fires.
  // This prevents live-sync from writing unfrozen content to disk.
  onSnapshot(freezeSnapshot);

  // Phase 3a: Freeze again in prepare, for anything changed between the phases
  // (e.g. onbeforesave handlers). Pairs by the WeakMap phase 2 filled, because by
  // now the clone has lost its [no-snapshot] subtrees and position means nothing.
  onPrepareForSave(freezePrepare);
}

init();

export default saveFreeze;
