import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { applyOps, cloneJson } from "../../src/live/ops.js";
import { createFastLane, MIN_GAP_MS, RETRY_MS, FRAME_BYTES } from "../../src/live/fast-lane.js";

/**
 * The fast lane's internal hooks: every frame outcome (onDelivery) and every
 * rebase, changed or not (onRebase), told to whoever asked on the store object.
 */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function createRoom(initial, marks = {}) {
  const room = {
    epoch: "e1",
    seq: 0,
    writer: null,
    stores: cloneJson(initial),
    marks: cloneJson(marks),
    lastN: new Map(),
    clients: new Map(),
    posts: [],
    conn: undefined,
    withSeen: false,
    drop: () => false,
    moves: null,
    floors: null,
  };
  room.state = (clientId) => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    ...(room.moves !== null && { moves: cloneJson(room.moves) }),
    ...(room.conn !== undefined && { conn: room.conn }),
    stores: Object.fromEntries(
      Object.entries(room.stores).map(([name, value]) => [
        name,
        {
          value: cloneJson(value),
          ephemeral: false,
          last: room.marks[name]?.last ?? room.seq,
          landed: room.marks[name]?.landed ?? 0,
          ...(room.floors?.[name] !== undefined && { floor: room.floors[name] }),
          ...(room.withSeen && { seen: { [clientId]: room.lastN.get(name + "\n" + clientId)?.n ?? 0 } }),
        },
      ]),
    ),
  });
  room.broadcast = (type, data) => {
    for (const [id, client] of room.clients) {
      if (!client.connected) continue;
      if (type === "frame" && room.drop(id, data)) continue;
      client.handlers[type](cloneJson(data));
    }
  };
  room.post = (clientId, frame) => {
    room.posts.push({ clientId, ...cloneJson(frame) });
    if (frame.epoch !== undefined && frame.epoch !== room.epoch) return { status: 200, body: { stale: true, epoch: room.epoch }, retryAfter: 0 };
    if (!(frame.name in room.stores)) return { status: 404, body: { error: "unknown-store" }, retryAfter: 0 };
    const key = frame.name + "\n" + clientId;
    const last = room.lastN.get(key);
    if (last && frame.n <= last.n) return { status: 200, body: { duplicate: true, seq: last.seq, epoch: room.epoch }, retryAfter: 0 };
    let next;
    try {
      next = applyOps(cloneJson(room.stores[frame.name]), frame.ops);
    } catch {
      return { status: 422, body: { error: "bad-op" }, retryAfter: 0 };
    }
    room.stores[frame.name] = next;
    room.lastN.set(key, { n: frame.n, seq: room.seq + 1 });
    room.seq += 1;
    const later = [];
    if (!room.writer) {
      room.writer = clientId;
      later.push(["writer", { epoch: room.epoch, writer: clientId }]);
    }
    later.push(["frame", { epoch: room.epoch, seq: room.seq, name: frame.name, ops: frame.ops, from: clientId, n: frame.n }]);
    setTimeout(() => {
      for (const [type, data] of later) room.broadcast(type, data);
    }, 0);
    return { status: 200, body: { seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
  };
  room.transport = (clientId, wrap = (post) => post) => ({
    start(handlers) {
      room.clients.set(clientId, { handlers, connected: false });
      return () => room.clients.delete(clientId);
    },
    send: async (id, frame) => {
      await null;
      return wrap((f) => room.post(id, f))(frame);
    },
    fetchState: async (id) => room.state(id),
  });
  room.open = (clientId) => {
    const client = room.clients.get(clientId);
    client.connected = true;
    client.handlers.open({ clientId, lane: "live" });
  };
  return room;
}

function client(room, id, value, { wrap, ...options } = {}) {
  const store = createStore({ name: "game", value });
  const entries = new Map([["game", { store }]]);
  const transport = room.transport(id, wrap);
  const lane = createFastLane({ transport, entries, ...options });
  store.onLocal((ops) => lane.local("game", ops, store.mark));
  lane.start();
  const events = [];
  const rebases = [];
  store.onDelivery((e) => events.push(e));
  store.onRebase((e) => rebases.push(e));
  return { id, store, game: store.handle, lane, entries, transport, events, rebases };
}

const settle = () => jest.advanceTimersByTimeAsync(2000);

test("a normal frame tells sent, landed then echoed, and nothing else", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.events.length = 0;
  a.game.add("s", 1);
  await settle();
  expect(a.events.map((e) => e.phase)).toEqual(["sent", "landed", "echoed"]);
  const landed = a.events.find((e) => e.phase === "landed");
  const echoed = a.events.find((e) => e.phase === "echoed");
  expect(Number.isInteger(landed.seq)).toBe(true);
  expect(echoed.n).toBe(landed.n);
  expect(echoed.seq).toBe(landed.seq);
});

