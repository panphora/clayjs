import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin, blockJson } from "../../../../src/page/model.js";
import { state, view } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, migrateHybridValues, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";
import { bareShape, shapeOf } from "../../../../src/page/ybind/bridge.js";
import { RECORD } from "../fixtures/all-kinds.js";
import { tableKey } from "../../../../src/page/ybind/table.js";
import { addRow, deleteRow, sortBy, moveRow, moveColumn, renameColumn, setColumnKind, setColumnWidth } from "../../../../src/page/table.js";

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

test("table fields written by a peer render, decode strictly and reload unchanged", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  const note = { c: "bold note", m: [[4, "b"], [5, ""]] };
  b.binding.ydoc.transact(() => {
    b.binding.pd.tableFields.set(tableKey("tbl", "cell", "r1", "c3"), note);
    b.binding.pd.tableFields.set(tableKey("tbl", "row", "r2", "alive"), false);
    b.binding.pd.tableFields.set(tableKey("tbl", "col", "c2", "name"), "Rate");
  }, "peer-test");
  deliver(b, a);
  const table = blockAt(a, "tbl").node;
  expect(table.childCount).toBe(1);
  expect(table.child(0).child(2).textContent).toBe("bold note");
  expect(table.attrs.cols.c2.name).toBe("Rate");
  expect(rows(a)).toEqual({ r1: { ...source.blocks.tbl.rows.r1, cells: { ...source.blocks.tbl.rows.r1.cells, c3: note } } });
  const reloaded = open(a.store.value);
  expect(blockJson(blockAt(reloaded, "tbl").node)).toEqual(blockJson(table));
  expect(read(reloaded)).toEqual(read(a));
  expect(a.binding.stats.mismatch + reloaded.binding.stats.mismatch).toBe(0);
});

test("a peer change that spans rows renders exactly the stored table and keeps the caret in its cell", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(b, cellAt(b, "r2", "c2").pos + 1);
  a.binding.ydoc.transact(() => {
    a.binding.pd.tableFields.set(tableKey("tbl", "cell", "r1", "c1"), "Sep 20");
    a.binding.pd.tableFields.set(tableKey("tbl", "row", "r3", "alive"), true);
    a.binding.pd.tableFields.set(tableKey("tbl", "row", "r3", "pos"), "3");
    a.binding.pd.tableFields.set(tableKey("tbl", "cell", "r3", "c1"), "Oct 5");
  }, "peer-test");
  deliver(a, b);
  const shown = blockJson(blockAt(b, "tbl").node).rows;
  expect(Object.keys(shown)).toEqual(["r1", "r2", "r3"]);
  expect(shown.r1.cells).toEqual({ c1: "Sep 20", c2: "58", c3: "" });
  expect(shown.r3.cells).toEqual({ c1: "Oct 5", c2: "", c3: "" });
  expect(rows(b).r1.cells.c1).toBe("Sep 20");
  expect(rows(b).r3).toEqual({ pos: "3", cells: { c1: "Oct 5" } });
  expect(b.editor.state.selection.$from.parent.attrs.col).toBe("c2");
  expect(b.editor.state.selection.$from.node(2).attrs.id).toBe("r2");
  expect(b.editor.state.selection.$from.parentOffset).toBe(1);
  expect(() => b.editor.state.doc.check()).not.toThrow();
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});

const command = (tab, run) => run(tab.editor.state, (tr) => tab.editor.dispatch(tr));
const fieldsOf = (tab) => Object.fromEntries(tab.binding.pd.tableFields.entries());
const order = (tab) => {
  const ids = [];
  blockAt(tab, "tbl").node.forEach((row) => ids.push(row.attrs.id));
  return ids;
};
const storedOrder = (tab) => Object.keys(rows(tab)).sort((x, y) => {
  const px = rows(tab)[x].pos, py = rows(tab)[y].pos;
  return px !== py ? (px < py ? -1 : 1) : x < y ? -1 : 1;
});

