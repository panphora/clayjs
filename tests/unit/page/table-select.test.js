import { editor, key } from "./view-helpers.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { rectKey } from "../../../src/page/table-select.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";
import { gridFromClipboard } from "../../../src/page/table-paste.js";

const tbl = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "A" }, c2: { pos: "2", name: "B" }, c3: { pos: "3", name: "C" } },
  rows: {
    r1: { pos: "1", cells: { c1: "a1", c2: { c: "b1", m: [[2, "b"]] }, c3: "c1" } },
    r2: { pos: "2", cells: { c1: "a2", c2: "say \"hi\"\tthere", c3: "c2" } },
    r3: { pos: "3", cells: { c1: "a3", c2: "b3", c3: "c3" } },
  },
};
const td = (view, row, col) => view.dom.querySelectorAll("tbody tr")[row].querySelectorAll("td")[col];
const mouse = (type, target, init = {}) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
const clip = () => { const data = {}; return { data, clipboardData: { setData: (type, value) => { data[type] = value; }, getData: (type) => data[type] ?? "", files: [] } }; };
const fire = (view, type, event) => view.someProp("handleDOMEvents", (handlers) => handlers[type]?.(view, event));
const grid = (view) => { const table = blockJson(view.state.doc.child(0)); const cols = orderedIds(table.cols); return orderedIds(table.rows).map((id) => cols.map((col) => table.rows[id].cells[col])); };
const selected = (view) => [...view.dom.querySelectorAll("td.is-cell-selected")].map((cell) => cell.querySelector("span").textContent);
beforeAll(() => { document.elementFromPoint = () => null; });
afterAll(() => { delete document.elementFromPoint; });
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const item = (view, label) => [...menu(view).querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === label);

test("dragging from one cell to another selects the rectangle between them", () => {
  const view = editor([], { blocks: { tbl } });
  mouse("mousedown", td(view, 0, 0));
  mouse("mouseover", td(view, 0, 0));
  expect(rectKey.getState(view.state)).toBe(null);
  mouse("mouseover", td(view, 1, 1));
  expect(rectKey.getState(view.state)).toEqual({ table: "tbl", anchor: ["r1", "c1"], head: ["r2", "c2"] });
  expect(selected(view)).toEqual(["a1", "b1", "a2", "say \"hi\"\tthere"]);
  expect(view.dom.classList.contains("has-cell-rect")).toBe(true);
  const $at = view.state.doc.resolve(view.posAtDOM(td(view, 2, 2), 0));
  const between = () => view.someProp("createSelectionBetween", (f) => f(view, $at, $at)) ?? null;
  expect(between()).toBe(view.state.selection);
  mouse("mouseup", view.dom.ownerDocument);
  expect(between()).toBe(view.state.selection);
  mouse("mouseover", td(view, 2, 2));
  expect(rectKey.getState(view.state).head).toEqual(["r2", "c2"]);
  mouse("mousedown", td(view, 2, 2));
  expect(rectKey.getState(view.state)).toBe(null);
  expect(between()).toBe(null);
});

test("a key that is not a rectangle key clears it first and then does its usual job", () => {
  const view = editor([], { blocks: { tbl } });
  mouse("mousedown", td(view, 0, 0));
  mouse("mouseover", td(view, 1, 1));
  expect(key(view, "Shift")).toBe(false);
  expect(key(view, "c", { ctrlKey: true })).toBe(false);
  expect(rectKey.getState(view.state)).not.toBe(null);
  expect(key(view, "a")).toBe(false);
  expect(rectKey.getState(view.state)).toBe(null);
});

test("Shift+click extends from the caret cell, Shift+Arrow grows it and Escape clears it", () => {
  const view = editor([], { blocks: { tbl } });
  view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(view.posAtDOM(td(view, 1, 2), 0)))));
  mouse("mousedown", td(view, 0, 1), { shiftKey: true });
  expect(selected(view)).toEqual(["b1", "c1", "say \"hi\"\tthere", "c2"]);
  expect(key(view, "ArrowDown", { shiftKey: true })).toBe(true);
  expect(rectKey.getState(view.state).head).toEqual(["r2", "c2"]);
  expect(key(view, "ArrowLeft", { shiftKey: true })).toBe(true);
  expect(rectKey.getState(view.state).head).toEqual(["r2", "c1"]);
  expect(selected(view)).toEqual(["a2", "say \"hi\"\tthere", "c2"]);
  expect(key(view, "Escape")).toBe(true);
  expect(rectKey.getState(view.state)).toBe(null);
  expect(view.dom.classList.contains("has-cell-rect")).toBe(false);
});

