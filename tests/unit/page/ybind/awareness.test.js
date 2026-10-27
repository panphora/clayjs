import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state, view, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, docFromValue, enc, removeKey, NET, migrateHybridValues } from "../../../../src/page/ybind/index.js";
import { RECORD } from "../fixtures/all-kinds.js";
import { BlockSelection } from "../../../../src/page/blocks.js";
import { encodeSelection, decodeSelection } from "../../../../src/page/ybind/awareness.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

/**
 * Where a peer's selection sits (Document 10 Step 6).
 *
 * A target names a place by stable block id and a guarded Yjs relative position,
 * and it is read back through this tab's own projection: the winning copy, the
 * block that currently holds it, the cell that still exists. Anything this tab
 * cannot place resolves to null, and a null is a caret that is not drawn, never
 * one placed at a neighbouring block's edge.
 */

let open;
beforeEach(() => { open = []; });
afterEach(() => {
  for (const tab of open.splice(0)) { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); }
});

const seeded = () => seedValue([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
const tab = (initial = seeded()) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store });
  const editor = new view.EditorView(document.body.appendChild(document.createElement("div")), {
    state: state.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  const opened = { store, binding, view: editor, initial };
  open.push(opened);
  return opened;
};
const exchange = (...tabs) => {
  const updates = tabs.map((one) => Y.encodeStateAsUpdateV2(one.binding.ydoc));
  for (const one of tabs) for (const update of updates) Y.applyUpdateV2(one.binding.ydoc, update, NET);
};
const posOf = (one, id, offset = 0) => {
  let found = null;
  one.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = pos + 1 + offset; });
  if (found === null) throw new Error(`Missing ${id}`);
  return found;
};
const caretIn = (one, id, offset) => one.view.dispatch(one.view.state.tr.setSelection(state.TextSelection.create(one.view.state.doc, posOf(one, id, offset))));
const selectIn = (one, id, from, to) => one.view.dispatch(one.view.state.tr.setSelection(state.TextSelection.create(one.view.state.doc, posOf(one, id, from), posOf(one, id, to))));
const type = (one, text, at = null) => one.view.dispatch(one.view.state.tr.insertText(text, at === null ? one.view.state.selection.from : at));
const encode = (one) => encodeSelection({ ...one.binding.awareness.map(), doc: one.view.state.doc }, one.view.state.selection);
const decode = (one, selection) => decodeSelection({ ...one.binding.awareness.map(), doc: one.view.state.doc }, selection);
const textOf = (one, spot) => one.view.state.doc.textBetween(spot.from, spot.to, "\n", "\n");
const blockOf = (one, spot) => {
  const { $from, $to } = state.TextSelection.create(one.view.state.doc, spot.from, spot.to);
  return { id: $to.parent.attrs.id, from: $from.parentOffset, to: $to.parentOffset };
};
const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const hide = (one, id, endId) => {
  const key = keyOf(one.binding.pd, id);
  one.binding.pd.ydoc.transact(() => one.binding.pd.gone.set(removeKey(key, "peer-remove"), { blockId: id, end: endId ? keyOf(one.binding.pd, endId) : null, sv: [] }), NET);
  return key;
};

test("a caret publishes its block id and relative position, and reads back where it was", () => {
  const a = tab();
  caretIn(a, "q", 2);
  const target = encode(a);
  expect(target.kind).toBe("text");
  expect(target.anchor.block).toBe("q");
  expect(target.head.block).toBe("q");
  expect(typeof target.anchor.rel).toBe("string");
  expect(target.anchor.rel.length).toBeGreaterThan(0);
  const spot = decode(a, target);
  expect(spot).toEqual({ kind: "text", from: posOf(a, "q", 2), to: posOf(a, "q", 2) });
});

test("a peer's insertions at both range edges leave the range on the same text", () => {
  const a = tab(), b = tab();
  selectIn(b, "q", 1, 4);
  const target = encode(b);
  expect(textOf(b, decode(b, target))).toBe("rav");
  type(a, "X", posOf(a, "q", 1));
  type(a, "Y", posOf(a, "q", 5));
  exchange(a, b);
  const spot = decode(b, target);
  expect(spot).not.toBeNull();
  expect(textOf(b, spot)).toBe("rav");
  expect(blockOf(b, spot)).toEqual({ id: "q", from: 2, to: 5 });
});

