import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { createFastLane } from "../../../src/live/fast-lane.js";
import { localTransport } from "../../../src/live/local-lane.js";
import { createYProvider, dec, docFromValue } from "../../../src/page/ybind/provider.js";
import { isCheckpointKey } from "../../../src/live/page-compaction.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { seedValue } from "../../../src/page/ybind/seed.js";

/**
 * The local tab lane's host mode: the tab that sequences the page folds its keys
 * as a server room folds them, so two tabs reach the loose bound and the room
 * tails them, a page past its active bytes is refused as a full room refuses it,
 * a hand-off in the middle of typing keeps every admitted update, and a tab of
 * the lane before this one, on its own key and its own version, never joins.
 */

const KEY = "clay-live:/lab.html";
const SCOPE = `${KEY}:page-rooms:2`;
const BLOCKS = [
  { id: "p", text: "hello" },
  { id: "q", text: "world" },
];

let channels;
let posted;
let tabs;

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    channels.push(this);
  }
  postMessage(data) {
    posted.push({ channel: this, data: JSON.parse(JSON.stringify(data)) });
    const copy = JSON.parse(JSON.stringify(data));
    for (const other of channels) {
      if (other === this || other.closed || other.name !== this.name) continue;
      setTimeout(() => other.onmessage?.({ data: copy }), 0);
    }
  }
  close() {
    this.closed = true;
  }
}

// A lock per channel name, as the platform's Web Locks are: a scope of its own
// is a lock of its own, so two scopes never take each other's room.
function namedLocks() {
  const waiting = new Map();
  const held = new Set();
  const grant = (name) => {
    if (held.has(name)) return;
    const queue = waiting.get(name);
    if (!queue?.length) return;
    held.add(name);
    const { callback, resolve } = queue.shift();
    Promise.resolve(callback({ name })).then((result) => {
      held.delete(name);
      resolve(result);
      grant(name);
    });
  };
  return {
    request(name, callback) {
      return new Promise((resolve) => {
        const queue = waiting.get(name) ?? [];
        queue.push({ callback, resolve });
        waiting.set(name, queue);
        grant(name);
      });
    },
  };
}

beforeAll(() => {
  global.BroadcastChannel = FakeChannel;
});

beforeEach(() => {
  jest.useFakeTimers();
  channels = [];
  posted = [];
  tabs = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: namedLocks() });
});

afterEach(() => {
  for (const t of tabs) t.stop();
  tabs = [];
  jest.useRealTimers();
});

const settle = (ms = 3000) => jest.advanceTimersByTimeAsync(ms);
const text = (t) => t.flow.toString().replace(/[^\x20-\x7e\ufffc]/g, "");
const all = (t) => [...t.flow.toString()].join("");

// The page value a file saved by a compacting room holds: one checkpoint key.
function folded(blocks = BLOCKS) {
  const seeded = seedValue(blocks);
  const merged = Y.mergeUpdatesV2(Object.keys(seeded.y).sort().map((key) => dec(seeded.y[key])));
  return { v: 1, g: 0, y: { "c00000000-1": Y.toBase64(merged) } };
}

// A seed written the way a long page's save writes it: one update's base64 text
// in parts, under the base name seed.
function splitSeed(blocks = BLOCKS, n = 3) {
  const seeded = seedValue(blocks);
  const text = Y.toBase64(Y.mergeUpdatesV2(Object.keys(seeded.y).sort().map((key) => dec(seeded.y[key]))));
  const size = Math.ceil(text.length / n);
  const y = {};
  for (let i = 0; i < n; i++) y[`seed.${i}.${n}`] = text.slice(i * size, (i + 1) * size);
  return { v: 1, g: 0, y };
}

const textOf = (value) => {
  const doc = docFromValue(value);
  const out = doc.getText("flow").toString();
  doc.destroy();
  return out;
};

