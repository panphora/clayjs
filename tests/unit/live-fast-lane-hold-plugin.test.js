import { jest } from "@jest/globals";

/**
 * A store whose file save ended without an answer, while the room holds it: its
 * ops wait for the room's receipts, and are given up with a notice at the first
 * read that does not prove them or when the hold ends.
 */

await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: () => ({ changed: jest.fn(), soon: jest.fn(), flush: jest.fn(), flushing: false, deadline: null }),
}));
await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async () => false,
  hostMeta: async () => ({ spec: 1, extensions: ["live-data", "live-provenance"], document: null }),
}));
// No live-data host here, so the plugin takes its local tab lane: a stub that
// records what the plugin reports to it and hands the transport itself to the
// server lane, which this harness drives through the stream bridge.
const { serverTransport: realServerTransport } = await import("../../src/live/server-lane.js");
await jest.unstable_mockModule("../../src/live/local-lane.js", () => ({
  localLaneSupported: () => true,
  localTransport: () => ({
    ...realServerTransport(),
    landed: () => {},
    fileFrame: () => {},
  }),
}));

window.clayEditMode = true;
const requests = [];
let room = { epoch: "e1", seq: 0, writer: null, provenanceVersion: 2, receiptGeneration: 0, stores: { g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } } };
// Set to a promise to keep a document save on the wire until it settles.
let saveGate = null;
let hangState = false;
let stateStatus = null;
const hung = [];
global.fetch = jest.fn(async (url, init = {}) => {
  if (saveGate && !String(url).includes("/_/sync/")) return saveGate;
  requests.push({ url: String(url), init });
  if ((init.method || "GET") === "GET") {
    if (stateStatus) return { ok: false, status: stateStatus, json: async () => ({}), headers: { get: () => null } };
    return hangState ? new Promise((resolve) => hung.push(() => resolve({ ok: true, status: 200, json: async () => room }))) : { ok: true, status: 200, json: async () => room };
  }
  return { ok: true, status: 200, json: async () => ({ seq: room.seq + 1, epoch: room.epoch }), headers: { get: () => null } };
});

const { live, storeOf, fastLane, receiveFrame, HOLD_MS } = await import("../../src/plugins/live.js");
const bridge = await import("../../src/live/stream-bridge.js");
const snapshot = await import("../../src/core/snapshot.js");
const { saveHtml } = await import("../../src/core/save-core.js");

const flushAsync = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tag = (name, json, at) => `<script type="application/json" merge="${name}" clay="live"${at ? ` live-at="${at}"` : ""}>${json}</script>`;

// The room changes: a new epoch, this tab as its writer, these stores.
let epochs = 1;
const join = async (stores) => {
  room = { epoch: `e${++epochs}`, seq: 0, writer: "tab-1", provenanceVersion: 2, receiptGeneration: 0, stores };
  bridge.streamEvent("data-state", room);
  await flushAsync();
};

const notices = [];
document.addEventListener("clay:live-notice", (event) => notices.push(event.detail));
beforeEach(() => { notices.length = 0; });

const posts = (name) => requests.filter((r) => r.init.method === "POST" && JSON.parse(r.init.body).name === name);

const roomBoundSave = async (name) => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag(name, '{"n":0}');
  const store = live(name);
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  requests.length = 0;
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  store.add("n", 1);
  await flushAsync();
  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  let endSave;
  saveGate = new Promise((resolve) => { endSave = resolve; });
  saveHtml(body);
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, [name]: { value: { n: 1 }, ephemeral: false, last: 0, landed: 0 } });
  expect(store.status.mode).toBe("file");
  expect(storeOf(name).pending).toHaveLength(1);
  return {
    store,
    loseAnswer: () => {
      document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 502 } }));
      saveGate = null;
      endSave({ ok: false, status: 502, text: async () => "", json: async () => ({}), headers: { get: () => null } });
    },
  };
};

test("a room-bound store whose save ended without an answer gives its ops up at the first read that does not prove them", async () => {
  const { store, loseAnswer } = await roomBoundSave("rb");
  loseAnswer();
  await wait(120);
  expect(store.toJSON()).toEqual({ n: 1 });
  expect(storeOf("rb").pending).toEqual([]);
  expect(store.status.mode).toBe("fast");
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ name: "rb", code: "save-uncertain", ops: [{ op: "add", path: ["n"], n: 1 }] });
  expect(posts("rb")).toEqual([]);
});

test("a room-bound store whose room reads never answer gives its ops up when the hold ends", async () => {
  const { store, loseAnswer } = await roomBoundSave("rt");
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === HOLD_MS ? 200 : ms, ...args);
  try {
    hangState = true;
    loseAnswer();
    await wait(80);
    expect(storeOf("rt").pending).toHaveLength(1);
    expect(store.toJSON()).toEqual({ n: 1 });
    expect(notices).toEqual([]);
    await wait(200);
    expect(storeOf("rt").pending).toEqual([]);
    expect(store.toJSON()).toEqual({ n: 0 });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ name: "rt", code: "save-uncertain", ops: [{ op: "add", path: ["n"], n: 1 }] });
    expect(posts("rt")).toEqual([]);
  } finally {
    global.setTimeout = realSetTimeout;
    hangState = false;
    for (const answer of hung.splice(0)) answer();
    await wait(60);
  }
});


test("a room-bound store whose room is gone gives its ops up when the lane stops, and falls back to file values", async () => {
  const { store, loseAnswer } = await roomBoundSave("rg");
  try {
    stateStatus = 404;
    loseAnswer();
    await wait(120);
    expect(fastLane().status.stopped).toBe(true);
    expect(storeOf("rg").pending).toEqual([]);
    expect(store.status.mode).toBe("file");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ name: "rg", code: "save-uncertain", ops: [{ op: "add", path: ["n"], n: 1 }] });
    receiveFrame(tag("rg", '{"n":5}'));
    await flushAsync();
    expect(store.toJSON()).toEqual({ n: 5 });
  } finally {
    stateStatus = null;
  }
});
