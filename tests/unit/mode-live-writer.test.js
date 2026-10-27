/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The live store's writer, as a mode lease.
 *
 * A live store is only this tab's to send while an edit session holds it. So:
 *
 *   - a value the reader changed while the page was a view is not carried into the
 *     session: the lane starts from the file, and no frame of the reader's change is
 *     ever posted;
 *   - the entry that enables the lease is what starts this tab's lane, and the lane's
 *     per-store requests start over in each session, so a second entry does not
 *     re-send or double-apply anything;
 *   - an exit closes admission and drains the ops the room has not acknowledged before
 *     the writer may be released; when the room never answers, the drain refuses
 *     instead of dropping the ops, and a resume keeps them;
 *   - the release gives back the transport's subscription and the lane's queue, so a
 *     room frame after the exit changes nothing, and the page's own hide no longer
 *     asks for a checkpoint save;
 *   - releasing this tab's writer is not a global stop: the page keeps following the
 *     file, and a peer's accepted bytes still reach the store.
 */

const changed = jest.fn();
const soon = jest.fn();
const flushed = jest.fn();
const within = jest.fn();
let deps;

await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (d) => {
    deps = d;
    return { changed, soon, flush: flushed, within, flushing: false, deadline: null };
  },
}));

await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async (name) => name === "live-data" || name === "live-provenance",
  hostMeta: async () => ({ spec: 1, extensions: ["live-data", "live-provenance"], document: null }),
  hostMetaOutcome: () => null,
  hostVersions: async () => null,
  querySaveOutcome: null,
  resetHostMeta: () => {},
}));

const requests = [];
let room = null;
// "silent": the room never answers a frame, as when the request never arrives.
let postAnswer = "ok";
global.fetch = jest.fn(async (url, init = {}) => {
  requests.push({ url: String(url), init });
  if ((init.method || "GET") === "GET") return { ok: true, status: 200, json: async () => room };
  if (postAnswer === "silent") return { ok: false, status: 0, json: async () => null, headers: { get: () => null } };
  return { ok: true, status: 200, json: async () => ({ seq: room.seq + 1, epoch: room.epoch }), headers: { get: () => null } };
});

const { live, storeOf, fastLane, receiveFrame, drainLiveWriter, liveWriterParticipant, pageWriterReady } =
  await import("../../src/plugins/live.js");
const bridge = await import("../../src/live/stream-bridge.js");
const facts = await import("../../src/core/is-edit-mode.js");
const { pendingIds } = await import("../../src/lib/unsaved-state.js");

const tag = (name, json) => `<script type="application/json" merge="${name}" clay="live">${json}</script>`;
const page = (body) => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
const domText = (name) => document.querySelector(`script[merge="${name}"]`).textContent;

const flushAsync = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const posts = (name) => requests.filter((r) => r.init.method === "POST" && JSON.parse(r.init.body).name === name);

let epochs = 0;

const join = async ({ writer = "tab-1", value = { s: 0 }, last = 0, landed = 0 } = {}) => {
  room = {
    epoch: `e${++epochs}`,
    seq: 0,
    writer,
    provenanceVersion: 2,
    receiptGeneration: 0,
    stores: { g: { value, ephemeral: false, last, landed } },
  };
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  bridge.streamEvent("data-state", room);
  await flushAsync();
};


beforeEach(() => {
  requests.length = 0;
  room = null;
  epochs = 0;
  postAnswer = "ok";
  changed.mockClear();
  soon.mockClear();
  flushed.mockClear();
  within.mockClear();
  facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
  document.body.innerHTML = "";
});

test("a value the reader changed is not the session's edit and is never posted", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  g.set("s", 7);
  expect(storeOf("g").pending).toHaveLength(1);

  const lease = liveWriterParticipant().prepare({ generation: 1 });
  // The reader's own change is not carried into the session.
  expect(storeOf("g").pending).toEqual([]);
  expect(g.toJSON()).toEqual({ s: 0 });

  lease.enable();
  await join();
  await wait(80);
  await flushAsync();

  expect(g.status.mode).toBe("fast");
  expect(posts("g")).toHaveLength(0);
  expect(storeOf("g").pending).toEqual([]);
  expect(g.toJSON()).toEqual({ s: 0 });
  lease.dispose();
});

