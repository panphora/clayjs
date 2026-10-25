import { editor, select } from "./view-helpers.js";
import { blockJson } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { setColumnWidth, MIN_WIDTH, MAX_WIDTH } from "../../../src/page/table.js";
import { project, renderModel, parseModel } from "../../../src/page/projection.js";

const tbl = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name" }, c2: { pos: "2", name: "Owner" } },
  rows: { r1: { pos: "1", cells: { c1: "a", c2: "x" } } },
};
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const item = (view, label) => [...menu(view).querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === label);
const cols = (view) => blockJson(view.state.doc.child(0)).cols;
const pointer = (type, target, clientX) => target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }), { pointerId: 1 }));

test("dragging a column border stores a clamped width as one step and draws a fixed layout", () => {
  const view = editor([], { blocks: { tbl } });
  expect(view.dom.querySelectorAll("colgroup col")).toHaveLength(2);
  expect(view.dom.querySelector("table").classList.contains("is-sized")).toBe(false);
  const handle = view.dom.querySelector('th[data-col="c1"] .page-table-resize');
  expect(handle.getAttribute("aria-label")).toBe("Resize column Name");
  expect(handle.getAttribute("role")).toBe("separator");
  expect(handle.getAttribute("aria-orientation")).toBe("vertical");
  pointer("pointerdown", handle, 100);
  pointer("pointermove", view.dom.ownerDocument, 160);
  expect(view.dom.querySelector('col[data-col="c1"]').style.width).toBe("220px");
  expect(cols(view).c1.width).toBeUndefined();
  pointer("pointerup", view.dom.ownerDocument, 160);
  expect(cols(view).c1).toEqual({ pos: "1", name: "Name", width: 220 });
  expect(cols(view).c2.width).toBeUndefined();
  const table = view.dom.querySelector("table");
  expect(table.classList.contains("is-sized")).toBe(true);
  expect([...view.dom.querySelectorAll("colgroup col")].map((col) => col.style.width)).toEqual(["220px", "160px"]);
  expect(table.style.width).toBe("380px");
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1.width).toBeUndefined();
});

test("a live drag survives the editor's mutation observer: the table view is kept and the width lands", async () => {
  const view = editor([], { blocks: { tbl } });
  const table = view.dom.querySelector("table");
  const handle = view.dom.querySelector('th[data-col="c1"] .page-table-resize');
  pointer("pointerdown", handle, 100);
  pointer("pointermove", view.dom.ownerDocument, 130);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(view.dom.querySelector("table")).toBe(table);
  pointer("pointermove", view.dom.ownerDocument, 160);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(view.dom.querySelector('col[data-col="c1"]').style.width).toBe("220px");
  pointer("pointerup", view.dom.ownerDocument, 160);
  expect(cols(view).c1.width).toBe(220);
});

test("the Width menu is the button equivalent: Wider, Narrower, Fit and Reset", () => {
  const view = editor([], { blocks: { tbl } });
  view.dom.querySelector('th[data-col="c2"] button').click();
  expect(item(view, "Width ▸").querySelector(".page-menu-hint")?.textContent ?? "Auto").toMatch(/Auto/);
  item(view, "Width ▸").click();
  expect(item(view, "Reset width")).toBeUndefined();
  item(view, "Wider").click();
  expect(cols(view).c2.width).toBe(200);
  view.dom.querySelector('th[data-col="c2"] button').click();
  item(view, "Width ▸").click();
  item(view, "Narrower").click();
  expect(cols(view).c2.width).toBe(160);
  view.dom.querySelector('th[data-col="c2"] button').click();
  item(view, "Width ▸").click();
  item(view, "Reset width").click();
  expect("width" in cols(view).c2).toBe(false);
});

test("Fit sizes a column to its widest unwrapped cell text, measured outside the editor", () => {
  const view = editor([], { blocks: { tbl: { ...tbl, rows: { r1: { pos: "1", cells: { c1: "a", c2: "x" } }, r2: { pos: "2", cells: { c1: "a much longer name", c2: "y" } } } } } });
  const rect = HTMLElement.prototype.getBoundingClientRect;
  const probes = [];
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.style.whiteSpace === "pre") probes.push(this.textContent);
    return this.style.whiteSpace === "pre" ? { width: this.textContent.length * 7, height: 16 } : rect.call(this);
  };
  try {
    view.dom.querySelector('th[data-col="c1"] .page-table-resize').dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  } finally {
    HTMLElement.prototype.getBoundingClientRect = rect;
  }
  expect(probes).toEqual(["a", "a much longer name"]);
  expect(cols(view).c1.width).toBe("a much longer name".length * 7 + 24);
  expect(view.dom.ownerDocument.body.querySelectorAll('span[style*="visibility: hidden"]')).toHaveLength(0);
});

test("setColumnWidth clamps, refuses junk and skips a no-op", () => {
  const view = editor([], { blocks: { tbl } });
  select(view, 3);
  expect(setColumnWidth("c1", 5)(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1.width).toBe(MIN_WIDTH);
  expect(setColumnWidth("c1", 99999)(view.state, view.dispatch)).toBe(true);
  expect(cols(view).c1.width).toBe(MAX_WIDTH);
  expect(setColumnWidth("c1", MAX_WIDTH)(view.state)).toBe(false);
  expect(setColumnWidth("c1", NaN)(view.state)).toBe(false);
  expect(setColumnWidth("c1", -1)(view.state)).toBe(false);
  expect(setColumnWidth("nope", 200)(view.state)).toBe(false);
  expect(setColumnWidth("c2", null)(view.state)).toBe(false);
});

test("the saved article carries the width and reads it back; junk widths are dropped", () => {
  const sized = { ...tbl, cols: { c1: { pos: "1", name: "Name", width: 240 }, c2: { pos: "2", name: "Owner", width: "wide" } } };
  const [item] = project({ tbl: sized });
  expect(item.cols).toEqual([{ id: "c1", name: "Name", width: 240 }, { id: "c2", name: "Owner" }]);
  const html = renderModel([item]);
  expect(html).toContain('<th data-col="c1" data-width="240" style="width:240px">Name</th>');
  expect(html).toContain('<th data-col="c2">Owner</th>');
  const article = document.createElement("article");
  article.innerHTML = html;
  expect(parseModel(article)).toEqual([item]);
  article.querySelector("th").setAttribute("data-width", "-3");
  expect(parseModel(article)[0].cols[0]).toEqual({ id: "c1", name: "Name" });
});
