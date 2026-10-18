import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { createFastLane } from "../../src/live/fast-lane.js";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const settle = () => jest.advanceTimersByTimeAsync(2000);

function room(epoch = "e1") {
  const r = { epoch, seq: 0, values: { s: { n: 0 }, t: { n: 0 } }, saved: {}, reads: 0, posts: [] };
  r.state = () => ({
    epoch: r.epoch,
    seq: r.seq,
    writer: null,
    stores: Object.fromEntries(Object.entries(r.values).map(([name, value]) => [name, { value: JSON.parse(JSON.stringify(value)), last: 0, landed: 0, saved: r.saved[name] ?? [] }])),
  });
  return r;
}

function tab(r, { names = ["s", "t"], held = {}, hold, taken, onStop } = {}) {
  const entries = new Map();
  const stores = {};
  for (const name of names) {
    const store = createStore({ name, value: { n: 0 } });
    entries.set(name, { store });
    stores[name] = store;
  }
  let handlers;
  const transport = {
    start(h) {
      handlers = h;
      return () => {};
    },
    send: async (id, frame) => {
      r.posts.push(JSON.parse(JSON.stringify(frame)));
      return { status: 200, body: { seq: ++r.seq, epoch: r.epoch } };
    },
    fetchState: async () => {
      r.reads++;
      if (r.script?.length) return r.script.shift()();
      if (r.gate) await r.gate;
      return r.state();
    },
  };
  const lane = createFastLane({
    transport,
    entries,
    held: (name) => (held[name] ?? []).length > 0,
    heldIds: (name) => held[name] ?? [],
    ...(hold && { hold }),
    ...(taken && { taken }),
    ...(onStop && { onStop }),
  });
  stores.s.onLocal((ops) => lane.local("s", ops, stores.s.mark));
  lane.start();
  return { lane, stores, handlers, open: () => handlers.open({ clientId: "c", lane: "live" }) };
}

test("a state keeps its value from a store whose ops a save carries, and applies it after release", async () => {
  const r = room();
  r.values.s = { n: 3 };
  const held = { s: [1, 2] };
  const t = tab(r, { held });
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  t.open();
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.handle.status.mode).toBe("file");
  expect(t.stores.s.pendingEntries().map((e) => e.id)).toEqual([1, 2]);
  expect(t.lane.roomBound("s")).toBe(true);
  expect(r.posts).toEqual([]);
  expect(t.stores.t.handle.status.mode).toBe("fast");

  t.stores.s.confirm(2);
  held.s = [];
  const reads = r.reads;
  t.lane.release("s");
  await settle();
  expect(r.reads).toBe(reads + 1);
  expect(t.stores.s.value).toEqual({ n: 3 });
  expect(t.stores.s.pending).toEqual([]);
  expect(t.stores.s.handle.status.mode).toBe("fast");
  expect(r.posts).toEqual([]);
  t.lane.stop();
});

test("a store with nothing captured takes the state while another store waits", async () => {
  const r = room();
  r.values.t = { n: 9 };
  const t = tab(r, { held: { s: [1] } });
  t.stores.s.handle.add("n", 1);
  t.open();
  await settle();
  expect(t.stores.t.value).toEqual({ n: 9 });
  expect(t.stores.t.handle.status.mode).toBe("fast");
  expect(t.stores.s.value).toEqual({ n: 1 });
  t.lane.stop();
});

test("the room's receipts for the captured frames let its state apply at once", async () => {
  const r = room();
  const held = {};
  const t = tab(r, { held });
  t.open();
  await settle();
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  const { frames, complete } = t.lane.pendingFrames("s", { epoch: "e1" }, { reserve: true });
  expect(complete).toBe(true);
  expect(frames).toEqual([["c", [[1, 1]]]]);
  held.s = [1, 2];
  r.values.s = { n: 2 };
  r.saved.s = [[1, 1]];
  r.seq = 1;
  t.handlers.state(r.state());
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.pending).toEqual([]);
  expect(r.posts).toEqual([]);
  t.lane.stop();
});

test("a state without those receipts waits, and the reserved frames are not sent", async () => {
  const r = room();
  const held = {};
  const t = tab(r, { held });
  t.open();
  await settle();
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  t.lane.pendingFrames("s", { epoch: "e1" }, { reserve: true });
  held.s = [1, 2];
  r.values.s = { n: 2 };
  r.seq = 1;
  t.handlers.state(r.state());
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.pendingEntries().map((e) => e.id)).toEqual([1, 2]);
  expect(r.posts).toEqual([]);
  t.lane.stop();
});

test("a restarted room's state waits too, and the old frames are sorted when the store takes it", async () => {
  const r = room();
  const held = {};
  const t = tab(r, { held });
  t.open();
  await settle();
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  t.lane.pendingFrames("s", { epoch: "e1" }, { reserve: true });
  held.s = [1, 2];
  r.epoch = "e2";
  r.seq = 0;
  r.values.s = { n: 2 };
  r.saved.s = [[1, 1]];
  t.handlers.state(r.state());
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.pendingEntries().map((e) => e.id)).toEqual([1, 2]);
  expect(r.posts).toEqual([]);

  t.stores.s.confirm(2);
  held.s = [];
  t.lane.release("s");
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.pending).toEqual([]);
  expect(t.stores.s.handle.status.mode).toBe("fast");
  expect(r.posts).toEqual([]);
  t.lane.stop();
});

