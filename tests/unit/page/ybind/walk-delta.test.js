import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, seedFrom, walk, authorKey } from "../../../../src/page/ybind/index.js";
import { LOCAL, NET, idKey } from "../../../../src/page/ybind/layout.js";
import { removeKey, textDeleteKey } from "../../../../src/page/ybind/recovery.js";
import { captureDelta, rewalk, walkSignature } from "../../../../src/page/ybind/walk-delta.js";

const A = 300;

const page = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, [
    { id: "p", text: "ALPHA" },
    { id: "q", text: "bravo" },
    { id: "r", text: "charlie" },
  ]);
  pd.ydoc.clientID = A;
  pd.origins.set(authorKey(1), "seed");
  pd.origins.set(authorKey(A), "A");
  return pd;
};

const markerOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) {
    if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return it;
  }
  throw new Error(`no live marker for ${id}`);
};

const atOf = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return at + 1;
    if (it.countable) at += it.length;
  }
  throw new Error(`no block at ${id}`);
};

const textOf = (seg) => seg.runs.map((r) => (r.br ? "\n" : r.hole !== undefined ? "" : r.text)).join("");

const totals = { equal: 0, refused: 0 };

// A page, the walk that stands for it, and the capture the bridge's afterTransaction
// listener does for every transaction the document finishes.
const open = () => {
  const pd = page();
  const s = { pd, w: walk(pd), captured: undefined };
  pd.ydoc.on("afterTransaction", (t) => { if (t.changed.size) s.captured = captureDelta(pd, t, s.w); });
  s.capture = (fn, origin = LOCAL) => { s.captured = undefined; pd.ydoc.transact(fn, origin); return s.captured; };
  s.equal = (c, id, deleted) => {
    expect(c).not.toBeNull();
    expect(c.marker.content.embed.b).toBe(id);
    expect(c.deleted).toBe(deleted);
    const next = rewalk(pd, s.w, c.marker);
    expect(next).not.toBeNull();
    expect(walkSignature(pd, next)).toBe(walkSignature(pd, walk(pd)));
    totals.equal += 1;
    s.w = walk(pd);
    return next;
  };
  s.refused = (c) => {
    expect(c).toBeNull();
    totals.refused += 1;
    s.w = walk(pd);
  };
  return s;
};

test("a one-block re-walk equals a full walk, and both refuse what they must", () => {
  const t = open();
  const { pd } = t;

  // 1. Insert text into block q.
  t.equal(t.capture(() => pd.flow.insert(atOf(pd, "q") + 1, "x")), "q", false);

  // 2. Delete one character in block q.
  t.equal(t.capture(() => pd.flow.delete(atOf(pd, "q") + 1, 1)), "q", true);

  // 3. Insert text carrying a bold format item into block q.
  t.equal(t.capture(() => pd.flow.insert(atOf(pd, "q") + 1, "y", { bold: true })), "q", false);

  // 4. Insert a line break embed into block q.
  t.equal(t.capture(() => pd.flow.insertEmbed(atOf(pd, "q") + 1, { br: 1 })), "q", false);

  // 5. Insert a new block marker embed and its attrs record.
  t.refused(t.capture(() => {
    pd.flow.insertEmbed(atOf(pd, "q") + 1, { b: "s" });
    const m = new Y.Map();
    m.set("t", "paragraph");
    pd.attrs.set("s", m);
  }));

  // 6. Change block q's type in pd.attrs.
  t.refused(t.capture(() => pd.attrs.get("q").set("t", "heading")));

  // 7. Set a removal record in pd.gone.
  t.refused(t.capture(() => pd.gone.set(removeKey(idKey(markerOf(pd, "r").id), "op-1"), { blockId: "r", end: null, sv: [] })));

  // 8. Set an origins record.
  t.refused(t.capture(() => pd.origins.set('["author",77]', "peer")));

  // 9. Text in block q and in block r in one transaction.
  t.refused(t.capture(() => {
    pd.flow.insert(atOf(pd, "q") + 1, "z");
    pd.flow.insert(atOf(pd, "r") + 1, "z");
  }));

  // 13. A text-delete record alone: the walk never reads one.
  t.refused(t.capture(() => {
    const it = (() => { for (let i = pd.flow._start; i; i = i.right) if (!i.deleted && i.content instanceof Y.ContentString) return i; })();
    pd.gone.set(textDeleteKey(it.id.client, it.id.clock, "op-3"), { length: 1, actor: pd.ydoc.clientID, sv: [] });
  }));

  // 14. Delete two characters in block p, which no earlier case touched.
  t.equal(t.capture(() => pd.flow.delete(atOf(pd, "p") + 1, 2)), "p", true);

  // 15. Re-format existing text in block p, with no text change.
  t.equal(t.capture(() => pd.flow.format(atOf(pd, "p"), 2, { bold: true })), "p", false);

  // 10. A remote update that types into block q.
  {
    const s = open();
    const doc = new Y.Doc();
    doc.clientID = 500;
    Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(s.pd.ydoc));
    const other = createPageDoc(doc);
    other.flow.insert(atOf(other, "q") + 1, "r");
    s.captured = undefined;
    Y.applyUpdateV2(s.pd.ydoc, Y.encodeStateAsUpdateV2(other.ydoc), NET);
    s.equal(s.captured, "q", false);
  }

  // 11. Typing in the block before a block removed with a removal record: the previous
  // walk ends that block with a hole, so the block has to be walked with the flow again.
  {
    const s = open();
    const brk = markerOf(s.pd, "r");
    const at = atOf(s.pd, "r") - 1;
    s.capture(() => {
      s.pd.gone.set(removeKey(idKey(brk.id), "op-2"), { blockId: "r", end: null, sv: [] });
      s.pd.flow.delete(at, 1);
    });
    s.w = walk(s.pd);
    const q = s.w.visible.find((seg) => seg.id === "q");
    expect(q.runs.some((r) => r.hole !== undefined)).toBe(true);
    expect(s.w.stops.some((stop) => stop.client === brk.id.client && brk.id.clock >= stop.clock && brk.id.clock < stop.clock + stop.len)).toBe(true);
    const c = s.capture(() => s.pd.flow.insert(atOf(s.pd, "q") + 1, "s"));
    expect(c).not.toBeNull();
    expect(c.marker.content.embed.b).toBe("q");
    expect(rewalk(s.pd, s.w, c.marker)).toBeNull();
    totals.refused += 1;
  }

  // 12. Typing in a block whose next marker was deleted without a record: the blocks are
  // joined, so the text past the deleted marker is in this block's runs.
  {
    const s = open();
    s.capture(() => s.pd.flow.delete(atOf(s.pd, "r") - 1, 1));
    s.w = walk(s.pd);
    const next = s.equal(s.capture(() => s.pd.flow.insert(atOf(s.pd, "q") + 1, "t")), "q", false);
    expect(textOf(next.visible.find((seg) => seg.id === "q"))).toContain("charlie");
  }

  expect(totals.equal).toBeGreaterThanOrEqual(8);
  expect(totals.refused).toBeGreaterThanOrEqual(7);
});
