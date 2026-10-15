import { jest } from "@jest/globals";

/**
 * The throttled autosave check compares the autosave domain, which leaves out
 * batching (no-trigger-autosave) regions. The dirty gate counts them. When the
 * check finds nothing, it must not clear the gate over an unsaved edit in such a
 * region, or live sync treats the page as clean and applies disk changes over it.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let save, gate, snapshot;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">a</div><div id="batch" clay="no-trigger-autosave">b</div>';
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ msg: "Saved" }) }));
  save = await import("../../src/core/save.js");
  gate = await import("../../src/lib/dirty-gate.js");
  snapshot = await import("../../src/core/snapshot.js");
  document.body.appendChild(document.createElement("span"));
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
  await save.savePage();
  await sleep(1300);
}, 20000);

test("an unchanged autosave check leaves the gate dirty over a batching-region edit", async () => {
  document.getElementById("batch").textContent = "typed";
  await sleep(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  const result = await save.savePageThrottled();
  expect(result.msg).toBe("No changes to save");
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(snapshot.captureForDirtyCheck()).not.toBe(save.getLastSavedDirty());
}, 20000);

test("with no batching region, an unchanged autosave check still clears the gate", async () => {
  document.getElementById("batch").remove();
  await save.savePage();
  await sleep(1300);
  const c = document.getElementById("c");
  c.textContent = "x";
  c.textContent = "a";
  await sleep(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  const result = await save.savePageThrottled();
  expect(result.msg).toBe("No changes to save");
  expect(gate.pageMaybeDirty()).toBe(false);
}, 20000);

test("on a page with a batching region, an edit that nets to nothing clears the gate", async () => {
  document.body.insertAdjacentHTML("beforeend", '<div id="batch2" clay="no-trigger-autosave">x</div>');
  await save.savePage();
  await sleep(1300);
  const c = document.getElementById("c");
  c.setAttribute("data-tmp", "1");
  c.removeAttribute("data-tmp");
  await sleep(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  const result = await save.savePageThrottled();
  expect(result.msg).toBe("No changes to save");
  expect(gate.pageMaybeDirty()).toBe(false);
}, 20000);
