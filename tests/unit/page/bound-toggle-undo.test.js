import { history as pmHistory } from "../../../src/vendor/prosemirror.vendor.js";
import { Sim, createRoom } from "./collab/room-double.js";
import { makeTab } from "./collab/blocks/editor-tab.js";

/**
 * A toggle with a body, deleted and then undone in a bound editor, must come
 * back with its body still attached to it: in the tab that undid, in another
 * tab, and in the shared record. The binding re-ids a restored block that was
 * deleted, so this is the case that can leave the body pointing at a toggle id
 * that no longer exists.
 */

const record = () => ({
  blocks: {
    t: { t: "toggle", pos: "M", c: "Summary", open: true },
    b1: { t: "paragraph", pos: "N", parent: "t", c: "body one" },
    b2: { t: "paragraph", pos: "O", parent: "t", c: "body two" },
    q: { t: "paragraph", pos: "V", c: "" },
  },
  deleted: {},
});

const rowsOf = (doc) => {
  const rows = [];
  doc.forEach((n) => rows.push({ id: n.attrs.id, type: n.type.name, text: n.textContent, parent: n.attrs.parent ?? null }));
  return rows;
};
const detached = (rows) => {
  const toggles = new Set(rows.filter((r) => r.type === "toggle").map((r) => r.id));
  return rows.filter((r) => r.parent !== null && !toggles.has(r.parent)).map((r) => r.text);
};

async function setup() {
  const sim = new Sim(11);
  const room = createRoom(sim, { page: record() }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeTab(sim, room, "a", record());
  const b = makeTab(sim, room, "b", record());
  a.start();
  b.start();
  await sim.run(1000);
  return { sim, room, a, b };
}

// S1 fixed the binding's re-id of a restored block (binding.js): a block
// whose parent was renamed follows the rename.
test("a toggle with a body deleted and undone is whole again in both tabs and in the record", async () => {
  const { sim, room, a, b } = await setup();
  try {
    const ed = a.editor;
    const doc = ed.state.doc;
    ed.dispatch(ed.state.tr.delete(0, doc.child(0).nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize));
    await sim.run(3000);
    expect(rowsOf(b.editor.state.doc).map((r) => r.text)).toEqual([""]);
    pmHistory.undo(ed.state, ed.dispatch);
    await sim.run(6000);
    const recordRows = Object.entries(room.stores.get("page").value.blocks).map(([id, x]) => ({ id, type: x.t, text: x.c, parent: x.parent ?? null }));
    expect(detached(rowsOf(a.editor.state.doc))).toEqual([]);
    expect(detached(rowsOf(b.editor.state.doc))).toEqual([]);
    expect(detached(recordRows)).toEqual([]);
    expect(rowsOf(a.editor.state.doc).map((r) => r.text)).toEqual(["Summary", "body one", "body two", ""]);
  } finally {
    a.binding.dispose();
    b.binding.dispose();
    a.editor.destroy?.();
    b.editor.destroy?.();
  }
});
