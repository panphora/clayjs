// Round 11 review, Opus 3: a store the room never held (too large, too many
// stores, or a tag added after the room opened) has no frames to miss, so it
// must not make every read a whole read: a reconnect reads since this tab's
// seq, and a broadcast state applies as it comes.
import { Sim, createRoom } from "./room-double.js";
import { createStore } from "../../../../src/live/store.js";
import { createFastLane } from "../../../../src/live/fast-lane.js";

test("Opus 3: a store that was never in the room leaves reconnects on since, and broadcasts apply directly", async () => {
  console.warn = () => {};
  const sim = new Sim(1);
  const room = createRoom(sim, { s: { n: 0 } });
  const reads = [];
  const base = room.transport("a");
  const transport = {
    ...base,
    fetchState: (id, since) => {
      reads.push({ at: sim.now(), since: since ? `${since.epoch}:${since.seq}` : null });
      return base.fetchState(id, since);
    },
  };
  const s = createStore({ name: "s", value: { n: 0 } });
  const big = createStore({ name: "big", value: { x: 0 } });
  const lane = createFastLane({ transport, entries: new Map([["s", { store: s }], ["big", { store: big }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer });
  s.onLocal((ops) => lane.local("s", ops, s.mark));
  lane.start();
  room.open("a");
  await sim.run(100);
  for (let i = 0; i < 5; i++) sim.at(200 + i * 100, () => s.handle.add("n", 1));
  await sim.run(1000);
  sim.at(1100, () => { room.close("a"); room.open("a"); });
  sim.at(1500, () => room.clients.get("a").handlers.state(room.state("a")));
  sim.at(1800, () => room.clients.get("a").handlers.state(room.state("a")));
  sim.at(2200, () => { room.close("a"); room.open("a"); });
  await sim.run(3000);
  expect({ s: s.handle.status.mode, big: big.handle.status.mode }).toEqual({ s: "fast", big: "file" });
  expect(s.value).toEqual({ n: 5 });
  expect(reads).toEqual([
    { at: 0, since: null },
    { at: 1100, since: "e1:5" },
    { at: 2200, since: "e1:5" },
  ]);
});
