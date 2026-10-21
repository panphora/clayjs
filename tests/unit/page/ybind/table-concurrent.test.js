import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin, blockJson, orderedIds } from "../../../../src/page/model.js";
import { state, view } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, migrateHybridValues, enc, docFromValue } from "../../../../src/page/ybind/index.js";
import { tableKey } from "../../../../src/page/ybind/table.js";
import { deleteRow, addColumn, deleteColumn, moveColumn } from "../../../../src/page/table.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
const clone = (value) => JSON.parse(JSON.stringify(value));
const source = {
  blocks: {
    before: { t: "paragraph", pos: "A", c: "Before" },
    tbl: {
      t: "table", pos: "B",
      cols: { c1: { pos: "1", name: "Week" }, c2: { pos: "2", name: "Signups" } },
      rows: { r1: { pos: "1", cells: { c1: "Sep 21", c2: "58" } }, r2: { pos: "2", cells: { c1: "Sep 28", c2: "41" } } },
    },
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
const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};
const blockOf = (tab, id) => {
  let found;
  tab.editor.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = { node, pos }; });
  if (!found) throw new Error(`Missing block: ${id}`);
  return found;
};
const tableOf = (tab) => blockOf(tab, "tbl");
const selectCell = (tab, row, col) => {
  const { node, pos } = tableOf(tab);
  let at = pos + 1;
  for (let i = 0; i < row; i++) at += node.child(i).nodeSize;
  at++;
  for (let j = 0; j < col; j++) at += node.child(row).child(j).nodeSize;
  tab.editor.dispatch(tab.editor.state.tr.setSelection(state.TextSelection.create(tab.editor.state.doc, at + 1)));
};
const colsOf = (tab) => blockJson(tableOf(tab).node).cols;
const colIds = (tab) => orderedIds(colsOf(tab));
const rowIds = (tab) => orderedIds(blockJson(tableOf(tab).node).rows);
const fieldsOfValue = (value) => {
  const doc = docFromValue(value, { strict: true });
  try { return Object.fromEntries(doc.getMap("tableFields").entries()); } finally { doc.destroy(); }
};
const paragraphs = (tab) => { const out = {}; tab.editor.state.doc.forEach((node) => { if (node.isTextblock) out[node.attrs.id] = node.textContent; }); return out; };

test("two tabs deleting a different one of two columns leave a valid table with the first column", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  selectCell(a, 0, 0); deleteColumn(a.editor.state, a.editor.dispatch);
  selectCell(b, 0, 1); deleteColumn(b.editor.state, b.editor.dispatch);
  deliver(a, b); deliver(b, a);
  for (const tab of [a, b]) {
    expect(() => tab.editor.state.doc.check()).not.toThrow();
    expect(tableOf(tab).node.childCount).toBe(2);
    expect(colIds(tab)).toEqual(["c1"]);
    expect(tableOf(tab).node.child(0).childCount).toBe(1);
  }
  const before = blockOf(a, "before").pos + 1;
  a.editor.dispatch(a.editor.state.tr.insertText("PEER ", before));
  deliver(a, b);
  expect(paragraphs(b).before).toBe("PEER Before");
  expect(colIds(open(a.store.value))).toEqual(["c1"]);
});

test("two tabs deleting a different one of two rows leave a valid table with one row", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  selectCell(a, 0, 0); deleteRow(a.editor.state, a.editor.dispatch);
  selectCell(b, 1, 0); deleteRow(b.editor.state, b.editor.dispatch);
  deliver(a, b); deliver(b, a);
  for (const tab of [a, b]) {
    expect(() => tab.editor.state.doc.check()).not.toThrow();
    expect(tableOf(tab).node.childCount).toBe(1);
    expect(rowIds(tab)).toEqual(["r1"]);
  }
});

test("the kept column becomes real on the next edit and a new column added afterwards keeps both", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  selectCell(a, 0, 0); deleteColumn(a.editor.state, a.editor.dispatch);
  selectCell(b, 0, 1); deleteColumn(b.editor.state, b.editor.dispatch);
  deliver(a, b); deliver(b, a);
  expect(fieldsOfValue(a.store.value)[tableKey("tbl", "col", "c1", "alive")]).toBe(false);
  selectCell(a, 0, 0);
  a.editor.dispatch(a.editor.state.tr.insertText("X"));
  deliver(a, b);
  expect(fieldsOfValue(a.store.value)[tableKey("tbl", "col", "c1", "alive")]).toBe(true);
  selectCell(b, 0, 0); addColumn(true)(b.editor.state, b.editor.dispatch);
  expect(colIds(b)).toHaveLength(2);
  expect(colIds(b)[0]).toBe("c1");
  deliver(b, a);
  expect(colIds(a)).toEqual(colIds(b));
  expect(() => a.editor.state.doc.check()).not.toThrow();
});

test("tied column positions survive an insert and moves across the tie", () => {
  const initial = migrateHybridValues([source]);
  const a = open(initial), b = open(initial);
  selectCell(a, 0, 0); addColumn(true)(a.editor.state, a.editor.dispatch);
  selectCell(b, 0, 0); addColumn(true)(b.editor.state, b.editor.dispatch);
  deliver(a, b); deliver(b, a);
  const start = colIds(b);
  expect(start).toHaveLength(4);
  expect(colsOf(b)[start[1]].pos).toBe(colsOf(b)[start[2]].pos);
  selectCell(b, 0, 1); addColumn(false)(b.editor.state, b.editor.dispatch);
  const inserted = colIds(b);
  expect(inserted).toHaveLength(5);
  expect(inserted[0]).toBe(start[0]);
  expect(inserted[2]).toBe(start[1]);
  expect(inserted[3]).toBe(start[2]);
  expect(inserted[4]).toBe(start[3]);
  const added = inserted[1];
  selectCell(b, 0, 0); moveColumn(1)(b.editor.state, b.editor.dispatch);
  expect(colIds(b)).toEqual([added, start[0], start[1], start[2], start[3]]);
  selectCell(b, 0, 3); moveColumn(-1)(b.editor.state, b.editor.dispatch);
  expect(colIds(b)).toEqual([added, start[0], start[2], start[1], start[3]]);
  expect(() => b.editor.state.doc.check()).not.toThrow();
});
