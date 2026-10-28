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
let tabs;

beforeAll(async () => {
  global.BroadcastChannel = FakeChannel;
  ({ localTransport } = await import("../../src/live/local-lane.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  channels = [];
  locks = fakeLocks();
  drop = () => false;
  tabs = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
});

afterEach(() => {
  for (const t of tabs) t.lane.stop();
  tabs = [];
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
  const t = { transport, lane, entries, handle, game: handle("game"), channel: channels.at(-1) };
  tabs.push(t);
  return t;
}

const settle = (ms = 3000) => jest.advanceTimersByTimeAsync(ms);

// A tab that vanishes without pagehide: its channel stops delivering and its
// lock is released, but it never posts closed.
function crash(t) {
  t.channel.closed = true;
  t.channel.postMessage = () => {};
  t.lane.stop();
}

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

test("a 200 KB value set in one tab reaches every tab whole", async () => {
  const a = tab({ game: { value: { blob: null } } });
  await settle();
  const b = tab({ game: { value: { blob: null } } });
  await settle();
  const blob = "x".repeat(200 * 1024);
  const changes = [];
  b.handle("game").on("change", () => changes.push(b.game.toJSON().blob));
  a.game.set("blob", blob);
  await settle();
  expect(a.game.toJSON()).toEqual({ blob });
  expect(b.game.toJSON()).toEqual({ blob });
  expect(b.entries.get("game").store.pending).toEqual([]);
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(changes.filter((value) => value === blob)).toHaveLength(1);
});

test("when the sequencer stops, the next tab takes over the same epoch with the same values and nothing counts twice", async () => {
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
  expect(b.lane.status.epoch).toBe(firstEpoch);
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

test("a stamped file edited again is an edit, so the first edit's logged merge is not replayed over it", async () => {
  const a = tab({ game: { value: { name: "x", s: 0 } } });
  await settle();
  const b = tab({ game: { value: { name: "x", s: 0 } } });
  await settle();
  b.game.add("s", 1);
  await settle();
  const epoch = a.lane.status.epoch;
  const stamp = at(epoch, 1, '{"name":"x","s":1}');
  a.transport.landed("game", stamp);
  await settle();
  a.transport.fileFrame(new Map([["game", { text: '{"name":"y","s":1}', at: stamp, seq: 10 }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ name: "y", s: 1 });

  a.transport.fileFrame(new Map([["game", { text: '{"name":"z","s":1}', at: stamp, seq: 11 }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ name: "z", s: 1 });
  expect(b.game.toJSON()).toEqual({ name: "z", s: 1 });
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

test("a successor holds every move it has a receipt for, even one its lane was still buffering", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  // b asks for the room again and its answer is held back, so b's lane is
  // unsynced and the move that arrives meanwhile waits in its buffer.
  drop = (to, m) => to === b.channel && m.type === "answer";
  b.lane.storeOpened();
  await settle(0);
  c.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  a.lane.stop();
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });
  expect(c.entries.get("game").store.pending).toEqual([]);
});

test("a move the old sequencer accepted just before it went is applied once by the successor", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  const held = [];
  drop = (to, m) => {
    if (to !== b.channel || m.type !== "data") return false;
    held.push(JSON.parse(JSON.stringify(m)));
    return true;
  };
  c.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  a.lane.stop();
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  for (const message of held) b.channel.onmessage({ data: message });
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });
  expect(c.entries.get("game").store.pending).toEqual([]);

  for (const message of held) b.channel.onmessage({ data: message });
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 1 });
});

test("a state answer asked for before the mirror changed is dropped", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  let held = null;
  drop = (to, m) => {
    if (to !== b.channel || m.type !== "answer" || held) return false;
    held = m;
    return true;
  };
  const asked = b.transport.fetchState();
  await settle(0);
  a.game.add("s", 1);
  await settle(100);
  a.game.add("s", 1);
  await settle(100);
  expect(b.game.toJSON()).toEqual({ s: 2 });

  drop = () => false;
  b.channel.onmessage({ data: held });
  expect(await asked).toBeNull();
  await settle(100);
  expect(b.game.toJSON()).toEqual({ s: 2 });

  a.lane.stop();
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 2 });
});

