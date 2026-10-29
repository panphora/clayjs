import { jest } from "@jest/globals";
import { editor, posOf } from "./view-helpers.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { renderBlocks } from "../../../src/page/projection.js";
import { blockMap } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { pendingIds } from "../../../src/lib/unsaved-state.js";
import { runSaveBarrier } from "../../../src/core/mode-transition.js";

const table = RECORD.blocks.tbl;
const chart = RECORD.blocks.ch;
const menuButton = (view, label) => [...view.dom.parentElement.querySelectorAll(".page-menu-item")].find((button) => button.textContent.includes(label));
const openPanel = (view) => view.dom.querySelector(".page-chart-edit").click();
const panel = (view) => view.dom.querySelector(".page-chart-panel");
const typeButton = (view, label) => [...panel(view).querySelectorAll(".page-chart-type")].find((button) => button.textContent === label);
const field = (view, name) => panel(view).querySelector(`[data-field="${name}"]`);
const pick = (view, name, value) => { const control = field(view, name); control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); };
const valueColumn = (view, col) => panel(view).querySelector(`[data-field="series"][data-col="${col}"]`);
const toggleValue = (view, col) => { const box = valueColumn(view, col); box.checked = !box.checked; box.dispatchEvent(new Event("change", { bubbles: true })); };

let frames;
let originalRaf;
let originalCancel;
beforeEach(() => {
  frames = [];
  originalRaf = window.requestAnimationFrame;
  originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  window.cancelAnimationFrame = () => {};
});
afterEach(() => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancel;
});
const paint = () => { const queued = frames.splice(0); queued.forEach((callback) => callback()); return queued.length; };
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const flushChrome = () => {
  const at = frames.findIndex((callback) => callback.toString().includes("measureLayout"));
  if (at >= 0) frames.splice(at, 1)[0]();
};

test("Chart this table inserts the default chart after the table and undoes once", async () => {
  const view = editor([], { blocks: { tbl: table } });
  view.dom.querySelector('th[data-col="c1"] button').click();
  menuButton(view, "Chart this table").click();
  await settled();
  expect(view.state.doc.childCount).toBe(2);
  const attrs = view.state.doc.child(1).attrs;
  expect(attrs).toMatchObject({ source: "tbl", kind: "bar", x: "c1", series: ["c2"], title: "" });
  expect(attrs.id).toBeTruthy();
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
});

test("the header shows the title, the source table's heading name, and Edit chart's state", () => {
  const view = editor([["q", "heading", "Quarterly revenue", { level: 2 }], ["tbl", "table", "", { cols: table.cols, rows: table.rows }], ["ch", "chart", "", { source: "tbl", x: "c1", series: ["c2"] }]]);
  paint();
  expect(view.dom.querySelector(".page-chart-title").textContent).toBe("Untitled chart");
  expect(view.dom.querySelector(".page-chart-title").classList.contains("is-empty")).toBe(true);
  expect(view.dom.querySelector(".page-chart-source").textContent).toBe("Quarterly revenue");
  expect(view.dom.querySelector(".page-chart-edit").getAttribute("aria-expanded")).toBe("false");
  expect(view.state.doc.child(2).attrs.title).toBe("");

  const alone = editor([["tbl", "table", "", { cols: table.cols, rows: table.rows }], ["ch", "chart", "", { source: "tbl", x: "c1", series: ["c2"] }]]);
  paint();
  expect(alone.dom.querySelector(".page-chart-source").textContent).toBe("Table 1");

  const titled = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  expect(titled.dom.querySelector(".page-chart-title").textContent).toBe("Activation by week");
  expect(titled.dom.querySelector(".page-chart-title").classList.contains("is-empty")).toBe(false);
});

test("opening the panel saves nothing for an empty title", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  view.dispatch(view.state.tr.setNodeMarkup(posOf(view, "ch") - 1, null, { ...view.state.doc.child(1).attrs, title: "" }));
  paint();
  const dispatch = jest.spyOn(view, "dispatch");
  openPanel(view);
  expect(view.dom.querySelector(".page-chart-title").textContent).toBe("Untitled chart");
  expect(dispatch).toHaveBeenCalledTimes(0);
  expect(view.state.doc.child(1).attrs.title).toBe("");
  dispatch.mockRestore();
});

test("the source chip puts the caret in the table's first cell", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  view.dom.querySelector(".page-chart-source").click();
  expect(view.state.selection.$head.parent.type.name).toBe("table_cell");
  expect(view.state.selection.$head.parent.attrs.col).toBe("c1");
});

test("each chart setting makes one transaction", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  const dispatch = jest.spyOn(view, "dispatch");
  openPanel(view);
  typeButton(view, "Bar").click();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.kind).toBe("bar");
  dispatch.mockClear();
  pick(view, "highlight", "r2");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.highlight).toBe("r2");
  dispatch.mockClear();
  pick(view, "labels", "c3");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.x).toBe("c3");
  dispatch.mockClear();
  toggleValue(view, "c1");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.series).toContain("c1");
  expect(valueColumn(view, "c1").checked).toBe(true);
  dispatch.mockClear();
  const title = field(view, "title");
  title.value = "Edited chart";
  title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.title).toBe("Edited chart");
  dispatch.mockRestore();
});

