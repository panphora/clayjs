import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { createFastLane } from "../../src/live/fast-lane.js";
import { textHash } from "../../src/live/ops.js";

/**
 * The local tab lane with a fake BroadcastChannel and fake Web Locks, several
 * "tabs" in one test: the first tab is the sequencer and the writer, tabs
 * converge, never-saved stores travel too, a new sequencer keeps the values and
 * counts nothing twice, and file frames merge: the room's own checkpoint changes
 * nothing, an outside edit keeps the room's moves.
 */

const KEY = "clay-live:/game.html";
let channels;
let locks;
let drop = () => false;

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    channels.push(this);
  }
  postMessage(data) {
    const copy = JSON.parse(JSON.stringify(data));
    for (const other of channels) {
      if (other === this || other.closed || other.name !== this.name || drop(other, data)) continue;
      setTimeout(() => other.onmessage?.({ data: copy }), 0);
    }
  }
  close() {
    this.closed = true;
  }
}

function fakeLocks() {
  const queue = [];
  let held = false;
  async function grant() {
    if (held || !queue.length) return;
    held = true;
    const { callback, resolve } = queue.shift();
    const result = await callback({ name: KEY });
    held = false;
    resolve(result);
    grant();
  }
  return {
    request(name, callback) {
      return new Promise((resolve) => {
        queue.push({ callback, resolve });
        Promise.resolve().then(grant);
      });
    },
  };
}

let localTransport;

beforeAll(async () => {
  global.BroadcastChannel = FakeChannel;
  ({ localTransport } = await import("../../src/live/local-lane.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  channels = [];
  locks = fakeLocks();
  drop = () => false;
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
});

afterEach(() => {
  jest.useRealTimers();
});

function tab(tags) {
  const entries = new Map();
  for (const [name, { value, ephemeral = false }] of Object.entries(tags)) {
    entries.set(name, { store: createStore({ name, value, ephemeral }) });
  }
  const seed = () => {
    const values = new Map();
    for (const [name, entry] of entries) {
      values.set(name, { value: entry.store.authoritative, ephemeral: entry.store.ephemeral, text: JSON.stringify(tags[name].value) });
    }
    return values;
  };
  const transport = localTransport({ seed, key: KEY });
  const lane = createFastLane({ transport, entries });
  for (const [name, entry] of entries) entry.store.onLocal((ops) => lane.local(name, ops, entry.store.mark));
  lane.start();
  const handle = (name) => entries.get(name).store.handle;
  return { transport, lane, entries, handle, game: handle("game"), channel: channels.at(-1) };
}

const settle = (ms = 3000) => jest.advanceTimersByTimeAsync(ms);

test("the first tab is the sequencer and the writer; three tabs converge", async () => {
  const a = tab({ game: { value: { score: 0, players: {} } } });
  await settle();
  const b = tab({ game: { value: { score: 0, players: {} } } });
  const c = tab({ game: { value: { score: 0, players: {} } } });
  await settle();
  expect(a.transport.isSequencer).toBe(true);
  expect(b.transport.isSequencer).toBe(false);
  expect(a.lane.isWriter()).toBe(true);
  expect(b.lane.isWriter()).toBe(false);
  expect(b.game.status.mode).toBe("fast");

  a.game.add("score", 1);
  b.game.add("score", 1);
  c.game.data.players.c = { x: 3 };
  await settle();
  const want = { score: 2, players: { c: { x: 3 } } };
  expect(a.game.toJSON()).toEqual(want);
  expect(b.game.toJSON()).toEqual(want);
  expect(c.game.toJSON()).toEqual(want);
  expect(b.entries.get("game").store.pending).toEqual([]);
});

test("never-saved stores travel too", async () => {
  const tags = { game: { value: {} }, lobby: { value: { chat: [] }, ephemeral: true } };
  const a = tab(tags);
  await settle();
  const b = tab(tags);
  await settle();
  b.handle("lobby").data.chat.push("hi");
  await settle();
  expect(a.handle("lobby").toJSON()).toEqual({ chat: ["hi"] });
});

test("when the sequencer stops, the next tab takes over with the same values and nothing counts twice", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  const c = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 5);
  await settle();
  expect(c.game.toJSON()).toEqual({ score: 5 });
  const firstEpoch = b.lane.status.epoch;

  a.lane.stop();
  c.game.add("score", 1);
  await settle();
  expect(b.transport.isSequencer || c.transport.isSequencer).toBe(true);
  expect(b.lane.status.epoch).not.toBe(firstEpoch);
  expect(b.game.toJSON()).toEqual({ score: 6 });
  expect(c.game.toJSON()).toEqual({ score: 6 });
  b.game.add("score", 1);
  await settle();
  expect(c.game.toJSON()).toEqual({ score: 7 });
});