test("when the caller lets go of the ops the state applies without them and they are never sent", async () => {
  const r = room();
  const held = {};
  const gave = [];
  const t = tab(r, {
    held,
    hold: (name, ids) => {
      gave.push(ids);
      t.stores.s.rebase(t.stores.s.authoritative, { source: "state", dropIds: ids });
      held.s = [];
      return false;
    },
  });
  t.open();
  await settle();
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  t.lane.pendingFrames("s", { epoch: "e1" }, { reserve: true });
  held.s = [1, 2];
  r.epoch = "e2";
  r.seq = 0;
  r.values.s = { n: 2 };
  t.handlers.state(r.state());
  await settle();
  expect(gave).toEqual([[1, 2]]);
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.pending).toEqual([]);
  expect(r.posts).toEqual([]);
  t.lane.stop();
});

test("a store the room does not hold is not room bound", async () => {
  const r = room();
  delete r.values.t;
  const t = tab(r);
  t.open();
  await settle();
  expect(t.lane.roomBound("s")).toBe(true);
  expect(t.lane.roomBound("t")).toBe(false);
  t.lane.stop();
  expect(t.lane.roomBound("s")).toBe(false);
});

test("once released, a store takes no state that was not read since, and then takes the read", async () => {
  const r = room();
  const held = { s: [1, 2] };
  const t = tab(r, { held });
  t.stores.s.handle.add("n", 1);
  t.stores.s.handle.add("n", 1);
  t.open();
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });

  t.stores.s.confirm(2);
  held.s = [];
  let open;
  r.gate = new Promise((resolve) => { open = resolve; });
  r.values.s = { n: 2 };
  t.lane.release("s");
  await jest.advanceTimersByTimeAsync(0);
  const stale = { ...r.state(), moves: {} };
  stale.stores.s.value = { n: 1 };
  t.handlers.state(stale);
  await jest.advanceTimersByTimeAsync(0);
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.handle.status.mode).toBe("file");

  open();
  await settle();
  expect(t.stores.s.value).toEqual({ n: 2 });
  expect(t.stores.s.handle.status.mode).toBe("fast");
  t.lane.stop();
});

test("a store reports taking a state, and does not while it waits", async () => {
  const r = room();
  const taken = [];
  const held = { s: [1] };
  const t = tab(r, { held, taken: (name) => taken.push(name) });
  t.stores.s.handle.add("n", 1);
  t.open();
  await settle();
  expect(taken).toEqual(["t"]);
  t.stores.s.confirm(1);
  held.s = [];
  t.lane.release("s");
  await settle();
  expect(taken.filter((name) => name === "s")).toEqual(["s"]);
  t.lane.stop();
});

test("a read can be asked of a store that was not skipped", async () => {
  const r = room();
  const t = tab(r);
  t.open();
  await settle();
  const reads = r.reads;
  r.values.s = { n: 4 };
  r.seq = 1;
  t.lane.release("s", { read: true });
  await settle();
  expect(r.reads).toBe(reads + 1);
  expect(t.stores.s.value).toEqual({ n: 4 });
  t.lane.stop();
});

describe("the read that replaces a kept state always ends", () => {
  const heldTab = async (r, options = {}) => {
    const held = { s: [1] };
    r.values.t = { n: 7 };
    const t = tab(r, { held, ...options });
    t.stores.s.handle.add("n", 1);
    t.open();
    await settle();
    expect(t.stores.t.value).toEqual({ n: 7 });
    t.stores.s.confirm(1);
    held.s = [];
    r.values.s = { n: 1 };
    return t;
  };

  test("a read that fails is made again", async () => {
    const r = room();
    const t = await heldTab(r);
    r.script = [() => null];
    t.lane.release("s");
    await jest.advanceTimersByTimeAsync(400);
    expect(t.stores.s.handle.status.mode).toBe("file");
    await jest.advanceTimersByTimeAsync(200);
    expect(t.stores.s.value).toEqual({ n: 1 });
    expect(t.stores.s.handle.status.mode).toBe("fast");
    t.lane.stop();
  });

  test("a busy host moves the stores to save speed and the read is made again after its delay", async () => {
    const r = room();
    const t = await heldTab(r);
    r.script = [() => ({ status: 503, code: "busy" })];
    t.lane.release("s");
    await jest.advanceTimersByTimeAsync(59_000);
    expect(t.stores.s.handle.status.mode).toBe("file");
    expect(t.stores.t.handle.status.mode).toBe("file");
    await jest.advanceTimersByTimeAsync(2000);
    expect(t.stores.s.value).toEqual({ n: 1 });
    expect(t.stores.s.handle.status.mode).toBe("fast");
    t.lane.stop();
  });

  test("a room that is gone stops the lane and the stores stay at save speed", async () => {
    const r = room();
    const onStop = jest.fn();
    const t = await heldTab(r, { onStop });
    r.script = [() => ({ status: 404 })];
    t.lane.release("s");
    await jest.advanceTimersByTimeAsync(86_400_000);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(t.stores.s.handle.status.mode).toBe("file");
    expect(t.stores.t.handle.status.mode).toBe("file");
    expect(t.lane.roomBound("s")).toBe(false);
    t.lane.stop();
  });
});
