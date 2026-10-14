import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { createFastLane } from "../../src/live/fast-lane.js";

/**
 * The local tab lane with a fake BroadcastChannel and fake Web Locks, several
 * "tabs" in one test: the first tab is the sequencer and the writer, tabs
 * converge, never-saved stores travel too, a new sequencer keeps the values and
 * counts nothing twice, and only an outside file frame restarts the room.
 */

const KEY = "clay-live:/game.html";
let channels;
let locks;

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
      if (other === this || other.closed || other.name !== this.name) continue;
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
  return { transport, lane, entries, handle, game: handle("game") };
}

const settle = () => jest.advanceTimersByTimeAsync(3000);

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

test("only a file frame this browser did not write restarts the room", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 2);
  await settle();
  const epoch = b.lane.status.epoch;

  b.transport.captured("game", '{"score":2}');
  await settle();
  a.transport.fileFrame(new Map([["game", '{"score":2}']]));
  await settle();
  expect(b.lane.status.epoch).toBe(epoch);
  expect(b.game.toJSON()).toEqual({ score: 2 });

  a.transport.fileFrame(new Map([["game", '{"score":50}']]));
  await settle();
  expect(b.lane.status.epoch).not.toBe(epoch);
  expect(a.game.toJSON()).toEqual({ score: 50 });
  expect(b.game.toJSON()).toEqual({ score: 50 });
});

test("without BroadcastChannel or Web Locks there is no local lane", async () => {
  const { localLaneSupported } = await import("../../src/live/local-lane.js");
  expect(localLaneSupported()).toBe(true);
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  expect(localLaneSupported()).toBe(false);
});
