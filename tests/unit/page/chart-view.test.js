import { jest } from "@jest/globals";
import { editor, posOf } from "./view-helpers.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { renderBlocks } from "../../../src/page/projection.js";
import { blockMap } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";

const table = RECORD.blocks.tbl;
const chart = RECORD.blocks.ch;
const menuButton = (view, label) => [...view.dom.parentElement.querySelectorAll(".page-menu-item")].find((button) => button.textContent.includes(label));
const openSettings = (view) => view.dom.querySelector(".page-chart-settings").click();
const choose = (view, group, value) => { openSettings(view); menuButton(view, group).click(); menuButton(view, value).click(); };

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

test("Chart this table inserts the default chart after the table and undoes once", () => {
  const view = editor([], { blocks: { tbl: table } });
  view.dom.querySelector('th[data-col="c1"] button').click();
  menuButton(view, "Chart this table").click();
  expect(view.state.doc.childCount).toBe(2);
  const attrs = view.state.doc.child(1).attrs;
  expect(attrs).toMatchObject({ source: "tbl", kind: "line", x: "c1", series: ["c2"], title: "" });
  expect(attrs.id).toBeTruthy();
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.childCount).toBe(1);
});

test("each chart setting makes one transaction", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  paint();
  const dispatch = jest.spyOn(view, "dispatch");
  openSettings(view);
  menuButton(view, "Bar").click();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.kind).toBe("bar");
  dispatch.mockClear();
  choose(view, "Highlight row", "Sep 28");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.highlight).toBe("r2");
  dispatch.mockClear();
  choose(view, "X column", "Note");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.x).toBe("c3");
  dispatch.mockClear();
  choose(view, "Series", "Week");
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.series).toContain("c1");
  openSettings(view);
  menuButton(view, "Series").click();
  expect(menuButton(view, "Week").getAttribute("aria-checked")).toBe("true");
  dispatch.mockClear();
  openSettings(view);
  menuButton(view, "Edit title").click();
  const input = view.dom.querySelector('input[aria-label="Chart title"]');
  input.value = "Edited chart";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(view.state.doc.child(1).attrs.title).toBe("Edited chart");
  dispatch.mockRestore();
});

test("table changes paint once per frame and the editor SVG matches the saved projection", () => {
  const view = editor([], { blocks: { tbl: table, ch: chart } });
  expect(paint()).toBe(1);
  const before = view.dom.querySelector(".page-chart svg").outerHTML;
  const at = posOf(view, "tbl") + 3;
  view.dispatch(view.state.tr.insertText("!", at));
  view.dispatch(view.state.tr.insertText("?", at));
  expect(frames).toHaveLength(1);
  expect(paint()).toBe(1);
  const svg = view.dom.querySelector(".page-chart svg").outerHTML;
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
  const initial = view.dom.querySelector(".page-chart svg").outerHTML;
  view.dom.querySelector('th[data-col="c2"] button').click();
  menuButton(view, "Sort ascending").click();
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart svg").outerHTML).not.toBe(initial);
  view.dom.querySelector('th[data-col="c2"] button').click();
  menuButton(view, "Delete column").click();
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart svg title").textContent).toBe("Chart source missing");
  view.dispatch(view.state.tr.delete(0, view.state.doc.child(0).nodeSize));
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart svg title").textContent).toBe("Chart source missing");
});
