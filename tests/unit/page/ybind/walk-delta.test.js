import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, seedFrom, walk, authorKey } from "../../../../src/page/ybind/index.js";
import { LOCAL, NET, idKey } from "../../../../src/page/ybind/layout.js";
import { removeKey, textDeleteKey } from "../../../../src/page/ybind/recovery.js";
import { captureDelta, rewalk, walkSignature } from "../../../../src/page/ybind/walk-delta.js";
import { createOriginIndex } from "../../../../src/page/ybind/origins.js";
import { moveBlocks } from "../../../../src/page/ybind/moves.js";
import { ctxAt } from "../../../../src/page/ybind/writer.js";

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
    const next = rewalk(pd, s.w, c.marker, c);
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

  // 5. Insert a new block marker embed and its attrs record: a split of block q.
  const next = t.equal(t.capture(() => {
    pd.flow.insertEmbed(atOf(pd, "q") + 1, { b: "s" });
    const m = new Y.Map();
    m.set("t", "paragraph");
    pd.attrs.set("s", m);
  }), "q", false);
  expect(next.visible.map((seg) => seg.id)).toEqual(["p", "q", "s", "r"]);

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

  // 16. The same split made by another tab: records this tab already holds may name its id.
  {
    const s = open();
    const doc = new Y.Doc();
    doc.clientID = 500;
    Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(s.pd.ydoc));
    const other = createPageDoc(doc);
    other.ydoc.transact(() => {
      other.flow.insertEmbed(atOf(other, "q") + 1, { b: "u" });
      const m = new Y.Map();
      m.set("t", "paragraph");
      other.attrs.set("u", m);
    });
    s.captured = undefined;
    Y.applyUpdateV2(s.pd.ydoc, Y.encodeStateAsUpdateV2(other.ydoc), NET);
    s.refused(s.captured);
  }

  expect(totals.equal).toBeGreaterThanOrEqual(9);
  expect(totals.refused).toBeGreaterThanOrEqual(7);
});

// A block whose marker appears more than once in the flow is a moved copy, and the walk
// records its items with absolute positions. Typing in a block before it leaves those
// positions one character behind unless the re-walk shifts them like the hidden entries.
test("a one-block re-walk shifts the items of a moved copy after it", () => {
  const s = open();
  const { pd } = s;
  const appendCopy = (id, text) => {
    pd.flow.insertEmbed(pd.flow.length, { b: id });
    const attrs = new Y.Map();
    attrs.set("t", "paragraph");
    pd.attrs.set(id, attrs);
    pd.flow.insert(pd.flow.length, text);
  };
  pd.ydoc.transact(() => {
    appendCopy("s", "sierra");
    appendCopy("s", "sierra again");
  });
  s.captured = undefined;
  s.w = walk(pd);
  expect(s.w.visible.some((seg) => seg.id === "s" && seg.items?.length > 0)).toBe(true);

  const c = s.capture(() => pd.flow.insert(atOf(pd, "q") + 1, "x"));
  expect(c).not.toBeNull();
  expect(c.marker.content.embed.b).toBe("q");
  const next = rewalk(pd, s.w, c.marker);
  expect(next).not.toBeNull();
  expect(walkSignature(pd, next)).toBe(walkSignature(pd, walk(pd)));
  totals.equal += 1;
});

// The position just past the last live marker of a block: a moved block's visible copy.
const copyAt = (pd, id) => {
  let at = 0, found = -1;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) found = at + 1;
    if (it.countable) at += it.length;
  }
  if (found < 0) throw new Error(`no block at ${id}`);
  return found;
};

// A moved block keeps its old marker live under the removal that hides it, so its one
// visible copy records its items. Typing in that copy, or in a block before it, is walked
// again on its own; a second visible copy of the same block is the full walk's case.
test("a one-block re-walk of a moved block keeps its items equal to a full walk", () => {
  const s = open();
  const { pd } = s;
  const origins = createOriginIndex(pd.origins);
  const moved = moveBlocks({ pd, view: null, um: null, origins, render: () => {} }, { ids: ["p"], afterId: "r" });
  expect(moved.status).toBe("moved");
  s.w = walk(pd);
  const copy = s.w.visible.find((seg) => seg.id === "p");
  expect(copy.items?.length).toBeGreaterThan(0);
  expect(s.w.copies.has("p")).toBe(false);

  const typed = s.equal(s.capture(() => pd.flow.insert(copyAt(pd, "p") + 2, "zz", { bold: true })), "p", false);
  expect(typed.visible.find((seg) => seg.id === "p").items.map((item) => item.text).join("")).toContain("zz");
  s.equal(s.capture(() => pd.flow.insertEmbed(copyAt(pd, "p") + 1, { br: 1 })), "p", false);
  s.equal(s.capture(() => pd.flow.delete(copyAt(pd, "p") + 3, 2)), "p", true);
  s.equal(s.capture(() => pd.flow.insert(atOf(pd, "q") + 1, "before the copy")), "q", false);
  s.equal(s.capture(() => pd.flow.format(copyAt(pd, "p"), 2, { italic: true })), "p", false);

  origins.dispose();
});

