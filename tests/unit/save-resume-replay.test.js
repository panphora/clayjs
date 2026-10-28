/**
 * save-resume-replay: an attempt refused by a closed session is replayed when the exit is
 * refused.
 *
 * While an exit holds admission closed only an automatic attempt used to be parked for
 * `resume` to replay. Two intents were lost with it, and the page resumed reporting Saved
 * over newer text no save had written: an explicit save that the drain started behind a
 * save on the wire, and a large page's preparation that the closed session cancelled.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

const BIG = 320 * 1024;

let save, saveCore, posts = [];
let holdPosts = false;
let held = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setText = (text) => { document.getElementById("c").textContent = text; };

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

function holdSlices() {
  const previous = globalThis.scheduler;
  const held = [];
  const gate = {
    held,
    released: false,
    release() {
      gate.released = true;
      held.splice(0).forEach((resolve) => resolve());
    },
    restore() {
      if (previous === undefined) delete globalThis.scheduler;
      else globalThis.scheduler = previous;
    },
  };
  globalThis.scheduler = {
    yield: () => (gate.released ? Promise.resolve() : new Promise((resolve) => { held.push(resolve); })),
  };
  return gate;
}

function stepClock() {
  const realNow = performance.now;
  let clock = 0;
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  return () => Object.defineProperty(performance, "now", { configurable: true, writable: true, value: realNow });
}

async function idleLane() {
  for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
  await save.savePage();
  for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
}

const carried = (text) => posts.some((body) => body.includes(text));

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  global.fetch = jest.fn((url, options = {}) => {
    if (!String(url).includes("/_/save")) return Promise.resolve(okJson({ spec: 1, document: { etag: "base-1" } }));
    posts.push(String(options.body ?? ""));
    if (!holdPosts) return Promise.resolve(okJson({ msg: "Saved", etag: `etag-${posts.length}` }));
    return new Promise((resolve) => held.push(resolve));
  });
  save = await import("../../src/core/save.js");
  saveCore = await import("../../src/core/save-core.js");
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
  // The page's first save has no last saved size to judge yet, so it prepares in one task;
  // the second gets the preparer in place, so the tests below take the sliced path.
  setText("first");
  expect((await save.savePage()).ok).toBe(true);
  setText("second");
  expect((await save.savePage()).ok).toBe(true);
  posts = [];
}, 60000);

test("an explicit save drained while an exit holds admission is replayed when the exit is refused", async () => {
  const session = save.saveSession();
  session.start();
  held = [];
  try {
    holdPosts = true;
    setText("queued-alpha");
    const first = save.savePage();
    await sleep(0);
    expect(posts).toHaveLength(1);

    setText("queued-beta");
    const queued = await save.savePage();
    expect(queued.msg).toBe("Save already in progress");

    session.quiesce();
    expect(save.savesAdmitted()).toBe(false);

    // The save on the wire lands inside the barrier: the drain it triggers starts the save
    // queued behind it, and a closed session refuses that attempt.
    holdPosts = false;
    held.splice(0).forEach((resolve) => resolve(okJson({ msg: "Saved" })));
    await first;
    await sleep(20);

    session.resume();
    for (let i = 0; i < 100 && !carried("queued-beta"); i++) await sleep(20);
    expect(carried("queued-beta")).toBe(true);
  } finally {
    holdPosts = false;
    held.splice(0).forEach((resolve) => resolve(okJson({ msg: "Saved" })));
    session.stop();
    await idleLane();
  }
});

test("an autosave preparing across tasks, cancelled by an exit's quiesce, is replayed when the exit is refused", async () => {
  const gate = holdSlices();
  const restoreClock = stepClock();
  const session = save.saveSession();
  session.start();
  const sentBefore = posts.length;
  try {
    setText("typed-before-leave");
    await sleep(0);
    const auto = save.savePageThrottled();
    for (let i = 0; i < 100 && gate.held.length === 0; i++) await sleep(20);
    expect(gate.held.length).toBeGreaterThan(0);

    session.quiesce();
    gate.release();
    await auto;
    await sleep(200);
    expect(posts).toHaveLength(sentBefore);

    session.resume();
    for (let i = 0; i < 100 && !carried("typed-before-leave"); i++) await sleep(20);
    expect(carried("typed-before-leave")).toBe(true);
  } finally {
    gate.release();
    gate.restore();
    session.stop();
    restoreClock();
    await idleLane();
  }
});
