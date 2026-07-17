// A hub already published on window.__clayMutation (as a different-URL module
// instance would leave it): mutation.js adopts it, creates no second observer,
// and does NOT re-dispatch readiness (§2.2).

test("second evaluation adopts the existing hub and stays silent", async () => {
  const existing = { adopted: true, onAnyChange() {} };
  window.__clayMutation = existing;

  let dispatched = 0;
  document.addEventListener("clay:mutation-ready", () => { dispatched++; });

  const Mutation = (await import("../../src/lib/mutation.js")).default;

  expect(Mutation).toBe(existing);       // adopted, not re-created
  expect(dispatched).toBe(0);            // no readiness re-dispatch
});
