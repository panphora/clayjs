import { Sim, createRoom } from "./collab/room-double.js";
import { makeTab, initial } from "./collab/blocks/editor-tab.js";
import { flushUnsaved, pendingIds } from "../../../src/lib/unsaved-state.js";

/**
 * The binding's unsaved state: "page:live" while any block's write is in
 * flight, with a flush that resolves once every one landed; "page:held" while
 * a composition holds releases back.
 */

function setup() {
  const sim = new Sim(3);
  const room = createRoom(sim, { page: initial("The quick brown fox.") }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", initial("The quick brown fox."));
  a.start();
  return { sim, room, a };
}

test("flush resolves once every write landed, and the page is pending until then", async () => {
  const { sim, room, a } = setup();
  await sim.run(500);
  room.close("a");
  a.caret = 9;
  a.type(" red");
  expect(pendingIds()).toContain("page:live");
  let result = null;
  const flushed = a.binding.flush({ timeoutMs: 20_000 }).then((r) => { result = r; });
  await sim.run(3000);
  expect(result).toBe(null);
  room.open("a");
  await sim.run(6000);
  await flushed;
  expect(result).toEqual({ ok: true });
  expect(room.stores.get("page").value.blocks.p.c).toBe("The quick red brown fox.");
  expect(pendingIds()).not.toContain("page:live");
  a.binding.dispose();
});

test("flush gives up with a timeout while the room stays out of reach", async () => {
  const { sim, room, a } = setup();
  await sim.run(500);
  room.close("a");
  a.type("!");
  let result = null;
  a.binding.flush({ timeoutMs: 2000 }).then((r) => { result = r; });
  await sim.run(3000);
  expect(result).toEqual({ ok: false, code: "timeout" });
  a.binding.dispose();
});

test("an open composition is unsaved state that flushUnsaved lists, never waits on", async () => {
  const { sim, a } = setup();
  await sim.run(500);
  a.compose(true);
  expect(pendingIds()).toContain("page:held");
  const answer = await flushUnsaved();
  expect(answer.pending).toContain("page:held");
  a.compose(false);
  expect(pendingIds()).not.toContain("page:held");
  a.binding.dispose();
});

test("a formatted write is stored with its marks as runs; a peer and a record with one key per unit both open it", async () => {
  const sim = new Sim(5);
  const legacy = { blocks: { p: { t: "paragraph", pos: "M", c: "The quick fox.", m: ["", "", "", "", "b", "b", "b", "b", "b", "", "", "", "", ""] } }, deleted: {} };
  const room = createRoom(sim, { page: legacy }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", JSON.parse(JSON.stringify(legacy)));
  const b = makeTab(sim, room, "b", JSON.parse(JSON.stringify(legacy)));
  a.start();
  b.start();
  await sim.run(1000);
  expect(a.marks.slice(4, 9)).toEqual(["b", "b", "b", "b", "b"]);
  a.caret = 13;
  a.type(" jumps", "i");
  await sim.idle(5000);
  const stored = room.stores.get("page").value.blocks.p;
  expect(stored.c).toBe("The quick fox jumps.");
  expect(stored.m).toEqual([[4, ""], [5, "b"], [4, ""], [6, "i"], [1, ""]]);
  expect(b.view).toBe("The quick fox jumps.");
  expect(b.marks).toEqual(a.marks);
  expect(b.marks.slice(13, 19)).toEqual(["i", "i", "i", "i", "i", "i"]);
  a.binding.dispose();
  b.binding.dispose();
});

test("a data API write deeper than a block reaches every tab, after the tab has read the block", async () => {
  const sim = new Sim(6);
  const value = { blocks: { p: { t: "paragraph", pos: "M", c: "The quick fox.", m: [[4, ""], [5, "b"], [5, ""]] } }, deleted: {} };
  const room = createRoom(sim, { page: value }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", JSON.parse(JSON.stringify(value)));
  const b = makeTab(sim, room, "b", JSON.parse(JSON.stringify(value)));
  a.start();
  b.start();
  await sim.run(1000);
  a.caret = 13;
  a.type("!");
  await sim.idle(3000);
  const z = room.transport("z");
  z.start({ open() {}, close() {}, frame() {}, writer() {} });
  room.open("z");
  let n = 0;
  z.send("z", { name: "page", n: ++n, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "p", "c"], value: "A new line." }] });
  await sim.idle(3000);
  expect(room.stores.get("page").value.blocks.p.c).toBe("A new line.");
  expect(a.view).toBe("A new line.");
  expect(b.view).toBe("A new line.");
  z.send("z", { name: "page", n: ++n, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "p", "t"], value: "heading" }] });
  await sim.idle(3000);
  for (const t of [a, b]) expect(t.editor.state.doc.child(0).type.name).toBe("heading");
  a.binding.dispose();
  b.binding.dispose();
});