test("two tabs editing different cells at once keep both edits and write one key each", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(a, cellAt(a, "r1", "c1").pos);
  a.editor.dispatch(a.editor.state.tr.insertText("A "));
  select(b, cellAt(b, "r2", "c2").pos + 2);
  b.editor.dispatch(b.editor.state.tr.insertText(".5"));
  deliver(a, b);
  deliver(b, a);
  for (const tab of [a, b]) {
    expect(rows(tab).r1.cells.c1).toBe("A Sep 21");
    expect(rows(tab).r2.cells.c2).toBe("41.5");
    expect(cellAt(tab, "r1", "c1").node.textContent).toBe("A Sep 21");
    expect(cellAt(tab, "r2", "c2").node.textContent).toBe("41.5");
    expect(fieldsOf(tab)).toEqual({ [tableKey("tbl", "cell", "r1", "c1")]: "A Sep 21", [tableKey("tbl", "cell", "r2", "c2")]: "41.5" });
    expect(tab.binding.pd.attrs.get("tbl").get("rows")).toEqual(source.blocks.tbl.rows);
  }
  const reloaded = open(a.store.value);
  expect(blockJson(blockAt(reloaded, "tbl").node)).toEqual(blockJson(blockAt(a, "tbl").node));
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch + reloaded.binding.stats.mismatch).toBe(0);
});

test("two tabs editing the same cell agree on one of the two values", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(a, cellAt(a, "r1", "c3").pos);
  a.editor.dispatch(a.editor.state.tr.insertText("from a"));
  select(b, cellAt(b, "r1", "c3").pos);
  b.editor.dispatch(b.editor.state.tr.insertText("from b"));
  deliver(a, b);
  deliver(b, a);
  expect(["from a", "from b"]).toContain(rows(a).r1.cells.c3);
  expect(rows(b).r1.cells.c3).toBe(rows(a).r1.cells.c3);
  expect(cellAt(a, "r1", "c3").node.textContent).toBe(rows(a).r1.cells.c3);
  expect(cellAt(b, "r1", "c3").node.textContent).toBe(rows(a).r1.cells.c3);
});

test("deleting a row writes only alive:false and Undo brings it back in place", () => {
  const tab = open();
  select(tab, cellAt(tab, "r1", "c1").pos);
  expect(command(tab, deleteRow)).toBe(true);
  expect(fieldsOf(tab)).toEqual({ [tableKey("tbl", "row", "r1", "alive")]: false });
  expect(rows(tab).r1).toBeUndefined();
  expect(tab.binding.undo()).toBe(true);
  expect(fieldsOf(tab)).toEqual({});
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
  expect(order(tab)).toEqual(["r1", "r2"]);
});

test("a new row writes alive, pos and its cells in one transaction and one Undo step", () => {
  const tab = open();
  const table = blockAt(tab, "tbl");
  const row = schema.nodes.table_row.create(null, ["c1", "c2", "c3"].map((col) => schema.nodes.table_cell.create({ col }, col === "c2" ? null : schema.text(`new ${col}`))));
  let updates = 0;
  const count = () => { updates++; };
  tab.binding.ydoc.on("update", count);
  tab.editor.dispatch(tab.editor.state.tr.insert(table.pos + table.node.nodeSize - 1, row));
  tab.binding.ydoc.off("update", count);
  expect(updates).toBe(1);
  const added = Object.keys(rows(tab)).find((id) => !Object.hasOwn(source.blocks.tbl.rows, id));
  expect(Object.keys(fieldsOf(tab)).sort()).toEqual([
    tableKey("tbl", "cell", added, "c1"), tableKey("tbl", "cell", added, "c3"), tableKey("tbl", "row", added, "alive"), tableKey("tbl", "row", added, "pos"),
  ].sort());
  expect(fieldsOf(tab)[tableKey("tbl", "row", added, "alive")]).toBe(true);
  expect(rows(tab)[added].cells).toEqual({ c1: "new c1", c3: "new c3" });
  expect(tab.binding.undo()).toBe(true);
  expect(fieldsOf(tab)).toEqual({});
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
});

test("a row deleted in one tab while another edits it stays deleted until the delete is undone", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(a, cellAt(a, "r2", "c1").pos);
  command(a, deleteRow);
  select(b, cellAt(b, "r2", "c3").pos);
  b.editor.dispatch(b.editor.state.tr.insertText("late "));
  deliver(a, b);
  deliver(b, a);
  for (const tab of [a, b]) {
    expect(rows(tab).r2).toBeUndefined();
    expect(order(tab)).toEqual(["r1"]);
  }
  expect(a.binding.undo()).toBe(true);
  deliver(a, b);
  for (const tab of [a, b]) {
    expect(rows(tab).r2.cells.c3).toBe("late invite <first>");
    expect(cellAt(tab, "r2", "c3").node.textContent).toBe("late invite <first>");
  }
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});