// One whole update, as a client sends it.
function updateOf(mark, client) {
  const doc = new Y.Doc();
  doc.clientID = client;
  doc.getText("flow").insert(0, mark);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  return encoded;
}

function tab(client, { key = KEY, rooms = true, value = folded() } = {}) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const entries = new Map([["page", { store }]]);
  const seed = () => new Map([["page", { value: store.authoritative, ephemeral: false, text: JSON.stringify(value) }]]);
  const transport = localTransport({ seed, key, rooms });
  const lane = createFastLane({ transport, entries });
  store.onLocal((ops) => lane.local("page", ops, store.mark));
  const ydoc = new Y.Doc();
  ydoc.clientID = client;
  for (const k of Object.keys(value.y).sort()) Y.applyUpdateV2(ydoc, dec(value.y[k]), NET);
  const provider = createYProvider({ store, ydoc });
  lane.start();
  const t = { store, lane, ydoc, provider, transport, flow: ydoc.getText("flow"), stop: () => lane.stop() };
  tabs.push(t);
  return t;
}

// The lane alone: a room seeded from a value this test builds, driven by frames
// it sends itself.
function room(value) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const seed = () => new Map([["page", { value: store.authoritative, ephemeral: false }]]);
  const transport = localTransport({ seed, key: KEY, rooms: true });
  const writers = [];
  const stop = transport.start({ open() {}, close() {}, frame() {}, state() {}, writer: (event) => writers.push(event) });
  const t = { transport, store, stop, writers };
  tabs.push(t);
  return t;
}

const setOp = (key, value) => ({ op: "set", path: ["y", key], value });
const keysOf = async (t) => Object.keys((await t.transport.fetchState(t.transport.clientId)).stores.page.value.y);

test("two tabs reach the loose bound and the room tails their updates", async () => {
  const a = tab(11);
  await settle();
  const b = tab(12);
  await settle();
  expect(a.transport.isSequencer).toBe(true);
  expect(a.transport.scope).toBe(SCOPE);

  for (let i = 0; i < 10; i++) {
    a.flow.insert(0, "a");
    await settle(50);
    b.flow.insert(0, "b");
    await settle(50);
  }

  expect(text(a)).toBe(text(b));
  expect(all(a).match(/a/g)).toHaveLength(10);
  expect(all(b).match(/b/g)).toHaveLength(10);
  expect(all(a)).toContain("hello");
  expect(all(a)).toContain("world");

  const keys = await keysOf(a);
  expect(keys.filter((key) => /^t[0-9a-z]{8}-[0-9a-z]+$/.test(key))).toHaveLength(1);
  expect(keys.filter((key) => /^c[0-9a-z]{8}-[0-9a-z]+$/.test(key))).toHaveLength(1);
  expect(keys.filter((key) => /^[ur][0-9a-z]+(-[0-9a-z]+){2}$/.test(key)).length).toBeLessThan(16);
  expect(posted.some((message) => message.data?.type === "data" && message.data.data?.from === "compactor")).toBe(true);
  expect(a.store.pending.length).toBe(0);
  expect(b.store.pending.length).toBe(0);
});

test("an overflow gets a full and then page-full", async () => {
  const t = room({ v: 1, g: 0, y: { "c00000000-1": updateOf("x".repeat(2_800_000), 41) } });
  await settle();
  expect(t.transport.isSequencer).toBe(true);

  const over = await t.transport.send("c1", { name: "page", n: 1, compaction: 1, ops: [setOp("u1aaaaaaa-b-c", updateOf("y".repeat(300_000), 42))] });
  expect(over).toEqual({ status: 503, body: { code: "checkpoint-required" }, retryAfter: 0 });

  await settle();
  const state = await t.transport.fetchState("c1");
  const keys = Object.keys(state.stores.page.value.y);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^c[0-9a-z]{8}-[0-9a-z]+$/);
  expect(state.stores.page.compaction).toEqual({ v: 1, loose: 32, activeBytes: 3932160 });
  expect(posted.some((message) => message.data?.type === "data" && message.data.data?.kind === "full")).toBe(true);

  const full = await t.transport.send("c1", { name: "page", n: 2, compaction: 1, ops: [setOp("u1aaaaaaa-b-d", updateOf("z".repeat(600_000), 43))] });
  expect(full).toEqual({ status: 409, body: { code: "page-full" }, retryAfter: 0 });
});

