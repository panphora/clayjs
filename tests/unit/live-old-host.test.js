// A new client against a host still on the old 16 KB body cap. Round 7 review,
// Opus finding 2 and Astra finding 2: a multi-op frame the host answers 413 is
// packed again at 15 KB and sent again; only an op too large on its own is
// refused.
import { jest } from "@jest/globals";
import { Sim, createRoom, LIMITS } from "./page/collab/room-double.js";
import { createStore } from "../../src/live/store.js";
import { createFastLane, OLD_FRAME_BYTES } from "../../src/live/fast-lane.js";

let was, warn;
beforeEach(() => { was = LIMITS.bodyBytes; LIMITS.bodyBytes = 16 * 1024; warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { LIMITS.bodyBytes = was; warn.mockRestore(); });

function setup(value) {
  const sim = new Sim(1);
  const room = createRoom(sim, { board: value });
  const store = createStore({ name: "board", value });
  const lane = createFastLane({ transport: room.transport("a"), entries: new Map([["board", { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  store.onLocal((ops) => lane.local("board", ops, store.mark));
  lane.start();
  room.open("a");
  return { sim, room, store, lane };
}

test("one update of 100 cards (27 KB) lands in frames the old host takes", async () => {
  const { sim, room, store, lane } = setup({ cards: {} });
  await sim.run(500);
  store.handle.update((d) => { for (let i = 0; i < 100; i++) d.cards["c" + i] = { title: "card ".repeat(50), i }; });
  await sim.run(5000);
  lane.stop();
  expect(room.refused.map((r) => r.status)).toEqual([413]);
  expect(Object.keys(room.stores.get("board").value.cards)).toHaveLength(100);
  expect(Object.keys(store.value.cards)).toHaveLength(100);
  expect(store.pending).toEqual([]);
});

test("one op over 15 KB on its own is refused by the old host and undone", async () => {
  const { sim, room, store, lane } = setup({ cards: {} });
  await sim.run(500);
  store.handle.update((d) => { d.cards.small = 1; });
  await sim.run(1000);
  store.handle.update((d) => { d.cards.big = "x".repeat(20000); });
  await sim.run(5000);
  lane.stop();
  expect(room.stores.get("board").value.cards).toEqual({ small: 1 });
  expect(store.value.cards).toEqual({ small: 1 });
  expect(OLD_FRAME_BYTES).toBe(15 * 1024);

});