test("a revert of the file to its first text is merged, not skipped", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  await settle();
  const epoch = a.lane.status.epoch;
  a.transport.landed("game", at(epoch, 1, '{"s":1}'));
  await settle();
  const frame = new Map([["game", { text: '{"s":0}', at: null }]]);
  a.transport.fileFrame(frame);
  b.transport.fileFrame(frame);
  await settle();
  expect(a.game.toJSON()).toEqual({ s: 0 });
  expect(b.game.toJSON()).toEqual({ s: 0 });
});

test("the closing sequencer's last checkpoint reaches the successor", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  await settle();
  a.game.add("s", 1);
  await settle();
  a.game.add("s", 1);
  await settle();
  const epoch = a.lane.status.epoch;
  a.transport.landed("game", at(epoch, 3, '{"s":3}'));
  await settle();
  a.lane.stop();
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 3 });

  b.transport.fileFrame(new Map([["game", { text: '{"s":3,"t":1}', at: null }]]));
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 3, t: 1 });
});

test("a restore of an older own checkpoint keeps the room's value and asks for a save", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  for (let i = 0; i < 5; i++) {
    a.game.add("s", 1);
    await settle();
  }
  const epoch = a.lane.status.epoch;
  a.transport.landed("game", at(epoch, 5, '{"s":5}'));
  await settle();
  const frame = new Map([["game", { text: '{"s":3}', at: at(epoch, 3, '{"s":3}') }]]);
  a.transport.fileFrame(frame);
  b.transport.fileFrame(frame);
  await settle();
  expect(a.game.toJSON()).toEqual({ s: 5 });
  expect(b.game.toJSON()).toEqual({ s: 5 });
  expect(a.entries.get("game").landed).toBe(3);
  expect(a.entries.get("game").last).toBe(5);
});

test("a successor whose mirror reached the saved move has nothing to rewrite", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  a.game.add("s", 1);
  await settle(10);
  const { epoch, seq } = a.lane.status;
  a.transport.landed("game", at(epoch, seq, '{"s":2}'));
  a.lane.stop();
  await settle(5000);
  expect(b.transport.isSequencer).toBe(true);
  const state = await b.transport.fetchState();
  expect(state.stores.game.landed).toBe(seq);
  expect(state.stores.game.value).toEqual({ s: 2 });
});

test("a never-saved store ignores file frames", async () => {
  const tags = { game: { value: { s: 0 } }, lobby: { value: { chat: [] }, ephemeral: true } };
  const a = tab(tags);
  await settle();
  const b = tab(tags);
  await settle();
  a.handle("lobby").data.chat.push("hi");
  a.game.add("s", 1);
  await settle();
  const frame = new Map([
    ["game", { text: '{"s":0}', at: null }],
    ["lobby", { text: '{"chat":["file"]}', at: null }],
  ]);
  a.transport.fileFrame(frame);
  b.transport.fileFrame(frame);
  await settle();
  expect(a.handle("lobby").toJSON()).toEqual({ chat: ["hi"] });
  expect(b.handle("lobby").toJSON()).toEqual({ chat: ["hi"] });
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(b.game.toJSON()).toEqual({ s: 1 });
});

test("closed ends a tab's unanswered post, which then counts once", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  const epoch = b.lane.status.epoch;
  drop = (to, m) => to === c.channel && m.type === "answer";
  c.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  a.lane.stop();
  await settle(3000);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });
  expect(c.entries.get("game").store.pending).toEqual([]);
  expect(b.lane.status.epoch).toBe(epoch);
});

test("a move whose data reached only the sequencer before it stopped is in the successor's room", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  const held = [];
  drop = (to, m) => {
    if (to !== b.channel || m.type !== "data") return false;
    held.push(JSON.parse(JSON.stringify(m)));
    return true;
  };
  c.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  a.lane.stop();
  await settle(3000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 1 });

  for (const message of held) b.channel.onmessage({ data: message });
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(c.game.toJSON()).toEqual({ s: 1 });
});