test("enable starts the lane, and each session's lane requests start over", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  // A view has no lane at all.
  await flushAsync();
  expect(fastLane()).toBeNull();
  expect(requests).toHaveLength(0);

  const first = liveWriterParticipant().prepare({ generation: 1 });
  first.enable();
  await join();
  facts.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });

  g.add("s", 1);
  await wait(80);
  await flushAsync();
  expect(JSON.parse(posts("g").at(-1).init.body)).toMatchObject({ n: 1, epoch: room.epoch });
  bridge.streamEvent("data", { epoch: room.epoch, seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  await expect(first.quiesce()).resolves.toEqual({ ok: true });
  first.dispose();
  expect(fastLane()).toBeNull();
  expect(storeOf("g").handle.status.mode).toBe("file");

  facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
  const second = liveWriterParticipant().prepare({ generation: 2 });
  second.enable();
  await join({ value: { s: 1 } });
  facts.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });

  requests.length = 0;
  g.add("s", 1);
  await wait(80);
  await flushAsync();
  // A fresh lane: the second session's first frame is n:1 again, not a replay.
  expect(posts("g")).toHaveLength(1);
  expect(JSON.parse(posts("g")[0].init.body)).toMatchObject({ n: 1, epoch: room.epoch });

  // And one frame is applied once, not twice: only one lane follows the room.
  bridge.streamEvent("data", { epoch: room.epoch, seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  expect(g.toJSON()).toEqual({ s: 2 });
  expect(storeOf("g").pending).toEqual([]);
  second.dispose();
});

test("quiesce drains the ops the room has not acknowledged, and refuse on an answer that never comes", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  const lease = liveWriterParticipant().prepare({ generation: 1 });
  lease.enable();
  await wait(0);
  // The room's file reaches position 1 of 2: this tab, its writer, has a checkpoint due.
  await join({ last: 2, landed: 1 });
  facts.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });
  expect(deps.needsSave()).toBe(true);

  g.add("s", 1);
  await wait(80);
  await flushAsync();
  expect(posts("g")).toHaveLength(1);
  expect(storeOf("g").pending).toHaveLength(1);

  let settled = null;
  const draining = lease.quiesce().then((result) => {
    settled = result;
    return result;
  });
  await wait(40);
  // Nothing may save while the ops are still on their way, and the exit waits for them.
  expect(settled).toBeNull();
  expect(deps.needsSave()).toBe(false);
  expect(pendingIds()).toContain("live:writer");

  bridge.streamEvent("data", { epoch: room.epoch, seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  await expect(draining).resolves.toEqual({ ok: true });
  expect(storeOf("g").pending).toEqual([]);
  expect(pendingIds()).not.toContain("live:writer");

  // While the exit holds admission closed, a page edit is not framed as this tab's to
  // send: only the exit's own drain speaks to the room. It carries the op, and waits
  // for the room to take it.
  g.add("s", 1);
  await wait(60);
  await flushAsync();
  expect(posts("g")).toHaveLength(1);
  expect(storeOf("g").pending).toHaveLength(1);

  const carrying = drainLiveWriter({ timeoutMs: 500 });
  await wait(60);
  expect(posts("g")).toHaveLength(2);
  expect(JSON.parse(posts("g")[1].init.body)).toMatchObject({ n: 2 });
  bridge.streamEvent("data", { epoch: room.epoch, seq: 2, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 2 });
  await expect(carrying).resolves.toEqual({ ok: true });
  expect(storeOf("g").pending).toEqual([]);

  // A room that never answers refuses the drain, and the ops stay for a resume.
  g.add("s", 1);
  postAnswer = "silent";
  await expect(drainLiveWriter({ timeoutMs: 20 })).resolves.toEqual({ ok: false, code: "timeout" });
  expect(pendingIds()).toContain("live:writer");
  expect(storeOf("g").pending).toHaveLength(1);

  postAnswer = "ok";
  lease.resume();
  // Admission is back: the same ops are this tab's to send again, not an exit.
  expect(pendingIds()).not.toContain("live:writer");
  expect(storeOf("g").pending).toHaveLength(1);
  lease.dispose();
});

