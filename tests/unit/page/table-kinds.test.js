import { editor, select } from "./view-helpers.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { effectiveKind } from "../../../src/page/rich/csv.js";
import { columnKinds } from "../../../src/page/table-kinds.js";
import { makeTable, sortBy, setColumnKind } from "../../../src/page/table.js";
import { insertChartAfterTable } from "../../../src/page/chart.js";

const table = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Week" }, c2: { pos: "2", name: "Signups" }, c3: { pos: "3", name: "Due" } },
  rows: {
    r1: { pos: "1", cells: { c1: "Sep 21", c2: "10", c3: "2026-10-20" } },
    r2: { pos: "2", cells: { c1: "Sep 28", c2: "2", c3: "" } },
  },
};
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const item = (view, label) => [...menu(view).querySelectorAll("button")].find((button) => button.textContent.includes(label));
const record = (view) => blockJson(view.state.doc.child(0));
const cellPos = (view, row, col) => {
  const t = view.state.doc.child(0);
  let pos = 1;
  for (let i = 0; i < row; i++) pos += t.child(i).nodeSize;
  pos++;
  for (let i = 0; i < col; i++) pos += t.child(row).child(i).nodeSize;
  return pos;
};
const click = (view, row, col) => {
  const at = cellPos(view, row, col);
  return view.someProp("handleClickOn", (f) => f(view, at + 1, view.state.doc.nodeAt(at), at, { button: 0 }, true));
};

test("a stored kind wins and a missing kind is inferred from the values", () => {
  expect(effectiveKind("text", ["1", "2"])).toBe("text");
  expect(effectiveKind(undefined, ["1", "2,5", ""])).toBe("number");
  expect(effectiveKind(null, ["2026-10-20", ""])).toBe("date");
  expect(effectiveKind(undefined, ["", ""])).toBe("text");
  expect(effectiveKind("bogus", ["x"])).toBe("text");
});

test("new tables and columns store no kind, and the view shows inferred kinds", () => {
  const node = makeTable(2, 2);
  expect(Object.values(node.attrs.cols).every((col) => !("kind" in col))).toBe(true);
  const view = editor([], { blocks: { tbl: table } });
  expect(columnKinds(view.state.doc.child(0))).toEqual({ c1: "text", c2: "number", c3: "date" });
  expect(view.dom.querySelector('th[data-col="c2"]').dataset.kind).toBe("number");
  expect([...view.dom.querySelectorAll('td[data-col="c2"]')].map((td) => td.dataset.kind)).toEqual(["number", "number"]);
  select(view, cellPos(view, 1, 1) + 1);
  view.dispatch(view.state.tr.insertText("x"));
  expect([...view.dom.querySelectorAll('td[data-col="c2"]')].map((td) => td.dataset.kind)).toEqual(["text", "text"]);
  expect(record(view).cols.c2.kind).toBeUndefined();
});

test("the column menu shows the kind as an icon and changes it, Auto clears it", () => {
  const view = editor([], { blocks: { tbl: table } });
  view.dom.querySelector('th[data-col="c2"] button').click();
  const kind = item(view, "Kind");
  expect(kind.querySelector(".page-menu-icon").textContent).toBe("#");
  expect(kind.querySelector(".page-menu-hint").textContent).toBe("Auto: Number");
  kind.click();
  expect(item(view, "Auto").getAttribute("aria-checked")).toBe("true");
  item(view, "Text").click();
  expect(record(view).cols.c2.kind).toBe("text");
  expect(view.dom.querySelector('td[data-col="c2"]').dataset.kind).toBe("text");
  view.dom.querySelector('th[data-col="c2"] button').click();
  item(view, "Kind").click();
  expect(item(view, "Text").getAttribute("aria-checked")).toBe("true");
  item(view, "Auto").click();
  expect("kind" in record(view).cols.c2).toBe(false);
  expect(view.dom.querySelector('td[data-col="c2"]').dataset.kind).toBe("number");
  expect(setColumnKind("c2", "money")(view.state)).toBe(false);
});

test("sort and Chart this table use the inferred kind", () => {
  const view = editor([], { blocks: { tbl: table } });
  select(view, cellPos(view, 0, 0) + 1);
  expect(sortBy("c2", "asc")(view.state, view.dispatch)).toBe(true);
  expect(orderedIds(record(view).rows)).toEqual(["r2", "r1"]);
  expect(insertChartAfterTable(view, 0)).toBe(true);
  expect(view.state.doc.child(1).attrs.series).toEqual(["c2"]);
});

test("a click in a date cell opens a date picker that writes an ISO date", () => {
  const view = editor([], { blocks: { tbl: table } });
  click(view, 1, 0);
  expect(view.dom.querySelector(".page-table-date")).toBeNull();
  click(view, 1, 2);
  const input = view.dom.querySelector('td[data-col="c3"] input[type="date"]');
  expect(input.getAttribute("aria-label")).toBe("Pick a date");
  input.value = "2026-10-23";
  input.dispatchEvent(new Event("change"));
  expect(record(view).rows.r2.cells.c3).toBe("2026-10-23");
  expect(view.dom.querySelector(".page-table-date")).toBeNull();
  click(view, 0, 2);
  const again = view.dom.querySelector(".page-table-date");
  expect(again.value).toBe("2026-10-20");
  again.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(view.dom.querySelector(".page-table-date")).toBeNull();
  expect(record(view).rows.r1.cells.c3).toBe("2026-10-20");
});
