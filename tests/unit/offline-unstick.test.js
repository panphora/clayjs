import { jest } from "@jest/globals";

/**
 * A page that goes offline with everything already saved kept saying "Offline"
 * after the connection came back. The online handler called savePage(), which
 * correctly found nothing to send and returned 'skipped' — and a skipped save
 * never touches savestatus, so the stale attribute sat there until the next
 * real edit.
 */

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

test("coming back online on a clean page clears the offline state, silently", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));

  document.getElementById("content").textContent = "saved-state";
  await saveMod.savePage();
  await new Promise((r) => setTimeout(r, 0));

  document.documentElement.setAttribute("savestatus", "offline");

  // No save event may fire: nothing was saved. Firing one would run every
  // [onaftersave] handler and light every status chip on a lie.
  const events = [];
  const listener = (e) => events.push(e.type);
  ["saved", "saving", "error", "offline"].forEach((s) =>
    document.addEventListener("clay:save-" + s, listener)
  );

  window.dispatchEvent(new Event("online"));
  await new Promise((r) => setTimeout(r, 10));

  expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  expect(events).toEqual([]);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  ["saved", "saving", "error", "offline"].forEach((s) =>
    document.removeEventListener("clay:save-" + s, listener)
  );
});

test("coming back online with unsaved work still sends it", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));

  document.getElementById("content").textContent = "written-while-offline";
  document.documentElement.setAttribute("savestatus", "offline");

  window.dispatchEvent(new Event("online"));
  await new Promise((r) => setTimeout(r, 10));

  expect(global.fetch).toHaveBeenCalled();
  expect(global.fetch.mock.calls[0][1].body).toContain("written-while-offline");
  expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
});