const at = (epoch, seq, text) => ({ epoch, seq, hash: textHash(text) });

test("the room's own checkpoint changes nothing; an edit of it keeps the epoch and the room's later moves", async () => {
  const a = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  const b = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  a.game.add("score", 2);
  await settle();
  const epoch = b.lane.status.epoch;
  const own = '{"score":2,"name":"x"}';
  a.transport.fileFrame(new Map([["game", { text: own, at: at(epoch, 1, own) }]]));
  await settle();
  expect(b.lane.status.epoch).toBe(epoch);
  expect(b.game.toJSON()).toEqual({ score: 2, name: "x" });

  a.game.add("score", 1);
  await settle();
  const edited = '{"score":2,"name":"y"}';
  a.transport.fileFrame(new Map([["game", { text: edited, at: at(epoch, 1, own) }]]));
  await settle();
  expect(b.lane.status.epoch).toBe(epoch);
  expect(a.game.toJSON()).toEqual({ score: 3, name: "y" });
  expect(b.game.toJSON()).toEqual({ score: 3, name: "y" });
});

test("an outside save with no stamp keeps every move the room accepted", async () => {
  const a = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  const b = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  a.game.add("score", 1);
  b.game.add("score", 1);
  await settle();
  const epoch = b.lane.status.epoch;
  a.transport.fileFrame(new Map([["game", { text: '{"score":0,"name":"z"}', at: null }]]));
  await settle();
  expect(b.lane.status.epoch).toBe(epoch);
  expect(a.game.toJSON()).toEqual({ score: 2, name: "z" });
  expect(b.game.toJSON()).toEqual({ score: 2, name: "z" });
});

test("a file frame whose text has not changed since the last one changes nothing", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 3);
  await settle();
  a.transport.fileFrame(new Map([["game", { text: JSON.stringify({ score: 0 }), at: null }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 3 });
});

test("a checkpoint landing tells every tab, so a later merge does not replay what it holds", async () => {
  const a = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  const b = tab({ game: { value: { score: 0, name: "x" } } });
  await settle();
  a.game.add("score", 2);
  await settle();
  const epoch = a.lane.status.epoch;
  const own = '{"score":2,"name":"x"}';
  a.transport.landed("game", at(epoch, 1, own));
  await settle();
  a.lane.stop();
  await settle();
  expect(b.transport.isSequencer).toBe(true);
  b.transport.fileFrame(new Map([["game", { text: '{"score":2,"name":"q"}', at: null }]]));
  await settle();
  expect(b.game.toJSON()).toEqual({ score: 2, name: "q" });
});

test("a predecessor's late checkpoint after a hand-off does not roll the room back", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  await settle();
  a.game.add("s", 1);
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 2 });
  expect(b.entries.get("game").store.pending).toEqual([]);
  const oldEpoch = a.lane.status.epoch;

  a.lane.stop();
  await settle();
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 2 });
  const before = b.lane.status.epoch;
  b.transport.fileFrame(new Map([["game", { text: '{"s":1}', at: at(oldEpoch, 1, '{"s":1}') }]]));
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 2 });
  expect(b.lane.status.epoch).toBe(before);
  expect(b.entries.get("game").store.pending).toEqual([]);
});

test("a move whose answer was lost is not counted twice by the successor", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  const oldEpoch = a.lane.status.epoch;
  drop = (to, m) => to === c.channel && ((m.type === "data" && m.data.epoch === oldEpoch) || (m.type === "answer" && m.result.status === 200));
  c.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.entries.get("game").store.pending).toHaveLength(1);
  a.lane.stop();
  drop = () => false;
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });
  expect(c.entries.get("game").store.pending).toEqual([]);
});

test("without BroadcastChannel or Web Locks there is no local lane", async () => {
  const { localLaneSupported } = await import("../../src/live/local-lane.js");
  expect(localLaneSupported()).toBe(true);
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  expect(localLaneSupported()).toBe(false);
});