test("switching the source table resets the labels and value columns in one transaction", () => {
  const second = { t: "table", pos: "Z", cols: { d1: { pos: "1", name: "Region" }, d2: { pos: "2", name: "Tickets", kind: "number" }, d3: { pos: "3", name: "Resolved", kind: "number" } }, rows: { r1: { pos: "1", cells: { d1: "North", d2: "182", d3: "176" } } } };
  const view = editor([], { blocks: { tbl: table, ch: chart, other: second } });
  paint();
  openPanel(view);
  const dispatch = jest.spyOn(view, "dispatch");
  pick(view, "source", "other");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs).toMatchObject({ source: "other", x: "d1", series: ["d2", "d3"] });
  dispatch.mockRestore();
});

test("a typed chart title refuses the exit by name, stays in the field, and a blur writes it", async () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  openPanel(view);
  const input = field(view, "title");
  input.focus();
  input.value = "Edited chart";
  expect(pendingIds()).toEqual(["chart-title"]);

  const refused = await runSaveBarrier({ timeoutMs: 1000 });
  expect(refused).toMatchObject({ ok: false, code: "pending-input" });
  expect(refused.pending).toEqual(["chart-title"]);
  expect(input.isConnected).toBe(true);
  expect(input.value).toBe("Edited chart");

  input.blur();
  expect(view.state.doc.child(1).attrs.title).toBe("Edited chart");
  expect(pendingIds()).toEqual([]);
});

test("Remove deletes the chart block and one undo restores it", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  const id = view.state.doc.child(1).attrs.id;
  openPanel(view);
  panel(view).querySelector(".page-chart-remove").click();
  expect(view.state.doc.childCount).toBe(1);
  expect(panel(view)).toBeNull();
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.childCount).toBe(2);
  expect(view.state.doc.child(1).attrs.id).toBe(id);
});

test("Pie names one value column and keeps the other selected series in attrs", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  openPanel(view);
  const valueRow = () => [...panel(view).querySelectorAll(".page-chart-row")].find((row) => row.querySelector(".page-chart-values"));
  expect(valueRow().querySelector(".page-chart-label").textContent).toBe("Value columns");
  typeButton(view, "Pie").click();
  expect(view.state.doc.child(1).attrs.kind).toBe("pie");
  expect(view.state.doc.child(1).attrs.series).toEqual(["c2"]);
  expect(valueRow().querySelector(".page-chart-label").textContent).toBe("Value column");
  expect(valueRow().querySelector(".page-chart-hint").textContent).toBe("Pie charts plot the first value column across rows.");
});

test("Escape closes the panel and returns focus to Edit chart", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  openPanel(view);
  const edit = view.dom.querySelector(".page-chart-edit");
  expect(edit.getAttribute("aria-expanded")).toBe("true");
  edit.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(panel(view)).toBeNull();
  expect(edit.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(edit);
});

test("table changes paint once per frame and the editor SVG matches the saved projection", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  expect(frames).toHaveLength(0);
  const before = view.dom.querySelector(".page-chart-plot svg").outerHTML;
  const at = posOf(view, "tbl") + 3;
  view.dispatch(view.state.tr.insertText("!", at));
  view.dispatch(view.state.tr.insertText("?", at));
  flushChrome();
  expect(frames).toHaveLength(1);
  expect(paint()).toBe(1);
  const svg = view.dom.querySelector(".page-chart-plot svg").outerHTML;
  expect(svg).not.toBe(before);
  const saved = new DOMParser().parseFromString(`<article>${renderBlocks(blockMap(view.state.doc)).html}</article>`, "text/html");
  expect(svg).toBe(saved.querySelector('figure[data-type="chart"] svg').outerHTML);
});

test("a narrow chart draws no more than three Y ticks", () => {
  const narrowTable = JSON.parse(JSON.stringify(table));
  narrowTable.rows.r1.cells.c2 = "0";
  narrowTable.rows.r2.cells.c2 = "100";
  const view = editor([], { blocks: { tbl: narrowTable, ch: chart } });
  const figure = view.dom.querySelector(".page-chart");
  figure.getBoundingClientRect = () => ({ width: 390 });
  paint();
  expect(figure.querySelectorAll("svg > line")).toHaveLength(3);
});

test("sorting, column removal and table removal redraw or show the missing state", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  const initial = view.dom.querySelector(".page-chart-plot svg").outerHTML;
  view.dom.querySelector('th[data-col="c2"] button').click();
  menuButton(view, "Sort ascending").click();
  flushChrome();
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart-plot svg").outerHTML).not.toBe(initial);
  view.dom.querySelector('th[data-col="c2"] button').click();
  menuButton(view, "Delete column").click();
  flushChrome();
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart-plot svg title").textContent).toBe("Chart source missing");
  view.dispatch(view.state.tr.delete(0, view.state.doc.child(0).nodeSize));
  flushChrome();
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart-plot svg title").textContent).toBe("Chart source missing");
});
