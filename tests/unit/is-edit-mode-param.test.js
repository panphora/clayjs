/**
 * @jest-environment-options {"url": "https://example.com/?editmode=false"}
 */

// Scenario: the ?editmode=false URL param wins over window.clayEditMode (§1.5).

test("?editmode=false param overrides the clayEditMode global", async () => {
  window.clayEditMode = true;
  const mod = await import("../../src/core/is-edit-mode.js");
  expect(mod.isEditMode).toBe(false);
});
