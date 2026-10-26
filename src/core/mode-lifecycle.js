// The mode controller: the one module that prepares, enables, quiesces and disposes
// edit leases. It is a dynamic target, fetched by an explicit initial edit or the first
// live switch, so a reader that never asks to edit never downloads it.
//
// A lease is `{ready, enable, quiesce, resume, dispose}` for one participant. `prepare`
// may fetch and build inert UI; `enable` is synchronous once every preparation has
// succeeded; `quiesce` stops admission without losing buffers, so a refused exit can
// `resume` the very same lease; and `dispose` runs only after a committed exit.
//
// The save generation and the exit's barrier are imported when a transition needs them,
// never at the top: this module's own graph stays what it was.
import {
  canEdit,
  isDraftMode,
  isEditMode,
  commitModeFacts,
  modeState,
  noteParticipantForget,
  takeModeParticipants,
} from "./is-edit-mode.js";

let generation = 0;
let leases = [];
let roster = [];
let inFlight = null;

// One deadline covers the whole transition: every import a participant prepares from,
// the preparation itself, and the commit.
const DEADLINE_MS = 15000;

const current = () => modeState().mode;

const fault = (message, code) => Object.assign(new Error(`clay.modeLifecycle: ${message}`), { code });

// A committed change is announced so the engines that follow the session (Sap's undo
// pair) rebind once, keyed on `state.generation`.
function announceMode() {
  document.dispatchEvent(new Event("clay:modechange"));
}

function refuse(code, phase = "idle", extra = {}) {
  commitModeFacts({ phase, reason: code });
  return { ok: false, mode: current(), code, ...extra };
}

// A lease handed nothing back has nothing to take back. Reverse order is the exit's, so a
// lease enabled last is disposed first.
function disposeInReverse(list) {
  for (const lease of [...list].reverse()) {
    try {
      lease.dispose?.();
    } catch {}
  }
}

function setRootEditMode(on) {
  document.documentElement.setAttribute("editmode", on ? "true" : "false");
}

// Participants may be queued as promises. Their ids have to stay unique across every
// registration this page ever made, and `order` decides prepare order.
async function rosterOf() {
  for (const entry of takeModeParticipants()) {
    const participant = await entry;
    if (typeof participant?.id !== "string" || typeof participant.prepare !== "function") {
      throw fault("a participant needs an id and a prepare()", "unsupported-plugin");
    }
    if (roster.some(({ id }) => id === participant.id)) {
      throw fault(`duplicate participant id "${participant.id}"`, "unsupported-plugin");
    }
    roster.push(participant);
  }
  return [...roster].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// A registration this page took back while idle in view leaves the roster too, so the next
// entry never prepares a participant nobody wants. Loaded, the controller is the only
// owner of the roster; the registry calls this and never fetches the controller for it.
export function forgetParticipant(id) {
  const index = roster.findIndex((participant) => participant.id === id);
  if (index !== -1) roster.splice(index, 1);
}

noteParticipantForget(forgetParticipant);

async function enter() {
  const before = current();
  const editBefore = isEditMode;
  const controller = new AbortController();
  const context = {
    generation: ++generation,
    destination: modeState().destination,
    signal: controller.signal,
    // Abandonment is cancellation as well as a newer generation: a lease that resolves
    // after the deadline belongs to no session and must not be kept.
    isCurrent: () => context.generation === generation && !controller.signal.aborted,
  };
  commitModeFacts({ phase: "entering", generation: context.generation, reason: null });

  const prepared = [];
  let save = null;
  // Preparation answers only for itself: whatever it builds after the deadline is
  // disposed by the continuation that notices the abandonment, never here.
  const preparation = (async () => {
    try {
      // Inside the deadline, because the generation commits in the boundary below.
      save = await import("./save.js");
      for (const participant of await rosterOf()) {
        const lease = await participant.prepare(context);
        if (!lease) continue;
        prepared.push(lease);
        if (!context.isCurrent()) throw fault(`"${participant.id}" prepared for a stale generation`, "stale-document");
        if (lease.ready) await lease.ready;
        if (!context.isCurrent()) throw fault(`"${participant.id}" became ready for a stale generation`, "stale-document");
      }
      return true;
    } catch (err) {
      disposeInReverse(prepared);
      throw err;
    }
  })();

  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, DEADLINE_MS);
  });

  let ready;
  try {
    ready = await Promise.race([preparation, deadline]);
  } catch (err) {
    clearTimeout(timer);
    controller.abort();
    return refuse(err?.code || "load-failed", "blocked", { message: err?.message });
  }
  clearTimeout(timer);
  if (!ready) {
    // The entry is over; its continuation still holds a lease that has not resolved.
    preparation.catch(() => {});
    return refuse("timeout");
  }

  // One synchronous boundary, no await between these steps: the mode facts commit while
  // the phase still says `entering` (so `canWrite()` is false), the root attribute and the
  // save generation follow, the leases enable, and only then does the phase go `idle` and
  // the one announcement out. An `enable` therefore sees the committed edit facts.
  commitModeFacts({ mode: isDraftMode ? "draft" : "edit", isEditMode: true });
  setRootEditMode(true);
  save?.setSaveGeneration(context.generation);
  try {
    for (const lease of prepared) lease.enable();
  } catch (err) {
    // The blocked fault: the facts and the root attribute go back, everything prepared is
    // taken back in reverse, and the page keeps the reason.
    commitModeFacts({ mode: before, isEditMode: editBefore });
    setRootEditMode(false);
    disposeInReverse(prepared);
    controller.abort();
    return refuse(err?.code || "load-failed", "blocked", { message: err?.message });
  }
  leases = prepared;
  commitModeFacts({ phase: "idle", reason: null });
  announceMode();
  return { ok: true, mode: current(), changed: before !== current() };
}

