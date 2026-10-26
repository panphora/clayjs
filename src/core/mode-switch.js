// The live switch's decision, and the one lease every session starts with.
//
// A document that signs `<html clay-mode-switch="live">` is saying its code can enter and
// leave edit repeatedly. That claim is checked here, before anything is prepared: every
// module either of its plans resolves must have a support row and nothing it authored may
// have to run again, or the document keeps the guarded reload. The same goes for a queued
// participant that is not one: a lease nobody can call is not a lease.
//
// The controller reaches this module, and only the controller: a reader pays for the
// declaration and nothing else.
import { peekModeParticipants, registerModeParticipant } from "./is-edit-mode.js";
import { resourceSupport, resourcesParticipant } from "./mode-resources.js";
import { supportFor } from "./mode-support.js";

let resourcesQueued = false;

// A participant queued before boot may be a promise; the controller awaits that one
// itself. Anything else has to have the shape a lease is prepared from, and its id has to
// be unique across the queue. Validating never drains: a malformed queue is left as it is.
const participantsReady = () => {
  const ids = new Set();
  for (const entry of peekModeParticipants()) {
    if (typeof entry?.then === "function") continue;
    const id = entry?.id;
    if (typeof id !== "string" || typeof entry?.prepare !== "function") return false;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return true;
};

// Every module either road resolves: the edit plan with its own core wave, the plugins an
// implication, a default, a `[sap]` root or template metadata pulled in, and the plan this
// tab booted. Passing that whole set is the point — a plugin nobody named is checked
// exactly like one the URL did.
const resolvedPaths = (handle) => [
  ...(handle?.edit?.core ?? []),
  ...(handle?.edit?.plugins ?? []),
  ...(handle?.edit?.late ?? []),
  ...(handle?.view?.plugins ?? []),
  ...(handle?.view?.late ?? []),
];

/**
 * Which of the modules this document resolves this release cannot start and take back.
 *
 * @param {{edit?: object, view?: object}} handle - both resolved plans
 * @returns {string[]}
 */
export function unsupportedPaths(handle) {
  return [...new Set(resolvedPaths(handle))].filter((path) => supportFor(path) === null);
}

/**
 * May this document switch live, through the plans it resolved?
 *
 * @param {{edit?: object, view?: object}} handle - both resolved plans
 * @returns {boolean}
 */
export function liveAllowed(handle) {
  return participantsReady() && unsupportedPaths(handle).length === 0 && resourceSupport().reversible;
}

// The authored styles and stylesheets are the first lease of an entry: `liveAllowed` proved
// them reversible, so the entry flips them and the exit flips them back. Registered once,
// through the queue the dispatcher already holds, while the page is idle in view.
export function openResources() {
  if (resourcesQueued) return;
  resourcesQueued = true;
  registerModeParticipant(resourcesParticipant());
}
