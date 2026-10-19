import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin, blockJson } from "../../../../src/page/model.js";
import { state, view } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, migrateHybridValues, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";
import { bareShape, shapeOf } from "../../../../src/page/ybind/bridge.js";
import { RECORD } from "../fixtures/all-kinds.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
const clone = (value) => JSON.parse(JSON.stringify(value));
const source = {
  blocks: {
    before: { t: "paragraph", pos: "A", c: "Before" },
    tbl: { ...clone(RECORD.blocks.tbl), pos: "B", sort: { by: "c2", dir: "desc" } },
    after: { t: "paragraph", pos: "C", c: "After" },
  },
};
let tabs, frame;
beforeEach(() => { tabs = []; frame = 0; });
afterEach(() => {
  for (const tab of tabs) { tab.editor.destroy(); tab.mount.remove(); tab.binding.dispose(); tab.binding.ydoc.destroy(); }
});
const open = (initial = migrateHybridValues([source])) => {
  const store = createStore({ name: "page", value: clone(initial) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const mount = document.body.appendChild(document.createElement("div"));
  const editor = new view.EditorView(mount, {
    state: state.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  const tab = { store, binding, editor, mount };
  tabs.push(tab);
  return tab;
};
const blockAt = (tab, id) => {
  let found;
  tab.editor.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = { node, pos }; });
  if (!found) throw new Error(`Missing block: ${id}`);
  return found;
};
const rowAt = (tab, id) => {
  const table = blockAt(tab, "tbl");
  let found;
  table.node.forEach((node, offset) => { if (node.attrs.id === id) found = { node, pos: table.pos + 1 + offset }; });
  if (!found) throw new Error(`Missing row: ${id}`);
  return found;
};
const cellAt = (tab, row, col) => {
  const item = rowAt(tab, row);
  let found;
  item.node.forEach((node, offset) => { if (node.attrs.col === col) found = { node, pos: item.pos + 2 + offset }; });
  if (!found) throw new Error(`Missing cell: ${row}/${col}`);
  return found;
};
const read = (tab) => blocksFromYValue(tab.store.value);
const rows = (tab) => read(tab).tbl.rows;
const select = (tab, pos) => tab.editor.dispatch(tab.editor.state.tr.setSelection(state.TextSelection.create(tab.editor.state.doc, pos)));
const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};

test("renders the migrated complete fixture with row identities, order and all cells", () => {
  const tab = open(migrateHybridValues([RECORD]));
  const table = blockAt(tab, "tbl").node;
  expect(table.childCount).toBe(2);
  expect(table.child(0).childCount).toBe(3);
  expect(blockJson(table).rows).toEqual(RECORD.blocks.tbl.rows);
  expect(blockJson(table).cols).toEqual(RECORD.blocks.tbl.cols);
  expect(table.child(1).child(2).textContent).toBe("invite <first>");
  expect(() => tab.editor.state.doc.check()).not.toThrow();
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("a cell edit persists, reloads and has one own undo/redo group", () => {
  const tab = open();
  select(tab, cellAt(tab, "r2", "c3").pos + 6);
  tab.editor.dispatch(tab.editor.state.tr.insertText("changed "));
  expect(rows(tab).r2.cells.c3).toBe("invitechanged  <first>");
  expect(read(tab).before.c).toBe("Before");
  expect(read(tab).after.c).toBe("After");
  expect(read(tab).tbl.cols).toEqual(source.blocks.tbl.cols);
  expect(read(tab).tbl.sort).toEqual(source.blocks.tbl.sort);
  const reloaded = open(tab.store.value);
  expect(blockJson(blockAt(reloaded, "tbl").node).rows).toEqual(rows(tab));
  expect(tab.binding.undo()).toBe(true);
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
  expect(tab.binding.redo()).toBe(true);
  expect(rows(tab).r2.cells.c3).toBe("invitechanged  <first>");
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("multiple cells and a surrounding paragraph can change in one transaction", () => {
  const tab = open();
  const first = cellAt(tab, "r1", "c1").pos;
  const second = cellAt(tab, "r2", "c2").pos;
  const before = blockAt(tab, "before").pos + 1;
  let tr = tab.editor.state.tr.insertText("X", first);
  tr = tr.insertText("Y", tr.mapping.map(second));
  tr = tr.insertText("!", tr.mapping.map(before));
  tab.editor.dispatch(tr);
  expect(rows(tab).r1.cells.c1).toBe("XSep 21");
  expect(rows(tab).r2.cells.c2).toBe("Y41");
  expect(read(tab).before.c).toBe("!Before");
  expect(read(tab).after.c).toBe("After");
  expect(tab.binding.stats.groups).toBe(1);
  expect(tab.binding.stats.mismatch).toBe(0);
  tab.binding.undo();
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
  expect(read(tab).before.c).toBe("Before");
});

test("row insertion keeps appended identities and row deletion is undoable", () => {
  const tab = open();
  const table = blockAt(tab, "tbl");
  const row = schema.nodes.table_row.create(null, ["c1", "c2", "c3"].map((col) => schema.nodes.table_cell.create({ col }, schema.text(`new ${col}`))));
  tab.editor.dispatch(tab.editor.state.tr.insert(table.pos + table.node.nodeSize - 1, row));
  const ids = Object.keys(rows(tab));
  expect(ids).toHaveLength(3);
  const added = ids.find((id) => !Object.hasOwn(source.blocks.tbl.rows, id));
  expect(added).toMatch(/^r-/);
  expect(rows(tab)[added].pos).toEqual(expect.any(String));
  expect(rows(tab)[added].cells).toEqual({ c1: "new c1", c2: "new c2", c3: "new c3" });
  const item = rowAt(tab, "r1");
  tab.editor.dispatch(tab.editor.state.tr.delete(item.pos, item.pos + item.node.nodeSize));
  expect(rows(tab).r1).toBeUndefined();
  expect(Object.keys(rows(tab))).toHaveLength(2);
  tab.binding.undo();
  expect(Object.keys(rows(tab))).toHaveLength(3);
  expect(rows(tab).r1).toEqual(source.blocks.tbl.rows.r1);
  tab.binding.undo();
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
  expect(read(tab).before.c).toBe("Before");
  expect(read(tab).after.c).toBe("After");
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("peer delivery preserves a caret in another cell and undo retains peer work", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(b, cellAt(b, "r2", "c2").pos + 1);
  a.editor.dispatch(a.editor.state.tr.insertText("X", blockAt(a, "before").pos + 1));
  deliver(a, b);
  expect(b.editor.state.selection.$from.parent.attrs.col).toBe("c2");
  expect(b.editor.state.selection.$from.parentOffset).toBe(1);
  a.editor.dispatch(a.editor.state.tr.insertText("peer ", cellAt(a, "r1", "c3").pos));
  deliver(a, b);
  expect(b.editor.state.selection.$from.parent.attrs.col).toBe("c2");
  expect(b.editor.state.selection.$from.parentOffset).toBe(1);
  b.editor.dispatch(b.editor.state.tr.insertText("!"));
  expect(rows(b).r2.cells.c2).toBe("4!1");
  a.editor.dispatch(a.editor.state.tr.insertText("Y", blockAt(a, "before").pos + 1));
  deliver(a, b);
  b.binding.undo();
  expect(rows(b).r2.cells.c2).toBe("41");
  expect(rows(b).r1.cells.c3).toBe("peer ");
  expect(read(b).before.c).toBe("YXBefore");
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});

test("the actual shape guard distinguishes a changed table cell", () => {
  const tab = open();
  const doc = tab.editor.state.doc;
  const changed = tab.editor.state.tr.insertText("changed", cellAt(tab, "r1", "c1").pos).doc;
  expect(bareShape(changed)).not.toBe(bareShape(doc));
  expect(shapeOf(changed)).not.toBe(shapeOf(doc));
});

test("retains an empty table payload without inventing rows", () => {
  const tab = open(migrateHybridValues([{ blocks: { tbl: { t: "table", pos: "A", cols: {}, rows: {} } } }]));
  expect(blockAt(tab, "tbl").node.childCount).toBe(0);
  expect(rows(tab)).toEqual({});
});
