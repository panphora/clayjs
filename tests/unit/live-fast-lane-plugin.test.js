import { parseBy } from "../../src/live/provenance.js";
import { jest } from "@jest/globals";

/**
 * The plugin starts the fast lane on a live-data host, takes the room's state
 * when the live-lane stream opens, posts local ops, and checkpoints in fast mode
 * only as the writer, only after a change, and only while the file is behind the
 * room.
 */

const changed = jest.fn();
const soon = jest.fn();
let deps;
let checkpoints;
await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (d) => {
    deps = d;
    checkpoints = { changed, soon, flush: jest.fn(), flushing: false, deadline: null };
    return checkpoints;
  },
}));
await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async () => false,
  hostMeta: async () => ({ spec: 1, extensions: ["live-data", "live-provenance"], document: null }),
}));
// No live-data host here, so the plugin takes its local tab lane: a stub that
// records what the plugin reports to it and hands the transport itself to the
// server lane, which this harness drives through the stream bridge.
const landed = [];
const { serverTransport: realServerTransport } = await import("../../src/live/server-lane.js");
await jest.unstable_mockModule("../../src/live/local-lane.js", () => ({
  localLaneSupported: () => true,
  localTransport: () => ({
    ...realServerTransport(),
    landed: (name, at) => landed.push({ name, at }),
    fileFrame: () => {},
  }),
}));

window.clayEditMode = true;
const requests = [];
let room = { epoch: "e1", seq: 0, writer: null, provenanceVersion: 2, receiptGeneration: 0, stores: { g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } } };
// Set to a promise to keep a document save on the wire until it settles.
let saveGate = null;
let hangState = false;
global.fetch = jest.fn(async (url, init = {}) => {
  if (saveGate && !String(url).includes("/_/sync/")) return saveGate;
  requests.push({ url: String(url), init });
  if ((init.method || "GET") === "GET") return hangState ? new Promise(() => {}) : { ok: true, status: 200, json: async () => room };
  return { ok: true, status: 200, json: async () => ({ seq: room.seq + 1, epoch: room.epoch }), headers: { get: () => null } };
});

const { live, fastLane, storeOf, confirmSaved, receiveFrame, HOLD_MS } = await import("../../src/plugins/live.js");
const bridge = await import("../../src/live/stream-bridge.js");
const snapshot = await import("../../src/core/snapshot.js");
const { saveHtml } = await import("../../src/core/save-core.js");
const { savePageForce } = await import("../../src/core/save.js");
const { stampOf, textHash, parseStamp, serializeLive } = await import("../../src/live/ops.js");

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

test("the lane opens every live tag on the page, not only the one code asked for", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("other", '{"t":0}');
  live("g");
  await flushAsync();
  expect(storeOf("other")).not.toBeNull();
});

test("joins the room, posts ops, and checkpoints only as the writer after a change", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  await flushAsync();
  requests.length = 0;
  expect(fastLane()).not.toBeNull();

  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  expect(g.status.mode).toBe("fast");
  expect(requests.some((r) => new URL(r.url).pathname === "/_/sync/data" && (r.init.method || "GET") === "GET")).toBe(true);
  expect(deps.needsSave()).toBe(false);

  g.add("s", 1);
  await wait(80);
  await flushAsync();
  const post = posts("g").at(-1);
  expect(new URL(post.url).searchParams.get("client-id")).toBe("tab-1");
  expect(JSON.parse(post.init.body)).toEqual({ name: "g", n: 1, ops: [{ op: "add", path: ["s"], n: 1 }], epoch: "e1", receiptGeneration: 0 });

  bridge.streamEvent("data", { epoch: "e1", seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  expect(g.toJSON()).toEqual({ s: 1 });
  expect(deps.needsSave()).toBe(false);

  bridge.streamEvent("data-writer", { epoch: "e1", writer: "tab-1" });
  expect(fastLane().isWriter()).toBe(true);
  expect(deps.needsSave()).toBe(true);
  expect(changed).toHaveBeenCalled();

  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  expect(body).toContain('{"s":1}');
  const saved = new DOMParser().parseFromString(body, "text/html").querySelector('script[merge="g"]');
  expect(saved.getAttribute("live-at")).toBe(stampOf("e1", 1, serializeLive(storeOf("g").authoritative)));
  confirmSaved(body);
  expect(deps.needsSave()).toBe(true);

  bridge.streamEvent("data-writer", { epoch: "e1", writer: "tab-1", landed: { g: 1 } });
  expect(deps.needsSave()).toBe(false);
});

test("after a room change the writer saves the new room's moves", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  live("g");
  await flushAsync();

  await join({ g: { value: { s: 50 }, ephemeral: false, last: 50, landed: 50 } });
  expect(fastLane().isWriter()).toBe(true);
  expect(deps.needsSave()).toBe(false);

  await join({ g: { value: { s: 50 }, ephemeral: false, last: 0, landed: 0 } });
  expect(deps.needsSave()).toBe(false);

  changed.mockClear();
  bridge.streamEvent("data", { epoch: room.epoch, seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  expect(deps.needsSave()).toBe(true);
  expect(changed).toHaveBeenCalled();
});

test("landed -1 saves at once", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  live("g");
  await flushAsync();

  soon.mockClear();
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: -1 } });
  expect(soon).toHaveBeenCalled();

  soon.mockClear();
  bridge.streamEvent("data-writer", { epoch: room.epoch, writer: "tab-1", landed: { g: -1 } });
  expect(soon).toHaveBeenCalled();
});

