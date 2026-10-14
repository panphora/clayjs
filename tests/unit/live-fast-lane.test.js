import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { applyOps, cloneJson } from "../../src/live/ops.js";
import { createFastLane, MIN_GAP_MS, RETRY_MS } from "../../src/live/fast-lane.js";

/**
 * The fast-lane client against a fake room with the host's rules (seq, epoch,
 * per-sender n, first sender is the writer). Several clients converge, a
 * retried frame counts once, gaps and restarts repair, refusals undo.
 */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function createRoom(initial) {
  const room = {
    epoch: "e1",
    seq: 0,
    writer: null,
    stores: cloneJson(initial),
    lastN: new Map(),
    clients: new Map(),
    posts: [],
    drop: () => false,
  };
  room.state = () => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    stores: Object.fromEntries(Object.entries(room.stores).map(([name, value]) => [name, { value: cloneJson(value), ephemeral: false }])),
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
    if (!(frame.name in room.stores)) return { status: 404, body: { error: "unknown-store" }, retryAfter: 0 };
    const key = frame.name + "\n" + clientId;
    if (frame.n <= (room.lastN.get(key) || 0)) return { status: 200, body: { duplicate: true, seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
    let next;
    try {
      next = applyOps(cloneJson(room.stores[frame.name]), frame.ops);
    } catch {
      return { status: 422, body: { error: "bad-op" }, retryAfter: 0 };
    }
    room.stores[frame.name] = next;
    room.lastN.set(key, frame.n);
    room.seq += 1;
    if (!room.writer) {
      room.writer = clientId;
      room.broadcast("writer", { epoch: room.epoch, writer: clientId });
    }
    room.broadcast("frame", { epoch: room.epoch, seq: room.seq, name: frame.name, ops: frame.ops, from: clientId, n: frame.n });
    return { status: 200, body: { seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
  };
  room.restart = (stores) => {
    room.epoch = `e${Number(room.epoch.slice(1)) + 1}`;
    room.seq = 0;
    room.writer = null;
    room.stores = cloneJson(stores);
    room.lastN = new Map();
    room.broadcast("state", room.state());
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
    fetchState: async () => room.state(),
  });
  room.open = (clientId) => {
    const client = room.clients.get(clientId);
    client.connected = true;
    client.handlers.open({ clientId, lane: "live" });
  };
  room.close = (clientId) => {
    const client = room.clients.get(clientId);
    client.connected = false;
    client.handlers.close();
  };
  return room;
}

function client(room, id, value, { wrap, ...options } = {}) {
  const store = createStore({ name: "game", value });
  const entries = new Map([["game", { store }]]);
  const lane = createFastLane({ transport: room.transport(id, wrap), entries, ...options });
  store.onLocal((ops) => lane.local("game", ops, store.mark));
  lane.start();
  return { id, store, game: store.handle, lane };
}

const settle = () => jest.advanceTimersByTimeAsync(2000);

test("two clients converge; each sees the other's ops in room order", async () => {
  const room = createRoom({ game: { score: 0, players: {} } });
  const a = client(room, "a", { score: 0, players: {} });
  const b = client(room, "b", { score: 0, players: {} });
  room.open("a");
  room.open("b");
  await settle();
  expect(a.game.status.mode).toBe("fast");

  a.game.add("score", 1);
  a.game.add("score", 1);
  b.game.data.players.b = { x: 1 };
  a.game.add("score", 1);
  await settle();

  expect(room.stores.game).toEqual({ score: 3, players: { b: { x: 1 } } });
  expect(a.game.toJSON()).toEqual(room.stores.game);
  expect(b.game.toJSON()).toEqual(room.stores.game);
  expect(a.store.pending).toEqual([]);
  expect(b.store.pending).toEqual([]);
  expect(a.lane.status.seq).toBe(room.seq);
});

test("ops made before the first state are sent once the tab joins", async () => {
  const room = createRoom({ game: { score: 5 } });
  const a = client(room, "a", { score: 5 });
  a.game.add("score", 2);
  room.open("a");
  await settle();
  expect(room.stores.game).toEqual({ score: 7 });
  expect(a.game.toJSON()).toEqual({ score: 7 });
  expect(a.store.pending).toEqual([]);
});

test("sends are spaced at least MIN_GAP_MS apart, and later ops ride along", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = client(room, "a", { score: 0 });
  room.open("a");
  await settle();
  for (let i = 0; i < 10; i++) {
    a.game.add("score", 1);
    await jest.advanceTimersByTimeAsync(5);
  }
  await settle();
  expect(room.stores.game.score).toBe(10);
  expect(room.posts.length).toBeLessThanOrEqual(3);
});

test("a frame that landed but whose answer was lost is sent again with the same n and counts once", async () => {
  const room = createRoom({ game: { score: 0 } });
  let lost = 1;
  const wrap = (post) => (frame) => {
    const result = post(frame);
    if (lost > 0) {
      lost -= 1;
      return { status: 0, body: null, retryAfter: 0 };
    }
    return result;
  };
  room.drop = () => true;
  const a = client(room, "a", { score: 0 }, { wrap });
  room.open("a");
  await settle();
  a.game.add("score", 1);
  await jest.advanceTimersByTimeAsync(MIN_GAP_MS + RETRY_MS + 100);
  await settle();
  expect(room.posts.map((p) => p.n)).toEqual([1, 1]);
  expect(room.stores.game.score).toBe(1);
});

test("a skipped seq fetches the room's state and catches up", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = client(room, "a", { score: 0 });
  const b = client(room, "b", { score: 0 });
  room.open("a");
  room.open("b");
  await settle();
  let dropOne = true;
  room.drop = (id) => {
    if (id === "b" && dropOne) {
      dropOne = false;
      return true;
    }
    return false;
  };
  a.game.add("score", 1);
  await settle();
  a.game.add("score", 1);
  await settle();
  expect(b.game.toJSON()).toEqual({ score: 2 });
  expect(b.lane.status.seq).toBe(room.seq);
});