test("the release gives the lane back and stops this page's hide from checkpointing", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  const lease = liveWriterParticipant().prepare({ generation: 1 });
  lease.enable();
  await join();
  facts.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });

  flushed.mockClear();
  window.dispatchEvent(new Event("pagehide"));
  expect(flushed).toHaveBeenCalledTimes(1);

  await lease.quiesce();
  lease.dispose();
  facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
  expect(fastLane()).toBeNull();
  expect(storeOf("g").handle.status.mode).toBe("file");

  flushed.mockClear();
  window.dispatchEvent(new Event("pagehide"));
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(flushed).not.toHaveBeenCalled();
  delete document.visibilityState;

  // A room frame after the exit reaches no lane: the store keeps the peer's file.
  const before = g.toJSON();
  bridge.streamEvent("data", { epoch: room.epoch, seq: 5, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "peer" });
  expect(g.toJSON()).toEqual(before);
});

test("a released writer does not stop the reader: the page still follows a peer's saved bytes", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  live("g");
  const lease = liveWriterParticipant().prepare({ generation: 1 });
  lease.enable();
  await join();
  await lease.quiesce();
  lease.dispose();

  receiveFrame(page(tag("g", '{"s":9}')));
  expect(storeOf("g").value).toEqual({ s: 9 });
  // The reader keeps the file's text and writes the store's value into the next save.
  expect(domText("g")).toBe('{"s":0}');
  expect(storeOf("g").pending).toEqual([]);
});

test("the initial edit's writer is adopted, not started again, and the exit releases its lane", async () => {
  // A store of this test's own: an entry a previous case opened would not open again.
  document.body.innerHTML = tag("adopted", '{"s":0}');
  // The page booted in edit, so the plugin's own import started this tab's lane.
  facts.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });
  const g = live("adopted");
  await wait(20);
  await flushAsync();
  // The import's own session already asked for the lane.
  const bootLane = fastLane();
  expect(bootLane).not.toBeNull();

  // An edit this session already holds is not the reader's, and adopting the session
  // must not drop it the way a fresh session drops what it did not make.
  g.add("s", 1);
  expect(storeOf("adopted").pending).toHaveLength(1);

  const before = requests.length;
  const lease = liveWriterParticipant().prepare({ initial: true, generation: 1 });
  lease.enable();
  await wait(60);
  await flushAsync();
  // The session the boot already has: no second lane request, and the same lane.
  expect(requests.length).toBe(before);
  expect(fastLane()).toBe(bootLane);
  expect(storeOf("adopted").pending).toHaveLength(1);

  await expect(lease.quiesce()).resolves.toEqual({ ok: true });
  lease.dispose();
  // The exit stops the lane the boot started.
  expect(fastLane()).toBeNull();
  expect(storeOf("adopted").handle.status.mode).toBe("file");
});

test("a second session's writer gate is a new promise, not the first session's resolved one", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  live("g");
  const first = liveWriterParticipant().prepare({ generation: 1 });
  first.enable();
  await join();
  const firstGate = pageWriterReady();
  const firstLane = await firstGate;
  expect(firstLane).toBe(fastLane());

  await expect(first.quiesce()).resolves.toEqual({ ok: true });
  first.dispose();
  expect(fastLane()).toBeNull();

  const second = liveWriterParticipant().prepare({ generation: 2 });
  const secondGate = pageWriterReady();
  // The released session's gate answered for a lane that no longer exists.
  expect(secondGate).not.toBe(firstGate);
  second.enable();
  await join({ value: { s: 0 } });
  const secondLane = await secondGate;
  expect(secondLane).not.toBeNull();
  expect(secondLane).not.toBe(firstLane);
  expect(secondLane).toBe(fastLane());
  second.dispose();
});
