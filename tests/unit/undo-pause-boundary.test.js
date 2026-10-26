/**
 * @jest-environment jsdom
 */

/**
 * The boundary between the shared mutation hub and undo.
 *
 * Live sync pauses the hub across a whole apply (src/sync/live-sync.js:1922, :2130)
 * and that pause bridges into undo (src/lib/mutation.js:141-146). Before pausing,
 * the hub pulls the browser's undelivered records and delivers them on a microtask
 * (src/lib/mutation.js:137, :150-158), which is after undo's pause has begun; undo
 * drops records it sees while paused, so an edit made in the same task just before
 * a sync apply never becomes an undo step.
 *
 * The first and last cases pin what does work: an edit made with the hub running is
 * one undo step, and an edit made inside the pause is not recorded. The middle case
 * is the unrecorded loss the plan's Evidence still called a hypothesis. It fails
 * today, and the failure is this file's point.
 */

import Mutation from "../../src/lib/mutation.js";

const FIXTURE = `<p id="article">authored</p>`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const article = () => document.getElementById("article");

let undo;

beforeAll(async () => {
  // The loader wires both of these onto clay (src/loader.js:275); the hub's pause
  // bridge and undo's shared-hub observer both read them there.
  window.clay = { Mutation };
  undo = (await import("../../src/plugins/undo.js")).undo;
  window.clay.undo = undo;
  undo.start({ bindKeys: false });
});

afterAll(() => {
  undo.stop();
  window.clay = undefined;
});

beforeEach(async () => {
  document.body.innerHTML = FIXTURE;
  await settle();
  undo.clear();
});

test("an edit made with the hub running is one undo step", async () => {
  article().textContent = "typed";
  await settle();
  undo.flush();
  expect(undo.canUndo).toBe(true);
  undo.undo();
  expect(article().textContent).toBe("authored");
});

test("an edit made just before a sync pause begins is lost from the undo history", async () => {
  const delivered = [];
  const subscription = Mutation.subscribeRaw((records) => {
    delivered.push({ whileUndoPaused: undo.isPaused, count: records.length });
  });

  try {
    article().textContent = "typed";
    Mutation.pause();
    await settle();
    Mutation.resume();
    await settle();
    undo.flush();
  } finally {
    subscription.unsubscribe();
  }

  // The hub hands the pre-pause record to undo before undo's pause begins, so it is
  // recorded as an ordinary edit instead of reaching undo's paused sink, which drops
  // what it sees (src/vendor/hyper-undo.vendor.js).
  expect(delivered).toEqual([{ whileUndoPaused: false, count: 1 }]);
  expect(undo.canUndo).toBe(true);
});

test("an edit made inside the pause is not recorded", async () => {
  Mutation.pause();
  article().textContent = "typed during";
  await settle();
  Mutation.resume();
  await settle();
  undo.flush();
  expect(undo.canUndo).toBe(false);
  expect(article().textContent).toBe("typed during");
});
