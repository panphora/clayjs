import { jest } from "@jest/globals";

// Scenario (isolated file): edit mode but NO <html autosave>. The gate returns
// early, so no autosave path is installed and an edit never saves on its own.

test("without <html autosave>, an edit does not trigger a save", async () => {
  window.clayEditMode = true; // edit mode, but the autosave attribute is absent
  document.body.innerHTML = '<div id="c">a</div><input persist value="">';
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ msg: "Saved" }) }));

  jest.useFakeTimers();
  await import("../../src/core/autosave.js");

  document.getElementById("c").textContent = "b";
  document.querySelector("input[persist]").dispatchEvent(new Event("input", { bubbles: true }));

  jest.advanceTimersByTime(3000);

  expect(global.fetch).not.toHaveBeenCalled();
  jest.useRealTimers();
});
