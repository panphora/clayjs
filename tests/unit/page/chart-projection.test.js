import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, parseModel, project, renderBlocks } from "../../../src/page/projection.js";
import { chartModel, renderChartSvg } from "../../../src/page/rich/chart.js";

const blocks = () => JSON.parse(JSON.stringify(blocksOfValues([RECORD])));
const chartSvg = (record) => {
  const doc = new DOMParser().parseFromString(`<article data-page="1">${renderBlocks(record).html}</article>`, "text/html");
  return doc.querySelector('figure[data-type="chart"] svg').outerHTML;
};

test("saved chart uses the shared SVG renderer and retains chart attrs on parse", () => {
  const record = blocks();
  const model = project(record);
  const chart = model.find((item) => item.t === "chart");
  const table = model.find((item) => item.id === chart.source);
  const expected = renderChartSvg(chartModel({ id: chart.id, type: chart.kind ?? "line", x: chart.x, series: chart.series, title: chart.title, highlight: chart.highlight }, table), { width: 640, height: 320 });
  const html = renderBlocks(record).html;
  const article = new DOMParser().parseFromString(`<article data-page="1">${html}</article>`, "text/html").querySelector("article");
  expect(html.match(/<svg[\s\S]*?<\/svg>/)[0]).toBe(expected);
  expect(parseModel(article).find((item) => item.t === "chart")).toEqual(chart);
  expect(article.querySelector('figure[data-type="chart"] figcaption').textContent).toBe(chart.title);
});

test("cell edits, row sort and removed series column change saved SVG", () => {
  const record = blocks();
  const original = chartSvg(record);
  record.tbl.rows.r1.cells.c2 = "66";
  const edited = chartSvg(record);
  expect(edited).not.toBe(original);
  record.tbl.rows.r1.pos = "3";
  record.tbl.rows.r2.pos = "1";
  const sorted = chartSvg(record);
  expect(sorted).not.toBe(edited);
  delete record.tbl.cols.c2;
  expect(chartSvg(record)).toContain("Chart source missing");
  delete record.tbl;
  expect(chartSvg(record)).toContain("Chart source missing");
});

test("searchable chart text comes from the caption, not the SVG", async () => {
  const extractor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../hyperclay/server-lib/search/extract-text.js");
  if (!existsSync(extractor)) return;
  const { extractSearchText } = await import(pathToFileURL(extractor).href);
  const record = blocks();
  record.ch.title = "A unique caption";
  record.tbl.cols.c2.name = "Hidden SVG series";
  const text = extractSearchText(`<html><body><article data-page="1">${renderBlocks(record).html}</article></body></html>`);
  expect(text).toContain("A unique caption");
  expect(text).not.toContain("Hidden SVG series: 58 to 41");
});
