// A block written whole (an image, a divider, a table) across a room loss
// (round 10, rule 1): this tab's last write to it comes back when no peer
// wrote it in the new epoch; a peer's write wins, with a heal notice that keeps
// this tab's value; a lost delete comes back, unless a peer changed the block.
import { jest } from "@jest/globals";
import { Sim, createRoom } from "./room-double.js";
import { engine, find } from "./blocks/editor-tab.js";

let warn;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());
const copy = (v) => JSON.parse(JSON.stringify(v));
const initial = () => ({
  blocks: {
    p: { t: "paragraph", pos: "M", c: "Start." },
    i: { t: "image", pos: "N", src: "a.png", caption: "one" },
    q: { t: "paragraph", pos: "V", c: "" },
  },
  deleted: {},
});

function setup() {
  const sim = new Sim(3);
  const room = createRoom(sim, { page: initial() }, { latency: () => 60, answerLatency: () => 60 });
  const a = engine.makeTab(sim, room, "a", initial());
  const b = engine.makeTab(sim, room, "b", initial());
  a.start(); b.start();
  return { sim, room, a, b };
}
const caption = (t, text) => {
  const ed = t.editor, f = find(ed.state.doc, "i");
  ed.dispatch(ed.state.tr.setNodeMarkup(f.pos, null, { ...f.node.attrs, caption: text }));
};
const removeImage = (t) => {
  const ed = t.editor, f = find(ed.state.doc, "i");
  ed.dispatch(ed.state.tr.delete(f.pos, f.pos + f.node.nodeSize));
};
const image = (t) => { const f = find(t.editor.state.doc, "i"); return f ? f.node.attrs.caption : null; };
function result(room, a, b) {
  const v = room.stores.get("page").value;
  const out = {
    room: v.deleted?.i ? null : v.blocks.i?.caption ?? null,
    a: image(a), b: image(b),
    notices: [...a.allNotices(), ...b.allNotices()].map((n) => [n.kind, n.lost, n.block?.caption ?? null]),
  };
  for (const t of [a, b]) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); }
  return out;
}

test("rule 1: a whole-block write lost with the room comes back, with no notice", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => caption(a, "two"));
  sim.at(1000, () => room.restart({ page: initial() }));
  await sim.run(10000);
  await sim.idle(3000);
  expect(result(room, a, b)).toEqual({ room: "two", a: "two", b: "two", notices: [] });
});

test("rule 1: a whole-block write still unechoed at the loss comes back", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => caption(a, "two"));
  sim.at(640, () => room.restart({ page: initial() }));
  await sim.run(10000);
  await sim.idle(3000);
  expect(result(room, a, b)).toEqual({ room: "two", a: "two", b: "two", notices: [] });
});

test("rule 1: a peer's write in the new epoch wins over the lost write, with a heal notice that keeps it", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => caption(a, "two"));
  sim.at(1000, () => room.close("a"));
  sim.at(1100, () => room.restart({ page: initial() }));
  sim.at(2000, () => caption(b, "peer"));
  sim.at(3000, () => room.open("a"));
  await sim.run(10000);
  await sim.idle(3000);
  expect(result(room, a, b)).toEqual({ room: "peer", a: "peer", b: "peer", notices: [["heal", "", "two"]] });
});

test("rule 1: a delete lost with the room comes back", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => removeImage(a));
  sim.at(1000, () => room.restart({ page: initial() }));
  await sim.run(10000);
  await sim.idle(3000);
  expect(result(room, a, b)).toEqual({ room: null, a: null, b: null, notices: [] });
});

// Both tabs that saw the delete are away; tab c opens the new epoch from the
// file, which still has the block, and changes it.
test("rule 1: a lost delete of a block a peer changed in the new epoch is not sent again, and nothing is noticed", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => removeImage(a));
  sim.at(1000, () => { room.close("a"); room.close("b"); });
  sim.at(1100, () => room.restart({ page: initial() }));
  const c = engine.makeTab(sim, room, "c", initial());
  sim.at(1500, () => c.start());
  sim.at(2000, () => caption(c, "peer"));
  sim.at(3000, () => { room.open("a"); room.open("b"); });
  await sim.run(10000);
  await sim.idle(3000);
  const cView = image(c), cNotices = c.allNotices().length;
  c.binding.dispose(); c.editor.destroy(); c.lane.stop();
  expect({ ...result(room, a, b), c: cView, cNotices }).toEqual({ room: "peer", a: "peer", b: "peer", notices: [], c: "peer", cNotices: 0 });
});