test("Undo takes back only this tab's cell edit and keeps a peer's edit in the same table", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(a, cellAt(a, "r1", "c1").pos);
  a.editor.dispatch(a.editor.state.tr.insertText("mine "));
  select(b, cellAt(b, "r2", "c1").pos);
  b.editor.dispatch(b.editor.state.tr.insertText("theirs "));
  deliver(b, a);
  expect(rows(a).r2.cells.c1).toBe("theirs Sep 28");
  expect(a.binding.undo()).toBe(true);
  expect(rows(a).r1.cells.c1).toBe("Sep 21");
  expect(rows(a).r2.cells.c1).toBe("theirs Sep 28");
  expect(cellAt(a, "r2", "c1").node.textContent).toBe("theirs Sep 28");
  expect(a.binding.redo()).toBe(true);
  expect(rows(a).r1.cells.c1).toBe("mine Sep 21");
  expect(a.binding.stats.mismatch).toBe(0);
});

test("editing one cell keeps the marks a peer stored in another cell", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  const marked = { c: "invite <first>", m: [[6, "b"], [8, ""]] };
  b.binding.ydoc.transact(() => b.binding.pd.tableFields.set(tableKey("tbl", "cell", "r2", "c3"), marked), "peer-test");
  deliver(b, a);
  expect(cellAt(a, "r2", "c3").node.textContent).toBe("invite <first>");
  select(a, cellAt(a, "r1", "c3").pos);
  a.editor.dispatch(a.editor.state.tr.insertText("note"));
  expect(rows(a).r2.cells.c3).toEqual(marked);
  expect(rows(a).r1.cells.c3).toBe("note");
  select(a, cellAt(a, "r2", "c3").pos);
  a.editor.dispatch(a.editor.state.tr.insertText("re-"));
  expect(rows(a).r2.cells.c3).toEqual({ c: "re-invite <first>", m: [[9, "b"], [8, ""]] });
  expect(cellAt(a, "r2", "c3").node.child(0).marks.map((mark) => mark.type.name)).toEqual(["strong"]);
});

test("a row added after a peer reorders the rows lands after the same neighbour in storage", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(b, cellAt(b, "r1", "c1").pos);
  expect(command(b, sortBy("c1", "desc"))).toBe(true);
  deliver(b, a);
  expect(order(a)).toEqual(["r2", "r1"]);
  const shown = blockJson(blockAt(a, "tbl").node).rows;
  expect([shown.r1.pos, shown.r2.pos]).toEqual([rows(a).r1.pos, rows(a).r2.pos]);
  const changed = [];
  const watch = (event) => changed.push(...event.keysChanged);
  a.binding.pd.tableFields.observe(watch);
  select(a, cellAt(a, "r1", "c1").pos);
  expect(command(a, addRow(true))).toBe(true);
  a.binding.pd.tableFields.unobserve(watch);
  const added = order(a)[2];
  expect(added).toMatch(/^r-/);
  expect(changed.sort()).toEqual([tableKey("tbl", "row", added, "alive"), tableKey("tbl", "row", added, "pos")].sort());
  expect(storedOrder(a)).toEqual(["r2", "r1", added]);
  deliver(a, b);
  expect(order(b)).toEqual(["r2", "r1", added]);
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});

test("two tabs adding a row at the same place keep both rows in the same order", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  select(a, cellAt(a, "r1", "c1").pos);
  command(a, addRow(true));
  select(b, cellAt(b, "r1", "c1").pos);
  command(b, addRow(true));
  deliver(a, b);
  deliver(b, a);
  expect(order(a)).toHaveLength(4);
  expect(order(b)).toEqual(order(a));
  expect(order(a)[0]).toBe("r1");
  expect(order(a)[3]).toBe("r2");
  expect(Object.keys(rows(a))).toHaveLength(4);
});

test("a sort is one Undo step that restores every row position", () => {
  const tab = open();
  select(tab, cellAt(tab, "r1", "c1").pos);
  command(tab, sortBy("c1", "desc"));
  expect(order(tab)).toEqual(["r2", "r1"]);
  expect(Object.keys(fieldsOf(tab)).sort()).toEqual([tableKey("tbl", "row", "r1", "pos"), tableKey("tbl", "row", "r2", "pos")].sort());
  expect(tab.binding.undo()).toBe(true);
  expect(order(tab)).toEqual(["r1", "r2"]);
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
});