test("an outside restart replaces every store and resends what is still pending", async () => {
  const room = createRoom({ game: { score: 0, note: "" } });
  const onEpoch = jest.fn();
  const a = client(room, "a", { score: 0, note: "" }, { onEpoch });
  room.open("a");
  await settle();
  expect(onEpoch).toHaveBeenLastCalledWith("e1");
  a.game.add("score", 1);
  room.restart({ game: { score: 100, note: "edited" } });
  await settle();
  expect(onEpoch).toHaveBeenLastCalledWith("e2");
  expect(room.stores.game).toEqual({ score: 101, note: "edited" });
  expect(a.game.toJSON()).toEqual({ score: 101, note: "edited" });
});

test("a refused frame is undone locally", async () => {
  const room = createRoom({ game: { score: 0 } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const wrap = (post) => (frame) => (frame.n === 2 ? { status: 422, body: { error: "bad-op" }, retryAfter: 0 } : post(frame));
  const a = client(room, "a", { score: 0 }, { wrap });
  room.open("a");
  await settle();
  a.game.add("score", 1);
  await settle();
  a.game.set("flag", true);
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1 });
  expect(a.store.pending).toEqual([]);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("401 stops the lane and puts stores back in file mode", async () => {
  const room = createRoom({ game: { score: 0 } });
  const onStop = jest.fn();
  const wrap = () => () => ({ status: 401, body: null, retryAfter: 0 });
  const a = client(room, "a", { score: 0 }, { wrap, onStop });
  room.open("a");
  await settle();
  a.game.add("score", 1);
  await settle();
  expect(onStop).toHaveBeenCalledTimes(1);
  expect(a.game.status.mode).toBe("file");
  expect(a.store.pending).toHaveLength(1);
});

test("the first sender is the writer", async () => {
  const room = createRoom({ game: { score: 0 } });
  const onWriter = jest.fn();
  const a = client(room, "a", { score: 0 }, { onWriter });
  const b = client(room, "b", { score: 0 });
  room.open("a");
  room.open("b");
  await settle();
  expect(a.lane.isWriter()).toBe(false);
  a.game.add("score", 1);
  await settle();
  expect(a.lane.isWriter()).toBe(true);
  expect(b.lane.isWriter()).toBe(false);
  expect(onWriter).toHaveBeenCalled();
});

test("ops made while the stream is down are sent after it reopens", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = client(room, "a", { score: 0 });
  const b = client(room, "b", { score: 0 });
  room.open("a");
  room.open("b");
  await settle();
  room.close("a");
  a.game.add("score", 4);
  await settle();
  expect(room.stores.game.score).toBe(0);
  room.open("a");
  await settle();
  expect(room.stores.game.score).toBe(4);
  expect(b.game.toJSON()).toEqual({ score: 4 });
  expect(a.store.pending).toEqual([]);
});

test("a store the room does not have stays in file mode", async () => {
  const room = createRoom({ other: {} });
  const a = client(room, "a", { score: 0 });
  room.open("a");
  await settle();
  expect(a.game.status.mode).toBe("file");
  a.game.add("score", 1);
  await settle();
  expect(room.posts).toEqual([]);
  expect(a.store.pending).toHaveLength(1);
});
