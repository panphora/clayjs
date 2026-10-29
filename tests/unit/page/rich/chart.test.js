import { readFileSync } from "node:fs";
import { chartModel, renderChartSvg } from "../../../../src/page/rich/chart.js";

const table = {
  cols: [{ id: "day", name: "Day" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
  rows: [
    { id: "r1", cells: { day: "Mon", a: "-2", b: "3" } },
    { id: "r2", cells: { day: "Tue", a: "", b: "bad" } },
    { id: "r3", cells: { day: "Wed", a: "4", b: "5" } },
  ],
};
const chart = { id: "chart1", type: "line", tableId: "table1", x: "day", series: ["a"], title: "A < B", highlight: "r3" };
const pieTable = {
  cols: [{ id: "day", name: "Day" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
  rows: [
    { id: "r1", cells: { day: "Mon", a: "50", b: "3" } },
    { id: "r2", cells: { day: "Tue", a: "25", b: "4" } },
    { id: "r3", cells: { day: "Wed", a: "15", b: "5" } },
    { id: "r4", cells: { day: "Thu", a: "10", b: "6" } },
  ],
};
const pieChart = { ...chart, type: "pie", series: ["a", "b"], title: "Values", highlight: "r2" };

test("point identity, missing values, line range, and at most six ticks", () => {
  const model = chartModel(chart, table);
  expect(model.points.map((point) => point.id)).toEqual(["chart1:r1:a", "chart1:r2:a", "chart1:r3:a"]);
  expect(model.points.map((point) => point.value)).toEqual([-2, null, 4]);
  expect(model.domain[0]).toBeLessThan(-2);
  expect(model.domain[1]).toBeGreaterThan(4);
  expect(model.yTicks.length).toBeLessThanOrEqual(6);
  expect(model.narrowTicks.length).toBeLessThanOrEqual(3);
});

test("bar domain includes zero, and a missing source names its table and title", () => {
  const [min, max] = chartModel({ ...chart, type: "bar" }, table).domain;
  expect(min).toBeLessThanOrEqual(0);
  expect(max).toBeGreaterThanOrEqual(0);
  expect(chartModel({ ...chart, source: "table1" }, null)).toEqual({ state: "missing", reason: "table", sourceId: "table1", title: "A < B" });
  expect(chartModel({ ...chart, source: "table1", x: "removed" }, table)).toEqual({ state: "missing", reason: "column", sourceId: "table1", title: "A < B" });
  expect(chartModel(chart, null)).toEqual({ state: "missing", reason: "table", sourceId: null, title: "A < B" });
  expect(renderChartSvg(chartModel(chart, null))).toContain("Chart source missing");
});

test("render is deterministic, escapes text, highlights the row, and breaks gaps", () => {
  const model = chartModel(chart, table);
  const first = renderChartSvg(model);
  expect(renderChartSvg(model)).toBe(first);
  expect(first).toContain("<title>A &lt; B</title>");
  expect(first).toContain('data-highlight="true"');
  expect(first).not.toContain("<polyline");
  expect(first).toContain("var(--chart-1)");
  expect(first).toContain("<desc>A: -2 to 4</desc>");
});

test.each(["line", "bar", "pie"])("%s SVG matches its golden fixture", (type) => {
  const simple = { ...table, rows: [table.rows[0], table.rows[2]] };
  const source = type === "pie" ? pieTable : simple;
  const model = type === "pie" ? chartModel(pieChart, source) : chartModel({ ...chart, type, title: "Values" }, source);
  const expected = readFileSync(new URL(`./fixtures/${type}.svg`, import.meta.url), "utf8").trimEnd();
  expect(renderChartSvg(model, { width: 320, height: 180 })).toBe(expected);
});

test("a pie model plots only the first series and leaves the others selected", () => {
  const attrs = { ...pieChart, series: ["a", "b"] };
  const model = chartModel(attrs, pieTable);
  expect(model.series.map((item) => item.id)).toEqual(["a"]);
  expect(model.points.map((point) => point.id)).toEqual(["chart1:r1:a", "chart1:r2:a", "chart1:r3:a", "chart1:r4:a"]);
  expect(attrs.series).toEqual(["a", "b"]);
});

test("a pie leaves out zero and negative rows, and one positive row fills the circle", () => {
  const mixed = {
    cols: table.cols,
    rows: [
      { id: "r1", cells: { day: "Mon", a: "0" } },
      { id: "r2", cells: { day: "Tue", a: "-3" } },
      { id: "r3", cells: { day: "Wed", a: "7" } },
    ],
  };
  const svg = renderChartSvg(chartModel({ ...chart, type: "pie" }, mixed));
  expect(svg).not.toContain('data-point="chart1:r1:a"');
  expect(svg).not.toContain('data-point="chart1:r2:a"');
  expect(svg.match(/<path /g)).toBeNull();
  expect(svg.match(/<circle data-point="chart1:r3:a" /g)).toHaveLength(1);
  expect(svg.match(/data-point="chart1:r3:a"/g)).toHaveLength(2);
  expect(svg).toContain("7 (100%)");
});

test("a bar chart names each series once, beside its last bar", () => {
  const svg = renderChartSvg(chartModel({ ...chart, type: "bar", series: ["a", "b"] }, table));
  expect(svg.match(/>A<\/text>/g)).toHaveLength(1);
  expect(svg.match(/>B<\/text>/g)).toHaveLength(1);
});
