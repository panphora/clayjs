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
  await sleep(500);
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
  await sleep(500);
  expect(posts.length - before).toBe(2);
  expect(posts[posts.length - 1]).toContain("three");
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
}, 20000);
