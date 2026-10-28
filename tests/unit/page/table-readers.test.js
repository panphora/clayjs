import { schema } from "../../../src/page/schema.js";
import { nodeFromBlock, blockJson } from "../../../src/page/model.js";
import { ATOM, BREAK, project, renderModel, parseModel } from "../../../src/page/projection.js";
import { chartModel } from "../../../src/page/rich/chart.js";

const table = {
  t: "table", pos: "1",
  cols: { c1: { pos: "1", name: "Week" }, c2: { pos: "2", name: "Signups", kind: "number" } },
  rows: {
    r1: { pos: "1", cells: { c1: { c: "Sep <21>", m: [[3, "b"], [5, ""]] }, c2: { c: "58", m: [[2, "i"]] } } },
    r2: { pos: "2", cells: { c1: { c: `Sep${ATOM}28`, m: [[3, ""], [1, BREAK], [2, ""]] }, c2: "41" } },
  },
};

test("the editor shows a marked cell with its marks and line break, and keeps them", () => {
  const node = nodeFromBlock(schema, "tbl", table);
  const first = node.child(0).child(0);
  expect(first.textContent).toBe("Sep <21>");
  expect(first.child(0).text).toBe("Sep");
  expect(first.child(0).marks.map((mark) => mark.type.name)).toEqual(["strong"]);
  expect(first.child(1).marks).toEqual([]);
  const broken = node.child(1).child(0);
  expect(broken.childCount).toBe(3);
  expect(broken.child(1).type.name).toBe("hard_break");
  expect(blockJson(node).rows).toEqual(table.rows);
  expect(() => node.check()).not.toThrow();
});

test("the article shows marked cells with their marks and parses back to the same cells", () => {
  const [item] = project({ tbl: table });
  expect(item.rows).toEqual([
    { id: "r1", cells: { c1: { c: "Sep <21>", m: [[3, "b"], [5, ""]] }, c2: { c: "58", m: [[2, "i"]] } } },
    { id: "r2", cells: { c1: { c: `Sep${ATOM}28`, m: [[3, ""], [1, BREAK], [2, ""]] }, c2: "41" } },
  ]);
  const html = renderModel([item]);
  expect(html).toContain('<td headers="tbl-c1"><strong>Sep</strong> &lt;21&gt;</td>');
  expect(html).toContain('<td headers="tbl-c2"><em>58</em></td>');
  expect(html).toContain('<td headers="tbl-c1">Sep<br>28</td>');
  expect(html).toContain('<td headers="tbl-c2">41</td>');
  expect(html).not.toContain("[object Object]");
  const article = document.createElement("article");
  article.innerHTML = html;
  expect(parseModel(article)).toEqual([item]);
});

test("a cell holding only a plain { c, m } value projects as its text", () => {
  const [item] = project({ tbl: { ...table, rows: { r1: { pos: "1", cells: { c1: { c: "plain", m: [[5, ""]] }, c2: "" } } } } });
  expect(item.rows[0].cells).toEqual({ c1: "plain", c2: "" });
});

test("a chart reads marked cells as numbers and labels", () => {
  const model = chartModel({ id: "ch", type: "bar", x: "c1", series: ["c2"], title: "", highlight: null }, {
    cols: [{ id: "c1", name: "Week" }, { id: "c2", name: "Signups" }],
    rows: Object.entries(table.rows).map(([id, row]) => ({ id, cells: row.cells })),
  });
  expect(model.points.map((point) => point.value)).toEqual([58, 41]);
  expect(model.points.map((point) => point.xLabel)).toEqual(["Sep <21>", "Sep\n28"]);
});

test("a saved table writes its rows once, as the visible table, and reads them back from it", () => {
  const [item] = project({ tbl: table });
  const html = renderModel([item]);
  expect(html).not.toContain("data-clay-page-value");
  const article = document.createElement("article");
  article.innerHTML = html;
  expect(parseModel(article)).toEqual([item]);
});
