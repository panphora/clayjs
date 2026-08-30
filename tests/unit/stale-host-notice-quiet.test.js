// The other half: a current host draws nothing. A notice that appears on a healthy page
// would be worse than no notice at all.

test("a host serving the current token gets no notice", async () => {
  document.documentElement.setAttribute("savetoken", "tok-spec");

  await import("../../src/core/stale-host-notice.js");

  expect(document.querySelector("[data-clay-stale-host]")).toBeNull();
});
