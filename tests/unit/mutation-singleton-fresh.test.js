// Fresh evaluation (no hub published yet): mutation.js creates the hub, publishes
// it on window.__clayMutation + window.clay.Mutation, and dispatches readiness —
// the hub set BEFORE the dispatch (§2.2).

test("first evaluation publishes the hub and dispatches readiness", async () => {
  let hubAtDispatch;
  const events = [];
  document.addEventListener("clay:mutation-ready", (e) => {
    events.push(e.detail.Mutation);
    hubAtDispatch = window.clay?.Mutation;
  });

  const Mutation = (await import("../../src/lib/mutation.js")).default;

  expect(window.__clayMutation).toBe(Mutation);
  expect(window.clay.Mutation).toBe(Mutation);
  expect(events).toHaveLength(1);
  expect(events[0]).toBe(Mutation);
  // The hub was already in place when the event fired.
  expect(hubAtDispatch).toBe(Mutation);
});
