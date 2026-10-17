/** @jest-environment node */
import { Sim, createRoom, LIMITS, RATE } from "./room-double.js";

const OP = (value, path = ["x"]) => [{ op: "set", path, value }];
const LOG_ENTRIES = LIMITS.logEntries;

afterEach(() => {
  LIMITS.logEntries = LOG_ENTRIES;
});

function make({ stores = { doc: { n: 0 } }, room: roomOptions } = {}) {
  const sim = new Sim(1);
  const room = createRoom(sim, stores, roomOptions);
  function connect(id) {
    const seen = { open: [], frames: [], writer: [], close: 0 };
    const transport = room.transport(id);
    transport.start({
      open: (d) => seen.open.push(d),
      frame: (d) => seen.frames.push(d),
      writer: (d) => seen.writer.push(d),
      close: () => { seen.close += 1; },
    });
    room.open(id);
    return { id, transport, seen };
  }
  async function send(client, frame) {
    const p = client.transport.send(client.id, frame);
    await sim.run(sim.t + 200);
    return p;
  }
  async function readState(client, since) {
    const p = client.transport.fetchState(client.id, since);
    await sim.run(sim.t + 200);
    return p;
  }
  return { sim, room, connect, send, readState };
}

test("a frame whose body is over 64 KB is refused 413", async () => {
  const { connect, send } = make();
  const a = connect("a");
  const res = await send(a, { epoch: "e1", name: "doc", n: 1, ops: [{ op: "set", path: ["big"], value: "x".repeat(70000) }] });
  expect(res.status).toBe(413);
  expect(res.body.code).toBe("too-large");
});

test("41 sends at one moment: the 41st is 429, the first 40 are 200, and time refills the bucket", async () => {
  const { sim, connect } = make();
  const a = connect("a");
  const pending = [];
  for (let i = 0; i < 41; i++) pending.push(a.transport.send("a", { epoch: "e1", name: "doc", n: i + 1, ops: OP(i) }));
  await sim.run(sim.t + 200);
  const results = await Promise.all(pending);
  expect(results.slice(0, 40).every((r) => r.status === 200)).toBe(true);
  expect(results[40].status).toBe(429);
  expect(results[40].retryAfter).toBe(1);
  await sim.run(sim.t + 1000);
  const p = a.transport.send("a", { epoch: "e1", name: "doc", n: 42, ops: OP("ok") });
  await sim.run(sim.t + 200);
  expect((await p).status).toBe(200);
  expect(RATE.perSecond).toBe(25);
});

test("a frame from an old epoch answers 200 stale with the current epoch", async () => {
  const { connect, send } = make();
  const a = connect("a");
  const res = await send(a, { epoch: "e9", name: "doc", n: 1, ops: OP(1) });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ stale: true, epoch: "e1" });
});

test("a frame for an unknown store is 404", async () => {
  const { connect, send } = make();
  const a = connect("a");
  const res = await send(a, { epoch: "e1", name: "nope", n: 1, ops: OP(1) });
  expect(res.status).toBe(404);
  expect(res.body.code).toBe("unknown-store");
});

test("bad frames are 400: n 0, no ops, and 129 ops", async () => {
  const { connect, send } = make();
  const a = connect("a");
  expect((await send(a, { epoch: "e1", name: "doc", n: 0, ops: OP(1) })).status).toBe(400);
  expect((await send(a, { epoch: "e1", name: "doc", n: 1, ops: [] })).status).toBe(400);
  const many = Array.from({ length: 129 }, (_, i) => ({ op: "set", path: ["k" + i], value: i }));
  expect((await send(a, { epoch: "e1", name: "doc", n: 2, ops: many })).status).toBe(400);
});

