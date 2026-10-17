// clay.effect(fn): run fn soon and again after anything that can change what it
// reads. Local edits arrive through the mutation hub; a live-sync merge runs with
// the hub paused, so clay:sync-applied covers it; undo and redo write through the
// hub as well, and their events are a backstop. fn runs with the hub paused, so
// its own writes (derived counts, totals) never re-trigger it, never start an
// autosave and never enter undo history. The first run is on a microtask too:
// pausing the hub mid-way through an undo.commit would split the command. fn must
// be synchronous: writes after an await land outside the pause and would loop.
export function effect(fn) {
  const clay = window.clay;
  const Mutation = clay.Mutation;
  let queued = false;
  let stopped = false;

  const run = () => {
    queued = false;
    if (stopped) return;
    Mutation.pause();
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        stop();
        console.error("clay.effect: fn returned a promise. It must be synchronous, so this effect was stopped.");
      }
    } catch (err) {
      console.error("clay.effect:", err);
    } finally {
      Mutation.resume();
    }
  };
  const schedule = () => {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(run);
  };

  const offMutation = Mutation.onAnyChange({ debounce: 0, require: "observed" }, schedule);
  document.addEventListener("clay:sync-applied", schedule);
  clay.undo?.on?.("undo", schedule);
  clay.undo?.on?.("redo", schedule);

  const stop = () => {
    stopped = true;
    offMutation();
    document.removeEventListener("clay:sync-applied", schedule);
    clay.undo?.off?.("undo", schedule);
    clay.undo?.off?.("redo", schedule);
  };

  schedule();
  return stop;
}
