/**
 * @jest-environment-options {"url": "https://example.com/?editmode=true"}
 */

// Scenario: ?editmode=true still opens a viewonly document for editing.

test("?editmode=true param overrides viewonly", async () => {
  document.documentElement.setAttribute("viewonly", "");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(true);
});
