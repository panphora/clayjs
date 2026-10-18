/**
 * Adoption through S1's real binding, store and fast lane on S1's room double
 * (all imported read-only): a hand edit reaches the room as ops on the edited
 * blocks only, and a second tab sees it.
 */
import { Sim, createRoom } from "./collab/room-double.js";
import { makeTab } from "./collab/blocks/editor-tab.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project, renderModel, revOf, parseModel } from "../../../src/page/projection.js";
import { planAdoption, adoptionTransaction } from "../../../src/page/adopt.js";

const clone = (v) => JSON.parse(JSON.stringify(v));

function fileOf(record) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  return `<!DOCTYPE html><html><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">\n${renderModel(model)}\n</article></body></html>`;
}

test("a hand edit becomes ops on the edited blocks only, and a peer sees it", async () => {
  const init = clone(RECORD);
  delete init.blocks.tool; // the editor-tab harness has no tool node view; not needed here
  const sim = new Sim(7);
  const room = createRoom(sim, { page: clone(init) });
  const a = makeTab(sim, room, "A", clone(init));
  const b = makeTab(sim, room, "B", clone(init));
  a.start(); b.start();
  await sim.idle();
  const seqBefore = room.seq;

  // The file on disk, edited by hand: one word, one new paragraph, one deletion.
  const d = new DOMParser().parseFromString(fileOf(init), "text/html");
  d.querySelector('[data-id="p1"]').firstChild.data = "Activation recovered to 64%. ";
  const p = d.createElement("p"); p.textContent = "Added in a text editor"; d.querySelector('[data-id="h2"]').after(p);
  d.querySelector('[data-id="after"]').remove();
  const article = new DOMParser().parseFromString("<!DOCTYPE html>" + d.documentElement.outerHTML, "text/html").querySelector("article");

  const base = blocksOfValues([init]);
  const parsed = parseModel(article, { seed: article.getAttribute("data-rev"), known: new Map(project(base).map((i) => [i.id, i])) });
  expect(revOf(parsed)).not.toBe(article.getAttribute("data-rev"));
  const tr = adoptionTransaction(a.editor.state, planAdoption(base, parsed));
  a.editor.dispatch(tr);
  await sim.idle();

  const value = room.stores.get("page").value;
  const touched = new Set();
  for (const entry of room.stores.get("page").log) if (entry.seq > seqBefore) for (const op of entry.ops) touched.add(op.path[1]);
  const added = Object.keys(value.blocks).filter((id) => !init.blocks[id]);
  expect(added).toHaveLength(1);
  expect([...touched].sort()).toEqual(["after", "p1", added[0]].sort());
  expect(value.blocks.p1.c.startsWith("Activation recovered to 64%.")).toBe(true);
  expect(value.deleted.after).toBe(true);
  // The peer's editor holds the same document.
  expect(b.blocks()).toEqual(a.blocks());
  expect(b.blocks().map(([id]) => id)).toContain(added[0]);
});
