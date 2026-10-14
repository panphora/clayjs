import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { applyOps, cloneJson } from "../../src/live/ops.js";
import { createFastLane, MIN_GAP_MS, RETRY_MS, FRAME_BYTES } from "../../src/live/fast-lane.js";

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
  // A restart whose data-state has not reached anyone yet.
  room.restartQuiet = (stores) => {
    room.epoch = `e${Number(room.epoch.slice(1)) + 1}`;
    room.seq = 0;
    room.writer = null;
    room.stores = cloneJson(stores);
    room.lastN = new Map();
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

test("a frame in flight when the room restarts is not applied twice", async () => {
  const room = createRoom({ game: { score: 0 } });
  const wrap = (post) => (frame) => {
    if (frame.n === 1) room.restartQuiet({ game: { score: 10 } });
    return post(frame);
  };
  const a = client(room, "a", { score: 0 }, { wrap });
  room.open("a");
  await settle();
  a.game.add("score", 1);
  await settle();
  expect(room.posts[0].epoch).toBe("e1");
  expect(room.stores.game).toEqual({ score: 11 });
  expect(a.game.toJSON()).toEqual({ score: 11 });
  expect(a.store.pending).toEqual([]);
});

// A lane for "a" whose state reads can be held open, to answer late.
function heldClient(room, value) {
  const store = createStore({ name: "game", value });
  const entries = new Map([["game", { store }]]);
  const transport = room.transport("a");
  const read = transport.fetchState;
  const held = { gate: null, release: null };
  transport.fetchState = async () => {
    if (!held.gate) return read();
    const state = room.state();
    await held.gate;
    return state;
  };
  held.hold = () => {
    held.gate = new Promise((resolve) => (held.release = resolve));
  };
  held.open = () => {
    const release = held.release;
    held.gate = null;
    release();
  };
  const lane = createFastLane({ transport, entries });
  store.onLocal((ops) => lane.local("game", ops, store.mark));
  lane.start();
  return { store, game: store.handle, lane, held };
}

test("a state answer that left before newer frames arrived does not rewind them", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = heldClient(room, { score: 0 });
  const b = client(room, "b", { score: 0 });
  room.open("a");
  room.open("b");
  await settle();
  a.held.hold();
  a.lane.storeOpened();
  b.game.add("score", 1);
  await settle();
  a.held.open();
  await settle();
  expect(a.game.toJSON()).toEqual({ score: 1 });
  expect(a.lane.status.seq).toBe(room.seq);
});

test("a reconnect while an old state read is out reads again, and the old answer is ignored", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = heldClient(room, { score: 0 });
  room.open("a");
  await settle();
  a.held.hold();
  a.lane.storeOpened();
  room.close("a");
  room.restartQuiet({ game: { score: 7 } });
  room.open("a");
  a.held.open();
  await settle();
  expect(a.lane.status.epoch).toBe(room.epoch);
  expect(a.game.toJSON()).toEqual({ score: 7 });
});

test("frames are packed by size, so many small writes go in frames the host takes", async () => {
  const room = createRoom({ game: { e: {} } });
  const a = client(room, "a", { e: {} });
  room.open("a");
  await settle();
  a.game.update((d) => {
    for (let i = 0; i < 128; i++) d.e["k" + i] = { x: i, label: "entity-".repeat(12) };
  });
  await settle();
  expect(room.posts.length).toBeGreaterThan(1);
  for (const p of room.posts) {
    const size = new TextEncoder().encode(JSON.stringify({ name: p.name, n: p.n, ops: p.ops, epoch: p.epoch })).length;
    expect(size).toBeLessThanOrEqual(FRAME_BYTES);
  }
  expect(room.stores.game).toEqual(a.game.toJSON());
  expect(Object.keys(room.stores.game.e)).toHaveLength(128);
  expect(a.store.pending).toEqual([]);
});

test("one update larger than a frame is undone locally", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.game.set("blob", "x".repeat(FRAME_BYTES));
  await settle();
  expect(a.game.toJSON()).toEqual({ s: 0 });
  expect(a.store.pending).toEqual([]);
  expect(room.posts).toHaveLength(0);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a state read refused with 401 stops the lane", async () => {
  const room = createRoom({ game: { s: 0 } });
  const store = createStore({ name: "game", value: { s: 0 } });
  const transport = room.transport("a");
  transport.fetchState = async () => ({ status: 401 });
  const lane = createFastLane({ transport, entries: new Map([["game", { store }]]) });
  lane.start();
  room.open("a");
  await settle();
  expect(lane.status.stopped).toBe(true);
  expect(store.handle.status.mode).toBe("file");
});

test("a failing state read backs off instead of asking every half second", async () => {
  const room = createRoom({ game: { s: 0 } });
  const store = createStore({ name: "game", value: { s: 0 } });
  const transport = room.transport("a");
  const reads = jest.fn(async () => null);
  transport.fetchState = reads;
  const lane = createFastLane({ transport, entries: new Map([["game", { store }]]) });
  lane.start();
  room.open("a");
  await jest.advanceTimersByTimeAsync(10000);
  expect(reads.mock.calls.length).toBeLessThanOrEqual(6);
  expect(reads.mock.calls.length).toBeGreaterThanOrEqual(4);
});
