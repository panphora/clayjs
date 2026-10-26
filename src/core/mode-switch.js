// The live switch's decision, and the one lease every session starts with.
//
// A document that signs `<html clay-mode-switch="live">` is saying its code can enter and
// leave edit repeatedly. That claim is checked here, before anything is prepared: every
// module its edit plan asks for must have an adapter and nothing it authored may have to
// run again, or the document keeps the guarded reload. The same goes for a queued
// participant that is not one: a lease nobody can call is not a lease.
//
// The controller reaches this module, and only the controller: a reader pays for the
// declaration and nothing else.
import { registerModeParticipant } from "./is-edit-mode.js";
import { requiresReload, resourcesParticipant } from "./mode-resources.js";

let resourcesQueued = false;

// A participant queued before boot may be a promise; the controller awaits that one
// itself. Anything else has to have the shape a lease is prepared from.
const participantsReady = () =>
  (window.clay?.modeParticipants ?? []).every(
    (entry) => typeof entry?.then === "function" || (typeof entry?.id === "string" && typeof entry?.prepare === "function")
  );

/**
 * May this document switch live, through the plan it resolved for an editor?
 *
 * @param {string[]} plan - the modules the edit plan asks for
 * @returns {boolean}
 */
export function liveAllowed(plan) {
  return participantsReady() && !requiresReload(plan);
}

// The authored styles and stylesheets are the first lease of an entry: `liveAllowed` proved
// them reversible, so the entry flips them and the exit flips them back. Registered once,
// through the queue the dispatcher already holds, while the page is idle in view.
export function openResources() {
  if (resourcesQueued) return;
  resourcesQueued = true;
  registerModeParticipant(resourcesParticipant());
}
