// A page tab that leaves the room keeps its writes and catches up when it
// comes back. Round 8 review, Opus findings 1 and 3, in the reviewer's
// fixture shapes, with the real binding, store and fast lane on the room double.
import { jest } from "@jest/globals";
import { Sim, createRoom } from "./room-double.js";
import { engine } from "./blocks/editor-tab.js";

let warn;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

const copy = (v) => JSON.parse(JSON.stringify(v));
const text = (room) => room.stores.get("page").value.blocks.p.c;
const close = (...tabs) => { for (const t of tabs) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } };

test("Opus 1: a writer whose frame is answered 503 busy, while a peer types, rejoins without repairing over the peer, and every tab converges", async () => {
  const sim = new Sim(5), initial = engine.initial("Start.");
  let aPosts = 0;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 60, answerLatency: () => 40, refuse: (id) => (id === "a" && ++aPosts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  const b = engine.makeTab(sim, room, "b", copy(initial));
  a.start(); b.start();
  await sim.run(500);
  sim.at(600, () => { a.caret = 6; a.type(" A1"); });
  sim.at(1000, () => { a.type(" A2"); });
  sim.at(2000, () => { b.caret = b.view.length; b.type(" B"); });
  await sim.run(5000);
  expect(a.store.handle.status.mode).toBe("file");
  expect(a.view).toBe("Start. A1 A2");
  await sim.run(90000);
  await sim.idle(5000);
  const out = { room: text(room), a: a.view, b: b.view };
  close(a, b);
  expect(out.room).toContain(" B");
  expect(out.room).toContain(" A2");
  expect(out).toEqual({ room: out.room, a: out.room, b: out.room });
});

test("Opus 1: a tab's own landed write survives its next frame being answered 503 busy", async () => {
  const sim = new Sim(5), initial = engine.initial("Start.");
  let posts = 0;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 400, answerLatency: () => 40, refuse: () => (++posts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  a.start();
  await sim.run(500);
  sim.at(1000, () => { a.caret = 6; a.type(" one"); });
  sim.at(1100, () => { a.type(" two"); });
  await sim.run(30000);
  expect({ view: a.view, value: a.store.value.blocks.p.c }).toEqual({ view: "Start. one two", value: "Start. one two" });
  await sim.run(90000);
  await sim.idle(5000);
  const out = { room: text(room), view: a.view };
  close(a);
  expect(out).toEqual({ room: "Start. one two", view: "Start. one two" });
});

// The room is lost, from a file without the typing, and the host is then over
// its live budget: every state read answers 503 busy until 50 s.
async function lostThenBusy(restartAt) {
  const sim = new Sim(5), initial = engine.initial("Start.");
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 400, answerLatency: () => 40 });
  let busy = false;
  const orig = room.state;
  room.state = (id, since) => (busy ? { status: 503, code: "busy", retryAfter: 60 } : orig(id, since));
  const a = engine.makeTab(sim, room, "a", copy(initial));
  a.start();
  await sim.run(500);
  sim.at(1000, () => { a.caret = 6; a.type(" hello world"); });
  sim.at(restartAt, () => { busy = true; room.restart({ page: copy(initial) }); });
  const during = [];
  await sim.run(5000);
  during.push({ mode: a.store.handle.status.mode, view: a.view, value: a.store.value.blocks.p.c, pending: a.store.pending.length });
  await sim.run(40000);
  during.push({ mode: a.store.handle.status.mode, view: a.view, value: a.store.value.blocks.p.c, pending: a.store.pending.length });
  sim.at(50000, () => { busy = false; });
  await sim.run(90000);
  await sim.idle(5000);
  const out = { during, room: text(room), view: a.view };
  close(a);
  return out;
}

const kept = { mode: "file", view: "Start. hello world", value: "Start. hello world", pending: 1 };

test("Opus 3: a write that landed but had not come back stays in the editor and in saves through the busy minute", async () => {
  const out = await lostThenBusy(1100);
  expect(out).toEqual({ during: [kept, kept], room: "Start. hello world", view: "Start. hello world" });
});

test("Opus 3: a write still on the wire at the loss stays in the editor and in saves through the busy minute", async () => {
  const out = await lostThenBusy(1010);
  expect(out).toEqual({ during: [kept, kept], room: "Start. hello world", view: "Start. hello world" });
});

// Round 9 review, Opus 2: the whole read after the busy minute is thrown away
// (the stream reconnects during it, or a save's landed event comes in), and the
// read that replaces it must still be whole.
async function busyPeerWithEventDuringRead(during) {
  const sim = new Sim(5), initial = engine.initial("Start.");
  let aPosts = 0, slow = false;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 60, answerLatency: (id) => (slow && id === "a" ? 4000 : 40), refuse: (id) => (id === "a" && ++aPosts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  const b = engine.makeTab(sim, room, "b", copy(initial));
  a.start(); b.start();
  await sim.run(500);
  sim.at(600, () => { a.caret = 6; a.type(" A1"); });
  sim.at(1000, () => { a.type(" A2"); });
  sim.at(2000, () => { b.caret = b.view.length; b.type(" B"); });
  // b leaves once its write is in, so no other writer repairs the room for a.
  await sim.run(30000);
  const bView = b.view;
  room.close("b");
  close(b);
  // a's retry reads at about 61 s; its answer takes 4 s.
  sim.at(60500, () => { slow = true; });
  sim.at(62000, () => { slow = false; during(room); });
  await sim.run(120000);
  await sim.idle(5000);
  const out = { room: text(room), a: a.view, b: bView };
  close(a);
  return out;
}

test("Opus 2: a reconnect during the whole read leaves the next read whole, and the room and a end with A2 and B", async () => {
  const out = await busyPeerWithEventDuringRead((room) => { room.close("a"); room.open("a"); });
  expect(out).toEqual({ room: out.room, a: out.room, b: "Start. A1 B" });
  for (const piece of [" A1", " A2", " B"]) expect(out.room.split(piece).length - 1).toBe(1);
});

test("Opus 2: a save's landed event during the whole read leaves the next read whole, and the room and a end with A2 and B", async () => {
  const out = await busyPeerWithEventDuringRead((room) => { room.fileWritten("page", copy(room.stores.get("page").value), { epoch: room.epoch, seq: room.seq }); });
  expect(out).toEqual({ room: out.room, a: out.room, b: "Start. A1 B" });
  for (const piece of [" A1", " A2", " B"]) expect(out.room.split(piece).length - 1).toBe(1);
});
