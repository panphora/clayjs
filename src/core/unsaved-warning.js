/**
 * Unsaved Warning Module
 *
 * Warns users before leaving the page if there are unsaved changes.
 * Self-contained: compares current page content to last saved content on beforeunload.
 *
 * Works independently of autosave - no mutation observer needed during editing,
 * just a single comparison when the user tries to leave.
 *
 * Both current and stored content have [save-remove] stripped, so comparison is
 * direct with no parsing needed. [save-ignore] / no-trigger-autosave regions are
 * KEPT here: they don't trigger an autosave, so an edit in one is precisely the
 * kind that would be lost without a warning.
 *
 * Requires the 'save-system' module (automatically included as dependency).
 */

import { isEditMode } from "./is-edit-mode.js";
import { captureForDirtyCheck } from "./snapshot.js";
import { getLastSavedDirty } from "./save.js";
import { logUnloadDiffSync, preloadIfEnabled } from "../lib/autosave-debug.js";

// Pre-load diff library if debug mode is on (so it's ready for unload)
preloadIfEnabled();

// Gated on isEditMode, not isOwner. isOwner means the platform's admin cookie
// specifically, so gating on it switched the warning off for every host that
// authenticates another way: htmlclay, anything using a root save token, and any
// sandboxed document, which cannot read cookies at all. Those are exactly the
// documents where an unsaved edit is easiest to lose. If the page is editable,
// the person editing it deserves the warning.
window.addEventListener('beforeunload', (event) => {
  if (!isEditMode) return;

  // The DIRTY domain, not the autosave domain. An edit inside a
  // no-trigger-autosave region never starts a save by itself, which is exactly
  // why closing the tab on one has to warn: nothing else is going to write it.
  const currentForCompare = captureForDirtyCheck();
  const lastSaved = getLastSavedDirty();

  if (currentForCompare !== lastSaved) {
    // Debug: log what's different before showing the warning
    logUnloadDiffSync(currentForCompare, lastSaved);

    event.preventDefault();
    event.returnValue = '';
  }
});