test("a remote split before the range keeps the caret's block and offset", () => {
  const a = tab(), b = tab();
  caretIn(b, "q", 3);
  const target = encode(b);
  caretIn(a, "p", 3);
  a.view.dispatch(a.view.state.tr.split(posOf(a, "p", 3)));
  exchange(a, b);
  const spot = decode(b, target);
  expect(blockOf(b, spot)).toEqual({ id: "q", from: 3, to: 3 });
  expect(textOf(b, spot)).toBe("");
});

test("a remote join before the caret keeps the caret after the joined text", () => {
  const a = tab(), b = tab();
  caretIn(b, "q", 2);
  const target = encode(b);
  caretIn(a, "q", 0);
  commands.joinBackward(a.view.state, a.view.dispatch);
  exchange(a, b);
  const spot = decode(b, target);
  expect(spot).not.toBeNull();
  expect(blockOf(b, spot)).toEqual({ id: "p", from: 7, to: 7 });
  expect(a.binding.stats.mismatch).toBe(0);
  expect(b.binding.stats.mismatch).toBe(0);
});

test("a peer's move of the block carries the caret with it", () => {
  const a = tab(), b = tab();
  caretIn(b, "q", 2);
  const target = encode(b);
  expect(a.binding.moveBlocks({ ids: ["q"], afterId: "r" })).toMatchObject({ status: "moved" });
  exchange(a, b);
  const ids = [];
  b.view.state.doc.forEach((node) => ids.push(node.attrs.id));
  expect(ids).toEqual(["p", "r", "q"]);
  expect(blockOf(b, decode(b, target))).toEqual({ id: "q", from: 2, to: 2 });
});

test("a caret inside a block a peer hid resolves to nothing", () => {
  const a = tab(), b = tab();
  caretIn(b, "q", 2);
  const target = encode(b);
  hide(a, "q", "r");
  exchange(a, b);
  expect(decode(b, target)).toBeNull();
});

test("a caret in a recovered block follows it, and disappears when the Restore is undone", () => {
  const a = tab(), b = tab();
  const q = hide(a, "q", "r");
  exchange(a, b);
  const record = a.binding.recoverable[0];
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  exchange(a, b);
  caretIn(b, `recovered:${q}`, 3);
  const target = encode(b);
  expect(blockOf(b, decode(b, target))).toEqual({ id: `recovered:${q}`, from: 3, to: 3 });
  expect(a.binding.undo()).toBe(true);
  exchange(a, b);
  expect(decode(b, target)).toBeNull();
});

test("a caret in a block a peer deleted resolves to nothing", () => {
  const a = tab(), b = tab();
  caretIn(b, "q", 2);
  const target = encode(b);
  caretIn(a, "q", 0);
  a.view.dispatch(state.TextSelection.create(a.view.state.doc, posOf(a, "q", 0)).$from.pos === 0
    ? a.view.state.tr
    : a.view.state.tr.delete(posOf(a, "q", 0) - 1, posOf(a, "q", 0) + 5));
  exchange(a, b);
  const ids = [];
  b.view.state.doc.forEach((node) => ids.push(node.attrs.id));
  expect(ids).toEqual(["p", "r"]);
  expect(decode(b, target)).toBeNull();
});

test("a target from another generation is not this document's", () => {
  const a = tab();
  expect(a.binding.awareness.generation()).toBe(0);
  a.store.rebase({ ...a.initial, g: 1 }, { source: "state" });
  expect(a.binding.awareness.generation()).toBe(1);
});

test("a relative position that names another shared type resolves to nothing", () => {
  const a = tab();
  const other = a.binding.pd.ydoc.getText("elsewhere");
  other.insert(0, "xyz");
  const rel = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(other, 1));
  expect(decode(a, { kind: "text", anchor: { block: "p", rel }, head: { block: "p", rel } })).toBeNull();
  const peer = docFromValue(a.initial);
  const foreign = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(peer.getText("flow"), 3));
  expect(decode(a, { kind: "text", anchor: { block: "p", rel: foreign }, head: { block: "p", rel: foreign } })).toBeNull();
  peer.destroy();
});