// Exit. Nothing here is a public flush: the barrier is the one write an exit may make, and
// it runs under the document-operation slot this transition takes and holds, so a
// replacement cannot start between the quiesce and the bytes.
async function leave() {
  const held = leases;
  commitModeFacts({ phase: "leaving" });
  const transition = await import("./mode-transition.js").catch(() => null);
  if (!transition) return refuse("load-failed");
  const quiesced = [];
  let operation = null;
  try {
    operation = transition.claimOperation("mode");
    if (!operation) throw fault("another document operation is in progress", "busy");
    for (const lease of [...held].reverse()) {
      quiesced.push(lease);
      const answer = await lease.quiesce?.();
      // A refusal is a refusal whether it was thrown or answered.
      if (answer && answer.ok === false) {
        throw Object.assign(fault("a lease refused the exit", answer.code || "pending-input"), answer);
      }
    }
    const barrier = await transition.runSaveBarrier({ operation });
    if (!barrier.ok) throw Object.assign(fault("the exit barrier refused", barrier.code || "save-failed"), barrier);
  } catch (err) {
    for (const lease of [...quiesced].reverse()) {
      try {
        lease.resume?.();
      } catch {}
    }
    commitModeFacts({ phase: "idle", reason: err?.code || "save-failed" });
    return { ok: false, mode: current(), code: err?.code || "save-failed", state: err?.state, pending: err?.pending };
  } finally {
    if (operation) transition.releaseOperation(operation);
  }
  disposeInReverse(held);
  leases = [];
  generation++;
  setRootEditMode(false);
  commitModeFacts({ mode: "view", isEditMode: false, phase: "idle", generation, reason: null });
  announceMode();
  return { ok: true, mode: "view", changed: true };
}

// The switch. Joining the transition already running for the same target answers with
// that same promise; asking for the other one while it runs answers busy — including for
// the mode still committed — and leaves the running transition untouched.
export function requestMode(target) {
  if (target !== "edit" && target !== "view") throw new TypeError(`clay.modeLifecycle: unknown mode "${target}"`);
  if (inFlight) return inFlight.target === target ? inFlight.promise : { ok: false, mode: current(), code: "busy" };
  if (target === current()) return { ok: true, mode: current(), changed: false };
  if (!canEdit || isDraftMode) return { ok: false, mode: current(), code: "not-allowed" };
  const promise = (target === "edit" ? enter() : leave()).finally(() => {
    inFlight = null;
  });
  inFlight = { target, promise };
  return promise;
}

// The public transaction for a document that signed the live-switch contract: the plan it
// resolved for an editor is checked first, and a document this release cannot start and
// take back answers `null` so its caller keeps the guarded reload.
export async function switchMode(target, plan) {
  // A decision this release cannot fetch leaves the caller its guarded reload, and the
  // failed import is not kept: the next ask asks again.
  const decision = await import("./mode-switch.js").catch(() => null);
  if (!decision || !decision.liveAllowed(plan)) return null;
  // A transition already running answers for itself: it joins or refuses, and this call
  // touches nothing on the way there.
  if (inFlight || target === current()) return requestMode(target);
  if (target === "edit") decision.openResources();
  return requestMode(target);
}

// The explicit initial edit: this tab already starts in edit or draft, so nothing
// switches. The preboot queue is drained, prepared and enabled before input instead.
export async function activateInitial() {
  if (current() === "view") return { ok: true, mode: "view", changed: false };
  if (inFlight) return inFlight.promise;
  const promise = enter().finally(() => {
    inFlight = null;
  });
  inFlight = { target: "edit", promise };
  return promise;
}
