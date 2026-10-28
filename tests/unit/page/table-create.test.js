import { editor, select, key, posOf } from "./view-helpers.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { history, state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { gridFromClipboard } from "../../../src/page/table-paste.js";
import { loadClipboardShape } from "../../../src/page/blocks.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createYPageBinding, seedValue } from "../../../src/page/ybind/index.js";

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

test("a copied page table pastes as a new table without turning its first row into names", async () => {
  await loadClipboardShape();
  const view = editor([["p", "paragraph", ""]]);
  select(view, 1);
  const own = `<table data-id="t1"><tbody><tr data-id="r1"><td data-col="c1">A</td><td data-col="c2">1</td></tr><tr data-id="r2"><td data-col="c1">B</td><td data-col="c2">2</td></tr></tbody></table>`;
  const data = { "text/html": own, "text/plain": "A\n\n1" };
  // The grid paste leaves the editor's own table to the clipboard parser, which keeps its header.
  expect(paste(view, data)).toBe(false);
  view.dom.dispatchEvent(Object.assign(new Event("paste", { bubbles: true, cancelable: true }), clip(data)));
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

const kinds = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.type.name)); return out; };
const texts = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.textContent)); return out; };
const spec = (n) => Array.from({ length: n }, (_, i) => [`b${i}`, "paragraph", `block${i}`]);
const tsv = { "text/plain": "X\tY\n1\t2" };

test("select all and paste a two-line grid leaves one table, not a document of fragments", () => {
  const view = editor(spec(4));
  view.dispatch(view.state.tr.setSelection(new pmState.AllSelection(view.state.doc)));
  expect(paste(view, tsv)).toBe(true);
  expect(kinds(view).filter((name) => name === "table")).toHaveLength(1);
  expect(kinds(view)[0]).toBe("table");
  const table = tableOf(view);
  expect(names(table)).toEqual(["X", "Y"]);
  expect(grid(table)).toEqual([["1", "2"]]);
});

test("a forward selection across three paragraphs is replaced by the pasted table, unsplit", () => {
  const view = editor(spec(5));
  select(view, posOf(view, "b0"), posOf(view, "b2", true));
  expect(paste(view, tsv)).toBe(true);
  expect(kinds(view)).toEqual(["table", "paragraph", "paragraph"]);
  expect(texts(view).slice(1)).toEqual(["block3", "block4"]);
  expect(grid(tableOf(view))).toEqual([["1", "2"]]);
});

test("tab-indented code pasted into a code block is left to the editor", () => {
  const view = editor([["c1", "code_block", "x"]]);
  select(view, posOf(view, "c1") + 1);
  expect(paste(view, { "text/plain": "function f() {\n\treturn 1;\n}" })).toBe(false);
  expect(kinds(view)).toEqual(["code_block"]);
});

test("a lone tab-separated line with no HTML is left to the editor", () => {
  const view = editor([["p1", "paragraph", "Note"]]);
  select(view, posOf(view, "p1") + 4);
  expect(paste(view, { "text/plain": "Total:\t42" })).toBe(false);
  expect(kinds(view)).toEqual(["paragraph"]);
  expect(texts(view)).toEqual(["Note"]);
});

test("the same lone line with a one-row HTML table makes a table", () => {
  const view = editor([["p1", "paragraph", "Note"]]);
  select(view, posOf(view, "p1") + 4);
  expect(paste(view, { "text/html": "<table><tr><td>Total:</td><td>42</td></tr></table>", "text/plain": "Total:\t42" })).toBe(true);
  expect(kinds(view)).toContain("table");
  const table = tableOf(view);
  expect(names(table)).toEqual(["Column 1", "Column 2"]);
  expect(grid(table)).toEqual([["Total:", "42"]]);
});

test("one Undo restores three whole paragraphs replaced by a multi-block paste", () => {
  const view = editor(spec(5));
  const before = view.state.doc;
  select(view, posOf(view, "b0"), posOf(view, "b2", true));
  expect(paste(view, tsv)).toBe(true);
  expect(kinds(view)).toEqual(["table", "paragraph", "paragraph"]);
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.eq(before)).toBe(true);
});

test("one Undo through the Yjs binding restores three whole paragraphs replaced by a multi-block paste", () => {
  const value = seedValue([0, 1, 2, 3, 4].map((i) => ({ id: `b${i}`, text: `block${i}` })));
  const store = createStore({ name: "page", value });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = createPageEditor(document.body.appendChild(document.createElement("div")), { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board });
  binding.attach(view);
  select(view, posOf(view, "b0"), posOf(view, "b2", true));
  expect(paste(view, tsv)).toBe(true);
  expect(kinds(view)).toEqual(["table", "paragraph", "paragraph"]);
  expect(binding.undo()).toBe(true);
  const restored = [];
  view.state.doc.forEach((node) => restored.push([node.type.name, node.attrs.id, node.textContent]));
  expect(restored).toEqual([
    ["paragraph", "b0", "block0"],
    ["paragraph", "b1", "block1"],
    ["paragraph", "b2", "block2"],
    ["paragraph", "b3", "block3"],
    ["paragraph", "b4", "block4"],
  ]);
  view.destroy();
  binding.dispose();
  binding.ydoc.destroy();
});

test("a pasted document with a table among other blocks is not read as one grid", () => {
  const html = "<p>Before the table.</p><table><tr><td>c1</td><td>c2</td></tr><tr><td>d1</td><td>d2</td></tr></table><p>After the table.</p>";
  expect(gridFromClipboard(html, "Before the table.\nc1\tc2\nd1\td2\nAfter the table.")).toBeNull();
  expect(gridFromClipboard("<table><tr><td>c1</td><td>c2</td></tr></table>", "c1\tc2")).toMatchObject({ width: 2, height: 1 });
});
