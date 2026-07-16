/**
 * Auto-save system for clayjs
 *
 * Automatically saves page on DOM changes with throttling.
 * Gated by the <html autosave> attribute.
 *
 * Requires the 'save-system' module to be loaded first.
 *
 * Recommended companion modules:
 *   - 'unsaved-warning' - Warn before leaving with unsaved changes (required for beforeunload)
 */

import Mutation from "../lib/mutation.js";
import { isEditMode } from "./is-edit-mode.js";
import { savePageThrottled } from "./save.js";
import { initUserGesture, markUserDriven } from "../lib/user-gesture.js";

/**
 * Initialize auto-save on DOM changes
 * Uses debounced mutation observer
 */
function initSavePageOnChange() {
  Mutation.onAnyChange({
    debounce: 1500,
    omitChangeDetails: true,
    require: 'autosave'
  }, () => {
    savePageThrottled();
  });
}

/**
 * Initialize auto-save on input events for [persist] elements
 * Form input values don't trigger DOM mutations, so we listen for input events
 */
let inputSaveTimer = null;
function initSaveOnPersistInput() {
  document.addEventListener('input', (e) => {
    if (!e.target.closest('[persist]')) return;
    // A trusted input on a [persist] field is itself a user-driven change the
    // Mutation hub can't see (form values aren't DOM mutations). Attribute it.
    if (e.isTrusted) markUserDriven();
    clearTimeout(inputSaveTimer);
    inputSaveTimer = setTimeout(savePageThrottled, 1500);
  }, true);
}

function init() {
  if (!document.documentElement.hasAttribute("autosave")) return;
  if (!isEditMode) return;
  initUserGesture();
  initSavePageOnChange();
  initSaveOnPersistInput();
}

// No window exports - savePageThrottled is exported from save-system

// Auto-init when module is imported
init();

export default init;
