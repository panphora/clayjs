import { editor, key, select } from "./view-helpers.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { importCsv } from "../../../src/page/csv-import.js";
import { moveRow, moveColumn, makeTable } from "../../../src/page/table.js";

const tbl = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name" }, c2: { pos: "2", name: "Owner" }, c3: { pos: "3", name: "Amount" } },
  rows: { r1: { pos: "1", cells: { c1: "a", c2: "x", c3: "1" } }, r2: { pos: "2", cells: { c1: "b", c2: "y", c3: "2" } } },
};
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const labels = (view) => [...menu(view).querySelectorAll(".page-menu-item")].map((row) => row.querySelector(".page-menu-label").textContent);
const item = (view, label) => [...menu(view).querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === label);
const record = (view, index = 0) => blockJson(view.state.doc.child(index));
const grid = (table) => { const cols = orderedIds(table.cols); return orderedIds(table.rows).map((id) => cols.map((col) => table.rows[id].cells[col])); };
const file = (body) => new File([body], "values.csv", { type: "text/csv" });

test("the + bars add a row at the bottom and a column at the right, each one undo step", () => {
  const view = editor([], { blocks: { tbl } });
  const addRow = view.dom.querySelector(".page-table-add-row");
  const addCol = view.dom.querySelector(".page-table-add-col");
  expect([addRow.getAttribute("aria-label"), addCol.getAttribute("aria-label")]).toEqual(["Add a row", "Add a column"]);
  expect(addRow.contentEditable).toBe("false");
  addRow.click();
  const rows = record(view).rows;
  const ids = orderedIds(rows);
  expect(ids).toHaveLength(3);
  expect(ids.slice(0, 2)).toEqual(["r1", "r2"]);
  expect([rows.r1.pos, rows.r2.pos]).toEqual(["1", "2"]);
  expect(view.state.selection.$head.index(1)).toBe(2);
  addCol.click();
  const cols = record(view).cols;
  expect(orderedIds(cols).map((id) => cols[id].name)).toEqual(["Name", "Owner", "Amount", "Column 4"]);
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(orderedIds(record(view).cols)).toHaveLength(3);
});

test("the row menu inserts, moves and deletes rows, offering only the moves that exist", () => {
  const view = editor([], { blocks: { tbl } });
  view.dom.querySelector(".page-table-row-menu:not([hidden])").click();
  expect(labels(view)).toEqual(["Insert above", "Insert below", "Move down", "Select row", "Delete row"]);
  item(view, "Move down").click();
  const moved = record(view);
  expect(orderedIds(moved.rows)).toEqual(["r2", "r1"]);
  expect(moved.rows.r2.pos).toBe("2");
  expect(grid(moved)).toEqual([["b", "y", "2"], ["a", "x", "1"]]);
  view.dom.querySelectorAll(".page-table-row-menu:not([hidden])")[1].click();
  expect(labels(view)).toEqual(["Insert above", "Insert below", "Move up", "Select row", "Delete row"]);
});

test("the column menu moves a column left or right with its cells", () => {
  const view = editor([], { blocks: { tbl } });
  view.dom.querySelector('th[data-col="c1"] button').click();
  expect(labels(view)).not.toContain("Move left");
  item(view, "Move right").click();
  const table = record(view);
  expect(orderedIds(table.cols)).toEqual(["c2", "c1", "c3"]);
  expect(table.cols.c2.pos).toBe("2");
  expect(grid(table)).toEqual([["x", "a", "1"], ["y", "b", "2"]]);
  expect([...view.dom.querySelectorAll("thead button")].map((button) => button.textContent)).toEqual(["Owner", "Name", "Amount"]);
  view.dom.querySelector('th[data-col="c3"] button').click();
  expect(labels(view)).not.toContain("Move right");
  item(view, "Move left").click();
  expect(orderedIds(record(view).cols)).toEqual(["c2", "c3", "c1"]);
});

test("moves at the edge refuse", () => {
  const view = editor([], { blocks: { tbl } });
  select(view, 3);
  expect(moveRow(-1)(view.state)).toBe(false);
  expect(moveColumn(-1)(view.state)).toBe(false);
  expect(moveRow(1)(view.state)).toBe(true);
});

test("the table's block menu has Chart this table and Import CSV, other blocks do not", () => {
  const view = editor([["p", "paragraph", "Intro"]], { blocks: { p: { t: "paragraph", pos: "A", c: "Intro" }, tbl } });
  view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0)));
  key(view, "/", { ctrlKey: true });
  expect(labels(view)).not.toContain("Chart this table");
  view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 1)));
  key(view, "Escape");
  key(view, "/", { ctrlKey: true });
  expect(labels(view).slice(-2)).toEqual(["Chart this table", "Import CSV…"]);
  item(view, "Chart this table").click();
  expect(view.state.doc.child(2).type.name).toBe("chart");
  expect(view.state.doc.child(2).attrs.source).toBe("tbl");
});

test("Import CSV from the table menu fills an empty table in place and puts a full one's import below it", async () => {
  const empty = makeTable(3, 3);
  const view = editor([], { blocks: { e: { t: "table", pos: "M", cols: empty.attrs.cols, rows: blockJson(empty).rows } } });
  expect(await importCsv(view, file("Code,Qty\n007,1"), { table: "e" })).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
  const filled = record(view);
  expect(view.state.doc.child(0).attrs.id).toBe("e");
  expect(filled.pos).toBe("M");
  expect(orderedIds(filled.cols).map((id) => filled.cols[id].name)).toEqual(["Code", "Qty"]);
  expect(grid(filled)).toEqual([["007", "1"]]);
  expect(await importCsv(view, file("A,B\n1,2"), { table: "e" })).toBe(true);
  expect(view.state.doc.childCount).toBe(2);
  expect(grid(record(view, 0))).toEqual([["007", "1"]]);
  expect(grid(record(view, 1))).toEqual([["1", "2"]]);
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
});
