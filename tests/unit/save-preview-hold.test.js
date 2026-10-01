import { jest } from "@jest/globals";

/**
 * The preview hold in save.js.
 *
 * While an AI edit's rewrite is on screen and nobody has kept it, the DOM holds
 * words the person has not accepted. Autosave is already suspended by the plugin,
 * which left the explicit lanes open: Cmd+S, savePageForce, the [persist] input
 * timer and the wire's pre-send flush all still wrote the unkept rewrite to disk
 * and out to every other tab. The hold closes every one of them and remembers that
 * a save was asked for, so it can run once the preview ends.
 */

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

function okFetch() {
  return jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
}

const settle = () => new Promise((r) => setTimeout(r, 0));

const HELD = /AI edit/;

test("a manual save during the preview is skipped and sends nothing", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-manual";
  saveMod.holdAllSaves();

  const result = await saveMod.savePage();

  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(HELD);
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves({ replay: false });
});

test("a forced save during the preview is skipped and sends nothing", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-force";
  saveMod.holdAllSaves();

  const result = await saveMod.savePageForce();

  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(HELD);
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves({ replay: false });
});

test("the throttled autosave lane is held too", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-throttled";
  saveMod.holdAllSaves();

  const result = await saveMod.savePageThrottled();

  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(HELD);
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves({ replay: false });
});

test("the save asked for during the preview runs on release, once", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-released";
  saveMod.holdAllSaves();

  const held = await saveMod.savePage();
  expect(held.msgType).toBe("skipped");
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves();
  await settle();

  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("a release that replays nothing leaves the remembered save unsent", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-kept";
  saveMod.holdAllSaves();

  await saveMod.savePage();
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves({ replay: false });
  await settle();

  expect(global.fetch).not.toHaveBeenCalled();
});

test("two holds need two releases before the remembered save runs", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "hold-nested";
  saveMod.holdAllSaves();
  saveMod.holdAllSaves();

  const held = await saveMod.savePage();
  expect(held.msgType).toBe("skipped");

  saveMod.releaseAllSaves();
  await settle();
  expect(global.fetch).not.toHaveBeenCalled();

  saveMod.releaseAllSaves();
  await settle();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
