// Scenario: an authored <html viewonly> keeps a tool page in view mode, even when
// the host stamps a save token and the page sets clayEditMode = true.

test("viewonly beats the clayEditMode global and a save token", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("savetoken", "tok-123");
  document.documentElement.setAttribute("viewonly", "");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(false);
});
