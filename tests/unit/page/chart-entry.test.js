import { jest } from "@jest/globals";
import { editor, posOf, select, typeText } from "./view-helpers.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { chartFromSlash, chartTables, tableLabel } from "../../../src/page/chart.js";
import { CHART_ITEM, runItem } from "../../../src/page/items.js";

afterEach(() => { document.body.innerHTML = ""; });

const table = RECORD.blocks.tbl;
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const labels = (view) => [...menu(view).querySelectorAll(".page-menu-item")].map((row) => row.querySelector(".page-menu-label").textContent);
const item = (view, label) => [...menu(view).querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === label);
const descriptions = (view) => [...menu(view).querySelectorAll(".page-menu-item")].map((row) => row.querySelector(".page-menu-desc")?.textContent ?? "");
const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const slash = (view, query) => { view.coordsAtPos = () => COORDS; for (const ch of `/${query}`) typeText(view, ch); };
const types = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.type.name)); return out; };
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const painted = () => new Promise((resolve) => { window.requestAnimationFrame(() => setTimeout(resolve, 0)); });
const toasts = () => [...document.querySelectorAll("[data-clay-toast]")];
const untilToast = async (text) => {
  for (let i = 0; i < 50 && !toasts().some((toast) => toast.textContent.includes(text)); i++) await settled();
};

test("/chart is listed only when the page has a table", () => {
  const plain = editor([["p", "paragraph", ""]]);
  select(plain, 1);
  slash(plain, "");
  expect(labels(plain)).not.toContain("Chart");
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } } });
  select(view, posOf(view, "p"));
  slash(view, "chart");
  expect(labels(view)[0]).toBe("Chart");
});

test("/chart with one table turns the empty line into a bar chart of that table, as one undo step", async () => {
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } } });
  select(view, posOf(view, "p"));
  slash(view, "chart");
  item(view, "Chart").click();
  await settled();
  expect(types(view)).toEqual(["table", "chart"]);
  const attrs = view.state.doc.child(1).attrs;
  expect(attrs).toMatchObject({ source: "tbl", kind: "bar", x: "c1", series: ["c2"], pos: "Z" });
  expect(attrs.id).not.toBe("p");
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(types(view)).toEqual(["table", "paragraph"]);
  expect(view.state.doc.child(1).attrs.id).toBe("p");
});

test("/chart with several tables asks which one, by their headings and row counts", async () => {
  const second = { ...table, pos: "X", cols: { k1: { pos: "1", name: "Month" }, k2: { pos: "2", name: "Revenue", kind: "number" } }, rows: { s1: { pos: "1", cells: { k1: "Jan", k2: "4" } } } };
  const view = editor([
    ["hr", "heading", "Revenue", { level: 2 }],
    ["tbl", "table", "", { cols: table.cols, rows: table.rows }],
    ["hs", "heading", "Support", { level: 2 }],
    ["two", "table", "", { cols: second.cols, rows: second.rows }],
    ["p", "paragraph", ""],
  ]);
  expect(chartTables(view.state.doc).map(tableLabel)).toEqual(["Week, Activation %, Note", "Month, Revenue"]);
  select(view, posOf(view, "p"));
  slash(view, "chart");
  item(view, "Chart").click();
  await settled();
  expect(labels(view)).toEqual(["Revenue", "Support"]);
  expect(descriptions(view)).toEqual(["2 rows · Week, Activation %, Note", "1 row · Month, Revenue"]);
  item(view, "Support").click();
  await settled();
  expect(types(view)).toEqual(["heading", "table", "heading", "table", "chart"]);
  expect(view.state.doc.child(4).attrs).toMatchObject({ source: "two", x: "k1", series: ["k2"] });
});

test("/chart with one table opens its inspector, and undo then redo leaves it closed", async () => {
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } } });
  select(view, posOf(view, "p"));
  slash(view, "chart");
  item(view, "Chart").click();
  await settled();
  await painted();
  expect(view.dom.querySelector(".page-chart-panel")).not.toBeNull();
  expect(view.dom.querySelector(".page-chart-edit").getAttribute("aria-expanded")).toBe("true");
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(types(view)).toEqual(["table", "paragraph"]);
  expect(history.redo(view.state, view.dispatch)).toBe(true);
  expect(types(view)).toEqual(["table", "chart"]);
  await painted();
  expect(view.dom.querySelector(".page-chart-panel")).toBeNull();
  expect(view.dom.querySelector(".page-chart-edit").getAttribute("aria-expanded")).toBe("false");
});

test("/chart with no table toasts and inserts nothing, and the query is consumed", async () => {
  const view = editor([["p", "paragraph", ""]]);
  expect(chartFromSlash(view, 0)).toBe(true);
  await untilToast("Add a table first: a chart plots the numbers in a table on this page.");
  expect(toasts().some((toast) => toast.textContent.includes("Add a table first: a chart plots the numbers in a table on this page."))).toBe(true);
  expect(types(view)).toEqual(["paragraph"]);
});

test("a chart picked on a line with text goes below it", () => {
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "Notes" } } });
  expect(chartFromSlash(view, 1)).toBe(true);
  expect(types(view)).toEqual(["table", "paragraph", "chart"]);
  expect(view.state.doc.child(1).textContent).toBe("Notes");
});

const deferred = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
};

const heldChart = () => {
  const { gate, release } = deferred();
  return { features: { ensure: () => gate, has: () => false, dispose() {} }, release };
};

const dispatchedBy = (view) => {
  const seen = [];
  const real = view.dispatch.bind(view);
  view.dispatch = (tr) => { seen.push(tr); return real(tr); };
  return seen;
};

const withNoHost = async (run) => {
  const real = globalThis.fetch;
  const fetch = jest.fn(async () => { throw new Error("the test has no host"); });
  globalThis.fetch = window.fetch = fetch;
  try {
    await run(fetch);
  } finally {
    globalThis.fetch = window.fetch = real;
  }
};

test("a chart chosen while its module loads does nothing once the session ended", async () => {
  await withNoHost(async (fetch) => {
    const { features, release } = heldChart();
    const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } }, features });
    const dispatched = dispatchedBy(view);
    const action = runItem(view, CHART_ITEM, 1);
    view.destroy();
    release();
    await expect(action).resolves.toBe(false);
    expect(dispatched).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

test("a chart chosen before its module loads leaves a second session untouched", async () => {
  await withNoHost(async (fetch) => {
    const { features, release } = heldChart();
    const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } }, features });
    const dispatched = dispatchedBy(view);
    const action = runItem(view, CHART_ITEM, 1);
    const second = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } } });
    const secondDoc = second.state.doc;
    const secondDispatched = dispatchedBy(second);
    view.destroy();
    release();
    await expect(action).resolves.toBe(false);
    expect(dispatched).toEqual([]);
    expect(secondDispatched).toEqual([]);
    expect(second.state.doc).toBe(secondDoc);
    expect(fetch).not.toHaveBeenCalled();
  });
});
