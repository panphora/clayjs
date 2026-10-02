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

// The same isolated file answers for flush: a view-mode page cannot save, so a flush
// has nothing to send and nothing to wait for.
test("view mode: flush answers 'view' and does not fetch", async () => {
  global.fetch = jest.fn();
  const saveMod = await import("../../src/core/save.js");

  await expect(saveMod.flushSave()).resolves.toEqual({ state: "view", etag: null });
  expect(global.fetch).not.toHaveBeenCalled();
});

// In view mode the warning module never loads, so the loader's fallback is what
// answers: false, because a page that cannot save has nothing unsaved to report.
test("view mode: hasUnsavedChanges answers false even after an edit", async () => {
  window.clay = {};
  window.fetch = async () => new Response("", { status: 404 });
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(""), resolve));

  document.body.innerHTML = '<div id="content">an edit nothing will write</div>';
  expect(typeof window.clay.hasUnsavedChanges).toBe("function");
  expect(window.clay.hasUnsavedChanges()).toBe(false);
});