test("the successor waits for a closed that arrives after the lock", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const epoch = b.lane.status.epoch;
  let held = null;
  drop = (to, m) => {
    if (to !== b.channel) return false;
    if (m.type === "data" || m.type === "data-state") return true;
    if (m.type === "closed" && !held) {
      held = JSON.parse(JSON.stringify(m));
      return true;
    }
    return false;
  };
  a.game.add("s", 1);
  await settle(100);
  a.lane.stop();
  await settle(200);
  expect(b.transport.isSequencer).toBe(false);

  drop = () => false;
  b.channel.onmessage({ data: held });
  await settle(100);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(b.lane.status.epoch).toBe(epoch);
});

test("a crash starts a new epoch from the mirror, and every tab follows it", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  const epoch = a.lane.status.epoch;
  a.game.add("s", 2);
  await settle();

  crash(a);
  await settle(1000);
  expect(b.transport.isSequencer || c.transport.isSequencer).toBe(true);
  expect(b.lane.status.epoch).not.toBe(epoch);
  expect(c.lane.status.epoch).toBe(b.lane.status.epoch);
  expect(b.game.toJSON()).toEqual({ s: 2 });
  expect(c.game.toJSON()).toEqual({ s: 2 });

  b.game.add("s", 1);
  await settle();
  expect(c.game.toJSON()).toEqual({ s: 3 });
});

test("a crash whose last move reached only some tabs does not split them", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const c = tab({ game: { value: { s: 0 } } });
  await settle();
  drop = (to, m) => to === b.channel && m.type === "data";
  a.game.add("s", 5);
  await settle(100);
  expect(c.game.toJSON()).toEqual({ s: 5 });
  drop = () => false;

  crash(a);
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);
  expect(c.lane.status.epoch).toBe(b.lane.status.epoch);
  expect(c.game.toJSON()).toEqual(b.game.toJSON());
  c.game.add("s", 1);
  await settle();
  expect(b.game.toJSON()).toEqual(c.game.toJSON());
});

test("a crash with a stale mirror starts a new epoch and rewrites the file", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const epoch = b.lane.status.epoch;
  drop = (to, m) => to === b.channel && m.type === "data";
  a.game.add("s", 1);
  await settle(100);
  expect(a.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  crash(a);
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.lane.status.epoch).not.toBe(epoch);
  const state = await b.transport.fetchState();
  expect(state.stores.game.landed).toBe(-1);
});

test("two hand-offs with a late data message from the first sequencer count it once", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  const d = tab({ game: { value: { s: 0 } } });
  await settle();
  const held = [];
  drop = (to, m) => {
    if ((to !== b.channel && to !== d.channel) || m.type !== "data") return false;
    held.push({ to, message: JSON.parse(JSON.stringify(m)) });
    return true;
  };
  c.game.add("s", 1);
  await settle(100);
  expect(c.game.toJSON()).toEqual({ s: 1 });

  drop = () => false;
  a.lane.stop();
  await settle(1000);
  for (const { to, message } of held) to.onmessage({ data: message });
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 1 });
  expect(d.game.toJSON()).toEqual({ s: 1 });

  c.game.add("s", 1);
  await settle();
  expect(c.game.toJSON()).toEqual({ s: 2 });

  const sequencer = b.transport.isSequencer ? b : d;
  const live = b.transport.isSequencer ? d : b;
  sequencer.lane.stop();
  await settle(1000);
  expect(c.game.toJSON()).toEqual({ s: 2 });
  expect(live.game.toJSON()).toEqual({ s: 2 });
});

test("a file frame seen only by a non-sequencer is merged when it takes the room", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  b.transport.fileFrame(new Map([["game", { text: '{"score":0,"note":"agent"}', at: null, seq: 10 }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 0 });

  a.lane.stop();
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ score: 0, note: "agent" });
});

test("a kept file frame the room already merged is not merged again", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  const frame = new Map([["game", { text: '{"score":0,"note":"agent"}', at: null, seq: 10 }]]);
  a.transport.fileFrame(frame);
  b.transport.fileFrame(frame);
  await settle();
  expect(b.game.toJSON()).toEqual({ score: 0, note: "agent" });

  a.game.add("score", 1);
  await settle();
  a.lane.stop();
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.game.toJSON()).toEqual({ score: 1, note: "agent" });
  const state = await b.transport.fetchState();
  expect(state.mirror.stores.game.file.seq).toBe(10);
});

