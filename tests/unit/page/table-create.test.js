import { editor, select, key } from "./view-helpers.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { gridFromClipboard } from "../../../src/page/table-paste.js";

const clip = (data) => ({ clipboardData: { files: [], getData: (type) => data[type] ?? "" }, preventDefault() {} });
const paste = (view, data) => view.someProp("handlePaste", (f) => f(view, clip(data), null)) ?? false;
const tableOf = (view) => { let out = null; view.state.doc.forEach((node) => { if (!out && node.type.name === "table") out = blockJson(node); }); return out; };
const names = (table) => orderedIds(table.cols).map((id) => table.cols[id].name);
const grid = (table) => { const cols = orderedIds(table.cols); return orderedIds(table.rows).map((id) => cols.map((col) => table.rows[id].cells[col])); };
const sheets = `<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1"><colgroup><col width="100"><col width="100"></colgroup><tbody><tr style="height:21px;"><td style="font-weight:bold;">Week</td><td>Signups</td></tr><tr><td><b>Sep 21</b></td><td style="text-align:right;">58</td></tr><tr><td>Sep 28<br>late</td><td>007</td></tr></tbody></table>`;

test("a Markdown row ended by Enter becomes a table with those columns and one empty row", () => {
  const view = editor([["p", "paragraph", "| Name | Owner |"]]);
  select(view, 1 + "| Name | Owner |".length);
  expect(key(view, "Enter")).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
  const table = tableOf(view);
  expect(names(table)).toEqual(["Name", "Owner"]);
  expect(grid(table)).toEqual([["", ""]]);
  expect(view.state.doc.child(0).attrs.pos).toBe("B");
  expect(view.state.selection.$head.parent.type.name).toBe("table_cell");
  expect(view.state.selection.$head.index(2)).toBe(0);
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.child(0).textContent).toBe("| Name | Owner |");
});

test.each([
  ["text that is not a row", "| just text", 11],
  ["a row with no names", "|  |", 4],
  ["a caret before the end", "| a | b |", 3],
])("Enter after %s splits the paragraph as before", (_name, text, offset) => {
  const view = editor([["p", "paragraph", text]]);
  select(view, 1 + offset);
  key(view, "Enter");
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
  expect(view.state.doc.childCount).toBe(2);
});

test("pasting cells from Google Sheets makes a table: first row as names, marks and line breaks kept", () => {
  const view = editor([["p", "paragraph", ""]]);
  select(view, 1);
  expect(paste(view, { "text/html": sheets, "text/plain": "Week\tSignups\nSep 21\t58\n\"Sep 28\nlate\"\t007" })).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
  const table = tableOf(view);
  expect(names(table)).toEqual(["Week", "Signups"]);
  expect(grid(table)).toEqual([
    [{ c: "Sep 21", m: [[6, "b"]] }, "58"],
    [{ c: "Sep 28￼late", m: [[6, ""], [1, '@{"type":"hard_break"}'], [4, ""]] }, "007"],
  ]);
});

test("pasting tab-separated text alone (Excel, Numbers) makes a table and keeps leading zeros", () => {
  const view = editor([["p", "paragraph", "Intro"]]);
  select(view, 6);
  expect(paste(view, { "text/plain": "Code\tQty\r\n007\t1\r\n010\t2\r\n" })).toBe(true);
  expect(view.state.doc.child(0).textContent).toBe("Intro");
  const table = tableOf(view);
  expect(names(table)).toEqual(["Code", "Qty"]);
  expect(grid(table)).toEqual([["007", "1"], ["010", "2"]]);
});

test("a paste that is not a lone grid is left to the editor", () => {
  const view = editor([["p", "paragraph", ""]]);
  select(view, 1);
  expect(paste(view, { "text/html": `<p>Hello</p>${sheets}`, "text/plain": "Hello" })).toBe(false);
  expect(paste(view, { "text/plain": "one line" })).toBe(false);
  expect(paste(view, { "text/html": "<table><tr><td>x</td></tr></table>", "text/plain": "x" })).toBe(false);
  expect(gridFromClipboard("", "a\tb")).toMatchObject({ width: 2, height: 1, grid: [["a", "b"]] });
});

test("a copied page table pastes as a new table without turning its first row into names", () => {
  const view = editor([["p", "paragraph", ""]]);
  select(view, 1);
  const own = `<table data-id="t1"><tbody><tr data-id="r1"><td data-col="c1">A</td><td data-col="c2">1</td></tr><tr data-id="r2"><td data-col="c1">B</td><td data-col="c2">2</td></tr></tbody></table>`;
  expect(paste(view, { "text/html": own, "text/plain": "A\n\n1" })).toBe(true);
  const table = tableOf(view);
  expect(names(table)).toEqual(["Column 1", "Column 2"]);
  expect(grid(table)).toEqual([["A", "1"], ["B", "2"]]);
  expect(Object.keys(table.rows)).not.toContain("r1");
});

test("pasting a rectangle into a cell overwrites from that cell, adds rows and drops extra columns, in one undo step", () => {
  const tbl = {
    t: "table", pos: "V",
    cols: { c1: { pos: "1", name: "A" }, c2: { pos: "2", name: "B" } },
    rows: { r1: { pos: "1", cells: { c1: "a1", c2: "b1" } }, r2: { pos: "2", cells: { c1: "a2", c2: "b2" } } },
  };
  const view = editor([], { blocks: { tbl } });
  const before = view.state.doc;
  select(view, 1 + 1 + view.state.doc.child(0).child(0).child(0).nodeSize + 1);
  expect(paste(view, { "text/plain": "x\ty\tz\nu\tv\tw\n" })).toBe(true);
  const table = tableOf(view);
  expect(grid(table)).toEqual([["a1", "x"], ["a2", "u"]]);
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.eq(before)).toBe(true);
  select(view, 1 + 1 + view.state.doc.child(0).child(0).child(0).nodeSize + 1);
  expect(paste(view, { "text/plain": "p\nq\nr\n" })).toBe(false);
  expect(paste(view, { "text/plain": "p\tP\nq\tQ\nr\tR" })).toBe(true);
  expect(grid(tableOf(view))).toEqual([["a1", "p"], ["a2", "q"], ["", "r"]]);
  expect(view.state.selection.$head.index(1)).toBe(2);
});