// Two people move the same block at once: both copies are visible until the post pass
// hides the later one, and while their text is equal the hidden one is no orphan. Typing
// in the winner makes them differ, which only a full walk sees.
test("a one-block re-walk refuses the winning copy of a block two people moved", () => {
  const base = page();
  const peer = (client) => {
    const doc = new Y.Doc();
    doc.clientID = client;
    Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(base.ydoc));
    return createPageDoc(doc);
  };
  const a = peer(400), b = peer(500);
  for (const [pd, afterId] of [[a, "r"], [b, "q"]]) {
    const origins = createOriginIndex(pd.origins);
    expect(moveBlocks({ pd, view: null, um: null, origins, render: () => {} }, { ids: ["p"], afterId }).status).toBe("moved");
    origins.dispose();
  }
  Y.applyUpdateV2(a.ydoc, Y.encodeStateAsUpdateV2(b.ydoc), NET);
  const before = walk(a);
  expect(before.copies.has("p")).toBe(true);
  expect(before.orphans).toEqual([]);
  const winner = before.visible.find((seg) => seg.id === "p").brk;
  let at = 0;
  for (let it = a.flow._start; it && !(it.id.client === winner.client && it.id.clock === winner.clock); it = it.right) if (!it.deleted && it.countable) at += it.length;
  let captured = null;
  a.ydoc.on("afterTransaction", (t) => { captured = captureDelta(a, t, before); });
  a.ydoc.transact(() => a.flow.insert(at + 1, "w"), LOCAL);
  expect(captured.marker.id).toEqual(winner);
  expect(rewalk(a, before, captured.marker)).toBeNull();
  expect(walk(a).orphans.length).toBe(1);
  totals.refused += 1;
});

// A removed block keeps its marker live under its removal record, so the block before it
// ends in a hidden run, and a block whose next marker was deleted with it goes on after
// that run. Typing up to the first hidden run is walked again on its own, as long as no
// format item changed; the hidden run and what follows it only move.
test("a one-block re-walk of a block with a hidden run equals a full walk", () => {
  const s = open();
  const { pd } = s;
  const peer = new Y.Doc();
  peer.clientID = 600;
  Y.applyUpdateV2(peer, Y.encodeStateAsUpdateV2(pd.ydoc));
  const late = createPageDoc(peer);
  late.flow.insert(atOf(late, "q") + 2, "late");
  const q = markerOf(pd, "q"), r = markerOf(pd, "r");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(idKey(q.id), "op-9"), { blockId: "q", end: idKey(r.id), sv: [] });
    pd.flow.delete(atOf(pd, "q"), "bravo".length);
    pd.flow.delete(atOf(pd, "r") - 1, 3);
  }, LOCAL);
  Y.applyUpdateV2(pd.ydoc, Y.encodeStateAsUpdateV2(peer), NET);
  s.w = walk(pd);
  const p = s.w.visible.find((seg) => seg.id === "p");
  expect(p.runs.some((run) => run.hole !== undefined)).toBe(true);
  expect(textOf(p)).toBe("ALPHAarlie");
  expect(s.w.hidden.some((entry) => entry.blockId === "q" && entry.items.some((item) => item.text === "late"))).toBe(true);

  const equalFlat = (c, deleted) => {
    expect(c.marker.content.embed.b).toBe("p");
    expect(c.deleted).toBe(deleted);
    expect(c.formats).toBe(false);
    const next = rewalk(pd, s.w, c.marker, c);
    expect(next).not.toBeNull();
    expect(walkSignature(pd, next)).toBe(walkSignature(pd, walk(pd)));
    totals.equal += 1;
    s.w = next;
  };
  equalFlat(s.capture(() => pd.flow.insert(atOf(pd, "p") + 2, "xyz")), false);
  equalFlat(s.capture(() => pd.flow.delete(atOf(pd, "p") + 1, 4)), true);
  equalFlat(s.capture(() => pd.flow.insertEmbed(atOf(pd, "p") + 1, { br: 1 })), false);

  const bold = s.capture(() => pd.flow.insert(atOf(pd, "p") + 1, "b", { bold: true }));
  expect(bold.formats).toBe(true);
  expect(rewalk(pd, s.w, bold.marker, bold)).toBeNull();
  totals.refused += 1;
  s.w = walk(pd);

  const after = s.capture(() => pd.flow.insert(pd.flow.length - 2, "after the hidden run"));
  expect(after === null || after.marker.content.embed.b !== "p" || rewalk(pd, s.w, after.marker, after) === null).toBe(true);
});