test("a second unstamped file is not overwritten by the merge of the first", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 1);
  await settle();
  a.transport.fileFrame(new Map([["game", { text: '{"score":0,"t":"b"}', at: null }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1, t: "b" });

  a.transport.fileFrame(new Map([["game", { text: '{"score":0,"t":"c"}', at: null }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1, t: "c" });
});

test("pagehide on the sequencer hands off, and pageshow brings the tab back", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  await settle();
  const epoch = a.lane.status.epoch;

  window.dispatchEvent(new Event("pagehide"));
  await settle(1000);
  expect(a.game.toJSON()).toEqual(b.game.toJSON());
  expect(b.lane.status.epoch).toBe(epoch);

  const ev = new Event("pageshow");
  Object.defineProperty(ev, "persisted", { value: true });
  window.dispatchEvent(ev);
  await settle(1000);
  expect(a.transport.isSequencer !== b.transport.isSequencer).toBe(true);

  a.game.add("s", 1);
  await settle();
  expect(b.game.toJSON()).toEqual({ s: 1 });
});


test("a successor that never heard the intermediate sequencer is forked by a tab ahead of it", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  const d = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  await settle();
  const epoch = d.lane.status.epoch;

  a.lane.stop();
  drop = (to, m) => to === c.channel && (m.type === "data" || m.type === "data-state" || m.type === "closed");
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);
  expect(c.transport.isSequencer).toBe(false);

  d.game.add("s", 10);
  await settle(1000);
  expect(b.game.toJSON()).toEqual({ s: 11 });
  expect(d.game.toJSON()).toEqual({ s: 11 });

  b.lane.stop();
  drop = () => false;
  await settle(1000);
  expect(c.transport.isSequencer).toBe(true);

  c.game.add("s", 1);
  await settle(3000);
  d.game.add("s", 1);
  await settle(5000);
  expect(d.game.toJSON()).toEqual(c.game.toJSON());
  expect(c.lane.status.epoch).not.toBe(epoch);
  expect(d.lane.status.epoch).toBe(c.lane.status.epoch);
});

test("a sequencer that took the lock before the old sequencer's messages arrive forks on their arrival", async () => {
  const a = tab({ game: { value: { s: 0 } } });
  await settle();
  const b = tab({ game: { value: { s: 0 } } });
  const c = tab({ game: { value: { s: 0 } } });
  const d = tab({ game: { value: { s: 0 } } });
  await settle();
  a.game.add("s", 1);
  await settle();
  const epoch = d.lane.status.epoch;

  a.lane.stop();
  const held = [];
  drop = (to, m) => {
    if (to !== c.channel) return false;
    held.push(JSON.parse(JSON.stringify(m)));
    return true;
  };
  await settle(1000);
  expect(b.transport.isSequencer).toBe(true);

  b.lane.stop();
  await settle(1000);
  expect(c.transport.isSequencer).toBe(true);
  expect(c.lane.status.epoch).toBe(epoch);

  drop = () => false;
  for (const message of held) c.channel.onmessage({ data: message });
  await settle(1000);
  expect(c.lane.status.epoch).not.toBe(epoch);

  c.game.add("s", 1);
  await settle(3000);
  d.game.add("s", 1);
  await settle(5000);
  expect(d.game.toJSON()).toEqual(c.game.toJSON());
  expect(d.lane.status.epoch).toBe(c.lane.status.epoch);
});

test("a kept file frame merges before the new epoch of a crashed sequencer's successor", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  const epoch = a.lane.status.epoch;
  b.transport.fileFrame(new Map([["game", { text: '{"score":0,"note":"agent"}', at: null, seq: 10 }]]));
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 0 });

  crash(a);
  await settle(3000);
  expect(b.transport.isSequencer).toBe(true);
  expect(b.lane.status.epoch).not.toBe(epoch);
  expect(b.game.toJSON()).toEqual({ score: 0, note: "agent" });
  const state = await b.transport.fetchState();
  expect(state.stores.game.landed).toBe(-1);
});

test("without BroadcastChannel or Web Locks there is no local lane", async () => {
  const { localLaneSupported } = await import("../../src/live/local-lane.js");
  expect(localLaneSupported()).toBe(true);
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  expect(localLaneSupported()).toBe(false);
});