test("a hand-off in the middle of typing keeps every admitted update", async () => {
  const a = tab(21);
  await settle();
  const b = tab(22);
  const c = tab(23);
  await settle();

  for (let i = 0; i < 6; i++) {
    a.flow.insert(0, `A${i}`);
    await settle(50);
    b.flow.insert(0, `B${i}`);
    await settle(50);
    c.flow.insert(0, `C${i}`);
    await settle(50);
  }
  const before = text(a);
  expect(text(b)).toBe(before);

  // The sequencer vanishes without a closed message: the next lock holder takes
  // the room from its mirror and goes on, and nothing admitted was lost.
  a.channel = null;
  a.stop();
  await settle(5000);

  expect(b.transport.isSequencer || c.transport.isSequencer).toBe(true);
  const next = b.transport.isSequencer ? b : c;
  const other = next === b ? c : b;
  next.flow.insert(0, "Z");
  other.flow.insert(0, "Y");
  await settle();

  expect(text(next)).toBe(text(other));
  for (let i = 0; i < 6; i++) {
    expect(text(next)).toContain(`A${i}`);
    expect(text(next)).toContain(`B${i}`);
    expect(text(next)).toContain(`C${i}`);
  }
  expect(text(next)).toContain("Z");
  expect(text(next)).toContain("Y");

  const keys = await keysOf(next);
  expect(keys.filter((key) => /^c[0-9a-z]{8}-[0-9a-z]+$/.test(key))).toHaveLength(1);
  expect(keys.length).toBeLessThanOrEqual(33);
});

test("a whole-page fold that still does not fit refuses the next write as full", async () => {
  // A page already past its active bytes, stored as one seed key the room folds under
  // a name of its own: the fold is the whole page and still does not fit, so nothing
  // is committed and the page is as small as it gets.
  const value = { v: 1, g: 0, y: { seed: updateOf("x".repeat(3_000_000), 71) } };
  const t = room(value);
  await settle();
  expect(t.transport.isSequencer).toBe(true);
  const keysBefore = await keysOf(t);

  const over = await t.transport.send("c1", { name: "page", n: 1, compaction: 1, ops: [setOp("u1aaaaaaa-b-c", updateOf("y".repeat(200_000), 72))] });
  expect(over).toEqual({ status: 503, body: { code: "checkpoint-required" }, retryAfter: 0 });
  await settle();
  expect(await keysOf(t)).toEqual(keysBefore);
  expect((await t.transport.fetchState("c1")).seq).toBe(0);

  // Waiting for another fold would never help: the next growing write is refused as
  // a full room refuses it.
  const full = await t.transport.send("c1", { name: "page", n: 2, compaction: 1, ops: [setOp("u1aaaaaaa-b-d", updateOf("z".repeat(1_000), 73))] });
  expect(full).toEqual({ status: 409, body: { code: "page-full" }, retryAfter: 0 });
});

test("a clean fold tells every tab it landed", async () => {
  // A page of parts is never normal, so the first write asks for a fold; nothing has
  // been edited since this tab last agreed with the file, so the fold is clean.
  const t = room(splitSeed());
  await settle();
  expect(t.transport.isSequencer).toBe(true);

  const first = await t.transport.send("c1", { name: "page", n: 1, compaction: 1, ops: [setOp("u1aaaaaaa-b-c", updateOf("typed", 61))] });
  expect(first).toEqual({ status: 503, body: { code: "checkpoint-required" }, retryAfter: 0 });
  await settle();

  const state = await t.transport.fetchState(t.transport.clientId);
  expect(state.seq).toBe(1);
  expect(t.writers).toHaveLength(1);
  expect(t.writers[0].landed.page).toBe(state.seq);
});