test("copy writes tab-separated text with quoting plus an HTML table that pastes back as the same grid", () => {
  const view = editor([], { blocks: { tbl } });
  mouse("mousedown", td(view, 0, 1));
  mouse("mouseover", td(view, 1, 2));
  const event = clip();
  expect(fire(view, "copy", { ...event, preventDefault() {} })).toBe(true);
  expect(event.data["text/plain"]).toBe('b1\tc1\n"say ""hi""\tthere"\tc2');
  expect(event.data["text/html"]).toBe('<table><tbody><tr><td data-col="c2"><strong>b1</strong></td><td data-col="c3">c1</td></tr><tr><td data-col="c2">say "hi"\tthere</td><td data-col="c3">c2</td></tr></tbody></table>');
  const back = gridFromClipboard(event.data["text/html"], event.data["text/plain"], document);
  expect(back).toMatchObject({ own: true, width: 2, height: 2 });
  expect(back.grid).toEqual([[{ c: "b1", m: [[2, "b"]] }, "c1"], ["say \"hi\" there", "c2"]]);
  expect(gridFromClipboard("", event.data["text/plain"]).grid).toEqual([["b1", "c1"], ["say \"hi\"\tthere", "c2"]]);
});

test("Delete clears the covered cells in one undo step, and cut copies then clears", () => {
  const view = editor([], { blocks: { tbl } });
  const before = view.state.doc;
  mouse("mousedown", td(view, 1, 0));
  mouse("mouseover", td(view, 2, 1));
  expect(key(view, "Backspace")).toBe(true);
  expect(grid(view).map((row) => row.slice(0, 2))).toEqual([["a1", { c: "b1", m: [[2, "b"]] }], ["", ""], ["", ""]]);
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.eq(before)).toBe(true);
  mouse("mouseup", view.dom.ownerDocument);
  mouse("mousedown", td(view, 0, 2));
  mouse("mouseover", td(view, 1, 2));
  const event = clip();
  expect(fire(view, "cut", { ...event, preventDefault() {} })).toBe(true);
  expect(event.data["text/plain"]).toBe("c1\nc2");
  expect(grid(view).map((row) => row[2])).toEqual(["", "", "c3"]);
});

test("a paste with a rectangle starts at its top-left cell, and one value fills every covered cell", () => {
  const view = editor([], { blocks: { tbl } });
  mouse("mousedown", td(view, 1, 1));
  mouse("mouseover", td(view, 2, 2));
  const paste = (text) => view.someProp("handlePaste", (f) => f(view, { clipboardData: { files: [], getData: (type) => (type === "text/plain" ? text : "") } }, null));
  expect(paste("x")).toBe(true);
  expect(grid(view).map((row) => row.slice(1))).toEqual([[{ c: "b1", m: [[2, "b"]] }, "c1"], ["x", "x"], ["x", "x"]]);
  mouse("mouseup", view.dom.ownerDocument);
  mouse("mousedown", td(view, 2, 0));
  mouse("mouseover", td(view, 2, 1));
  expect(paste("p\tq\nr\ts")).toBe(true);
  expect(grid(view).slice(2)).toEqual([["p", "q", "x"], ["r", "s", ""]]);
});

test("Select row and Select column are the button equivalents of a drag", () => {
  const view = editor([], { blocks: { tbl } });
  view.dom.querySelector('th[data-col="c2"] button').click();
  item(view, "Select column").click();
  expect(selected(view)).toEqual(["b1", "say \"hi\"\tthere", "b3"]);
  view.dom.querySelectorAll(".page-table-row-menu:not([hidden])")[2].click();
  item(view, "Select row").click();
  expect(selected(view)).toEqual(["a3", "b3", "c3"]);
});

test("a peer's edit keeps the rectangle while its rows exist; a local edit or a removed row clears it", () => {
  const view = editor([], { blocks: { tbl } });
  const drag = () => { mouse("mouseup", view.dom.ownerDocument); mouse("mousedown", td(view, 0, 0)); mouse("mouseover", td(view, 1, 1)); };
  drag();
  view.dispatch(view.state.tr.insertText("!", view.posAtDOM(td(view, 2, 2), 0)).setMeta(REMOTE_META, true));
  expect(rectKey.getState(view.state)).toEqual({ table: "tbl", anchor: ["r1", "c1"], head: ["r2", "c2"] });
  expect(selected(view)).toHaveLength(4);
  const row = view.dom.querySelectorAll("tbody tr")[1];
  const start = view.posAtDOM(row, 0) - 1;
  view.dispatch(view.state.tr.delete(start, start + view.state.doc.nodeAt(start).nodeSize).setMeta(REMOTE_META, true));
  expect(rectKey.getState(view.state)).toBe(null);
  drag();
  expect(rectKey.getState(view.state)).not.toBe(null);
  view.dispatch(view.state.tr.insertText("?", view.posAtDOM(td(view, 1, 2), 0)));
  expect(rectKey.getState(view.state)).toBe(null);
});