// A removal whose own marker was deleted opens the hidden region at that deleted item, and
// text a peer typed into the removed block stays live inside the region. Re-walking the
// block that holds it would take that text for the block's own, so it takes the full walk.
test("a one-block re-walk refuses a block whose hidden region holds live text", () => {
  const s = open();
  const { pd } = s;
  const peer = new Y.Doc();
  peer.clientID = 700;
  Y.applyUpdateV2(peer, Y.encodeStateAsUpdateV2(pd.ydoc));
  const late = createPageDoc(peer);
  late.flow.insert(atOf(late, "q") + 3, "late");
  const q = markerOf(pd, "q"), r = markerOf(pd, "r");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(idKey(q.id), "op-7"), { blockId: "q", end: idKey(r.id), sv: [] });
    pd.flow.delete(atOf(pd, "q") - 1, "bravo".length + 1);
  }, LOCAL);
  Y.applyUpdateV2(pd.ydoc, Y.encodeStateAsUpdateV2(peer), NET);
  s.w = walk(pd);
  const p = s.w.visible.find((seg) => seg.id === "p");
  expect(p.runs.some((run) => run.hole !== undefined)).toBe(true);
  expect(s.w.hidden.some((entry) => entry.blockId === "q" && entry.items.some((item) => item.text === "late"))).toBe(true);
  expect(s.w.stops.length).toBeGreaterThan(0);

  const c = s.capture(() => pd.flow.insert(atOf(pd, "p") + 1, "x"));
  expect(c.marker.content.embed.b).toBe("p");
  expect(rewalk(pd, s.w, c.marker, c)).toBeNull();
  totals.refused += 1;
});

test("a one-block re-walk of a moved block with a hidden run keeps its items equal to a full walk", () => {
  const s = open();
  const { pd } = s;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(pd.flow.length, { b: "s" });
    const attrs = new Y.Map();
    attrs.set("t", "paragraph");
    pd.attrs.set("s", attrs);
    pd.flow.insert(pd.flow.length, "sierra");
  }, LOCAL);
  const origins = createOriginIndex(pd.origins);
  expect(moveBlocks({ pd, view: null, um: null, origins, render: () => {} }, { ids: ["p"], afterId: "q" }).status).toBe("moved");
  origins.dispose();
  const r = markerOf(pd, "r"), sierra = markerOf(pd, "s");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(idKey(r.id), "op-8"), { blockId: "r", end: idKey(sierra.id), sv: [] });
    pd.flow.delete(atOf(pd, "r"), 3);
    pd.flow.delete(atOf(pd, "s") - 1, 2);
  }, LOCAL);
  s.w = walk(pd);
  const copy = s.w.visible.find((seg) => seg.id === "p");
  expect(textOf(copy)).toBe("ALPHAierra");
  expect(copy.items.length).toBeGreaterThan(0);
  expect(copy.runs.findIndex((run) => run.hole !== undefined)).toBeLessThan(copy.runs.length - 1);
  const c = s.capture(() => pd.flow.insert(copyAt(pd, "p") + 1, "moved and typed"));
  expect(c.formats).toBe(false);
  const next = rewalk(pd, s.w, c.marker, c);
  expect(next).not.toBeNull();
  expect(walkSignature(pd, next)).toBe(walkSignature(pd, walk(pd)));
  totals.equal += 1;
});

// Enter inside a block inserts one marker, carrying the formats in force there as the
// writer does, and the new block's attribute map. The block is walked again from its own
// marker, ends at the new one, and the new block takes the rest of the extent, hidden runs
// included.
const splitAt = (pd, at, id) => pd.flow.insertEmbed(at, { b: id }, Object.fromEntries(ctxAt(pd, at)));

