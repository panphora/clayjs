import { jest } from "@jest/globals";

/**
 * A view-mode tab loads no save, admin or editing-sender code. Those names live
 * in `sync/live-sync-edit.js`, which live-sync imports with `await import()` on
 * its edit path only; every call site a view-mode tab can reach takes the inert
 * value B1 found instead. Each case below drives one such call site on a saved
 * lane and then asserts the edit chunk was never fetched.
 */

const editLoads = jest.fn();

jest.unstable_mockModule("../../src/sync/live-sync-edit.js", () => {
  editLoads();
  return {
    savePageThrottled: jest.fn(),
    setLastSavedBaselines: jest.fn(),
    setUnsavedChanges: jest.fn(),
    getLastSavedBytes: jest.fn(() => null),
    conflictResolvedBySync: jest.fn(),
    isSaveConflicted: jest.fn(() => false),
    baselineSettled: jest.fn(() => false),
    schedulePaintHeal: jest.fn(),
    enableContentEditable: jest.fn(),
    enableOnClick: jest.fn(),
    enableAdminInputs: jest.fn(),
    enableAdminResources: jest.fn(),
    EditingSender: class {},
  };
});

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let LiveSync;
let snapshot;
let gate;
let save;
let autosaveState;

beforeAll(async () => {
  window.clayEditMode = false;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes("/_/meta")) return respond(200, META);
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  autosaveState = await import("../../src/lib/autosave-state.js");
});

beforeEach(() => {
  editLoads.mockClear();
  document.documentElement.removeAttribute("autosave");
  document.body.innerHTML = "";
  autosaveState.setAutosaveActive(false);
});

afterEach(() => {
  autosaveState.setAutosaveActive(false);
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "saved";
  sync._requestFrame = () => null;
  return sync;
}

async function settle(body) {
  document.body.innerHTML = body;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));

const PAGE = '<main><p data-id="a">one</p></main>';

test("a view-mode tab resolves a landing stamp without loading save code", async () => {
  await settle(PAGE);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;

  const frame = captureFrame();
  sync.lastHtml = frame;
  sync.sse.onmessage({ data: JSON.stringify({ html: frame, sender: "peer", seq: 10, etag: "E9" }) });

  expect(editLoads).not.toHaveBeenCalled();
  sync.stop();
});

test("a view-mode disk frame stamps itself without loading save code", async () => {
  await settle(PAGE);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  sync._diskBase = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;

  await sync._doApplyExternal(sync._diskBase, 21, "E9");

  expect(editLoads).not.toHaveBeenCalled();
  sync.stop();
});

test("a view-mode disk frame whose paint did not change schedules no heal and loads no save code", async () => {
  await settle(PAGE);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  sync._diskBase = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;

  await sync._doApplyExternal(sync._diskBase, 22);

  expect(editLoads).not.toHaveBeenCalled();
  sync.stop();
});

test("a view-mode merge save asks for nothing and loads no save code", () => {
  const sync = makeSync();
  autosaveState.setAutosaveActive(true);

  sync._saveAfterMerge(true, false);

  expect(editLoads).not.toHaveBeenCalled();
});

test("a view-mode start never asks whether the save baseline settled", () => {
  const sync = makeSync();
  sync._resolveProfile = () => new Promise(() => {});

  sync.start("index.html");

  expect(editLoads).not.toHaveBeenCalled();
  sync.stop();
});