test("a save of the page merges as a union under names this room makes", async () => {
  const value = folded();
  const t = room(value);
  await settle();
  expect(t.transport.isSequencer).toBe(true);

  // A save from a device that never saw this room: the room's own key and one
  // this room does not hold.
  const file = { v: 1, g: 0, y: { ...value.y, "seed-0000": updateOf("from the file", 51) } };
  t.transport.fileFrame(new Map([["page", { text: JSON.stringify(file), at: null, seq: null }]]));
  await settle();

  const keys = await keysOf(t);
  expect(keys).not.toContain("seed-0000");
  expect(keys.filter((key) => /^f[0-9a-z]{8}-[0-9a-z]+-[0-9a-z]+$/.test(key))).toHaveLength(1);
  const state = await t.transport.fetchState(t.transport.clientId);
  expect(state.seq).toBeGreaterThan(0);
  expect(Object.keys(state.stores.page.value.y)).toHaveLength(2);
});

test("an old-version tab on the old key never joins the new room", async () => {
  const fresh = tab(31);
  await settle();
  const old = tab(32, { rooms: false });
  await settle();

  expect(fresh.transport.scope).toBe(SCOPE);
  expect(old.transport.scope).toBe(KEY);
  expect(fresh.transport.isSequencer).toBe(true);
  expect(old.transport.isSequencer).toBe(true);

  const before = await fresh.transport.fetchState(fresh.transport.clientId);
  fresh.flow.insert(0, "new");
  old.flow.insert(0, "old");
  await settle();

  expect(text(fresh)).toContain("new");
  expect(text(fresh)).not.toContain("old");
  expect(text(old)).toContain("old");
  expect(text(old)).not.toContain("new");

  // A frame of the lane before this step, even on this room's channel, is not a
  // message of this one: the room keeps its epoch.
  const stale = new FakeChannel(SCOPE);
  stale.postMessage({ v: 4, version: 4, type: "data-state", state: { epoch: before.epoch, seq: 0, writer: "old-tab", stores: {}, mirror: { seen: [] } } });
  await settle();
  const after = await fresh.transport.fetchState(fresh.transport.clientId);
  expect(after.epoch).toBe(before.epoch);
  expect(after.seq).toBeGreaterThan(before.seq);
});

test("a seed stored in parts commits its fold and then admits a write", async () => {
  const value = splitSeed();
  const before = textOf(value);
  expect(Object.keys(value.y)).toHaveLength(3);
  const t = room(value);
  await settle();
  expect(t.transport.isSequencer).toBe(true);

  // A page of parts is never normal, so the first write is refused for the shape
  // and asks the room for a fold; the fold must commit, retiring the parts for one
  // checkpoint key, or every later write is refused the same way.
  const first = await t.transport.send("c1", { name: "page", n: 1, compaction: 1, ops: [setOp("u1aaaaaaa-b-c", updateOf("typed", 61))] });
  expect(first).toEqual({ status: 503, body: { code: "checkpoint-required" }, retryAfter: 0 });

  await settle();
  const keys = await keysOf(t);
  expect(keys.filter((key) => key.startsWith("seed."))).toHaveLength(0);
  expect(keys.filter((key) => isCheckpointKey(key))).toHaveLength(1);
  expect(posted.some((message) => message.data?.type === "data" && message.data.data?.from === "compactor" && message.data.data?.kind === "full")).toBe(true);

  const state = await t.transport.fetchState(t.transport.clientId);
  expect(textOf(state.stores.page.value)).toBe(before);

  // The room is within its bounds again: a further host-form update is admitted.
  const again = await t.transport.send("c1", { name: "page", n: 2, compaction: 1, ops: [setOp("u1aaaaaaa-b-d", updateOf("more", 62))] });
  expect(again.status).toBe(200);
  expect(again.body.code).toBeUndefined();
});
