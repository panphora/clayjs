// A write the room refuses leaves the binding's recovery bookkeeping
// (B.unechoed): the heal check is not held up by it, and a later room loss
// never heals it back. Round 8 review, Astra 5 and Opus 4, in the reviewers'
// fixture shapes.
import { jest } from "@jest/globals";
import { Sim, createRoom } from "./room-double.js";
import { engine } from "./blocks/editor-tab.js";

let warn;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());
const copy = (v) => JSON.parse(JSON.stringify(v));

test("Opus 4: a refused write is not healed back into the room by the next room loss", async () => {
  const sim = new Sim(3), initial = engine.initial("Start.");
  let refuseNext = false;
  const room = createRoom(sim, { page: copy(initial) }, { latency: () => 60, answerLatency: () => 60, refuse: () => (refuseNext ? ((refuseNext = false), { status: 413, body: { code: "too-large" } }) : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  a.start();
  await sim.run(500);
  sim.at(600, () => { refuseNext = true; a.caret = 6; a.type(" refused"); });
  await sim.run(3000);
  expect({ view: a.view, unechoed: a.binding.blocks.get("p").unechoed.length }).toEqual({ view: "Start.", unechoed: 0 });
  sim.at(5000, () => room.restart({ page: copy(room.stores.get("page").value) }));
  await sim.run(20000);
  await sim.idle(5000);
  const out = { view: a.view, room: room.stores.get("page").value.blocks.p.c, notices: a.allNotices().map((n) => [n.kind, n.lost]) };
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
  expect(out).toEqual({ view: "Start.", room: "Start.", notices: [["refused", " refused"]] });
});

test("Astra 5: a write refused while the heal check is armed lets the check finish, and a later loss does not bring it back", async () => {
  const sim = new Sim(), initial = engine.initial("Start.");
  const room = createRoom(sim, { page: initial }, { refuse: () => (sim.now() >= 2550 && sim.now() < 2700 ? { status: 413, body: { code: "too-large" } } : null) });
  const a = engine.makeTab(sim, room, "a", copy(initial));
  a.start();
  let file;
  sim.at(600, () => { a.caret = 6; a.type(" alpha"); });
  sim.at(1900, () => { file = copy(room.stores.get("page").value); room.land("page", room.seq); });
  sim.at(2000, () => room.restart({ page: copy(file) }));
  sim.at(2600, () => { a.caret = 12; a.type(" beta"); });
  await sim.run(20000);
  const B = a.binding.blocks.get("p");
  expect({ view: a.view, pending: a.store.pending.length, unechoed: B.unechoed.length, armed: B.heal.armed }).toEqual({ view: "Start. alpha", pending: 0, unechoed: 0, armed: false });
  room.restart({ page: copy(file) });
  await sim.run(30000);
  const out = { view: a.view, room: room.stores.get("page").value.blocks.p.c, notices: a.allNotices().map((n) => [n.kind, n.lost]) };
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
  expect(out).toEqual({ view: "Start. alpha", room: "Start. alpha", notices: [["refused", " beta"]] });
});
