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
import { supportFor } from "./mode-support.js";

let generation = 0;
let leases = [];
let roster = [];
let inFlight = null;
// A tab that booted in edit started its sessions at evaluation; the first exit adopts them
// instead of preparing its own.
let initialSession = false;

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

// The modules an edit plan resolves, in the order the plan names them.
const editPlanPaths = (handle) => [
  ...(handle?.edit?.core ?? []),
  ...(handle?.edit?.plugins ?? []),
  ...(handle?.edit?.late ?? []),
];

// The built-ins a session starts: one participant per loaded edit-plan path whose support
// row exports one, in plan order. A path the plan names but the entry could not load
// contributes nothing, and a neutral row never does.
function builtinParticipants(handle) {
  const found = [];
  for (const path of editPlanPaths(handle)) {
    if (supportFor(path) !== "export") continue;
    const mod = handle.loaded?.[path];
    if (!mod) continue;
    found.push(mod.modeParticipant?.());
  }
  return found;
}

// Participants may be queued as promises, and the queue is where the authored resources'
// lease arrives. The first claim on an id wins; `order` decides prepare order. A queued
// entry that is not a participant is a document this release cannot start, and it is
// found before anything is prepared.
async function collectRoster(handle) {
  const seen = new Set(roster.map(({ id }) => id));
  const add = (participant) => {
    if (typeof participant?.id !== "string" || typeof participant.prepare !== "function") {
      throw fault("a participant needs an id and a prepare()", "unsupported-plugin");
    }
    if (seen.has(participant.id)) return;
    seen.add(participant.id);
    roster.push(participant);
  };
  if (handle) for (const participant of builtinParticipants(handle)) add(participant);
  for (const entry of takeModeParticipants()) add(await entry);
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

async function enter(handle = null) {
  const before = current();
  const editBefore = isEditMode;
  const controller = new AbortController();
  const context = {
    generation: ++generation,
    destination: modeState().destination,
    signal: controller.signal,
    // No reader on this road yet: the entry takes the page as it stands.
    represented: null,
    reader: null,
    initial: false,
    // Abandonment is cancellation as well as a newer generation: a lease that resolves
    // after the deadline belongs to no session and must not be kept.
    isCurrent: () => context.generation === generation && !controller.signal.aborted,
  };
  commitModeFacts({ phase: "entering", generation: context.generation, reason: null });
  // A tab that booted in edit is already running the sessions an entry would prepare, so
  // its exit adopts them rather than starting a second set.
  if (!handle) initialSession = true;

  const prepared = [];
  const fresh = [];
  let save = null;
  // Whether any participant has been asked for a lease. Before that, a document this
  // release cannot start still has its guarded reload; after it, a failure is a refusal.
  let started = false;
  // Preparation answers only for itself: whatever it builds after the deadline is
  // disposed by the continuation that notices the abandonment, never here.
  const preparation = (async () => {
    try {
      // The edit plan's missing modules, imported while the committed mode is still view:
      // every import-time edit half is inert there, so what a module starts is exactly
      // what its lease starts at the commit.
      if (handle) {
        const plan = await import("./mode-switch.js");
        fresh.push(...(await plan.importPlan(handle, handle.edit, { signal: controller.signal })));
      }
      // Inside the deadline, because the generation commits in the boundary below.
      save = handle?.loaded?.["core/save.js"] ?? (await import("./save.js"));
      for (const participant of await collectRoster(handle)) {
        started = true;
        const lease = await participant.prepare(context);
        if (!lease) continue;
        prepared.push(lease);
        if (!context.isCurrent()) throw fault(`"${participant.id}" prepared for a stale generation`, "stale-document");
        if (lease.ready) await lease.ready;
        if (!context.isCurrent()) throw fault(`"${participant.id}" became ready for a stale generation`, "stale-document");
      }
      // A live entry's baseline is the page as it stands: no reader has a receipt to take
      // it from, so one capture settles both baselines and the dirty gate's token. A boot
      // that already starts in edit settled its own when it read the file.
      if (handle) {
        const baseline = save.adoptEntryBaseline({ represented: context.represented });
        if (baseline && baseline.ok === false) {
          throw Object.assign(fault("the page moved since the last session", baseline.code || "pending-input"), baseline);
        }
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
    // Nothing was prepared, so nothing has changed: the caller keeps its guarded reload
    // and the page goes back to an idle view. Once a lease exists, replacing the page
    // under it is worse than saying no.
    if (!started) {
      commitModeFacts({ phase: "idle", reason: null });
      return null;
    }
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
  // One announcement per plugin this entry loaded, after the mode change: a plugin is
  // announced by the boot that loaded it exactly once, and a refused entry announces
  // nothing so the next successful one does.
  for (const path of fresh) handle?.announce?.(path);
  return { ok: true, mode: current(), changed: before !== current() };
}

// The wait for the boot late tail, bounded by the same deadline as every other transition.
const withinDeadline = async (pending) => {
  if (!pending) return true;
  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), DEADLINE_MS);
  });
  try {
    return await Promise.race([Promise.resolve(pending).then(() => true, () => true), deadline]);
  } finally {
    clearTimeout(timer);
  }
};

// The sessions this tab's explicit initial edit already started, taken as leases over what
// the imports did rather than started again: a lease that starts nothing, quiesces and
// disposes the running session. A path that cannot be adopted leaves the caller its flush
// and reload.
async function adoptInitial(handle) {
  if (!handle) return [];
  // The boot late tail may still be importing. Waiting inside the deadline keeps its
  // sessions adoptable; one that lands after this exit stays cached and starts nothing,
  // because the module reads the committed mode when it evaluates.
  await withinDeadline(handle.late);
  const participants = [];
  for (const path of editPlanPaths(handle)) {
    if (supportFor(path) !== "export") continue;
    const mod = handle.loaded?.[path];
    // Not loaded: it started nothing, so there is nothing to hand back.
    if (!mod) continue;
    const participant = mod.modeParticipant?.();
    if (typeof participant?.id !== "string" || typeof participant.prepare !== "function") return null;
    participants.push(participant);
  }
  participants.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const adopted = [];
  const context = {
    generation,
    destination: modeState().destination,
    signal: undefined,
    represented: null,
    reader: null,
    initial: true,
    isCurrent: () => true,
  };
  for (const participant of participants) {
    let lease = null;
    try {
      lease = await participant.prepare(context);
    } catch {
      return null;
    }
    if (lease) adopted.push(lease);
  }
  return adopted;
}

// Exit. Nothing here is a public flush: the barrier is the one write an exit may make, and
// it runs under the document-operation slot this transition takes and holds, so a
// replacement cannot start between the quiesce and the bytes.
async function leave(handle = null) {
  const initial = initialSession;
  initialSession = false;
  commitModeFacts({ phase: "leaving" });
  const transition = await import("./mode-transition.js").catch(() => null);
  if (!transition) return refuse("load-failed");
  let held = leases;
  if (initial) {
    const adopted = await adoptInitial(handle);
    if (!adopted) {
      commitModeFacts({ phase: "idle", reason: null });
      return null;
    }
    held = [...adopted, ...held];
    leases = held;
  }
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
export function requestMode(target, handle = null) {
  if (target !== "edit" && target !== "view") throw new TypeError(`clay.modeLifecycle: unknown mode "${target}"`);
  if (inFlight) return inFlight.target === target ? inFlight.promise : { ok: false, mode: current(), code: "busy" };
  if (target === current()) return { ok: true, mode: current(), changed: false };
  if (!canEdit || isDraftMode) return { ok: false, mode: current(), code: "not-allowed" };
  const promise = (target === "edit" ? enter(handle) : leave(handle)).finally(() => {
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
  if (inFlight || target === current()) return requestMode(target, plan);
  if (target === "edit") decision.openResources();
  return requestMode(target, plan);
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
