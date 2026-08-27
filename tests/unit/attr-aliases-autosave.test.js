import { jest } from "@jest/globals";

// Scenario (isolated file): <html clay-autosave> plus a [clay-persist] input. Both
// aliases have to work together, because a page that reached for one spelling reached
// for all of them.

test("<html clay-autosave> arms autosave and [clay-persist] drives it", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("clay-autosave", "");
  document.body.innerHTML = '<div id="c">a</div><input clay-persist value="">';
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));

  jest.useFakeTimers();
  await import("../../src/core/autosave.js");

  document.getElementById("c").textContent = "b";
  document.querySelector("input[clay-persist]").dispatchEvent(new Event("input", { bubbles: true }));

  jest.advanceTimersByTime(1500);

  expect(global.fetch).toHaveBeenCalled();
  jest.useRealTimers();
});
