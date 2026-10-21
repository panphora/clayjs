import { editor, select, key, typeText } from "./view-helpers.js";
import { blockJson } from "../../../src/page/model.js";
import { sortBy } from "../../../src/page/table.js";
import { ATOM, BREAK } from "../../../src/page/projection.js";
import { cellText } from "../../../src/page/rich/cell.js";
import { tablesFromDoc } from "../../../src/page/tool-data.js";

const table = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "Ada", c2: "10" } }, r2: { pos: "2", cells: { c1: { c: "Bob", m: [[3, "b"]] }, c2: "2" } } },
};
const cells = (view) => blockJson(view.state.doc.child(0)).rows;

test("Mod-b in a cell bolds the selected text and the record keeps the mark", () => {
  const view = editor([], { blocks: { tbl: table } });
  select(view, 3, 6);
  expect(key(view, "b", { ctrlKey: true })).toBe(true);
  expect(cells(view).r1.cells.c1).toEqual({ c: "Ada", m: [[3, "b"]] });
  expect(view.dom.querySelector('td[data-col="c1"] strong').textContent).toBe("Ada");
});

test("Shift+Enter adds a line inside the cell and Enter still moves down", () => {
  const view = editor([], { blocks: { tbl: table } });
  select(view, 4);
  expect(key(view, "Enter", { shiftKey: true })).toBe(true);
  expect(view.state.doc.child(0).childCount).toBe(2);
  expect(cells(view).r1.cells.c1).toEqual({ c: `A${ATOM}da`, m: [[1, ""], [1, BREAK], [2, ""]] });
  expect(cellText(cells(view).r1.cells.c1)).toBe("A\nda");
  expect(key(view, "Enter")).toBe(true);
  expect(view.state.selection.$head.index(1)).toBe(1);
});

test("Markdown block shortcuts do not fire inside a cell", () => {
  const view = editor([], { blocks: { tbl: { ...table, rows: { r1: { pos: "1", cells: { c1: "", c2: "" } } } } } });
  select(view, 3);
  typeText(view, "#");
  typeText(view, " ");
  expect(view.state.doc.child(0).type.name).toBe("table");
  expect(cells(view).r1.cells.c1).toBe("# ");
});

test("sorting and tools read a marked cell as its plain text", () => {
  const view = editor([], { blocks: { tbl: table } });
  select(view, 3);
  expect(sortBy("c1", "desc")(view.state, view.dispatch)).toBe(true);
  expect(view.state.doc.child(0).child(0).attrs.id).toBe("r2");
  expect(tablesFromDoc(view.state.doc)[0].rows.map((row) => row.cells.c1)).toEqual(["Bob", "Ada"]);
});