test("a 429 answer tells retry with rate-limited and its retryAfter, then the retry lands", async () => {
  const room = createRoom({ game: { s: 0 } });
  let first = true;
  const wrap = (post) => (frame) => {
    if (first) {
      first = false;
      return { status: 429, body: null, retryAfter: 1 };
    }
    return post(frame);
  };
  const a = client(room, "a", { s: 0 }, { wrap });
  room.open("a");
  await settle();
  a.events.length = 0;
  a.game.add("s", 1);
  await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1000 + RETRY_MS + 100);
  await settle();
  const retry = a.events.find((e) => e.phase === "retry");
  expect(retry).toMatchObject({ code: "rate-limited", retryAfter: 1 });
  expect(a.events.some((e) => e.phase === "landed")).toBe(true);
  expect(room.stores.game).toEqual({ s: 1 });
  expect(a.game.toJSON()).toEqual({ s: 1 });
});

test("a 422 answer with a code tells refused and rebases with cause refused", async () => {
  const room = createRoom({ game: { s: 0 } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wrap = (post) => (frame) => (frame.n === 1 ? { status: 422, body: { code: "bad-op" }, retryAfter: 0 } : post(frame));
  const a = client(room, "a", { s: 0 }, { wrap });
  room.open("a");
  await settle();
  a.events.length = 0;
  a.rebases.length = 0;
  a.game.add("s", 1);
  await settle();
  expect(a.events.find((e) => e.phase === "refused")).toMatchObject({ code: "bad-op" });
  expect(a.rebases.some((r) => r.cause === "refused")).toBe(true);
  warn.mockRestore();
});

test("a single op over FRAME_BYTES tells undone with op-too-large", async () => {
  const room = createRoom({ game: { s: 0 } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.events.length = 0;
  a.game.set("blob", "x".repeat(FRAME_BYTES + 100));
  await settle();
  expect(a.events.find((e) => e.phase === "undone")).toMatchObject({ code: "op-too-large" });
  warn.mockRestore();
});

test("a 404 answer tells left with no-store", async () => {
  const room = createRoom({ game: { s: 0 } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wrap = (post) => (frame) => (frame.n === 1 ? { status: 404, body: { error: "unknown-store" }, retryAfter: 0 } : post(frame));
  const a = client(room, "a", { s: 0 }, { wrap });
  room.open("a");
  await settle();
  a.events.length = 0;
  a.game.add("s", 1);
  await settle();
  expect(a.events.find((e) => e.phase === "left")).toMatchObject({ code: "no-store" });
  warn.mockRestore();
});

test("a writer event with landed tells checkpointed with that seq", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.events.length = 0;
  room.clients.get("a").handlers.writer({ epoch: "e1", writer: "b", landed: { game: 7 } });
  expect(a.events).toEqual([{ client: "a", code: null, n: null, seq: 7, through: null, retryAfter: null, phase: "checkpointed" }]);
  expect(a.entries.get("game").landed).toBe(7);
});

test("a remote frame rebases with source remote and that client's frame", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  const b = client(room, "b", { s: 0 });
  room.open("a");
  room.open("b");
  await settle();
  a.rebases.length = 0;
  b.game.add("s", 1);
  await settle();
  const remote = a.rebases.find((r) => r.source === "remote");
  expect(remote).toBeTruthy();
  expect(remote.frame.from).toBe("b");
  expect(Number.isInteger(remote.frame.seq)).toBe(true);
  expect(remote.frame.ops).toEqual([{ op: "add", path: ["s"], n: 1 }]);
  expect(a.game.toJSON()).toEqual({ s: 1 });
});

test("this tab's own echo rebases with a frame without firing change", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  const changes = [];
  a.game.on("change", (e) => changes.push(e));
  room.open("a");
  await settle();
  a.rebases.length = 0;
  changes.length = 0;
  a.game.add("s", 1);
  await settle();
  const own = a.rebases.find((r) => r.frame);
  expect(own).toBeTruthy();
  expect(own.frame.from).toBe("a");
  expect(changes).toHaveLength(1);
});

test("a state read passes room moves and floor through to onRebase", async () => {
  const room = createRoom({ game: { s: 0 } });
  room.moves = { game: [{ at: "s", seq: 1 }] };
  room.floors = { game: 4 };
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  const withRoom = a.rebases.find((r) => r.room);
  expect(withRoom).toBeTruthy();
  expect(withRoom.room.moves).toEqual([{ at: "s", seq: 1 }]);
  expect(withRoom.room.floor).toBe(4);
  expect(withRoom.room.fresh).toBe(true);
});

test("a store with no listeners runs a normal frame without throwing", async () => {
  const room = createRoom({ game: { s: 0 } });
  const store = createStore({ name: "game", value: { s: 0 } });
  const entries = new Map([["game", { store }]]);
  const lane = createFastLane({ transport: room.transport("a"), entries });
  store.onLocal((ops) => lane.local("game", ops, store.mark));
  lane.start();
  room.open("a");
  await settle();
  expect(() => store.handle.add("s", 1)).not.toThrow();
  await settle();
  expect(store.handle.toJSON()).toEqual({ s: 1 });
});
