// Scenario: the save token is a rung on the edit-mode ladder, not the top of it.
// An explicit window.clayEditMode = false still wins, so a host that hands out a
// token can still ship a document that opens read-only.

test("an explicit clayEditMode:false beats a save token", async () => {
  window.clayEditMode = false;
  document.documentElement.setAttribute("savetoken", "tok-123");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(false);
});