test("a stamp's hash is of the value, not the formatting", async () => {
  document.body.innerHTML = tag("p", '{\n  "s": 0\n}');
  const p = live("p");
  await flushAsync();

  await join({ p: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(p.status.mode).toBe("fast");

  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  const saved = new DOMParser().parseFromString(body, "text/html").querySelector('script[merge="p"]');
  const value = serializeLive(storeOf("p").authoritative);
  expect(saved.textContent).toContain("\n");
  expect(saved.getAttribute("live-at")).toBe(stampOf(room.epoch, room.seq, value));
  expect(parseStamp(saved.getAttribute("live-at")).hash).toBe(textHash(value));
});

test("a fast-mode pin confirms nothing", async () => {
  document.body.innerHTML = tag("g", '{"s":0}');
  const g = live("g");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(g.status.mode).toBe("fast");

  g.add("s", 1);
  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  await join({});
  expect(g.status.mode).toBe("file");
  confirmSaved(body);
  expect(storeOf("g").pending).toHaveLength(1);
  expect(g.toJSON()).toEqual({ s: 1 });
  await wait(80);
  expect(posts("g")).toEqual([]);
});

test("a room state waits for the answer of a file-mode save that carries ops, and they are never framed", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("h", '{"n":0}');
  const h = live("h");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(h.status.mode).toBe("file");
  h.add("n", 1);
  await flushAsync();
  expect(posts("h")).toEqual([]);

  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  let endSave;
  saveGate = new Promise((resolve) => { endSave = resolve; });
  saveHtml(body);
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, h: { value: { n: 1 }, ephemeral: false, last: 0, landed: 0 } });
  expect(h.status.mode).toBe("file");
  expect(h.toJSON()).toEqual({ n: 1 });
  expect(storeOf("h").pending).toHaveLength(1);
  await wait(80);
  expect(posts("h")).toEqual([]);

  confirmSaved(body);
  saveGate = null;
  endSave({ ok: false, status: 500, text: async () => "", json: async () => ({}), headers: { get: () => null } });
  await wait(80);
  expect(h.status.mode).toBe("fast");
  expect(h.toJSON()).toEqual({ n: 1 });
  expect(storeOf("h").pending).toEqual([]);
  expect(posts("h")).toEqual([]);
});

test("a capture whose save sent nothing holds nothing", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("h", '{"n":0}');
  const h = live("h");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  h.add("n", 1);
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, h: { value: { n: 0 }, ephemeral: false, last: 0, landed: 0 } });
  await wait(80);
  expect(posts("h")).toHaveLength(1);
});

test("a refused file-mode save releases its ops to the lane", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("h", '{"n":0}');
  const h = live("h");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(h.status.mode).toBe("file");
  h.add("n", 1);
  await flushAsync();

  snapshot.captureForSaveAndComparison({ flushUndo: false });
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, h: { value: { n: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(posts("h")).toEqual([]);

  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 403 } }));
  await wait(80);
  expect(posts("h")).toHaveLength(1);
  expect(JSON.parse(posts("h")[0].init.body).ops).toEqual([{ op: "add", path: ["n"], n: 1 }]);
});

