// Consumers (sap's mutation bridge, hypercms's fast path) read clay.Mutation from
// inside their clay:mutation-ready listener, and the loader's assembleCore does not
// run until after mutation.js finishes evaluating. Publish the hub after the
// dispatch and they keep their own native observers forever — no error, no log.
// Its own file: native ESM caches per test file, so only one test per file gets a
// fresh evaluation of the install IIFE.

test("clay.Mutation is readable from inside a clay:mutation-ready listener", async () => {
  let hubAtDispatch;
  document.addEventListener("clay:mutation-ready", () => {
    hubAtDispatch = window.clay?.Mutation;
  }, { once: true });

  const Mutation = (await import("../../src/lib/mutation.js")).default;

  expect(hubAtDispatch).toBeTruthy();
  expect(hubAtDispatch).toBe(Mutation);
});
