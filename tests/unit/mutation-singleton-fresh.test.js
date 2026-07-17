// Fresh evaluation (no hub published yet): mutation.js creates the hub, publishes
// it on window.__clayMutation + the window.hyperclay.Mutation compat mirror, and
// dispatches readiness — the mirror set BEFORE the dispatch (§2.2).

test("first evaluation publishes the hub and dispatches readiness", async () => {
  let mirrorAtDispatch;
  const events = [];
  document.addEventListener("clay:mutation-ready", (e) => {
    events.push(e.detail.Mutation);
    mirrorAtDispatch = window.hyperclay?.Mutation;
  });

  const Mutation = (await import("../../src/lib/mutation.js")).default;

  expect(window.__clayMutation).toBe(Mutation);
  expect(window.hyperclay.Mutation).toBe(Mutation);
  expect(events).toHaveLength(1);
  expect(events[0]).toBe(Mutation);
  // The compat mirror was already in place when the event fired.
  expect(mirrorAtDispatch).toBe(Mutation);
});