test("a repeated n from the same client is a duplicate and is not applied twice", async () => {
  const { connect, send, readState } = make();
  const a = connect("a");
  const first = await send(a, { epoch: "e1", name: "doc", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
  expect(first.status).toBe(200);
  const second = await send(a, { epoch: "e1", name: "doc", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
  expect(second.status).toBe(200);
  expect(second.body).toEqual({ duplicate: true, seq: first.body.seq, epoch: "e1" });
  const state = await readState(a);
  expect(state.stores.doc.value.n).toBe(1);
});

test("an invalid op is 422", async () => {
  const { connect, send } = make();
  const a = connect("a");
  const res = await send(a, { epoch: "e1", name: "doc", n: 1, ops: [{ op: "add", path: ["x"], n: "1" }] });
  expect(res.status).toBe(422);
  expect(res.body.code).toBe("bad-op");
});

test("the store cap and the room cap are both refused 413", async () => {
  const first = make();
  const a = first.connect("a");
  let crossed = null;
  for (let i = 0; i < Math.ceil(LIMITS.storeBytes / 15000) + 1; i++) {
    const res = await first.send(a, { epoch: "e1", name: "doc", n: i + 1, ops: [{ op: "set", path: ["p" + i], value: "x".repeat(15000) }] });
    if (res.status !== 200) crossed = res;
  }
  expect(crossed.status).toBe(413);
  expect(crossed.body.code).toBe("too-large");

  const big = { big: "x".repeat(LIMITS.roomBytes / 4 - 82) };
  const second = make({ stores: { s0: big, s1: big, s2: big, s3: big, extra: {} } });
  const b = second.connect("b");
  const res = await second.send(b, { epoch: "e1", name: "extra", n: 1, ops: [{ op: "set", path: ["big"], value: "y".repeat(3000) }] });
  expect(res.status).toBe(413);
  expect(res.body.code).toBe("too-large");
});

test("a later write wins: no stale-version refusal", async () => {
  const { sim, connect, readState } = make();
  const a = connect("a");
  const b = connect("b");
  const pa = a.transport.send("a", { epoch: "e1", name: "doc", n: 1, ops: [{ op: "set", path: ["v"], value: "a" }] });
  const pb = b.transport.send("b", { epoch: "e1", name: "doc", n: 1, ops: [{ op: "set", path: ["v"], value: "b" }] });
  await sim.run(sim.t + 200);
  await Promise.all([pa, pb]);
  const state = await readState(a);
  expect(state.stores.doc.value.v).toBe("b");
});

test("one order everywhere: every client records seq 1, 2, 3", async () => {
  const sim = new Sim(1);
  const room = createRoom(sim, { doc: { n: 0 } }, { latency: (id) => ({ a: 10, b: 30, c: 60 }[id] ?? 40) });
  const connect = (id) => {
    const seen = { frames: [], writer: [], open: [] };
    const transport = room.transport(id);
    transport.start({
      open: (d) => seen.open.push(d),
      frame: (d) => seen.frames.push(d),
      writer: (d) => seen.writer.push(d),
      close: () => {},
    });
    room.open(id);
    return { id, transport, seen };
  };
  const a = connect("a"), b = connect("b"), c = connect("c");
  const pa = a.transport.send("a", { epoch: "e1", name: "doc", n: 1, ops: OP("a") });
  const pb = b.transport.send("b", { epoch: "e1", name: "doc", n: 1, ops: OP("b") });
  const pc = c.transport.send("c", { epoch: "e1", name: "doc", n: 1, ops: OP("c") });
  await sim.run(sim.t + 500);
  await Promise.all([pa, pb, pc]);
  for (const client of [a, b, c]) {
    expect(client.seen.frames.map((f) => f.seq)).toEqual([1, 2, 3]);
  }
  expect(a.seen.frames.map((f) => f.seq)).toEqual(b.seen.frames.map((f) => f.seq));
  expect(b.seen.frames.map((f) => f.seq)).toEqual(c.seen.frames.map((f) => f.seq));
});

test("the first sender becomes the writer; when it leaves, the most recent connected sender is elected", async () => {
  const { sim, room, connect, send } = make();
  const a = connect("a"), b = connect("b"), c = connect("c");
  await send(a, { epoch: "e1", name: "doc", n: 1, ops: OP(1) });
  expect(room.writer).toBe("a");
  await send(b, { epoch: "e1", name: "doc", n: 1, ops: OP(2) });
  await send(c, { epoch: "e1", name: "doc", n: 1, ops: OP(3) });
  room.close("a");
  await sim.run(sim.t + 100);
  expect(room.writer).toBe("c");
  expect(b.seen.writer.at(-1)).toEqual({ epoch: "e1", writer: "c" });
  expect(c.seen.writer.at(-1)).toEqual({ epoch: "e1", writer: "c" });
});

test("eviction keeps the newest entries and moves the floor", async () => {
  LIMITS.logEntries = 8;
  const { room, connect, send } = make();
  const a = connect("a");
  for (let i = 1; i <= 12; i++) await send(a, { epoch: "e1", name: "doc", n: i, ops: OP(i) });
  const store = room.stores.get("doc");
  expect(store.log.length).toBe(8);
  expect(store.log[0].seq).toBe(5);
  expect(store.floor).toBe(4);
  expect(room.logSince("doc", 3)).toBeNull();
  expect(room.logSince("doc", 4).map((e) => e.seq)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  expect(room.logSince("doc", 12)).toEqual([]);
});

test("sparse seqs are not a gap: a store starting above seq 1 has floor 0", async () => {
  const { room, connect, send } = make({ stores: { a: {}, b: {} } });
  const c = connect("c1");
  await send(c, { epoch: "e1", name: "a", n: 1, ops: OP(1) });
  await send(c, { epoch: "e1", name: "b", n: 2, ops: OP(2) });
  const b = room.stores.get("b");
  expect(b.floor).toBe(0);
  expect(b.log[0].seq).toBe(2);
  expect(room.logSince("b", 0).map((e) => e.seq)).toEqual([2]);
});

test("the checkpoint flag turns on past half the log cap and off after a landing", async () => {
  LIMITS.logEntries = 8;
  const { room, connect, send } = make();
  const a = connect("a");
  for (let i = 1; i <= 4; i++) await send(a, { epoch: "e1", name: "doc", n: i, ops: OP(i) });
  expect(a.seen.frames.map((f) => f.checkpoint)).toEqual([false, false, false, false]);
  await send(a, { epoch: "e1", name: "doc", n: 5, ops: OP(5) });
  expect(a.seen.frames[4].checkpoint).toBe(true);
  room.land("doc", room.seq);
  await send(a, { epoch: "e1", name: "doc", n: 6, ops: OP(6) });
  expect(a.seen.frames[5].checkpoint).toBe(false);
});

test("fetchState reports the room, the store record, and the moves since a seq", async () => {
  const { connect, send, readState } = make();
  const a = connect("a");
  await send(a, { epoch: "e1", name: "doc", n: 1, ops: OP(1) });
  const state = await readState(a, 0);
  expect(state.epoch).toBe("e1");
  expect(state.seq).toBe(1);
  expect(state.writer).toBe("a");
  expect(state.stores.doc).toEqual({ value: { n: 0, x: 1 }, ephemeral: false, last: 1, landed: 0, floor: 0, seen: { a: 1 } });
  expect(state.moves).toEqual({ doc: [{ seq: 1, ops: [{ op: "set", path: ["x"], value: 1 }] }] });
});

test("a restart bumps the epoch, resets seq, re-seeds stores and reopens clients", async () => {
  const { sim, room, connect, send } = make();
  const a = connect("a");
  await send(a, { epoch: "e1", name: "doc", n: 1, ops: OP(1) });
  room.restart({ doc: { n: 7 } });
  expect(room.epoch).toBe("e2");
  expect(room.seq).toBe(0);
  expect(room.stores.get("doc").value).toEqual({ n: 7 });
  await sim.run(sim.t + 300);
  expect(room.clients.get("a").connected).toBe(true);
  expect(a.seen.open.length).toBe(2);
  const res = await send(a, { epoch: "e1", name: "doc", n: 1, ops: OP(2) });
  expect(res.status).toBe(200);
  expect(res.body.stale).toBe(true);
});

test("the refuse hook rejects exactly the frame it names", async () => {
  const { connect, send } = make({
    room: { refuse: (id, frame) => (frame.n === 2 ? { status: 413, body: { code: "too-large" } } : null) },
  });
  const a = connect("a");
  expect((await send(a, { epoch: "e1", name: "doc", n: 1, ops: OP(1) })).status).toBe(200);
  const res = await send(a, { epoch: "e1", name: "doc", n: 2, ops: OP(2) });
  expect(res.status).toBe(413);
  expect(res.body.code).toBe("too-large");
});
