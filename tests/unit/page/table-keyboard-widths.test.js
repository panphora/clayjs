import { editor, posOf, select } from "./view-helpers.js";
import { blockJson } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { deleteColumn, selectTableCell, setColumnWidth, MIN_WIDTH, MAX_WIDTH } from "../../../src/page/table.js";

/**
 * A column's border is a focusable separator, so a column can be sized from the
 * keyboard. The arrows only preview; the key that stops repeating, Enter or
 * leaving the handle commits exactly one command, and a preview that a peer
 * invalidated is dropped rather than written.
 */

afterEach(() => { document.body.innerHTML = ""; });

const tbl = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name" }, c2: { pos: "2", name: "Owner" } },
  rows: { r1: { pos: "1", cells: { c1: "a", c2: "x" } } },
};
const cols = (view) => blockJson(view.state.doc.child(0)).cols;
const colWidth = (view, id) => view.dom.querySelector(`col[data-col="${id}"]`).style.width;
const handle = (view, id = "c1") => view.dom.querySelector(`th[data-col="${id}"] .page-table-resize`);
const press = (el, type, key, shiftKey = false) => el.dispatchEvent(new KeyboardEvent(type, { key, shiftKey, bubbles: true, cancelable: true }));

const open = () => {
  const view = editor([], { blocks: { tbl } });
  view.scrollToSelection = () => {};
  return view;
};

test("a resize handle is a focusable vertical separator that names its column and range", () => {
  const view = open();
  const el = handle(view);
  expect(el.getAttribute("role")).toBe("separator");
  expect(el.getAttribute("aria-orientation")).toBe("vertical");
  expect(el.getAttribute("aria-label")).toBe("Resize column Name");
  expect([el.getAttribute("aria-valuemin"), el.getAttribute("aria-valuemax"), el.getAttribute("aria-valuenow")]).toEqual(["48", "1200", "160"]);
  expect(el.tabIndex).toBe(0);
  expect(handle(view, "c2").getAttribute("aria-label")).toBe("Resize column Owner");
});

test("repeated arrow downs preview, and one keyup writes one width as one undo step", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  press(el, "keydown", "ArrowRight");
  press(el, "keydown", "ArrowRight");
  expect(colWidth(view, "c1")).toBe("190px");
  expect(el.getAttribute("aria-valuenow")).toBe("190");
  expect(cols(view).c1.width).toBeUndefined();
  press(el, "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBe(190);
  // The first width on a table that fills the page pins the others at their drawn width (160 in jsdom).
  expect(cols(view).c2.width).toBe(160);
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1.width).toBeUndefined();
  expect(colWidth(view, "c1")).toBe("");
});

test("Shift makes the step 50, and Home and End preview the bounds", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight", true);
  expect(colWidth(view, "c1")).toBe("210px");
  press(el, "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBe(210);
  press(handle(view), "keydown", "Home");
  expect([colWidth(view, "c1"), handle(view).getAttribute("aria-valuenow")]).toEqual([`${MIN_WIDTH}px`, String(MIN_WIDTH)]);
  press(handle(view), "keyup", "Home");
  expect(cols(view).c1.width).toBe(MIN_WIDTH);
  press(handle(view), "keydown", "End");
  press(handle(view), "keyup", "End");
  expect(cols(view).c1.width).toBe(MAX_WIDTH);
});

test("the arrows clamp to the range instead of walking past it", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  for (let i = 0; i < 20; i++) press(el, "keydown", "ArrowLeft");
  expect(colWidth(view, "c1")).toBe(`${MIN_WIDTH}px`);
  press(el, "keyup", "ArrowLeft");
  expect(cols(view).c1.width).toBe(MIN_WIDTH);
  expect(setColumnWidth("c1", MAX_WIDTH)(view.state, view.dispatch)).toBe(true);
  for (let i = 0; i < 120; i++) press(handle(view), "keydown", "ArrowRight");
  press(handle(view), "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBe(MAX_WIDTH);
});

test("Escape cancels the preview and leaves the document untouched", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  press(el, "keydown", "ArrowRight");
  const before = JSON.stringify(blockJson(view.state.doc.child(0)));
  press(el, "keydown", "Escape");
  expect(colWidth(view, "c1")).toBe("");
  expect(el.getAttribute("aria-valuenow")).toBe("160");
  expect(JSON.stringify(blockJson(view.state.doc.child(0)))).toBe(before);
  press(el, "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBeUndefined();
});

