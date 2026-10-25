export const PHASES = Object.freeze({
  loading: "loading",
  joining: "joining",
  adopting: "adopting",
  ready: "ready",
  blocked: "blocked",
  error: "error",
});

const TERMINAL = new Set([PHASES.ready, PHASES.blocked, PHASES.error]);

let installs = 0;

const monotonic = () => globalThis.performance?.now?.() ?? Date.now();

export function createInstall({ gen = 0, isCurrent = () => true, onPhase = null } = {}) {
  installs += 1;
  return {
    installId: installs,
    gen,
    isCurrent,
    onPhase: typeof onPhase === "function" ? onPhase : null,
    phase: PHASES.loading,
    result: null,
    at: monotonic(),
    controller: new AbortController(),
    disposers: [],
    disposed: false,
  };
}

export function isCurrent(inst) {
  return !inst.disposed && inst.isCurrent() !== false;
}

export function setPhase(inst, phase, reason = null) {
  if (TERMINAL.has(inst.phase) && inst.result) return inst.result;
  inst.phase = phase;
  inst.at = monotonic();
  inst.result = Object.freeze({ phase, reason: reason ?? null, installId: inst.installId, at: inst.at });
  try {
    inst.onPhase?.(inst.result);
  } catch (error) {
    console.error("clayjs: page boot phase callback failed", error);
  }
  return inst.result;
}

export function finishBlocked(inst, reason) {
  const result = setPhase(inst, PHASES.blocked, reason);
  inst.editorReadyResolve?.();
  return result;
}

export function finishError(inst, reason) {
  return setPhase(inst, PHASES.error, reason);
}

export function addDisposer(inst, dispose) {
  if (typeof dispose === "function") inst.disposers.push(dispose);
  return dispose;
}

export function disposeInstall(inst) {
  if (inst.disposed) return;
  inst.disposed = true;
  try {
    inst.controller.abort();
  } catch (error) {
    console.error("clayjs: page boot abort failed", error);
  }
  const disposers = inst.disposers.splice(0).reverse();
  for (const dispose of disposers) {
    try {
      dispose();
    } catch (error) {
      console.error("clayjs: a page boot disposer failed", error);
    }
  }
}

export function mark(name, inst) {
  const perf = globalThis.performance;
  if (typeof perf?.mark !== "function") return;
  try {
    perf.mark(name, { detail: { installId: inst.installId } });
  } catch (error) {
    try { perf.mark(name); } catch (ignored) { return; }
  }
}

function stop(inst, result) {
  if (result.cancelled) return null;
  return finishBlocked(inst, result.reason ?? "boot-incomplete");
}

// One coordinator for the edit boot, in the file's own serial order: read the
// source, take the assets, prepare authority, mount, adopt, then enable input.
// Every step reports an outcome and every await is followed by an ownership
// check, so a late or cancelled installation can neither mutate the page nor
// mark it ready.
export async function runBoot(inst, steps) {
  mark("document:boot", inst);
  setPhase(inst, PHASES.loading);

  const read = steps.readSource(inst);
  if (!isCurrent(inst)) return null;
  if (!read.ok) return finishBlocked(inst, read.reason);
  const source = read.source;

  const loaded = steps.loadEditorAssets(inst, source);
  if (!isCurrent(inst)) return null;
  if (!loaded.ok) return finishBlocked(inst, loaded.reason);

  setPhase(inst, PHASES.joining);
  const admitted = await steps.prepareAuthority(inst, source, loaded);
  if (!isCurrent(inst)) return null;
  if (!admitted.ok) return stop(inst, admitted);
  mark("document:authority-ready", inst);

  const mounted = steps.mountAndAttach(inst, source, loaded, admitted);
  if (!isCurrent(inst)) return null;
  if (!mounted.ok) return stop(inst, mounted);

  setPhase(inst, PHASES.adopting);
  const adoption = await steps.adoptSource(inst, source, mounted);
  if (!isCurrent(inst)) return null;
  if (!adoption.ok) return stop(inst, adoption);

  const enabled = await steps.enableInput(inst, mounted);
  if (!isCurrent(inst)) return null;
  if (!enabled.ok) return stop(inst, enabled);

  mark("document:input-ready", inst);
  return setPhase(inst, PHASES.ready);
}