test("a data API write into a record's marks, one key per unit, reaches every tab", async () => {
  const sim = new Sim(7);
  const m = ["", "", "", "", "b", "b", "b", "b", "b", "", "", "", "", ""];
  const value = { blocks: { p: { t: "paragraph", pos: "M", c: "The quick fox.", m } }, deleted: {} };
  const room = createRoom(sim, { page: value }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", JSON.parse(JSON.stringify(value)));
  const b = makeTab(sim, room, "b", JSON.parse(JSON.stringify(value)));
  a.start();
  b.start();
  await sim.run(1000);
  const z = room.transport("z");
  z.start({ open() {}, close() {}, frame() {}, writer() {} });
  room.open("z");
  let n = 0;
  for (const i of [4, 5, 6]) {
    z.send("z", { name: "page", n: ++n, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "p", "m", i], value: "" }] });
    await sim.idle(2000);
  }
  const want = ["", "", "", "", "", "", "", "b", "b", "", "", "", "", ""];
  for (const t of [a, b]) expect(t.marks).toEqual(want);
  a.caret = 2;
  a.type("x");
  await sim.idle(3000);
  for (const t of [a, b]) expect(t.marks).toEqual(["", "", "", ...want.slice(2)]);
  a.binding.dispose();
  b.binding.dispose();
});

test("a block from the room whose key ties a neighbour's gets a fresh key on the next local edit", async () => {
  const sim = new Sim(9);
  const value = { blocks: { p: { t: "paragraph", pos: "M", c: "The quick fox." }, q: { t: "paragraph", pos: "V", c: "Second." } }, deleted: {} };
  const room = createRoom(sim, { page: value }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", JSON.parse(JSON.stringify(value)));
  a.start();
  await sim.run(1000);
  a.caret = 3;
  a.type("!");
  await sim.idle(3000);
  const z = room.transport("z");
  z.start({ open() {}, close() {}, frame() {}, writer() {} });
  room.open("z");
  z.send("z", { name: "page", n: 1, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "r"], value: { t: "paragraph", pos: "V", c: "Third." } }] });
  await sim.idle(3000);
  expect(a.blocks().map(([id]) => id)).toEqual(["p", "q", "r"]);
  a.caret = 4;
  a.type("?");
  await sim.idle(3000);
  const blocks = room.stores.get("page").value.blocks;
  expect(blocks.p.c).toBe("The!? quick fox.");
  expect(blocks.p.pos < blocks.q.pos && blocks.q.pos < blocks.r.pos).toBe(true);
  a.binding.dispose();
});

test("a data API write of a formatted block's text alone leaves it without marks, in every tab and in the record", async () => {
  const sim = new Sim(10);
  const value = { blocks: { p: { t: "paragraph", pos: "M", c: "The quick fox.", m: ["", "", "", "", "b", "b", "b", "b", "b", "", "", "", "", ""] } }, deleted: {} };
  const room = createRoom(sim, { page: value }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", JSON.parse(JSON.stringify(value)));
  const b = makeTab(sim, room, "b", JSON.parse(JSON.stringify(value)));
  a.start();
  b.start();
  await sim.run(1000);
  a.caret = 13;
  a.type("!", "i");
  await sim.idle(3000);
  const z = room.transport("z");
  z.start({ open() {}, close() {}, frame() {}, writer() {} });
  room.open("z");
  z.send("z", { name: "page", n: 1, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "p", "c"], value: "The quick brown fox!." }] });
  await sim.idle(5000);
  for (const t of [a, b]) {
    expect(t.view).toBe("The quick brown fox!.");
    expect(t.marks.every((k) => k === "")).toBe(true);
  }
  const stored = room.stores.get("page").value.blocks.p;
  expect(stored.c).toBe("The quick brown fox!.");
  expect((Array.isArray(stored.m) ? stored.m : []).flat().filter((k) => typeof k === "string" && k)).toEqual([]);
  a.binding.dispose();
  b.binding.dispose();
});
