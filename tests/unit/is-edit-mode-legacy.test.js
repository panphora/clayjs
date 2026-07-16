// Scenario: no clayEditMode set, legacy window.__hyperclayEditMode is honored
// as the fallback (htmlclay injects it today), and there is no owner cookie.

test("legacy __hyperclayEditMode fallback turns on edit mode without a cookie", async () => {
  window.__hyperclayEditMode = true;
  const mod = await import("../../src/core/is-edit-mode.js");
  expect(mod.isEditMode).toBe(true);
  expect(mod.isOwner).toBe(false);
});