test("rule 1: a table is one value: a cell edit lost with the room comes back", async () => {
  const sim = new Sim(3);
  const init = () => ({ blocks: { p: { t: "paragraph", pos: "M", c: "Start." }, tb: { t: "table", pos: "N", cols: { c1: "M" }, rows: { r1: { pos: "M", cells: { c1: "x" } } } }, q: { t: "paragraph", pos: "V", c: "" } }, deleted: {} });
  const room = createRoom(sim, { page: init() }, { latency: () => 60, answerLatency: () => 60 });
  const a = engine.makeTab(sim, room, "a", init()), b = engine.makeTab(sim, room, "b", init());
  a.start(); b.start();
  await sim.run(500);
  sim.at(600, () => {
    const ed = a.editor, f = find(ed.state.doc, "tb");
    let at = null;
    f.node.descendants((n, pos) => { if (at === null && n.isText) at = f.pos + 1 + pos; });
    ed.dispatch(ed.state.tr.insertText("y", at + 1));
  });
  sim.at(1000, () => room.restart({ page: init() }));
  await sim.run(10000);
  await sim.idle(3000);
  const cell = (t) => { let c = null; find(t.editor.state.doc, "tb").node.descendants((n) => { if (c === null && n.type.name === "table_cell") c = n.textContent; }); return c; };
  const out = { room: room.stores.get("page").value.blocks.tb.rows.r1.cells.c1, a: cell(a), b: cell(b), notices: [...a.allNotices(), ...b.allNotices()].length };
  for (const t of [a, b]) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); }
  expect(out).toEqual({ room: "xy", a: "xy", b: "xy", notices: 0 });
});

// Round 11 review, Astra 1: b writes the caption at 600 ms, a at 620 ms, and
// the room orders b's first. b's value reaching a before a's echo is ordered
// before a's write, so it must not end a's claim: a's echo makes "mine" the
// latest value a tab can heal. Then the room restarts from the file.
for (const gap of [20, 200]) {
  test(`Astra 1: a peer's earlier write does not erase the claim of a later own whole write (a ${gap} ms after b)`, async () => {
    const { sim, room, a, b } = setup();
    await sim.run(500);
    sim.at(600, () => caption(b, "peer"));
    sim.at(600 + gap, () => caption(a, "mine"));
    await sim.run(1000);
    expect([room.stores.get("page").value.blocks.i.caption, image(a), image(b)]).toEqual(["mine", "mine", "mine"]);
    room.restart({ page: initial() });
    await sim.run(10000);
    await sim.idle(3000);
    const heals = a.heals;
    expect({ ...result(room, a, b), heals }).toEqual({ room: "mine", a: "mine", b: "mine", notices: [], heals: 1 });
  });
}

test("a peer's write ordered after this tab's echoed write ends this tab's claim: the peer's value heals", async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  sim.at(600, () => caption(a, "mine"));
  sim.at(900, () => caption(b, "peer"));
  await sim.run(1300);
  room.restart({ page: initial() });
  await sim.run(10000);
  await sim.idle(3000);
  const heals = [a.heals, b.heals];
  expect({ ...result(room, a, b), heals }).toEqual({ room: "peer", a: "peer", b: "peer", notices: [], heals: [0, 1] });
});

test('Astra 2 whole-equal-pending: an earlier equal peer write cannot consume a later own identity', async () => {
  const { sim, room, a, b } = setup();
  const c = engine.makeTab(sim, room, 'c', initial());
  c.start();
  await sim.run(500);
  sim.at(600, () => caption(b, 'mine'));
  sim.at(610, () => caption(c, 'peer'));
  sim.at(620, () => caption(a, 'mine'));
  await sim.run(1000);
  expect([image(a), image(b), image(c)]).toEqual(['mine', 'mine', 'mine']);
  expect(a.binding.blocks.get('i').mine.value.caption).toBe('mine');
  room.restart({ page: initial() });
  await sim.run(10000);
  await sim.idle(3000);
  const cImage = image(c), cNotices = c.allNotices();
  c.binding.dispose(); c.editor.destroy(); c.lane.stop();
  const heals = [a.heals, b.heals, c.heals];
  expect({ ...result(room, a, b), c: cImage, cNotices, heals }).toEqual({ room: 'mine', a: 'mine', b: 'mine', notices: [], c: 'mine', cNotices: [], heals: [1, 0, 0] });
});

test('an equal peer write ordered after the own echo ends the old claim by identity', async () => {
  const { sim, room, a, b } = setup();
  await sim.run(500);
  room.close('b');
  caption(a, 'mine');
  await sim.run(1000);
  caption(b, 'mine');
  room.open('b');
  await sim.run(1500);
  expect(a.binding.blocks.get('i').mine).toBeNull();
  room.restart({ page: initial() });
  await sim.run(10000);
  const heals = [a.heals, b.heals];
  expect({ ...result(room, a, b), heals }).toEqual({ room: 'mine', a: 'mine', b: 'mine', notices: [], heals: [0, 1] });
});