test("Enter commits the preview at once", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  press(el, "keydown", "Enter");
  expect(cols(view).c1.width).toBe(170);
});

test("leaving the handle commits the preview before the focus goes", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  el.blur();
  expect(cols(view).c1.width).toBe(170);
});

test("a column a peer removed during the preview cancels it instead of writing", () => {
  const view = open();
  const el = handle(view);
  selectTableCell(view, 0, 0, 0);
  el.focus();
  press(el, "keydown", "ArrowRight");
  expect(deleteColumn(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1).toBeUndefined();
  const before = JSON.stringify(blockJson(view.state.doc.child(0)));
  expect(() => press(el, "keyup", "ArrowRight")).not.toThrow();
  expect(JSON.stringify(blockJson(view.state.doc.child(0)))).toBe(before);
  expect(colWidth(view, "c2")).toBe("");
});

test("a peer's width during the preview wins, and the late keyup writes nothing", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  expect(setColumnWidth("c1", 300)(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1.width).toBe(300);
  expect(handle(view).getAttribute("aria-valuenow")).toBe("300");
  press(el, "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBe(300);
});

test("the same column's handle keeps the focus after the table re-renders", () => {
  const view = open();
  const before = handle(view);
  before.focus();
  press(before, "keydown", "ArrowRight");
  press(before, "keydown", "Enter");
  const after = handle(view);
  expect(after).not.toBe(before);
  expect(document.activeElement).toBe(after);
  expect(after.getAttribute("aria-valuenow")).toBe("170");
});

test("a keyboard width change leaves the caret's own cell selected", () => {
  const view = open();
  selectTableCell(view, 0, 0, 1);
  const from = view.state.selection.from;
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  press(el, "keydown", "Enter");
  expect(cols(view).c1.width).toBe(170);
  expect(view.state.selection.from).toBe(from);
  expect(view.state.selection.$head.parent.textContent).toBe("x");
});

test("a width set from the keyboard joins the pointer's width, not a second format", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "End");
  press(el, "keyup", "End");
  expect(view.dom.querySelector("table").classList.contains("is-sized")).toBe(true);
  expect(view.dom.querySelector("table").style.width).toBe(`${MAX_WIDTH + 160}px`);
});

const tableView = (view, index) => [...view.dom.querySelectorAll(".page-table")][index];
const handleIn = (view, index, id = "c1") => tableView(view, index).querySelector(`th[data-col="${id}"] .page-table-resize`);
const widthIn = (view, index, id = "c1") => tableView(view, index).querySelector(`col[data-col="${id}"]`).style.width;
const colsAt = (view, index) => blockJson(view.state.doc.child(index)).cols;

// Two tables made by duplicating one share their column IDs, so a column ID
// alone does not say which table a separator belongs to.
const twin = () => editor([], { blocks: { ta: { ...tbl, pos: "B" }, tb: { ...tbl, pos: "C" } } });

test("a keyboard resize writes the handle's table, not the table holding the caret", () => {
  const view = twin();
  selectTableCell(view, 0, 0, 0);
  const el = handleIn(view, 1);
  el.focus();
  press(el, "keydown", "ArrowRight");
  expect(widthIn(view, 1)).toBe("170px");
  press(el, "keyup", "ArrowRight");
  expect(colsAt(view, 0).c1.width).toBeUndefined();
  expect(colsAt(view, 1).c1.width).toBe(170);
});

test("a keyboard resize works with the caret in a paragraph, not only inside a table", () => {
  const view = editor([], { blocks: { p: { t: "paragraph", pos: "B", c: "P" }, tbl } });
  select(view, posOf(view, "p"));
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  press(el, "keyup", "ArrowRight");
  expect(colsAt(view, 1).c1.width).toBe(170);
});

test("an edit to the table during an arrow key keeps the preview, and the keyup commits it", () => {
  const view = open();
  const el = handle(view);
  el.focus();
  press(el, "keydown", "ArrowRight");
  selectTableCell(view, 0, 0, 1);
  view.dispatch(view.state.tr.insertText("!"));
  expect(view.state.doc.child(0).textContent).toBe("a!x");
  expect(colWidth(view, "c1")).toBe("170px");
  expect(cols(view).c1.width).toBeUndefined();
  press(handle(view), "keyup", "ArrowRight");
  expect(cols(view).c1.width).toBe(170);
});