test("a tab that re-reads the room is answered the sequencer's moves since its seq", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 1);
  await settle();
  a.game.add("score", 1);
  await settle();
  const epoch = b.lane.status.epoch;

  const pending = b.transport.fetchState(b.transport.clientId, { epoch, seq: 0 });
  await settle();
  const state = await pending;
  expect(state.moves.game.map((move) => move.seq)).toEqual([1, 2]);
  expect(state.moves.game.every((move) => Object.keys(move).join() === "seq,ops")).toBe(true);
});

test("a since below the log's floor leaves that store's moves null", async () => {
  const a = tab({ game: { value: {} } });
  await settle();
  const b = tab({ game: { value: {} } });
  await settle();
  for (let i = 0; i < 30; i++) {
    a.game.set("k" + i, "x".repeat(11000));
    await settle();
  }
  const epoch = b.lane.status.epoch;

  const pending = b.transport.fetchState(b.transport.clientId, { epoch, seq: 0 });
  await settle();
  const state = await pending;
  expect(state.moves.game).toBeNull();
});

// Round 9 review, Opus 7: the host's rule. A first read, and a read from
// another epoch, carry this epoch's moves from its start.
test("Opus 7: a first read, and a read from another epoch, carry the epoch's moves from 0", async () => {
  const a = tab({ game: { value: { score: 0 } } });
  await settle();
  const b = tab({ game: { value: { score: 0 } } });
  await settle();
  a.game.add("score", 1);
  await settle();

  const first = b.transport.fetchState(b.transport.clientId);
  await settle();
  expect((await first).moves.game.map((move) => move.seq)).toEqual([1]);
  const other = b.transport.fetchState(b.transport.clientId, { epoch: "an-older-room", seq: 1 });
  await settle();
  expect((await other).moves.game.map((move) => move.seq)).toEqual([1]);
});

// The format floor's scope: a floor-1 document shares neither channel nor room
// with a tab that cannot read it. The move happens only once an accepted receipt
// covers the pending work, keeps every store, and an interrupted move leaves the
// tab where it was rather than abandoning its pending operations.
const FORMAT_KEY = "clay-live:/game.html:page-format:1";

// A lock per channel name, as the platform's Web Locks are: a scope change takes
// a different name, so it is not queued behind the room this tab just left.
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

function scopedLocks() {
  Object.defineProperty(navigator, "locks", { configurable: true, value: namedLocks() });
}

function tabAt(tags, { key = KEY, floor = 0 } = {}) {
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
  const transport = localTransport({ seed, key, floor });
  const lane = createFastLane({ transport, entries });
  for (const [name, entry] of entries) entry.store.onLocal((ops) => lane.local(name, ops, entry.store.mark));
  lane.start();
  const handle = (name) => entries.get(name).store.handle;
  const t = { transport, lane, entries, handle, game: handle("game"), channel: channels.at(-1) };
  tabs.push(t);
  return t;
}

test("the lane's scope follows the document's floor", async () => {
  scopedLocks();
  const { localLaneKey, FORMAT_SCOPE } = await import("../../src/live/local-lane.js");
  expect(FORMAT_SCOPE).toBe("page-format:1");
  expect(localLaneKey(0, "/game.html")).toBe("clay-live:/game.html");
  expect(localLaneKey(1, "/game.html")).toBe("clay-live:/game.html:page-format:1");
  expect(localLaneKey(2, "/game.html")).toBe("clay-live:/game.html:page-format:1");
  const floorZero = tabAt({ game: { value: { score: 0 } } });
  const floorOne = tabAt({ game: { value: { score: 0 } } }, { key: KEY, floor: 1 });
  await settle();
  expect(floorZero.transport.scope).toBe(KEY);
  expect(floorOne.transport.scope).toBe(FORMAT_KEY);
  expect(floorOne.transport.floor).toBe(1);
  // Two scopes, two rooms: a floor-0 tab never sees a floor-1 tab's moves.
  floorOne.game.add("score", 5);
  await settle();
  expect(floorOne.game.toJSON()).toEqual({ score: 5 });
  expect(floorZero.game.toJSON()).toEqual({ score: 0 });
});

