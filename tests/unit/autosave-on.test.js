import { jest } from "@jest/globals";

// Scenario (isolated file): <html autosave> + edit mode. A change plus a
// [persist] input event schedules a debounced save that reaches the network.

test("with <html autosave>, an edit triggers a debounced save", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("autosave", "");
  document.body.innerHTML = '<div id="c">a</div><input persist value="">';
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ msg: "Saved" }) }));

  jest.useFakeTimers();
  await import("../../src/core/autosave.js"); // pulls in save.js; baseline captured at import

  // Make a serializable change so the dirty check passes, then fire the
  // [persist] input path that autosave installs.
  document.getElementById("c").textContent = "b";
  document.querySelector("input[persist]").dispatchEvent(new Event("input", { bubbles: true }));

  jest.advanceTimersByTime(1500); // input-path debounce -> savePageThrottled -> save

  expect(global.fetch).toHaveBeenCalled();
  jest.useRealTimers();
});
