import { pageState } from "../../../src/page/editor.js";
import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { orderedIds, blockJson } from "../../../src/page/model.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";
import { insertTable, nextCell, prevCell, cellBelow, addRow, deleteRow, addColumn, deleteColumn, renameColumn, setColumnKind, sortBy, moveColumn } from "../../../src/page/table.js";
import { placeAt } from "../../../src/page/ybind/board-commands.js";

const { TextSelection } = pmState;
const initial = { p: { t: "paragraph", pos: "V", c: "" } };
const run = (st, command) => {
  let tr;
  expect(command(st, (step) => { tr = step; })).toBe(true);
  return tr ? st.apply(tr) : st;
};
const record = (st) => blockJson(st.doc.child(0));
const select = (st, row, col) => {
  const table = st.doc.child(0);
  let pos = 1;
  for (let i = 0; i < row; i++) pos += table.child(i).nodeSize;
  pos++;
  for (let i = 0; i < col; i++) pos += table.child(row).child(i).nodeSize;
  return st.apply(st.tr.setSelection(TextSelection.create(st.doc, pos + 1)));
};

test("insert makes stable table, column and row ids and is one undo step", () => {
  const before = pageState(initial);
  const st = run(before, insertTable(2, 2));
  const table = record(st);
  expect(st.doc.childCount).toBe(1);
  expect(Object.keys(table.cols)).toHaveLength(2);
  expect(Object.keys(table.rows)).toHaveLength(2);
  expect(Object.keys(table.cols).every((id) => id.startsWith("c-"))).toBe(true);
  expect(Object.keys(table.rows).every((id) => id.startsWith("r-"))).toBe(true);
  expect(orderedIds(table.cols).map((id) => table.cols[id].name)).toEqual(["Column 1", "Column 2"]);
  let undone;
  expect(history.undo(st, (tr) => { undone = st.apply(tr); })).toBe(true);
  expect(undone.doc.toJSON()).toEqual(before.doc.toJSON());
});

test("Tab, Shift-Tab and Enter navigate cells and append one row at the edge", () => {
  let st = run(pageState(initial), insertTable(2, 2));
  st = run(st, nextCell);
  expect(st.selection.$head.index(2)).toBe(1);
  st = run(st, prevCell);
  expect(st.selection.$head.index(2)).toBe(0);
  st = run(st, cellBelow);
  expect(st.selection.$head.index(1)).toBe(1);
  st = run(select(st, 1, 1), nextCell);
  expect(st.doc.child(0).childCount).toBe(3);
  expect(st.selection.$head.index(1)).toBe(2);
  st = run(st, cellBelow);
  expect(st.doc.child(0).childCount).toBe(4);
});

test("row and column edits preserve neighbor ids and positions", () => {
  let st = run(pageState(initial), insertTable(2, 2));
  const before = record(st);
  st = run(st, addRow(true));
  const added = record(st);
  for (const id of Object.keys(before.rows)) expect(added.rows[id].pos).toBe(before.rows[id].pos);
  st = run(st, deleteRow);
  expect(Object.keys(record(st).rows)).toHaveLength(2);
  st = run(st, addColumn(true));
  const wide = record(st);
  for (const id of Object.keys(before.cols)) expect(wide.cols[id].pos).toBe(before.cols[id].pos);
  st = run(st, deleteColumn);
  expect(Object.keys(record(st).cols)).toHaveLength(2);
  const col = orderedIds(record(st).cols)[0];
  st = run(st, renameColumn(col, "Price"));
  st = run(st, setColumnKind(col, "number"));
  expect(record(st).cols[col]).toMatchObject({ name: "Price", kind: "number" });
});

test("last column cannot be deleted and last row clears cells", () => {
  let st = run(pageState(initial), insertTable(1, 1));
  expect(deleteColumn(st)).toBe(false);
  const row = st.doc.child(0).child(0);
  st = run(st, deleteRow);
  expect(st.doc.child(0).child(0).attrs.id).toBe(row.attrs.id);
  expect(st.doc.child(0).childCount).toBe(1);
});

test("sort is numeric, stable and puts blanks last; edits of sorted cells clear it", () => {
  let st = run(pageState(initial), insertTable(3, 2));
  const col = orderedIds(record(st).cols)[0];
  st = run(st, setColumnKind(col, "number"));
  for (const [row, text] of ["10", "2", ""].entries()) {
    st = select(st, row, 0);
    if (text) st = st.apply(st.tr.insertText(text));
  }
  const ids = orderedIds(record(st).rows);
  st = run(select(st, 0, 0), sortBy(col, "asc"));
  expect(orderedIds(record(st).rows)).toEqual([ids[1], ids[0], ids[2]]);
  expect(record(st).sort).toEqual({ col, dir: "asc" });
  st = select(st, 0, 1);
  st = st.apply(st.tr.insertText("other"));
  expect(record(st).sort).toEqual({ col, dir: "asc" });
  st = select(st, 0, 0);
  st = st.apply(st.tr.insertText("3"));
  expect(record(st).sort).toBeUndefined();
});

