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
    reads: [],
    conn: undefined,
    withSeen: false,
    drop: () => false,
  };
  room.state = (clientId) => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    ...(room.conn !== undefined && { conn: room.conn }),
    stores: Object.fromEntries(
      Object.entries(room.stores).map(([name, value]) => [
        name,
        {
          value: cloneJson(value),
          ephemeral: false,
          last: room.marks[name]?.last ?? room.seq,
          landed: room.marks[name]?.landed ?? 0,
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
    room.marks = {};
    room.lastN = new Map();
    room.broadcast("state", room.state());
  };
  // A restart whose data-state has not reached anyone yet.
  room.restartQuiet = (stores) => {
    room.epoch = `e${Number(room.epoch.slice(1)) + 1}`;
    room.seq = 0;
    room.writer = null;
    room.stores = cloneJson(stores);
    room.marks = {};
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
    fetchState: async (id, since) => {
      room.reads.push(since);
      return room.state(id);
    },
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
  const transport = room.transport(id, wrap);
  const lane = createFastLane({ transport, entries, ...options });
  store.onLocal((ops) => lane.local("game", ops, store.mark));
  lane.start();
  return { id, store, game: store.handle, lane, entries, transport };
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

test("a frame in flight when the room restarts waits for its answer: refused as stale, it goes to the new room once", async () => {
  const room = createRoom({ game: { score: 0 } });
  let restarted = false;
  const wrap = (post) => (frame) => {
    if (frame.n === 1 && !restarted) {
      restarted = true;
      room.restart({ game: { score: 10 } });
    }
    return post(frame);
  };
  const a = client(room, "a", { score: 0 }, { wrap });
  room.open("a");
  await settle();
  a.game.add("score", 1);
  await settle();
  expect(room.posts.map((p) => p.epoch)).toEqual(["e1", "e2"]);
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

// "a" posts once; the post lands, but its answer and its event are lost.
function lostOnce(room) {
  let lose = true;
  const wrap = (post) => (frame) => {
    const result = post(frame);
    if (!lose) return result;
    lose = false;
    return { status: 0, body: null, retryAfter: 0 };
  };
  room.drop = (id) => id === "a" && lose;
  return wrap;
}

// The room is replaced (a hand-off or a cold restart) with this value and evidence.
function replaceRoom(room, value, evidence = {}, lastN = new Map()) {
  room.epoch = `e${Number(room.epoch.slice(1)) + 1}`;
  room.seq = 0;
  room.writer = null;
  room.stores = { game: cloneJson(value) };
  room.lastN = lastN;
  room.broadcast("state", { epoch: room.epoch, seq: 0, writer: null, stores: { game: { value: cloneJson(value), ephemeral: false, ...evidence } } });
}

async function sendLost(room, a) {
  a.game.add("s", 1);
  await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
  expect(room.posts).toHaveLength(1);
}

describe("frames in flight when the room changes", () => {
  test("a frame the old room may have applied is dropped when the room restarts, never sent again", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 }, { wrap: lostOnce(room) });
    room.open("a");
    await settle();
    await sendLost(room, a);
    room.restartQuiet({ game: { s: 0 } });
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e1", "e1"]);
    expect(room.stores.game).toEqual({ s: 0 });
    expect(a.game.toJSON()).toEqual({ s: 0 });
    expect(a.store.pending).toEqual([]);
  });

  test("a frame answered with a seq but not yet seen is dropped on a restart too", async () => {
    const room = createRoom({ game: { s: 0 } });
    room.drop = (id) => id === "a";
    const a = client(room, "a", { s: 0 });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts).toHaveLength(1);
    room.drop = () => false;
    room.restart({ game: { s: 1 } });
    await settle();
    expect(room.posts).toHaveLength(1);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a frame every attempt of which was refused as stale goes to the new room once", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 });
    room.open("a");
    await settle();
    room.restartQuiet({ game: { s: 0 } });
    a.game.add("s", 1);
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e1", "e2"]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a frame refused as stale after an earlier attempt failed in transit is dropped", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 }, { wrap: lostOnce(room) });
    room.open("a");
    await settle();
    await sendLost(room, a);
    room.restartQuiet({ game: { s: 1 } });
    await settle();
    expect(room.posts).toHaveLength(2);
    expect(room.posts[1].epoch).toBe("e1");
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("with a local successor's receipts, a frame at or below seen settles and one above that the old room may have applied is not sent again", async () => {
    const room = createRoom({ game: { s: 0 } });
    room.drop = (id) => id === "a";
    const a = client(room, "a", { s: 0 });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts.map((p) => p.n)).toEqual([1, 2]);
    room.drop = () => false;
    replaceRoom(room, { s: 1 }, { seen: { a: 1 } });
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1, 2]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a state repair before the restart changes nothing", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 }, { wrap: lostOnce(room) });
    room.open("a");
    await settle();
    await sendLost(room, a);
    room.broadcast("state", room.state());
    await settle();
    room.restartQuiet({ game: { s: 1 } });
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1, 1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("429 does not make a frame uncertain", async () => {
    const room = createRoom({ game: { s: 0 } });
    let first = true;
    const wrap = (post) => (frame) => {
      if (first) {
        first = false;
        return { status: 429, body: null, retryAfter: 0 };
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    room.restartQuiet({ game: { s: 0 } });
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e1", "e2"]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("ops not yet sent always go to the new room", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    replaceRoom(room, { s: 5 });
    await settle();
    expect(room.stores.game).toEqual({ s: 6 });
    expect(a.game.toJSON()).toEqual({ s: 6 });
  });
});

describe("a store leaving the room", () => {
  test("a store missing from a new state drops the ops in flight and keeps unframed ops pending", async () => {
    const room = createRoom({ game: { s: 0 } });
    let holding = false;
    const a = client(room, "a", { s: 0 }, { wrap: lostOnce(room), held: () => holding });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts).toHaveLength(1);
    holding = true;
    a.game.set("flag", true);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    room.broadcast("state", { epoch: "e1", seq: room.seq, writer: null, stores: {} });
    await settle();
    expect(a.game.status.mode).toBe("file");
    expect(a.store.pending).toEqual([{ op: "set", path: ["flag"], value: true }]);
    expect(room.posts).toHaveLength(1);
  });

  test("a 404 answer keeps the frame's ops pending for file mode and stops framing the store", async () => {
    const room = createRoom({ game: { s: 0 } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const attempts = [];
    const wrap = (post) => (frame) => {
      attempts.push(frame.n);
      return frame.n === 1 ? { status: 404, body: { error: "unknown-store" }, retryAfter: 0 } : post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await settle();
    expect(a.game.status.mode).toBe("file");
    expect(a.store.pending).toEqual([{ op: "add", path: ["s"], n: 1 }]);
    expect(room.stores.game).toEqual({ s: 0 });
    a.game.set("flag", true);
    await settle();
    expect(attempts).toEqual([1]);
    expect(a.store.pending).toEqual([{ op: "add", path: ["s"], n: 1 }, { op: "set", path: ["flag"], value: true }]);
    warn.mockRestore();
  });
});

describe("positions from the room", () => {
  test("a state sets each entry's last and landed", async () => {
    const room = createRoom({ game: { s: 0 } }, { game: { last: 7, landed: 3 } });
    const a = client(room, "a", { s: 0 });
    room.open("a");
    await settle();
    expect(a.entries.get("game").last).toBe(7);
    expect(a.entries.get("game").landed).toBe(3);
  });

  test("a frame sets last and calls onApplied", async () => {
    const room = createRoom({ game: { s: 0 } });
    const onApplied = jest.fn();
    const a = client(room, "a", { s: 0 }, { onApplied });
    room.open("a");
    await settle();
    onApplied.mockClear();
    room.clients.get("a").handlers.frame({ epoch: "e1", seq: 1, name: "game", ops: [{ op: "add", path: ["s"], n: 1 }], from: "b", n: 1 });
    expect(a.entries.get("game").last).toBe(1);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(a.game.toJSON()).toEqual({ s: 1 });
  });

  test("a frame with checkpoint true calls onCheckpoint", async () => {
    const room = createRoom({ game: { s: 0 } });
    const onCheckpoint = jest.fn();
    const a = client(room, "a", { s: 0 }, { onCheckpoint });
    room.open("a");
    await settle();
    room.clients.get("a").handlers.frame({ epoch: "e1", seq: 1, name: "game", ops: [{ op: "add", path: ["s"], n: 1 }], from: "b", n: 1, checkpoint: true });
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    expect(a.entries.get("game").last).toBe(1);
  });

  test("a data-writer event with landed in the current epoch sets landed and calls onLanded", async () => {
    const room = createRoom({ game: { s: 0 } });
    const onLanded = jest.fn();
    const a = client(room, "a", { s: 0 }, { onLanded });
    room.open("a");
    await settle();
    room.clients.get("a").handlers.writer({ epoch: "e1", writer: "b", landed: { game: 4 } });
    expect(a.entries.get("game").landed).toBe(4);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });

  test("one from another epoch is ignored", async () => {
    const room = createRoom({ game: { s: 0 } });
    const onLanded = jest.fn();
    const a = client(room, "a", { s: 0 }, { onLanded });
    room.open("a");
    await settle();
    room.clients.get("a").handlers.writer({ epoch: "e2", writer: "b", landed: { game: 9 } });
    expect(a.entries.get("game").landed).toBe(0);
    expect(onLanded).not.toHaveBeenCalled();
  });
});

describe("a store a save is holding", () => {
  test("a held store frames nothing until release", async () => {
    const room = createRoom({ game: { s: 0 } });
    let holding = true;
    const a = client(room, "a", { s: 0 }, { held: () => holding });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS * 4);
    expect(room.posts).toEqual([]);
    holding = false;
    a.lane.release("game");
    await settle();
    expect(room.posts).toHaveLength(1);
    expect(room.posts[0].ops).toHaveLength(2);
    expect(room.stores.game).toEqual({ s: 2 });
  });

  test("release frames only what is still pending", async () => {
    const room = createRoom({ game: { s: 0 } });
    let holding = true;
    const a = client(room, "a", { s: 0 }, { held: () => holding });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    a.game.set("flag", true);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS * 4);
    a.store.confirm(1);
    holding = false;
    a.lane.release("game");
    await settle();
    expect(room.posts).toHaveLength(1);
    expect(room.posts[0].ops).toEqual([{ op: "set", path: ["flag"], value: true }]);
  });
});

// A lane for "a" whose state reads can be held open, with its entries in reach.
function heldReadClient(room, value) {
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
  return { store, game: store.handle, lane, entries, held };
}

describe("review regressions", () => {
  test.each([429, 503])("a frame refused with %i goes to the new room once when a new room arrives before its retry", async (status) => {
    const room = createRoom({ game: { s: 0 } });
    let refuse = true;
    const wrap = (post) => (frame) => (refuse ? { status, body: null, retryAfter: 0 } : post(frame));
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(a.store.pending).toHaveLength(1);
    expect(room.posts).toEqual([]);

    refuse = false;
    room.restart({ game: { s: 0 } });
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e2"]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a stale refusal survives two room changes before its retry", async () => {
    const room = createRoom({ game: { s: 0 } });
    let answer = null;
    let first = true;
    const wrap = (post) => (frame) => {
      if (first) {
        first = false;
        return new Promise((resolve) => (answer = resolve));
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(1);
    answer({ status: 200, body: { stale: true, epoch: "e2" }, retryAfter: 0 });
    await jest.advanceTimersByTimeAsync(0);
    expect(a.store.pending).toHaveLength(1);

    room.restartQuiet({ game: { s: 0 } });
    room.broadcast("state", room.state());
    room.restartQuiet({ game: { s: 0 } });
    room.broadcast("state", room.state());
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e3"]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("stopping the lane drops a frame the room may have applied, so file mode never replays it", async () => {
    const room = createRoom({ game: { s: 0 } });
    let attempts = 0;
    const wrap = (post) => (frame) => {
      attempts += 1;
      if (attempts === 1) {
        post(frame);
        return { status: 0, body: null, retryAfter: 0 };
      }
      return { status: 401, body: null, retryAfter: 0 };
    };
    room.drop = () => true;
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await settle();
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.lane.status.stopped).toBe(true);
    expect(a.game.status.mode).toBe("file");
    expect(a.store.pending).toEqual([]);
    expect(room.posts).toHaveLength(1);

    a.game.set("flag", true);
    await settle();
    expect(a.store.pending).toEqual([{ op: "set", path: ["flag"], value: true }]);
    expect(room.posts).toHaveLength(1);
    expect(room.stores.game).toEqual({ s: 1 });
  });

  test("a state read taken before a landing notification is discarded", async () => {
    const room = createRoom({ game: { s: 0 } }, { game: { last: 3, landed: 3 } });
    const a = heldReadClient(room, { s: 0 });
    room.open("a");
    await settle();
    expect(a.entries.get("game").last).toBe(3);
    expect(a.entries.get("game").landed).toBe(3);

    a.held.hold();
    a.lane.storeOpened();
    await jest.advanceTimersByTimeAsync(0);
    room.marks.game = { last: 3, landed: 1 };
    room.clients.get("a").handlers.writer({ epoch: "e1", writer: "b", landed: { game: 1 } });
    expect(a.entries.get("game").landed).toBe(1);

    a.held.open();
    await settle();
    expect(a.entries.get("game").landed).toBe(1);
    expect(a.entries.get("game").last).toBe(3);
  });

  test("a store back from a 404 frames both the refused op and ops made in file mode", async () => {
    const room = createRoom({ game: { s: 0, t: "a" } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let notFound = true;
    const wrap = (post) => (frame) => {
      if (notFound) {
        notFound = false;
        return { status: 404, body: { code: "not-found" }, retryAfter: 0 };
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0, t: "a" }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await settle();
    expect(a.game.status.mode).toBe("file");
    expect(a.store.pending).toEqual([{ op: "add", path: ["s"], n: 1 }]);

    a.game.add("s", 10);
    await settle();
    expect(a.store.pending).toHaveLength(2);
    expect(room.posts).toEqual([]);

    room.broadcast("state", room.state());
    await settle();
    expect(a.game.status.mode).toBe("fast");
    expect(room.stores.game).toEqual({ s: 11, t: "a" });
    expect(a.game.toJSON()).toEqual({ s: 11, t: "a" });
    expect(a.store.pending).toEqual([]);
    warn.mockRestore();
  });

  test("a frame refused once and later applied is never sent again after the room changes", async () => {
    const room = createRoom({ game: { s: 0 } });
    let refuse = true;
    const wrap = (post) => (frame) => {
      if (refuse) {
        refuse = false;
        return { status: 429, body: null, retryAfter: 0 };
      }
      return post(frame);
    };
    room.drop = () => true;
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });

    room.restart({ game: { s: 1 } });
    await settle();
    expect(room.posts.map((p) => p.epoch)).toEqual(["e1"]);
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a frame refused not-connected reads the state and goes again once", async () => {
    const room = createRoom({ game: { s: 0 } });
    room.conn = "c1";
    let refuse = true;
    const attempts = [];
    const wrap = (post) => (frame) => {
      attempts.push(frame.n);
      if (refuse) {
        refuse = false;
        return { status: 503, body: { code: "not-connected" }, retryAfter: 1 };
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    const read = a.transport.fetchState;
    const reads = jest.fn((id) => read(id));
    a.transport.fetchState = reads;
    room.open("a");
    await settle();
    expect(reads).toHaveBeenCalledTimes(1);

    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS - 1);
    expect(attempts).toEqual([1]);
    expect(room.posts).toEqual([]);
    expect(reads.mock.calls.length).toBeGreaterThan(1);

    await settle();
    expect(attempts).toEqual([1, 1]);
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.posts.every((p) => p.conn === "c1")).toBe(true);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a store refused busy goes to save speed and comes back once the room takes it", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const room = createRoom({ game: { s: 0 } });
    let refuse = true;
    const wrap = (post) => (frame) => {
      if (refuse) {
        refuse = false;
        return { status: 503, body: { code: "busy" }, retryAfter: 60 };
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await settle();
    expect(a.game.status.mode).toBe("file");
    expect(a.store.pending).toEqual([{ op: "add", path: ["s"], n: 1 }]);
    expect(room.stores.game).toEqual({ s: 0 });

    await jest.advanceTimersByTimeAsync(60000);
    await settle();
    expect(a.game.status.mode).toBe("fast");
    expect(room.posts).toHaveLength(1);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
    warn.mockRestore();
  });

  test("an unanswered frame on a stream that never dropped is sent again on the next state", async () => {
    const room = createRoom({ game: { s: 0 } });
    let unanswered = true;
    const wrap = (post) => (frame) => {
      if (unanswered) {
        unanswered = false;
        return { status: 0, body: null, retryAfter: 0 };
      }
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts).toEqual([]);
    expect(a.store.pending).toHaveLength(1);

    a.lane.refresh();
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(a.store.pending).toHaveLength(1);

    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("an unanswered frame after a reconnect is settled by the room\u0027s receipt, not sent twice", async () => {
    const room = createRoom({ game: { s: 0 } });
    room.withSeen = true;
    let applied = true;
    const wrap = (post) => (frame) => {
      if (applied) {
        applied = false;
        post(frame);
        return { status: 0, body: null, retryAfter: 0 };
      }
      return post(frame);
    };
    room.drop = () => true;
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });

    room.close("a");
    room.open("a");
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("refresh reads the room\u0027s state again", async () => {
    const room = createRoom({ game: { s: 0 } });
    const a = client(room, "a", { s: 0 });
    const read = a.transport.fetchState;
    const reads = jest.fn((id) => read(id));
    a.transport.fetchState = reads;
    room.open("a");
    await settle();
    expect(reads).toHaveBeenCalledTimes(1);

    const before = reads.mock.calls.length;
    a.lane.refresh();
    await settle();
    expect(reads.mock.calls.length).toBeGreaterThan(before);
    expect(reads).toHaveBeenCalledTimes(2);
  });

  test("a frame refused and then lost on a later connection is sent again once the same epoch's state has no receipt", async () => {
    const room = createRoom({ game: { s: 0 } });
    let attempts = 0;
    const wrap = (post) => (frame) => {
      attempts += 1;
      if (attempts === 1) return { status: 429, body: null, retryAfter: 0 };
      if (attempts === 2) return { status: 0, body: null, retryAfter: 0 };
      return post(frame);
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    expect(a.game.status.mode).toBe("fast");

    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(a.store.pending).toHaveLength(1);
    expect(room.posts).toEqual([]);

    room.close("a");
    room.open("a");
    await jest.advanceTimersByTimeAsync(700);
    expect(attempts).toBe(2);
    expect(room.posts).toEqual([]);

    room.broadcast("state", room.state());
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });

  test("a frame in flight across a reconnect is dropped once its answer is lost", async () => {
    const room = createRoom({ game: { s: 0 } });
    room.drop = () => true;
    let answer = null;
    let first = true;
    const wrap = (post) => (frame) => {
      if (!first) return post(frame);
      first = false;
      post(frame);
      return new Promise((resolve) => (answer = resolve));
    };
    const a = client(room, "a", { s: 0 }, { wrap });
    room.open("a");
    await settle();
    a.game.add("s", 1);
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 1);
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });

    room.close("a");
    room.lastN.delete("game\na");
    room.open("a");
    await jest.advanceTimersByTimeAsync(0);
    expect(a.lane.status.synced).toBe(true);

    answer({ status: 0, body: null, retryAfter: 0 });
    await settle();
    expect(room.posts.map((p) => p.n)).toEqual([1]);
    expect(room.stores.game).toEqual({ s: 1 });
    expect(a.game.toJSON()).toEqual({ s: 1 });
    expect(a.store.pending).toEqual([]);
  });
});

test("the first state read of a tab carries no since", async () => {
  const room = createRoom({ game: { score: 0 } });
  const a = client(room, "a", { score: 0 });
  room.open("a");
  await settle();
  expect(room.reads[0]).toBeNull();
});

test("a reconnect reads with the room position this tab has applied", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.game.add("s", 1);
  await settle();
  a.game.add("s", 1);
  await settle();
  a.game.add("s", 1);
  await settle();
  expect(a.lane.status.seq).toBe(3);

  room.close("a");
  room.open("a");
  await settle();
  expect(room.reads.at(-1)).toEqual({ epoch: "e1", seq: 3 });
});

test("after an epoch change the read names the new epoch only once this tab applied a seq in it", async () => {
  const room = createRoom({ game: { s: 0 } });
  const a = client(room, "a", { s: 0 });
  room.open("a");
  await settle();
  a.game.add("s", 1);
  await settle();

  room.restart({ game: { s: 10 } });
  await settle();
  expect(a.lane.status.epoch).toBe("e2");
  expect(a.lane.status.seq).toBe(0);
  a.lane.refresh();
  await settle();
  expect(room.reads.at(-1)).toBeNull();

  a.game.add("s", 1);
  await settle();
  expect(a.lane.status.seq).toBe(1);
  a.lane.refresh();
  await settle();
  expect(room.reads.at(-1)).toEqual({ epoch: "e2", seq: 1 });
});