test("a scope change needs a covering receipt, keeps every store and is idempotent", async () => {
  scopedLocks();
  const tags = { game: { value: { score: 0 } }, lobby: { value: { chat: ["hi"] }, ephemeral: true } };
  const a = tabAt(tags);
  await settle();
  const old = tabAt(tags);
  await settle();
  a.game.add("score", 2);
  await settle();

  const uncovered = a.transport.switchScope(1, { covered: false });
  expect(uncovered).toMatchObject({ status: "refused", code: "uncovered", floor: 0 });
  expect(a.transport.scope).toBe(KEY);
  expect(a.game.toJSON()).toEqual({ score: 2 });

  const switched = a.transport.switchScope(1, { covered: true });
  expect(switched).toMatchObject({ status: "switched", floor: 1, scope: FORMAT_KEY });
  await settle();
  // Every store came across, not only the page's, and the ephemeral one too.
  expect(a.game.toJSON()).toEqual({ score: 2 });
  expect(a.handle("lobby").toJSON()).toEqual({ chat: ["hi"] });
  expect(a.transport.scope).toBe(FORMAT_KEY);
  expect(a.transport.floor).toBe(1);
  expect(a.transport.isSequencer).toBe(true);

  // The old scope's tab is still there and sees nothing of the new room.
  a.game.add("score", 1);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 3 });
  expect(old.game.toJSON()).toEqual({ score: 2 });

  expect(a.transport.switchScope(1, { covered: true })).toMatchObject({ status: "already", floor: 1 });

  // A tab opening on the new scope joins this room from its seed and converges.
  const b = tabAt(tags, { key: KEY, floor: 1 });
  await settle();
  expect(b.game.toJSON()).toEqual({ score: 3 });
  b.game.add("score", 1);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 4 });
  expect(b.game.toJSON()).toEqual({ score: 4 });
});

test("an interrupted scope change leaves the tab on floor 0 with its pending work, and a retry moves it", async () => {
  scopedLocks();
  const tags = { game: { value: { score: 0 } } };
  const a = tabAt(tags);
  await settle();
  // A switch with no receipt covering it moves nothing and abandons nothing.
  expect(a.transport.switchScope(1)).toMatchObject({ status: "refused", code: "uncovered" });
  a.game.add("score", 1);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1 });
  expect(a.entries.get("game").store.pending).toEqual([]);

  // The retry, now covered by an accepted receipt, lands every store in the new
  // scope and the tab is its sequencer.
  expect(a.transport.switchScope(1, { covered: true })).toMatchObject({ status: "switched", floor: 1 });
  await settle();
  expect(a.transport.scope).toBe(FORMAT_KEY);
  expect(a.transport.isSequencer).toBe(true);
  expect(a.game.toJSON()).toEqual({ score: 1 });

  // A lane that has stopped refuses a move rather than pretending it happened.
  const c = tabAt({ game: { value: { score: 0 } } });
  await settle();
  c.lane.stop();
  expect(c.transport.switchScope(1, { covered: true })).toMatchObject({ status: "refused", code: "lane-stopped", floor: 0 });
});

// The format gate's own reason for switching: a tab that rises to floor 1 writes a
// format a tab that never rose cannot read, so it stops sharing that tab's lane.
test("a tab that rises to floor 1 shares nothing with a tab still on floor 0", async () => {
  scopedLocks();
  const tags = { game: { value: { score: 0 } } };
  const a = tabAt(tags);
  await settle();
  const b = tabAt(tags);
  await settle();
  // Both are on the floor-0 scope and see each other.
  a.game.add("score", 1);
  await settle();
  expect(b.game.toJSON()).toEqual({ score: 1 });

  // A's own accepted save covers the work, and its floor rose: it moves, keeping
  // every store.
  expect(a.transport.switchScope(1, { covered: true })).toMatchObject({ status: "switched", floor: 1, scope: FORMAT_KEY });
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1 });

  // The update a floor-0 tab could not read never reaches it.
  a.game.add("score", 2);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 3 });
  expect(b.game.toJSON()).toEqual({ score: 1 });
  expect(b.transport.scope).toBe(KEY);

  // A tab that opens at floor 1 joins the new scope and converges with A.
  const c = tabAt(tags, { key: KEY, floor: 1 });
  await settle();
  expect(c.transport.scope).toBe(FORMAT_KEY);
  expect(c.game.toJSON()).toEqual({ score: 3 });
  c.game.add("score", 1);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 4 });
});
