import { jest } from "@jest/globals";
import * as vendor from "../../src/vendor/hyper-morph.vendor.js";
import { mergeTagRecognizers } from "../../src/sync/merge-tags.js";

/**
 * The merge engine loads on first need: a frame waits for it, frames that
 * arrive while it loads collapse to the newest one, a failed load retries, and
 * a stopped sync never applies the frame it was holding.
 *
 * The engine module is held behind a deferred promise the test settles by hand,
 * and it hands back the real vendor once it settles, so the merges below are
 * real merges applied by the real engine.
 */

const engine = { HyperMorph: vendor.HyperMorph, morph: vendor.morph, mergeTagRecognizers };

let loaded = null;
const loads = [];

function startLoad() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  promise.then(() => { loaded = engine; }, () => {});
  loads.push({ promise, resolve, reject });
  return promise;
}

const mergeEngine = jest.fn(() => (loaded ? Promise.resolve(loaded) : startLoad()));

jest.unstable_mockModule("../../src/sync/merge-engine.js", () => ({
  loadedEngine: () => loaded,
  mergeEngine,
}));

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let snapshot;
let gate;
let save;
let autosaveState;

const ROOT_ATTRS = ["autosave", "editmode", "pageowner", "savestatus", "documentid"];
const ticks = async (n = 25) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  LiveSync = liveSyncModule.LiveSync;
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  autosaveState = await import("../../src/lib/autosave-state.js");
});

beforeEach(() => {
  loaded = null;
  loads.length = 0;
  mergeEngine.mockClear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" }));
  for (const a of ROOT_ATTRS) document.documentElement.removeAttribute(a);
  autosaveState.setAutosaveActive(false);
  document.body.innerHTML = "";
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  jest.useRealTimers();
  delete window.clay;
  for (const a of ROOT_ATTRS) document.documentElement.removeAttribute(a);
  autosaveState.setAutosaveActive(false);
});

const frames = [];

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = (callback) => { frames.push(callback); return frames.length; };
  sync._cancelFrame = () => {};
  return sync;
}

const texts = (selector) => [...document.querySelectorAll(selector)].map((el) => el.textContent);

async function settle(body) {
  document.body.innerHTML = body;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));

const PAGE = '<p data-id="a">a0</p><p data-id="b">b0</p>';

async function tabWithPendingFrame(pending) {
  await settle(PAGE);
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  sync.applyUpdate(sync.lastHtml.replace(pending.from, pending.to), pending.seq ?? 201, null, null, null);
  expect(frames).toHaveLength(1);
  return sync;
}

test("a frame that arrives before the engine applies after it loads", async () => {
  const sync = await tabWithPendingFrame({ from: "a0", to: "a1" });

  const applying = frames.shift()();
  await ticks();
  expect(mergeEngine).toHaveBeenCalled();
  expect(texts("p")).toEqual(["a0", "b0"]);

  loads.shift().resolve();
  await applying;

  expect(texts("p")).toEqual(["a1", "b0"]);
  expect(sync.isDestroyed).toBe(false);
  sync.stop();
});

test("a second frame during the load replaces the first, and only the second applies", async () => {
  const sync = await tabWithPendingFrame({ from: "a0", to: "a1" });
  const applying = frames.shift()();
  await ticks();

  sync.applyUpdate(sync.lastHtml.replace("a0", "a2").replace("b0", "b2"), 202, null, null, null);
  expect(frames).toHaveLength(0);

  loads.shift().resolve();
  await applying;

  expect(texts("p")).toEqual(["a2", "b2"]);
  expect(sync._pendingHtml).toBe(null);
  sync.stop();
});

test("a failed load retries and then applies", async () => {
  const sync = await tabWithPendingFrame({ from: "a0", to: "a1" });
  jest.useFakeTimers();

  const applying = frames.shift()();
  await ticks();
  loads.shift().reject(new Error("chunk offline"));
  await applying;

  expect(texts("p")).toEqual(["a0", "b0"]);
  expect(sync._engineRetry).not.toBe(null);

  jest.advanceTimersByTime(2000);
  expect(frames).toHaveLength(1);

  jest.useRealTimers();
  const retried = frames.shift()();
  await ticks();
  expect(loads).toHaveLength(1);
  loads.shift().resolve();
  await retried;

  expect(texts("p")).toEqual(["a1", "b0"]);
  sync.stop();
});

test("a destroyed sync never applies the frame it held", async () => {
  const sync = await tabWithPendingFrame({ from: "a0", to: "a1" });
  const applying = frames.shift()();
  await ticks();

  sync.stop();
  loads.shift().resolve();
  await applying;

  expect(texts("p")).toEqual(["a0", "b0"]);
});