test.each([
  ["text", ["Item 10", "item 2", "item 2", ""], [1, 2, 0, 3]],
  ["date", ["2026-11-01", "2026-10-26", "2026-10-26", ""], [1, 2, 0, 3]],
  ["number", ["10", "2", "2", ""], [1, 2, 0, 3]],
])("%s sort keeps stable ties and blanks last", (kind, values, expected) => {
  let st = run(pageState(initial), insertTable(4, 1));
  const col = orderedIds(record(st).cols)[0];
  st = run(st, setColumnKind(col, kind));
  for (const [row, value] of values.entries()) if (value) {
    st = select(st, row, 0);
    st = st.apply(st.tr.insertText(value));
  }
  const ids = orderedIds(record(st).rows);
  st = run(select(st, 0, 0), sortBy(col, "asc"));
  expect(orderedIds(record(st).rows)).toEqual(expected.map((i) => ids[i]));
  st = run(st, sortBy(col, "desc"));
  expect(orderedIds(record(st).rows).at(-1)).toBe(ids[3]);
});

test("row changes clear sort, while adding an unrelated column retains it", () => {
  let st = run(pageState(initial), insertTable(2, 2));
  const col = orderedIds(record(st).cols)[0];
  st = run(st, sortBy(col, "asc"));
  st = run(st, addColumn(true));
  expect(record(st).sort).toEqual({ col, dir: "asc" });
  st = run(st, addRow(true));
  expect(record(st).sort).toBeUndefined();
  st = run(st, sortBy(col, "desc"));
  st = run(st, deleteRow);
  expect(record(st).sort).toBeUndefined();
});

test("Tab outside a table keeps list indentation", () => {
  const st = pageState({ a: { t: "list_item", pos: "V", c: "A" }, b: { t: "list_item", pos: "W", c: "B" } });
  expect(nextCell(st)).toBe(false);
});

test("a peer's edit of the sorted column is left for the peer's own tab to clear", () => {
  let st = run(pageState(initial), insertTable(2, 1));
  const col = orderedIds(record(st).cols)[0];
  st = run(select(st, 0, 0), sortBy(col, "asc"));
  st = select(st, 0, 0);
  st = st.apply(st.tr.insertText("peer").setMeta(REMOTE_META, true).setMeta("addToHistory", false));
  expect(record(st).sort).toEqual({ col, dir: "asc" });
});

test("placeAt lands inside a tie group and gives the tied items after the slot fresh positions", () => {
  const pos = { a: "V", b: "V", c: "k" };
  const { pos: key, rekey } = placeAt(["a", "b", "c"], (id) => pos[id], 1);
  expect(key > "V" && key < "k").toBe(true);
  expect(rekey).toHaveLength(1);
  expect(rekey[0][0]).toBe("b");
  expect(rekey[0][1] > key && rekey[0][1] < "k").toBe(true);
  expect(placeAt(["a", "b", "c"], (id) => pos[id], 2)).toEqual({ pos: expect.any(String), rekey: [] });
  expect(placeAt(["a", "b"], (id) => pos[id], 1).rekey.map(([id, next]) => [id, next > "V"])).toEqual([["b", true]]);
});

test("a column added or moved between two tied columns lands where it shows", () => {
  const tied = { t: { t: "table", pos: "V", cols: { a: { pos: "V", name: "A" }, b: { pos: "V", name: "B" }, c: { pos: "k", name: "C" } }, rows: { r: { pos: "V", cells: { a: "1", b: "2", c: "3" } } } } };
  let st = select(pageState(tied), 0, 0);
  st = run(st, addColumn(true));
  const added = record(st);
  const order = orderedIds(added.cols);
  expect(order[0]).toBe("a");
  expect(order[2]).toBe("b");
  expect(order[3]).toBe("c");
  expect(new Set(Object.values(added.cols).map((col) => col.pos)).size).toBe(4);
  let moved = select(pageState(tied), 0, 2);
  moved = run(moved, moveColumn(-1));
  expect(orderedIds(record(moved).cols)).toEqual(["a", "c", "b"]);
});
