import { createStore } from "../../../../src/live/store.js";
import { createFastLane } from "../../../../src/live/fast-lane.js";
import { createYProvider, docFromValue, entriesOf } from "../../../../src/page/ybind/provider.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";
import { Sim, createRoom } from "../collab/room-double.js";

async function runProbe(chars, count, maxEvents) {
  const blocks = Array.isArray(chars) ? chars : [{ id: "p", text: "x".repeat(chars) }];
  const initial = seedValue(blocks);
  const sim = new Sim();
  const room = createRoom(sim, { page: initial });
  const tabs = [];
  for (let i = 0; i < count; i++) {
    const id = "tab" + i;
    const store = createStore({ name: "page", value: initial });
    const ydoc = docFromValue(initial);
    ydoc.clientID = 10 + i;
    const compact = { keys: 32 };
    const provider = createYProvider({ store, ydoc, compact, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
    const transport = room.transport(id);
    const lane = createFastLane({ transport, entries: new Map([["page", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
    store.onLocal((ops) => lane.local("page", ops, store.mark));
    lane.start();
    room.open(id);
    tabs.push({ store, ydoc, provider, lane, compact });
  }
  let events = 0;
  while (sim.q.length && events < maxEvents) {
    const e = sim.q.shift();
    sim.t = e.t;
    e.fn();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    events++;
  }
  const finalValue = room.stores.get("page").value;
  const final = { time: sim.t, posts: room.posts, refusals: room.refused.length, bytes: room.stores.get("page").bytes, complete: entriesOf(finalValue.y).length, reloaded: docFromValue(finalValue).getText("flow").toString().length, tabs: tabs.map((t) => ({ pending: t.store.pending.length })) };
  for (const t of tabs) { t.provider.dispose(); t.lane.stop(); t.ydoc.destroy(); }
  return final;
}

test("two tabs never refuse and the room reloads the whole page", async () => {
  const final = await runProbe(600000, 2, 500);
  expect(final.refusals).toBe(0);
  expect(final.complete).toBeGreaterThanOrEqual(1);
  expect(final.reloaded).toBe(600000);
}, 240000);

test("three tabs cap the room and drop the duplicated copies", async () => {
  const final = await runProbe(80000, 3, 500);
  expect(final.complete).toBe(1);
  expect(final.bytes).toBeLessThan(150000);
}, 240000);

test("three tabs over a larger page never refuse and keep one complete entry", async () => {
  const final = await runProbe(140000, 3, 500);
  expect(final.refusals).toBe(0);
  expect(final.complete).toBe(1);
}, 240000);

test("a Document with about 1 MB of real text opens in a room without a refusal", async () => {
  const para = "The quick brown fox jumps over the lazy dog while the team reviews the launch plan and notes risks. ";
  const blocks = Array.from({ length: Math.round((1024 * 1024) / para.length) }, (_, i) => ({ id: `b${i}`, text: para }));
  const final = await runProbe(blocks, 2, 4000);
  expect(final.refusals).toBe(0);
  expect(final.complete).toBeGreaterThanOrEqual(1);
  expect(final.bytes).toBeLessThan(4 * 1024 * 1024);
  expect(final.reloaded).toBe(docFromValue(seedValue(blocks)).getText("flow").toString().length);
}, 240000);
