// A save made while a tab is out of the room (round 9 review, Opus 1 and 2,
// Astra 1): the file holds every frame the tab gave the store, landed or not
// (live-by), the host's merge replays only the rest, and the page binding heals
// whatever text the merge left out, or names it. The real binding, store and
// fast lane on the room double, whose fileWritten is the host's merge.
import { jest } from "@jest/globals";
import { Sim, createRoom, LIMITS } from "./room-double.js";
import { engine } from "./blocks/editor-tab.js";

let warn;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

const copy = (v) => JSON.parse(JSON.stringify(v));
const text = (room) => room.stores.get("page").value.blocks.p.c;
const close = (...tabs) => { for (const t of tabs) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } };
const lostText = (tabs) => tabs.flatMap((t) => t.allNotices().map((n) => n.lost));

// Round 9's room-exit test: " one" lands but its frame has not come back when
// " two" is answered 503 busy. Then a saves at 9 s.
async function ownLanded({ answer, by = true, peerAt = null, logEntries = 4096, peerText = " B" }) {
  LIMITS.logEntries = logEntries;
  const sim = new Sim(5), initial = engine.initial("Start.");
  let posts = 0;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 400, answerLatency: () => 40, refuse: () => (++posts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  const b = peerAt ? engine.makeTab(sim, room, "b", copy(initial)) : null;
  a.start();
  await sim.run(500);
  if (b) { b.start(); await sim.run(900); sim.at(peerAt, () => { b.caret = b.view.length; b.type(peerText); }); }
  sim.at(1000, () => { a.caret = 6; a.type(" one"); });
  sim.at(1100, () => { a.type(" two"); });
  let capture;
  sim.at(9000, () => { capture = a.save({ answer, by }); });
  await sim.run(12000);
  const atSave = { room: text(room), view: a.view, mode: a.store.handle.status.mode };
  await sim.run(90000);
  await sim.idle(5000);
  const out = { capture: { mode: capture.mode, at: capture.at, by: capture.by }, atSave, room: text(room), view: a.view, notices: lostText(b ? [a, b] : [a]), posts, b: b?.view };
  close(...(b ? [a, b] : [a]));
  LIMITS.logEntries = 4096;
  return out;
}

test("Opus 1a: a tab's own landed write and its busy next write both survive a save at 9 s (answer first)", async () => {
  const out = await ownLanded({ answer: 80 });
  expect(out.capture).toEqual({ mode: "file", at: { epoch: "e1", seq: 0, hash: expect.any(String) }, by: { client: "a", n: 2 } });
  expect({ room: out.room, view: out.view, notices: out.notices }).toEqual({ room: "Start. one two", view: "Start. one two", notices: [] });
});

test("Opus 1b: the merge's state arriving before the save's answer does not send the busy frame again (no doubling)", async () => {
  const out = await ownLanded({ answer: 2000 });
  expect({ room: out.room, view: out.view, notices: out.notices }).toEqual({ room: "Start. one two", view: "Start. one two", notices: [] });
});

test("a peer typing after the merge kept the saved text, before this tab is back, gets no second copy of it", async () => {
  const out = await ownLanded({ answer: 80, peerAt: 9200 });
  expect({ view: out.view, b: out.b, notices: out.notices }).toEqual({ view: out.room, b: out.room, notices: [] });
  for (const piece of [" one", " two", " B"]) expect(out.room.split(piece).length - 1).toBe(1);
});

// Opus's busy-frame-peer: a's " A1" lands, " A2" is answered 503 busy, b types
// " B" meanwhile, and a saves at 4 s.
async function busyFramePeer({ answer, writer = "a" }) {
  const sim = new Sim(5), initial = engine.initial("Start.");
  let aPosts = 0;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 60, answerLatency: () => 40, refuse: (id, frame) => (id === "a" && ++aPosts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  const b = engine.makeTab(sim, room, "b", copy(initial));
  a.start(); b.start();
  await sim.run(500);
  if (writer === "b") room.writer = "b";
  sim.at(600, () => { a.caret = 6; a.type(" A1"); });
  sim.at(1000, () => { a.type(" A2"); });
  sim.at(2000, () => { b.caret = b.view.length; b.type(" B"); });
  sim.at(4000, () => { a.save({ answer }); });
  await sim.run(90000);
  await sim.idle(5000);
  const out = { room: text(room), a: a.view, b: b.view, notices: lostText([a, b]), writer: room.writer };
  close(a, b);
  return out;
}

for (const writer of ["a", "b"]) for (const answer of [80, 2000]) {
  test(`Opus 1a: busy-frame-peer with a save at 4 s, ${writer} the writer, answer after ${answer} ms: no text lost, none doubled`, async () => {
    const out = await busyFramePeer({ answer, writer });
    expect(out).toEqual({ room: out.room, a: out.room, b: out.room, notices: [], writer: out.writer });
    for (const piece of [" A1", " A2", " B"]) expect(out.room.split(piece).length - 1).toBe(1);
  });
}

// The same on a plain store (no page binding): the real store and fast lane,
// the room double's merge. Opus 1a's generic case and Astra 1 / Opus 3.
import { createStore } from "../../../../src/live/store.js";
import { createFastLane } from "../../../../src/live/fast-lane.js";
import { serializeLive, textHash } from "../../../../src/live/ops.js";

async function plainStore(initial, first, second, { answer = 80 } = {}) {
  const sim = new Sim(5);
  let posts = 0;
  const room = createRoom(sim, { s: copy(initial) }, { latency: () => 400, answerLatency: () => 40, refuse: () => (++posts === 2 ? { status: 503, body: { code: "busy" }, retryAfter: 60 } : null) });
  const store = createStore({ name: "s", value: copy(initial) });
  let leftAt = null, saving = null;
  const lane = createFastLane({
    transport: room.transport("a"), entries: new Map([["s", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer,
    onLeave: (_n, at) => { leftAt = at; },
    held: () => !!saving && store.pendingEntries().some((e) => e.id <= saving.mark),
  });
  store.onLocal((ops) => lane.local("s", ops, store.mark));
  lane.start(); room.open("a");
  await sim.run(500);
  sim.at(1000, () => first(store.handle));
  sim.at(1100, () => second(store.handle));
  sim.at(9000, () => {
    const value = copy(store.value), mark = store.mark;
    saving = { mark };
    const by = { client: "a", n: lane.framed?.("s") ?? 0 };
    sim.after(answer / 2, () => room.fileWritten("s", value, { ...leftAt, hash: textHash(serializeLive(value)) }, by));
    sim.after(answer, () => {
      saving = null;
      if (store.handle.status.mode === "fast") { store.rebase(store.authoritative, { source: "state", through: mark }); lane.release("s"); lane.refresh(); }
      else store.confirm(mark);
    });
  });
  await sim.run(90000);
  await sim.idle(5000);
  const out = { room: room.stores.get("s").value, tab: copy(store.value), mode: store.handle.status.mode, pending: store.pending.length, posts };
  lane.stop();
  return out;
}

for (const answer of [80, 2000]) {
  test(`Opus 1a, generic store: x=1 lands without coming back, x=2 is answered busy, a save at 9 s keeps x=2 (answer after ${answer} ms)`, async () => {
    const out = await plainStore({ x: 0 }, (h) => h.set("x", 1), (h) => h.set("x", 2), { answer });
    expect(out).toEqual({ room: { x: 2 }, tab: { x: 2 }, mode: "fast", pending: 0, posts: out.posts });
  });

  test(`Opus 3: an add that landed without coming back counts once after a save (answer after ${answer} ms)`, async () => {
    const out = await plainStore({ n: 0 }, (h) => h.add("n", 1), (h) => h.set("flag", true), { answer });
    expect(out).toEqual({ room: { n: 1, flag: true }, tab: { n: 1, flag: true }, mode: "fast", pending: 0, posts: out.posts });
  });

  test(`Astra 1: a list delete that landed without coming back deletes one item after a save (answer after ${answer} ms)`, async () => {
    const out = await plainStore({ items: ["a", "b", "c"] }, (h) => h.delete(["items", 0]), (h) => h.set("flag", true), { answer });
    expect(out).toEqual({ room: { items: ["b", "c"], flag: true }, tab: { items: ["b", "c"], flag: true }, mode: "fast", pending: 0, posts: out.posts });
  });
}

// Round 11 review, Opus 4: the same, with the room's log evicted before a is
// back (moves null), so a rejoins by the join path. Its own " one", which the
// room holds, is not named in a heal notice.
for (const peerText of [" B", " B C D"]) {
  test(`Opus 4: a rejoin after a save, with the log evicted, gives no false heal notice (peer types '${peerText}')`, async () => {
    const out = await ownLanded({ answer: 80, peerAt: 9200, logEntries: 2, peerText });
    expect({ view: out.view, b: out.b, notices: out.notices }).toEqual({ view: out.room, b: out.room, notices: [] });
    for (const piece of [" one", " two", ...peerText.trim().split(" ").map((w) => " " + w)]) expect(out.room.split(piece).length - 1).toBe(1);
  });
}
