// Scenario: window.clayEditMode wins over the cookie; cookie value is
// JSON-decoded so a "false" cookie is NOT owner (decoded-truthy, §1.5).

test("cookie.get JSON-decodes so 'false' is falsy", async () => {
  document.cookie = "isAdminOfCurrentResource=false";
  const cookie = (await import("../../src/lib/cookie.js")).default;
  expect(cookie.get("isAdminOfCurrentResource")).toBe(false);
});

test("clayEditMode global wins; decoded-truthy cookie => not owner", async () => {
  window.clayEditMode = true;
  document.cookie = "isAdminOfCurrentResource=false";
  const mod = await import("../../src/core/is-edit-mode.js");
  expect(mod.isEditMode).toBe(true);   // global forces edit mode
  expect(mod.isOwner).toBe(false);     // cookie "false" decodes to false
});
