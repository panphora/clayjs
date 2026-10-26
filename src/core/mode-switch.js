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

// The abort an entry reports when its own deadline or a newer generation cancelled it:
// named as the platform names a cancelled import, so a caller can tell it apart from a
// module that failed.
const cancelled = () =>
  Object.assign(new Error("clay.modeLifecycle: the import was cancelled"), { name: "AbortError", code: "aborted" });

/**
 * Import an edit plan's missing modules through the loader's own record and import cache.
 *
 * One path at a time, core then plugins then the late tail, in plan order: the same order
 * boot imports them in, for the same reasons. A path boot already loaded is skipped, so
 * nothing evaluates twice; a path in flight is awaited, so boot's late tail and an entry
 * that overlap share one import; and a rejected thunk is dropped from the cache so the
 * next attempt calls it again. It attaches the edit members once the core has landed and
 * each plugin's member as that plugin lands, exactly as boot does, and it announces
 * nothing: the plugin-ready events belong to a committed entry, not to an import.
 *
 * @param {object} handle - the loader's handle: `{loaded, modules, attach, attachEditCore, loadEditHints, late}`
 * @param {{core?: string[], plugins?: string[], late?: string[]}} plan
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<string[]>} the plugin paths this call newly loaded
 */
export async function importPlan(handle, plan, { signal } = {}) {
  const inflight = (handle.inflight ||= new Map());
  const newlyLoaded = [];

  const stop = () => { if (signal?.aborted) throw cancelled(); };

  // The loader's own hint fetch, which preloads what it returns against this plan. A failed
  // fetch defers hints, never an import already mapped.
  const hints = handle.loadEditHints?.();
  if (hints) {
    try {
      await hints;
    } catch {}
  }

  const importPath = (path) => {
    if (!inflight.has(path)) {
      const promise = Promise.resolve()
        .then(() => handle.modules[path]())
        .catch((err) => {
          inflight.delete(path);
          throw err;
        });
      inflight.set(path, promise);
    }
    return inflight.get(path);
  };

  for (const path of plan.core ?? []) {
    if (handle.loaded[path]) continue;
    stop();
    const mod = await importPath(path);
    handle.loaded[path] = mod;
    mod.install?.();
  }
  // Once, after the core wave: the members those modules offer, added to the facade
  // boot assembled rather than replacing it.
  handle.attachEditCore(handle.loaded);

  for (const path of plan.plugins ?? []) {
    if (handle.loaded[path]) continue;
    stop();
    const mod = await importPath(path);
    handle.loaded[path] = mod;
    handle.attach(path, mod);
    newlyLoaded.push(path);
  }

  const late = (plan.late ?? []).filter((path) => !handle.loaded[path]);
  if (late.length) {
    // Boot's tail may be importing these same paths right now, and it records them in the
    // same table a moment after each import resolves. Waiting for it costs nothing an
    // entry was not already waiting for, and it is what keeps one import per path.
    stop();
    try {
      await handle.late;
    } catch {}
    for (const path of late) {
      if (handle.loaded[path]) continue;
      stop();
      const mod = await importPath(path);
      handle.loaded[path] = mod;
      handle.attach(path, mod);
      newlyLoaded.push(path);
    }
  }

  return newlyLoaded;
}
