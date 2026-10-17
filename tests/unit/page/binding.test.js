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
