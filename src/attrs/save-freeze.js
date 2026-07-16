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

function freezeClone(clone) {
  const liveElements = document.querySelectorAll(FREEZE_SELECTOR);
  const cloneElements = clone.querySelectorAll(FREEZE_SELECTOR);

  log('freezing clone — live:', liveElements.length, 'clone:', cloneElements.length);

  for (let i = 0; i < cloneElements.length; i++) {
    const liveEl = liveElements[i];
    const hasOriginal = liveEl && originals.has(liveEl);
    if (hasOriginal) {
      const original = originals.get(liveEl);
      const current = cloneElements[i].innerHTML;
      if (original !== current) {
        log('element', i, '— restoring original');
        cloneElements[i].innerHTML = original;
      }
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
  // freeze region is still captured. NOTE: the old observer watched
  // document.documentElement; Mutation watches document.body, so a [freeze] added
  // directly to <head> at runtime is no longer captured (authored <head> freeze
  // regions are still handled by captureAll() on load) — an accepted edge.
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
  onSnapshot(freezeClone);

  // Phase 3a: Freeze again in prepare — belt-and-suspenders.
  // Catches any modifications made between phase 2 and 3a (e.g., onbeforesave handlers).
  onPrepareForSave(freezeClone);
}

init();

export default saveFreeze;