test("a split walks the block it splits again and opens the new block, equal to a full walk", () => {
  const s = open();
  const { pd } = s;
  const split = (at, id, t = "paragraph", also = () => {}) => s.capture(() => {
    splitAt(pd, at, id);
    const m = new Y.Map();
    m.set("t", t);
    pd.attrs.set(id, m);
    also();
  });
  s.equal(s.capture(() => pd.flow.format(atOf(pd, "q") + 1, 3, { strong: true })), "q", false);
  const inBold = s.equal(split(atOf(pd, "q") + 2, "s1"), "q", false);
  const opened = inBold.visible.find((seg) => seg.id === "s1");
  expect(opened.fmtIn).toEqual({ strong: true });
  expect(opened.runs[0].marks.map((mark) => mark.type.name)).toEqual(["strong"]);
  s.equal(split(atOf(pd, "q"), "s2"), "q", false);
  s.equal(split(atOf(pd, "r") + "charlie".length, "s3"), "r", false);
  s.equal(split(atOf(pd, "p") + 3, "s4", "heading"), "p", false);
  const code = s.equal(split(atOf(pd, "s1") + 1, "s9", "code_block"), "s1", false);
  expect(code.visible.find((seg) => seg.id === "s9").runs[0].marks).toEqual([]);
  expect(walk(pd).visible.map((seg) => seg.id)).toEqual(["p", "s4", "q", "s2", "s1", "s9", "r", "s3"]);

  const atom = split(atOf(pd, "r") + 2, "s8", "divider");
  expect(atom.split).toBeTruthy();
  expect(rewalk(pd, s.w, atom.marker, atom)).toBeNull();
  totals.refused += 1;
  s.w = walk(pd);

  s.refused(split(atOf(pd, "q"), "s5", "paragraph", () => pd.flow.insert(atOf(pd, "s5"), "typed in the new block")));
  s.refused(s.capture(() => {
    pd.flow.insertEmbed(atOf(pd, "r") + 1, { b: "s6" });
    pd.flow.insertEmbed(atOf(pd, "r") + 2, { b: "s7" });
    for (const id of ["s6", "s7"]) { const m = new Y.Map(); m.set("t", "paragraph"); pd.attrs.set(id, m); }
  }));

  s.refused(split(atOf(pd, "q"), "r"));
  s.refused(s.capture(() => {
    pd.flow.insertEmbed(atOf(pd, "r") + 1, { b: "bare" });
    pd.flow.insertEmbed(atOf(pd, "r") + 1, { b: "bare2" });
  }));
  s.refused(s.capture(() => {
    const m = new Y.Map();
    m.set("t", "heading");
    pd.attrs.set("bare", m);
    pd.flow.insert(atOf(pd, "q") + 1, "typed beside it");
  }));
  s.refused(split(atOf(pd, "q"), "s10", "paragraph", () => {
    const m = new Y.Map();
    m.set("t", "heading");
    pd.attrs.set("bare2", m);
  }));

});

test("a split of a block with a hidden run gives the new block that run, equal to a full walk", () => {
  const s = open();
  const { pd } = s;
  const q = markerOf(pd, "q"), r = markerOf(pd, "r");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(idKey(q.id), "op-7"), { blockId: "q", end: idKey(r.id), sv: [] });
    pd.flow.delete(atOf(pd, "q"), "bravo".length);
    pd.flow.delete(atOf(pd, "r") - 1, 3);
  }, LOCAL);
  s.w = walk(pd);
  expect(textOf(s.w.visible.find((seg) => seg.id === "p"))).toBe("ALPHAarlie");
  const c = s.capture(() => {
    splitAt(pd, atOf(pd, "p") + 2, "n");
    const m = new Y.Map();
    m.set("t", "paragraph");
    pd.attrs.set("n", m);
  });
  const next = s.equal(c, "p", false);
  const opened = next.visible.find((seg) => seg.id === "n");
  expect(textOf(opened)).toBe("PHAarlie");
  expect(opened.runs.some((run) => run.hole !== undefined)).toBe(true);
});

test("a split that changes the block type past a hidden run takes the full walk, so the tail drops marks the new type does not allow", () => {
  const s = open();
  const { pd } = s;
  pd.flow.format(atOf(pd, "r"), "charlie".length, { strong: true });
  const q = markerOf(pd, "q"), r = markerOf(pd, "r");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(idKey(q.id), "op-13"), { blockId: "q", end: idKey(r.id), sv: [] });
    pd.flow.delete(atOf(pd, "q"), "bravo".length);
    pd.flow.delete(atOf(pd, "r") - 1, 3);
  }, LOCAL);
  s.w = walk(pd);
  const c = s.capture(() => {
    splitAt(pd, atOf(pd, "p") + 2, "n");
    const m = new Y.Map();
    m.set("t", "code_block");
    pd.attrs.set("n", m);
  });
  expect(c).not.toBeNull();
  expect(rewalk(pd, s.w, c.marker, c)).toBeNull();
  totals.refused += 1;
  const opened = walk(pd).visible.find((seg) => seg.id === "n");
  const tail = opened.runs.slice(opened.runs.findIndex((run) => run.hole !== undefined) + 1);
  expect(tail.map((run) => run.text).join("")).toBe("arlie");
  expect(tail.every((run) => run.mk === "")).toBe(true);
});
