import { editor, posOf, select, typeText } from "./view-helpers.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { chartFromSlash, chartTables, tableLabel } from "../../../src/page/chart.js";

afterEach(() => { document.body.innerHTML = ""; });

const table = RECORD.blocks.tbl;
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const labels = (view) => [...menu(view).querySelectorAll(".page-menu-item")].map((row) => row.querySelector(".page-menu-label").textContent);
const item = (view, label) => [...menu(view).querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === label);
const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const slash = (view, query) => { view.coordsAtPos = () => COORDS; for (const ch of `/${query}`) typeText(view, ch); };
const types = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.type.name)); return out; };

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

test("/chart with one table turns the empty line into a bar chart of that table, as one undo step", () => {
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "" } } });
  select(view, posOf(view, "p"));
  slash(view, "chart");
  item(view, "Chart").click();
  expect(types(view)).toEqual(["table", "chart"]);
  const attrs = view.state.doc.child(1).attrs;
  expect(attrs).toMatchObject({ source: "tbl", kind: "bar", x: "c1", series: ["c2"], pos: "Z" });
  expect(attrs.id).not.toBe("p");
  view.scrollToSelection = () => {};
  expect(history.undo(view.state, view.dispatch)).toBe(true);
  expect(types(view)).toEqual(["table", "paragraph"]);
  expect(view.state.doc.child(1).attrs.id).toBe("p");
});

test("/chart with several tables asks which one, by their columns", () => {
  const second = { ...table, pos: "X", cols: { k1: { pos: "1", name: "Month" }, k2: { pos: "2", name: "Revenue", kind: "number" } }, rows: { s1: { pos: "1", cells: { k1: "Jan", k2: "4" } } } };
  const view = editor([], { blocks: { tbl: table, two: second, p: { t: "paragraph", pos: "Z", c: "" } } });
  expect(chartTables(view.state.doc).map(tableLabel)).toEqual(["Week, Activation %, Note", "Month, Revenue"]);
  select(view, posOf(view, "p"));
  slash(view, "chart");
  item(view, "Chart").click();
  expect(labels(view)).toEqual(["Table 1", "Table 2"]);
  item(view, "Table 2").click();
  expect(types(view)).toEqual(["table", "table", "chart"]);
  expect(view.state.doc.child(2).attrs).toMatchObject({ source: "two", x: "k1", series: ["k2"] });
});

test("a chart picked on a line with text goes below it, and no table refuses", () => {
  const view = editor([], { blocks: { tbl: table, p: { t: "paragraph", pos: "Z", c: "Notes" } } });
  expect(chartFromSlash(view, 1)).toBe(true);
  expect(types(view)).toEqual(["table", "paragraph", "chart"]);
  expect(view.state.doc.child(1).textContent).toBe("Notes");
  const empty = editor([["p", "paragraph", ""]]);
  expect(chartFromSlash(empty, 0)).toBe(false);
});
