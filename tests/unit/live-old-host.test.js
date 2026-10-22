// A new client against a host still on the old 16 KB body cap. Round 7 review,
// Opus finding 2 and Astra finding 2: a multi-op frame the host answers 413 is
// packed again at 15 KB and sent again; only an op too large on its own is
// refused.
import { jest } from "@jest/globals";
import { Sim, createRoom, LIMITS } from "./page/collab/room-double.js";
import { createStore } from "../../src/live/store.js";
import { createFastLane, OLD_FRAME_BYTES } from "../../src/live/fast-lane.js";

let was, warn;
beforeEach(() => { was = LIMITS.bodyBytes; LIMITS.bodyBytes = 16 * 1024; warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { LIMITS.bodyBytes = was; warn.mockRestore(); });

function setup(value) {
  const sim = new Sim(1);
  const room = createRoom(sim, { board: value });
  const store = createStore({ name: "board", value });
  const lane = createFastLane({ transport: room.transport("a"), entries: new Map([["board", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  store.onLocal((ops) => lane.local("board", ops, store.mark));
  lane.start();
  room.open("a");
  return { sim, room, store, lane };
}

test("one update of 100 cards (27 KB) lands in frames the old host takes", async () => {
  const { sim, room, store, lane } = setup({ cards: {} });
  await sim.run(500);
  store.handle.update((d) => { for (let i = 0; i < 100; i++) d.cards["c" + i] = { title: "card ".repeat(50), i }; });
  await sim.run(5000);
  lane.stop();
  expect(room.refused.map((r) => r.status)).toEqual([413]);
  expect(Object.keys(room.stores.get("board").value.cards)).toHaveLength(100);
  expect(Object.keys(store.value.cards)).toHaveLength(100);
  expect(store.pending).toEqual([]);
});

test("one op over 15 KB on its own is refused by the old host and undone", async () => {
  const { sim, room, store, lane } = setup({ cards: {} });
  await sim.run(500);
  store.handle.update((d) => { d.cards.small = 1; });
  await sim.run(1000);
  store.handle.update((d) => { d.cards.big = "x".repeat(20000); });
  await sim.run(5000);
  lane.stop();
  expect(room.stores.get("board").value.cards).toEqual({ small: 1 });
  expect(store.value.cards).toEqual({ small: 1 });
  expect(OLD_FRAME_BYTES).toBe(15 * 1024);

});

test("a lone large op answered 413 too-large is undone, not repacked", async () => {
  const sim = new Sim(1);
  let handlers, epoch = "e1", seq = 0;
  const value = { s: 0 };
  const posts = [];
  const transport = {
    start(h) { handlers = h; return () => {}; },
    async fetchState() { return { epoch, seq, writer: "a", stores: { board: { value: JSON.parse(JSON.stringify(value)), seen: {}, last: seq, landed: 0 } } }; },
    async send(id, frame) {
      posts.push(frame.ops.length);
      return { status: 413, body: { code: "too-large" } };
    },
  };
  const store = createStore({ name: "board", value: { s: 0 } });
  const deliveries = [];
  store.onDelivery((event) => deliveries.push(event));
  const lane = createFastLane({ transport, entries: new Map([["board", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  store.onLocal((ops) => lane.local("board", ops, store.mark));
  lane.start();
  sim.at(0, () => handlers.open({ clientId: "a" }));
  sim.at(100, () => store.handle.set(["big"], "x".repeat(200 * 1024)));
  await sim.run(5000);
  lane.stop();
  expect(posts).toEqual([1]);
  expect(store.value).toEqual({ s: 0 });
  expect(store.pending).toEqual([]);
  expect(deliveries.find((event) => event.phase === "refused")).toMatchObject({ code: "too-large" });
  expect(deliveries.some((event) => event.phase === "undone")).toBe(false);
});

test("a lone op answered a codeless 413 is told too-large", async () => {
  const sim = new Sim(1);
  let handlers, epoch = "e1", seq = 0;
  const value = { s: 0 };
  const posts = [];
  const transport = {
    start(h) { handlers = h; return () => {}; },
    async fetchState() { return { epoch, seq, writer: "a", stores: { board: { value: JSON.parse(JSON.stringify(value)), seen: {}, last: seq, landed: 0 } } }; },
    async send(id, frame) {
      posts.push(frame.ops.length);
      return { status: 413, body: {} };
    },
  };
  const store = createStore({ name: "board", value: { s: 0 } });
  const deliveries = [];
  store.onDelivery((event) => deliveries.push(event));
  const lane = createFastLane({ transport, entries: new Map([["board", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  store.onLocal((ops) => lane.local("board", ops, store.mark));
  lane.start();
  sim.at(0, () => handlers.open({ clientId: "a" }));
  sim.at(100, () => store.handle.set(["big"], "x".repeat(200 * 1024)));
  await sim.run(5000);
  lane.stop();
  expect(posts).toEqual([1]);
  expect(store.value).toEqual({ s: 0 });
  expect(store.pending).toEqual([]);
  expect(deliveries.find((event) => event.phase === "refused")).toMatchObject({ code: "too-large" });
});

// Round 8 review, Astra 2: the room restarts between the 413 and the smaller
// retry. The repacked ops are unframed again, so the new room's state frames
// them afresh and all 100 land there.
test("Astra 2: a room restart between the 413 and the smaller retry still lands every repacked op", async () => {
  const sim = new Sim(1);
  let handlers, epoch = "e1", seq = 0, value = {};
  const posts = [];
  const state = () => ({ epoch, seq, writer: "a", stores: { s: { value: JSON.parse(JSON.stringify(value)), seen: {} } } });
  const transport = {
    start(h) { handlers = h; return () => {}; },
    async fetchState() { return state(); },
    async send(id, frame) {
      posts.push(frame.ops.length);
      if (new TextEncoder().encode(JSON.stringify(frame)).length > 16384) return { status: 413, body: { error: "request entity too large" } };
      for (const op of frame.ops) value[op.path[0]] = op.value;
      const at = ++seq;
      sim.after(1, () => handlers.frame({ ...frame, seq: at, from: id }));
      return { status: 200, body: { epoch, seq: at } };
    },
  };
  const store = createStore({ name: "s", value: {} });
  const lane = createFastLane({ transport, entries: new Map([["s", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  store.onLocal((ops) => lane.local("s", ops, store.mark));
  lane.start();
  sim.at(0, () => handlers.open({ clientId: "a" }));
  sim.at(100, () => store.handle.update((d) => { for (let i = 0; i < 100; i++) d["card" + i] = "x".repeat(200); }));
  sim.at(110, () => { epoch = "e2"; seq = 0; value = {}; handlers.state(state()); });
  await sim.run(5000);
  lane.stop();
  expect(posts[0]).toBe(100);
  expect(Object.keys(value)).toHaveLength(100);
  expect(store.pending).toEqual([]);
});

// Round 8 review, Opus 2: on a 64 KB host, the room's own size refusal (413
// too-large, for the store cap) is a refusal, never the old host's body cap,
// so frames stay at 63 KB and a later 20 KB value lands.
test("Opus 2: the room's 413 too-large for its store cap does not shrink the frames", async () => {
  LIMITS.bodyBytes = 64 * 1024;
  const cap = LIMITS.storeBytes;
  LIMITS.storeBytes = 100 * 1024;
  try {
    const { sim, room, store, lane } = setup({ cards: { filler: "f".repeat(95 * 1024) } });
    await sim.run(500);
    store.handle.update((d) => { d.cards.a = "a".repeat(4000); d.cards.b = "b".repeat(4000); });
    await sim.run(3000);
    expect(room.refused.map((r) => [r.status, r.code])).toEqual([[413, "too-large"]]);
    store.handle.delete(["cards", "filler"]);
    await sim.run(6000);
    store.handle.set(["cards", "big"], "x".repeat(20000));
    await sim.run(9000);
    lane.stop();
    expect("big" in room.stores.get("board").value.cards).toBe(true);
    expect(store.pending).toEqual([]);
  } finally {
    LIMITS.storeBytes = cap;
  }
});
