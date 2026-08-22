import { jest } from "@jest/globals";

/**
 * `Save-Trigger: user|auto` tells the host whether a person was behind a save.
 * hyperclay's recovery guard uses it: a destructive `ui-gestured` save advances
 * the baseline silently, a destructive background save raises a recovery chip.
 *
 * Two defects made it near-useless. Gesture tracking was installed behind the
 * `<html autosave>` gate, so every manual-save page reported all of its human
 * saves as background writes. And "a person pressed Save" was not counted as
 * human at all.
 *
 * The fix has its own trap, which is why the intent is scoped to one attempt:
 * a sticky "a human asked" bit set when Save is pressed on a CLEAN page is never
 * consumed, because nothing is sent, and then rides the next background write.
 */

let saveMod, gestureMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div><button trigger-save>Save</button>';
  saveMod = await import("../../src/core/save.js");
  gestureMod = await import("../../src/lib/user-gesture.js");
});

beforeEach(() => {
  gestureMod._resetUserGesture();
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
});

function triggerHeader(callIndex = 0) {
  return global.fetch.mock.calls[callIndex][1].headers["Save-Trigger"];
}

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

test("a background save with no gesture behind it reports auto", async () => {
  document.getElementById("content").textContent = "background-write";
  await saveMod.savePage();
  expect(triggerHeader()).toBe("auto");
});

test("pressing Save reports user", async () => {
  document.getElementById("content").textContent = "typed-by-hand";
  gestureMod.markExplicitSave();
  await saveMod.savePage();
  expect(triggerHeader()).toBe("user");
});

test("an edit made in a trusted turn reports user", async () => {
  gestureMod._simulateGestureTurn();
  gestureMod.markUserDriven();
  document.getElementById("content").textContent = "edited-by-hand";
  await saveMod.savePage();
  expect(triggerHeader()).toBe("user");
});

/**
 * The leak. Press Save with nothing to save, then let a background script write.
 * That second save is exactly the clobber the recovery chip exists to catch, and
 * an unscoped intent bit would have labelled it human and suppressed the chip.
 */
test("pressing Save on a clean page does not make the next background write look human", async () => {
  document.getElementById("content").textContent = "saved-state";
  await saveMod.savePage();
  await settle();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  // Clean now. A person presses Save; nothing is sent.
  gestureMod.markExplicitSave();
  const skipped = await saveMod.savePage();
  expect(skipped.msgType).toBe("skipped");
  expect(global.fetch).toHaveBeenCalledTimes(1);

  // A background script clobbers the page.
  document.getElementById("content").textContent = "clobbered-by-script";
  await saveMod.savePage();
  await settle();

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(triggerHeader(1)).toBe("auto");
});

test("a save that never leaves edit mode does not leave intent armed", async () => {
  gestureMod.markExplicitSave();
  expect(gestureMod.consumeExplicitSave()).toBe(true);
  expect(gestureMod.consumeExplicitSave()).toBe(false);
});

test("a synthetic click on the save button cannot manufacture human provenance", async () => {
  document.getElementById("content").textContent = "script-driven";
  // el.click() dispatches isTrusted:false, which the handler checks.
  document.querySelector("[trigger-save]").click();
  await settle();

  expect(global.fetch).toHaveBeenCalled();
  expect(triggerHeader()).toBe("auto");
});

test("a failed save re-arms provenance so the retry still reports user", async () => {
  global.fetch = jest.fn(async () => { throw new Error("network down"); });
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  document.getElementById("content").textContent = "typed-then-failed";
  gestureMod.markExplicitSave();
  await saveMod.savePage();

  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
  await saveMod.savePage();

  expect(triggerHeader()).toBe("user");
  consoleError.mockRestore();
});