test("a file-mode save that may have landed drops its ops instead of sending them", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("h", '{"n":0}');
  const h = live("h");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  h.add("n", 1);
  await flushAsync();
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, h: { value: { n: 0 }, ephemeral: false, last: 0, landed: 0 } });

  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: null } }));
  await wait(80);
  expect(posts("h")).toEqual([]);
  expect(storeOf("h").pending).toEqual([]);
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ name: "h", code: "save-uncertain", ops: [{ op: "add", path: ["n"], n: 1 }] });
});

test("a file-mode save that may have landed before the store joined is never sent to the room", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("h", '{"n":0}');
  const h = live("h");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  h.add("n", 1);
  await flushAsync();
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 502 } }));
  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, h: { value: { n: 1 }, ephemeral: false, last: 0, landed: 0 } });
  await wait(80);
  expect(posts("h")).toEqual([]);
  expect(h.toJSON()).toEqual({ n: 1 });
});

test("a save hook that sorts object keys still confirms the save's ops", async () => {
  const mock = global.fetch;
  let posted = null;
  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/sync/")) return mock(url, init);
    posted = init.body;
    return { ok: true, status: 200, text: async () => JSON.stringify({ etag: "saved" }), headers: { get: () => null } };
  });
  document.body.innerHTML = tag("keys", '{"z":0,"a":0}');
  document
    .querySelector('script[merge="keys"]')
    .setAttribute("onbeforesave", 'this.textContent = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(this.textContent)).sort(([a],[b]) => a.localeCompare(b))))');
  const keys = live("keys");
  await flushAsync();

  keys.add("z", 1);
  expect((await savePageForce()).ok).toBe(true);
  const saved = new DOMParser().parseFromString(posted, "text/html").querySelector('script[merge="keys"]');
  expect(JSON.parse(saved.textContent)).toEqual({ a: 0, z: 1 });
  expect(storeOf("keys").pending).toEqual([]);

  receiveFrame(tag("keys", '{"a":0,"z":2}'));
  await flushAsync();
  expect(keys.toJSON()).toEqual({ a: 0, z: 2 });
  expect(storeOf("keys").pending).toEqual([]);
  global.fetch = mock;
});

test("an accepted file-mode save whose data-state came first is not counted again", async () => {
  document.body.innerHTML = tag("q", '{"s":0}');
  const q = live("q");
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(q.status.mode).toBe("file");
  q.add("s", 1);
  await flushAsync();
  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  let endSave;
  saveGate = new Promise((resolve) => { endSave = resolve; });
  saveHtml(body);

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 }, q: { value: { s: 1 }, ephemeral: false, last: 1, landed: 1 } });
  expect(q.status.mode).toBe("file");
  expect(q.toJSON()).toEqual({ s: 1 });
  expect(storeOf("q").pending).toHaveLength(1);

  confirmSaved(body);
  expect(storeOf("q").authoritative).toEqual({ s: 1 });
  expect(storeOf("q").pending).toEqual([]);
  expect(q.toJSON()).toEqual({ s: 1 });

  saveGate = null;
  endSave({ ok: true, status: 200, text: async () => JSON.stringify({ etag: "saved" }), json: async () => ({}), headers: { get: () => null } });
  await wait(80);
  expect(q.status.mode).toBe("fast");
  expect(q.toJSON()).toEqual({ s: 1 });
  expect(posts("q")).toEqual([]);
});

test("a save that timed out and then got a 4xx may have landed", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("hadTimeout", '{"n":0}') + tag("noTimeout", '{"n":0}');
  const hadTimeout = live("hadTimeout");
  const noTimeout = live("noTimeout");
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(hadTimeout.status.mode).toBe("file");
  expect(noTimeout.status.mode).toBe("file");

  hadTimeout.add("n", 1);
  await flushAsync();
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 409, hadTimeout: true } }));

  noTimeout.add("n", 1);
  await flushAsync();
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 409, hadTimeout: false } }));

  await join({
    g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 },
    hadTimeout: { value: { n: 0 }, ephemeral: false, last: 0, landed: 0 },
    noTimeout: { value: { n: 0 }, ephemeral: false, last: 0, landed: 0 },
  });
  await wait(80);
  expect(posts("hadTimeout")).toEqual([]);
  expect(storeOf("hadTimeout").pending).toEqual([]);
  expect(notices.map((notice) => notice.name)).toEqual(["hadTimeout"]);
  expect(posts("noTimeout")).toHaveLength(1);
  expect(JSON.parse(posts("noTimeout")[0].init.body).ops).toEqual([{ op: "add", path: ["n"], n: 1 }]);
});

