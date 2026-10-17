import { jest } from "@jest/globals";

/**
 * The live plugin drives the checkpoint clock: a saved store's local change
 * starts it, a never-saved store's does not, unsaved means pending ops, and
 * hiding the tab flushes.
 */

const changed = jest.fn();
const soon = jest.fn();
const within = jest.fn();
const flush = jest.fn();
let deps;

await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (d) => {
    deps = d;
    return { changed, soon, within, flush, flushing: false, deadline: null };
  },
}));
await jest.unstable_mockModule("../../src/core/save.js", () => ({
  savePageForce: jest.fn(async () => ({ ok: true })),
  baselineSettled: () => true,
  isSaveConflicted: () => false,
  autosaveIsSuspended: () => false,
}));

window.clayEditMode = true;
const { live, receiveFrame, requestCheckpoint, checkpointWithin, openStores, storeOf } = await import("../../src/plugins/live.js");

const tag = (name, json, clay = "live") => `<script type="application/json" merge="${name}" clay="${clay}">${json}</script>`;

beforeEach(() => {
  changed.mockClear();
  soon.mockClear();
  within.mockClear();
  flush.mockClear();
});

// Every open store's ops are confirmed, so a test starts from a clean clock.
function settleOpenStores() {
  for (const store of openStores()) store.confirm(store.mark);
}

test("a saved store's local change starts the clock, and pending ops count as unsaved", () => {
  document.body.innerHTML = tag("c1", '{"s":0}');
  const game = live("c1");
  expect(deps.needsSave()).toBe(false);
  game.add("s", 1);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(deps.needsSave()).toBe(true);
});

test("a never-saved store's change does not start the clock or count as unsaved", () => {
  document.body.innerHTML = tag("c2", "{}", "live ephemeral");
  live("c2").set("x", 1);
  expect(changed).not.toHaveBeenCalled();
});

test("a remote value alone starts nothing", () => {
  document.body.innerHTML = tag("c3", '{"s":0}');
  live("c3");
  receiveFrame(`<!DOCTYPE html><html><body>${tag("c3", '{"s":9}')}</body></html>`);
  expect(changed).not.toHaveBeenCalled();
});

test("hiding the tab and pagehide flush", () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("pagehide"));
  expect(flush).toHaveBeenCalledTimes(2);
});

test("requestCheckpoint resolves at once when nothing is unsaved", async () => {
  settleOpenStores();
  await expect(requestCheckpoint()).resolves.toEqual({ ok: true });
});

test("requestCheckpoint resolves once a save confirms a file-mode store's ops", async () => {
  settleOpenStores();
  document.body.innerHTML = tag("c5", '{"s":0}');
  live("c5").add("s", 1);
  const store = storeOf("c5");
  expect(store.pending.length).toBe(1);

  const asked = requestCheckpoint();
  store.confirm(store.mark);
  await deps.save();

  await expect(asked).resolves.toEqual({ ok: true });
});

test("requestCheckpoint resolves a timeout when no save lands", async () => {
  settleOpenStores();
  jest.useFakeTimers();
  try {
    document.body.innerHTML = tag("c6", '{"s":0}');
    live("c6").add("s", 1);
    const asked = requestCheckpoint({ timeoutMs: 500 });
    await jest.advanceTimersByTimeAsync(500);
    await expect(asked).resolves.toEqual({ ok: false, code: "timeout" });
  } finally {
    jest.useRealTimers();
  }
});

test("checkpointWithin asks the clock for the page editor's pause save", () => {
  settleOpenStores();
  document.body.innerHTML = tag("c7", '{"s":0}');
  live("c7").add("s", 1);
  checkpointWithin(1500);
  expect(within).toHaveBeenCalledWith(1500);
});
