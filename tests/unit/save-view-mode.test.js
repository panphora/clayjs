import { jest } from "@jest/globals";

// Scenario (isolated file): NOT in edit mode. savePage's own gate resolves
// {msgType:'skipped'} and never touches the network.

test("view mode: savePage resolves skipped and does not fetch", async () => {
  // no window.clayEditMode, no owner cookie => isEditMode false
  global.fetch = jest.fn();
  const saveMod = await import("../../src/core/save.js");

  const result = await saveMod.savePage();
  expect(result.msgType).toBe("skipped");
  expect(global.fetch).not.toHaveBeenCalled();
});
