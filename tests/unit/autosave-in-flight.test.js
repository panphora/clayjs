import { jest } from "@jest/globals";

/**
 * An autosave that arrives while a save is on the wire queues one more save
 * instead of copying the page to compare. The queued save makes its own full
 * check when the first lands, so an edit made during the flight is saved, and a
 * failed first save is retried.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let save, snapshot;
let posts = [];
let latency = 0;
let failNext = 0;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">a</div>';
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method !== "POST") {
      return { ok: false, status: 404, statusText: "NF", headers: { get: () => null }, text: async () => "", json: async () => ({}) };
    }
    posts.push(String(options.body ?? ""));
    if (latency) await sleep(latency);
    if (failNext > 0) {
      failNext--;
      return { ok: false, status: 500, statusText: "ERR", headers: { get: () => null }, text: async () => JSON.stringify({ msg: "fail" }) };
    }
    return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify({ msg: "Saved" }) };
  });
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  document.body.appendChild(document.createElement("span"));
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
  await sleep(1300);
}, 20000);

beforeEach(async () => {
  latency = 0;
  failNext = 0;
  await sleep(1300); // past the throttle window
});

test("an autosave during an in-flight save is queued, and the queued save writes the newer edit", async () => {
  latency = 150;
  const c = document.getElementById("c");
  c.textContent = "one";
  await sleep(0);
  const before = posts.length;
  const first = save.savePageThrottled();
  await sleep(20);
  c.textContent = "two";
  await sleep(0);
  const second = await save.savePageThrottled();
  expect(second.msg).toBe("Save already in progress");
  await first;
  await sleep(2500);
  expect(posts.length - before).toBe(2);
  expect(posts[posts.length - 1]).toContain("two");
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
}, 20000);

test("when the in-flight save fails, the queued save retries it", async () => {
  latency = 100;
  failNext = 1;
  document.getElementById("c").textContent = "three";
  await sleep(0);
  const before = posts.length;
  const first = save.savePageThrottled();
  await sleep(10);
  const second = await save.savePageThrottled();
  expect(second.msg).toBe("Save already in progress");
  await first;
  await sleep(2500);
  expect(posts.length - before).toBe(2);
  expect(posts[posts.length - 1]).toContain("three");
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
}, 20000);

test("an autosave never queues behind a raw saveHtml call, so its edit still reaches disk", async () => {
  // Inside the throttle window an autosave that is not queued rides the throttle's
  // trailing save, which runs after the raw save lands. (Outside the window the edit
  // is parked behind the raw save, as it always was.)
  const core = await import("../../src/core/save-core.js");
  const c = document.getElementById("c");
  c.textContent = "before-raw";
  await sleep(0);
  await save.savePageThrottled();
  latency = 200;
  const before = posts.length;
  const raw = core.saveHtml("<!DOCTYPE html><html><body>raw</body></html>");
  await sleep(10);
  c.textContent = "after-raw";
  await sleep(0);
  const result = save.savePageThrottled();
  await raw;
  await result;
  await sleep(2500);
  expect(posts.length - before).toBe(2);
  expect(posts[posts.length - 1]).toContain("after-raw");
}, 20000);

test("a queued autosave obeys a suspension that starts before it drains", async () => {
  latency = 150;
  const c = document.getElementById("c");
  c.textContent = "four";
  await sleep(0);
  const before = posts.length;
  const first = save.savePageThrottled();
  await sleep(20);
  c.textContent = "five";
  await sleep(0);
  expect((await save.savePageThrottled()).msg).toBe("Save already in progress");
  save.suspendAutosave();
  await first;
  await sleep(500);
  expect(posts.length - before).toBe(1);
  save.resumeAutosave();
  await sleep(2500);
  expect(posts.length - before).toBe(2);
  expect(posts[posts.length - 1]).toContain("five");
}, 20000);

test("a queued autosave does not send a batching-region-only edit", async () => {
  document.body.insertAdjacentHTML("beforeend", '<div id="batch" clay="no-trigger-autosave">b</div>');
  await save.savePage();
  await sleep(1300);
  latency = 150;
  document.getElementById("c").textContent = "six";
  await sleep(0);
  const before = posts.length;
  const first = save.savePageThrottled();
  await sleep(20);
  document.getElementById("batch").textContent = "batched";
  await sleep(0);
  expect((await save.savePageThrottled()).msg).toBe("Save already in progress");
  await first;
  await sleep(2500);
  expect(posts.length - before).toBe(1);
  expect(posts[posts.length - 1]).not.toContain("batched");
}, 20000);

test("a queued autosave caught by an all-save hold replays as an autosave, so a batching-only edit is not written", async () => {
  if (!document.getElementById("batch")) {
    document.body.insertAdjacentHTML("beforeend", '<div id="batch" clay="no-trigger-autosave">b</div>');
  }
  document.getElementById("batch").textContent = "manual-one";
  await sleep(0);
  latency = 150;
  const before = posts.length;
  const first = save.savePage();
  await sleep(20);
  document.getElementById("batch").textContent = "manual-two";
  await sleep(0);
  expect((await save.savePageThrottled()).msg).toBe("Save already in progress");
  save.holdAllSaves();
  await first;
  await sleep(50);
  save.releaseAllSaves();
  await sleep(2500);
  expect(posts.length - before).toBe(1);
  expect(posts[posts.length - 1]).toContain("manual-one");
  expect(posts.join("\n")).not.toContain("manual-two");
}, 20000);

test("an explicit save skipped by the hold still replays as an explicit save", async () => {
  document.getElementById("batch").textContent = "explicit-held";
  await sleep(0);
  const before = posts.length;
  save.holdAllSaves();
  expect((await save.savePage()).msgType).toBe("skipped");
  expect((await save.savePageThrottled()).msgType).toBe("skipped");
  save.releaseAllSaves();
  await sleep(500);
  expect(posts.length - before).toBe(1);
  expect(posts[posts.length - 1]).toContain("explicit-held");
}, 20000);

test("a snapshot hook that throws makes a replayed autosave report an error, not throw out of the release", async () => {
  let failSnapshot = false;
  snapshot.onSnapshot(() => {
    if (failSnapshot) throw new Error("hook failed");
  });
  document.getElementById("c").textContent = "hook-held";
  await sleep(0);
  save.holdAllSaves();
  expect((await save.savePageThrottled()).msgType).toBe("skipped");
  failSnapshot = true;
  expect(() => save.releaseAllSaves()).not.toThrow();
  await sleep(1500);
  expect(document.documentElement.getAttribute("savestatus")).toBe("error");
  failSnapshot = false;
}, 20000);