test("a mark added in one tab's cell reaches the other tab, writes one cell key and reloads strictly", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  const at = cellAt(a, "r1", "c1");
  const changed = [];
  const watch = (event) => changed.push(...event.keysChanged);
  a.binding.pd.tableFields.observe(watch);
  a.editor.dispatch(a.editor.state.tr.addMark(at.pos, at.pos + at.node.content.size, schema.marks.strong.create()));
  a.binding.pd.tableFields.unobserve(watch);
  expect(changed).toEqual([tableKey("tbl", "cell", "r1", "c1")]);
  const bold = { c: "Sep 21", m: [[6, "b"]] };
  expect(rows(a).r1.cells.c1).toEqual(bold);
  deliver(a, b);
  expect(cellAt(b, "r1", "c1").node.child(0).marks.map((mark) => mark.type.name)).toEqual(["strong"]);
  expect(blockJson(blockAt(b, "tbl").node).rows.r1.cells.c1).toEqual(bold);
  const reloaded = open(b.store.value);
  expect(blockJson(blockAt(reloaded, "tbl").node).rows).toEqual(rows(b));
  expect(a.binding.stats.mismatch).toBe(0);
  expect(b.binding.stats.mismatch).toBe(0);
});

test("one mark across a paragraph and a table writes both and keeps the binding in step", () => {
  const tab = open();
  const from = blockAt(tab, "before").pos + 1;
  const cell = cellAt(tab, "r1", "c1");
  tab.editor.dispatch(tab.editor.state.tr.addMark(from, cell.pos + 3, schema.marks.em.create()));
  expect(read(tab).before).toMatchObject({ c: "Before", m: [[6, "i"]] });
  expect(rows(tab).r1.cells.c1).toEqual({ c: "Sep 21", m: [[3, "i"], [3, ""]] });
  expect(tab.binding.stats.mismatch).toBe(0);
  expect(tab.binding.undo()).toBe(true);
  expect(rows(tab)).toEqual(source.blocks.tbl.rows);
  expect(read(tab).before.m).toBeUndefined();
});

test("moving a row or a column, renaming and changing a kind write one key each and keep the binding in step", () => {
  const tab = open();
  const changed = [];
  const watch = (event) => changed.push(...event.keysChanged);
  tab.binding.pd.tableFields.observe(watch);
  select(tab, cellAt(tab, "r1", "c1").pos);
  expect(command(tab, moveRow(1))).toBe(true);
  expect(changed).toEqual([tableKey("tbl", "row", "r1", "pos")]);
  changed.length = 0;
  select(tab, cellAt(tab, "r1", "c1").pos);
  expect(command(tab, moveColumn(1))).toBe(true);
  tab.binding.pd.tableFields.unobserve(watch);
  expect(changed).toEqual([tableKey("tbl", "col", "c1", "pos")]);
  expect(tab.binding.stats.mismatch).toBe(0);
  changed.length = 0;
  tab.binding.pd.tableFields.observe(watch);
  select(tab, cellAt(tab, "r1", "c1").pos);
  expect(command(tab, renameColumn("c1", "When"))).toBe(true);
  expect(command(tab, setColumnKind("c1", "text"))).toBe(true);
  expect(command(tab, setColumnKind("c3", "number"))).toBe(true);
  expect(command(tab, setColumnKind("c1", "auto"))).toBe(true);
  tab.binding.pd.tableFields.unobserve(watch);
  expect(changed).toEqual([tableKey("tbl", "col", "c1", "name"), tableKey("tbl", "col", "c1", "kind"), tableKey("tbl", "col", "c3", "kind"), tableKey("tbl", "col", "c1", "kind")]);
  expect(tab.binding.stats.mismatch).toBe(0);
  const reloaded = open(tab.store.value);
  expect(blockJson(blockAt(reloaded, "tbl").node)).toEqual(blockJson(blockAt(tab, "tbl").node));
  expect("kind" in read(tab).tbl.cols.c1).toBe(false);
});

test("a column width writes one key, reaches the other tab, reloads, and Reset removes it", () => {
  const a = open();
  const b = open(a.store.value);
  const changed = [];
  const watch = (event) => changed.push(...event.keysChanged);
  a.binding.pd.tableFields.observe(watch);
  select(a, cellAt(a, "r1", "c1").pos);
  expect(command(a, setColumnWidth("c2", 240))).toBe(true);
  expect(changed).toEqual([tableKey("tbl", "col", "c2", "width")]);
  deliver(a, b);
  expect(blockAt(b, "tbl").node.attrs.cols.c2.width).toBe(240);
  expect(read(a).tbl.cols.c2.width).toBe(240);
  expect(blockAt(open(a.store.value), "tbl").node.attrs.cols.c2.width).toBe(240);
  select(a, cellAt(a, "r1", "c1").pos);
  expect(command(a, setColumnWidth("c2", null))).toBe(true);
  a.binding.pd.tableFields.unobserve(watch);
  deliver(a, b);
  expect("width" in blockAt(b, "tbl").node.attrs.cols.c2).toBe(false);
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});
