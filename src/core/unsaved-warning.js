/**
 * Unsaved Warning Module
 *
 * Warns users before leaving the page if there are unsaved changes.
 * Self-contained: compares current page content to last saved content on beforeunload.
 *
 * Works independently of autosave - no mutation observer needed during editing,
 * just a single comparison when the user tries to leave.
 *
 * Both current and stored content have [save-remove] and [save-ignore] stripped,
 * so comparison is direct with no parsing needed.
 *
 * Requires the 'save-system' module (automatically included as dependency).
 */

import { isOwner, isEditMode } from "./is-edit-mode.js";
import { captureForComparison } from "./snapshot.js";
import { getLastSavedContents } from "./save.js";
import { logUnloadDiffSync, preloadIfEnabled } from "../lib/autosave-debug.js";

// Pre-load diff library if debug mode is on (so it's ready for unload)
preloadIfEnabled();

window.addEventListener('beforeunload', (event) => {
  if (!isOwner || !isEditMode) return;

  // Compare directly - both are already stripped
  const currentForCompare = captureForComparison();
  const lastSaved = getLastSavedContents();

  if (currentForCompare !== lastSaved) {
    // Debug: log what's different before showing the warning
    logUnloadDiffSync(currentForCompare, lastSaved);

    event.preventDefault();
    event.returnValue = '';
  }
});