test("a file-mode save that may have landed drops its ops at once, and a peer's save does not count them twice", async () => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag("us", '{"n":0}');
  const us = live("us");
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  requests.length = 0;

  await join({ g: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(us.status.mode).toBe("file");
  us.add("n", 1);
  await flushAsync();
  snapshot.captureForSaveAndComparison({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 502 } }));
  await flushAsync();
  expect(storeOf("us").pending).toEqual([]);
  expect(storeOf("us").authoritative).toEqual({ n: 0 });
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ name: "us", code: "save-uncertain" });

  receiveFrame(tag("us", '{"n":1}'));
  await flushAsync();
  expect(us.toJSON()).toEqual({ n: 1 });
  expect(storeOf("us").pending).toEqual([]);
  await wait(80);
  expect(posts("us")).toEqual([]);
});

test("a hide save on the wire when the page closes tells the local room it landed", async () => {
  document.body.innerHTML = tag("ph", '{"s":0}');
  const ph = live("ph");
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  requests.length = 0;
  landed.length = 0;

  await join({ ph: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(ph.status.mode).toBe("fast");

  snapshot.captureForSaveAndComparison({ flushUndo: false });
  const at = { epoch: fastLane().status.epoch, seq: fastLane().status.seq };
  checkpoints.flushing = true;
  window.dispatchEvent(new Event("pagehide"));
  expect(landed).toEqual([{ name: "ph", at }]);

  checkpoints.flushing = false;
  window.dispatchEvent(new Event("pageshow"));
});

// Round 9 review, Opus 1 and 3, Astra 1: a save made out of the room names
// this tab and its last frame, so the host's merge never replays those frames
// over the file; a fast-mode capture names no frames.
test("a store out of the room saves with live-by: this tab's refused frame and the frame reserved for its unframed tail", async () => {
  document.body.innerHTML = tag("by", '{"s":0}');
  const by = live("by");
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  await join({ by: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(by.status.mode).toBe("fast");
  const inFast = new DOMParser().parseFromString(snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave, "text/html").querySelector('script[merge="by"]');
  expect(inFast.hasAttribute("live-by")).toBe(false);

  const mock = global.fetch;
  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/sync/") && (init.method || "GET") === "POST") {
      return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "60" : null) } };
    }
    return mock(url, init);
  });
  by.add("s", 1);
  await wait(80);
  await flushAsync();
  global.fetch = mock;
  expect(by.status.mode).toBe("file");
  by.add("s", 1);

  const saved = new DOMParser().parseFromString(snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave, "text/html").querySelector('script[merge="by"]');
  expect(parseBy(saved.getAttribute("live-by")).frames).toEqual([["tab-1", [[1, 2]]]]);
  expect(fastLane().framed("by")).toBe(2);
  expect(saved.textContent).toBe('{"s":2}');
});

test("a store whose lane stopped saves with the stamp of where it left", async () => {
  document.body.innerHTML = tag("st", '{"s":0}', stampOf("e1", 0, '{"s":0}'));
  const st = live("st");
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  requests.length = 0;

  await join({ st: { value: { s: 0 }, ephemeral: false, last: 0, landed: 0 } });
  expect(st.status.mode).toBe("fast");
  const left = { epoch: fastLane().status.epoch, seq: fastLane().status.seq };

  const mock = global.fetch;
  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/sync/") && (init.method || "GET") === "POST") {
      return { ok: false, status: 403, json: async () => ({ code: "unauthorized" }), headers: { get: () => null } };
    }
    return mock(url, init);
  });
  st.add("s", 1);
  await wait(80);
  await flushAsync();
  global.fetch = mock;

  expect(fastLane().status.stopped).toBe(true);
  expect(st.status.mode).toBe("file");

  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  const saved = new DOMParser().parseFromString(body, "text/html").querySelector('script[merge="st"]');
  expect(saved.getAttribute("live-at")).toBe(stampOf(left.epoch, left.seq, serializeLive(storeOf("st").value)));
});