test("malformed relative bytes and a missing block are unresolvable, not clamped", () => {
  const a = tab();
  caretIn(a, "p", 2);
  const good = encode(a);
  const bad = [
    { kind: "text", anchor: { block: "p", rel: "not base64 at all" }, head: { block: "p", rel: "not base64 at all" } },
    { kind: "text", anchor: { block: "p", rel: "" }, head: { block: "p", rel: "" } },
    { kind: "text", anchor: { block: "p", rel: 42 }, head: { block: "p", rel: 42 } },
    { kind: "text", anchor: { block: "", rel: good.anchor.rel }, head: { block: "", rel: good.head.rel } },
    { kind: "text", anchor: null, head: good.head },
    { kind: "cell", block: "tbl", row: "r1", col: "c1" },
    { kind: "blocks", ids: ["missing"] },
    { kind: "text" },
    null,
    "nonsense",
  ];
  for (const selection of bad) expect(decode(a, selection)).toBeNull();
});

test("a caret in a table cell publishes the cell, never a character offset", () => {
  const a = tab(migrateHybridValues([{ blocks: JSON.parse(JSON.stringify(RECORD.blocks)) }]));
  const table = [];
  a.view.state.doc.forEach((node) => table.push([node.attrs.id, node.type.name]));
  expect(table).toContainEqual(["tbl", "table"]);
  const cell = posOf(a, "tbl", 0);
  let at = null;
  a.view.state.doc.forEach((node, pos) => {
    if (node.attrs.id !== "tbl") return;
    node.forEach((row, rowAt) => row.forEach((c, cellAt) => { if (row.attrs.id === "r2" && c.attrs.col === "c2" && at === null) at = pos + 2 + rowAt + cellAt + 2; }));
  });
  expect(typeof at).toBe("number");
  a.view.dispatch(a.view.state.tr.setSelection(state.TextSelection.create(a.view.state.doc, at)));
  const target = encode(a);
  expect(target).toEqual({ kind: "cell", block: "tbl", row: "r2", col: "c2" });
  const spot = decode(a, target);
  expect(spot.kind).toBe("cell");
  expect(a.view.state.doc.nodeAt(spot.from).type.name).toBe("table_cell");
  expect(a.view.state.doc.textBetween(spot.from + 1, spot.to - 1)).toBe("41");
  expect(cell).toBeGreaterThan(0);
});

test("a selection that spans two cells publishes nothing at all", () => {
  const a = tab(migrateHybridValues([{ blocks: JSON.parse(JSON.stringify(RECORD.blocks)) }]));
  let first = null, second = null;
  a.view.state.doc.forEach((node, pos) => {
    if (node.attrs.id !== "tbl") return;
    node.forEach((row, rowAt) => row.forEach((c, cellAt) => {
      const at = pos + 2 + rowAt + cellAt + 1;
      if (row.attrs.id === "r1" && c.attrs.col === "c2") first = at;
      if (row.attrs.id === "r2" && c.attrs.col === "c3") second = at;
    }));
  });
  a.view.dispatch(a.view.state.tr.setSelection(state.TextSelection.create(a.view.state.doc, first, second)));
  expect(encode(a)).toBeNull();
});

test("a block selection publishes its stable ids and reads back as those blocks", () => {
  const a = tab();
  const selection = new BlockSelection(a.view.state.doc.resolve(posOf(a, "p", 0) - 1), a.view.state.doc.resolve(posOf(a, "q", 5) + 1));
  a.view.dispatch(a.view.state.tr.setSelection(selection));
  const target = encode(a);
  expect(target).toEqual({ kind: "blocks", ids: ["p", "q"] });
  const spot = decode(a, target);
  expect(spot.ids).toEqual(["p", "q"]);
  expect(spot.ranges.map((range) => a.view.state.doc.nodeAt(range.from).attrs.id)).toEqual(["p", "q"]);
});

test("a binding without a view still maps from the document it is handed", () => {
  const a = tab();
  expect(typeof a.binding.awareness.map).toBe("function");
  expect(a.binding.awareness.map().pd).toBe(a.binding.pd);
  expect(a.binding.awareness.generation()).toBe(0);
});
