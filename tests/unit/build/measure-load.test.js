/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { cssImportsOf, measure } from "../../../scripts/measure-load.mjs";
import { seedValue } from "../../../src/page/ybind/seed.js";

const fixture = (name) => readFileSync(new URL(`../../../tests/fixtures/load/${name}`, import.meta.url), "utf8");
const paths = (measured) => measured.js.files.map(({ path }) => path);

const clayTag = (quote = '"', plugins = "menu") =>
  `<script src=${quote}https://clayjs.com/v1/clay.js?plugins=${plugins}${quote}></script>`;

test("single-quoted and double-quoted loader tags measure the same", async () => {
  const single = await measure({ html: clayTag("'"), mode: "view" });
  const double = await measure({ html: clayTag('"'), mode: "view" });

  expect(single).toEqual(double);
});

test("a loader tag inside an HTML comment counts nothing", async () => {
  const measured = await measure({ html: `<!-- ${clayTag()} -->`, mode: "view" });

  expect(measured.bootstrap).toBe(false);
  expect(measured.js.requests).toBe(0);
});

test("the word sap in prose does not load derive", async () => {
  const plain = await measure({ html: clayTag(), mode: "view" });
  const prose = await measure({ html: `${clayTag()}<p>The maple sap runs in spring.</p>`, mode: "view" });

  expect(prose.plugins).not.toContain("plugins/derive.js");
  expect(prose.js.requests).toBe(plain.js.requests);
});

test("without clay.js, satellites count but the loader does not", async () => {
  const measured = await measure({
    html: '<script src="https://clayjs.com/v1/sap.js"></script>',
    mode: "view",
  });

  expect(measured.bootstrap).toBe(false);
  expect(measured.js.files.map(({ path }) => path)).toEqual(["entries/sap.js"]);
});

test("Kanban edit boot includes Sortable", async () => {
  const measured = await measure({ html: clayTag('"', "sortable"), mode: "edit" });

  expect(measured.js.files.map(({ path }) => path)).toContain("src/vendor/Sortable.vendor.js");
  expect(measured.lazy).not.toContain("src/vendor/Sortable.vendor.js");
});

test("a cycle below an entry counts each module once", async () => {
  const measured = await measure({ html: clayTag('"', ""), mode: "edit" });
  const paths = measured.js.files.map(({ path }) => path);

  expect(paths.filter((path) => path === "src/core/save.js")).toHaveLength(1);
  expect(paths.filter((path) => path === "src/core/unsaved-warning.js")).toHaveLength(1);
  expect(new Set(paths).size).toBe(paths.length);
});

test("relative, root-relative and absolute CSS imports resolve to one served file", () => {
  const importer = "https://clayjs.com/v1/src/page/themes/light-1.css";
  const imports = [
    '@import url("./content.css");',
    '@import url("/v1/src/page/themes/content.css");',
    '@import url("https://clayjs.com/v1/src/page/themes/content.css");',
  ].map((css) => cssImportsOf(css, importer)[0]);

  expect(imports).toEqual([
    { url: "https://clayjs.com/v1/src/page/themes/content.css", path: "src/page/themes/content.css" },
    { url: "https://clayjs.com/v1/src/page/themes/content.css", path: "src/page/themes/content.css" },
    { url: "https://clayjs.com/v1/src/page/themes/content.css", path: "src/page/themes/content.css" },
  ]);
});

test("a Document with a table and a board counts their view parts at boot, a text-only one counts none", async () => {
  const rich = await measure({ html: fixture("document-rich.html"), mode: "edit" });
  const text = await measure({ html: fixture("document-text.html"), mode: "edit" });

  expect(paths(rich)).toContain("src/page/features/table.js");
  expect(paths(rich)).toContain("src/page/features/board.js");
  expect(rich.lazy).not.toContain("src/page/features/table.js");
  expect(rich.lazy).not.toContain("src/page/features/board.js");
  expect(paths(text).filter((path) => path.startsWith("src/page/features/") && path !== "src/page/features/registry.js")).toEqual([]);
});

test("a Document's view mode counts no view parts, and neither does a tool-less file's tool part", async () => {
  const view = await measure({ html: fixture("document-rich.html"), mode: "view" });
  const text = await measure({ html: fixture("document-text.html"), mode: "edit" });

  expect(paths(view)).not.toContain("src/page/features/table.js");
  expect(paths(text)).not.toContain("src/page/features/tool.js");
  expect(paths(text)).not.toContain("src/page/tools.js");
  expect(paths(text)).not.toContain("src/page/tool-data.js");
});

test("a Document with a tool counts the host and data modules its part opens first", async () => {
  const value = seedValue([{ id: "t", t: "tool", attrs: { rev: "r1" } }]);
  const html = `<!doctype html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script></head><body><article data-page="1"></article><script src="https://clayjs.com/v1/clay.js?plugins=page"></script></body></html>`;
  const measured = await measure({ html, mode: "edit" });

  expect(paths(measured)).toContain("src/page/features/tool.js");
  expect(paths(measured)).toContain("src/page/tools.js");
  expect(paths(measured)).toContain("src/page/tool-data.js");
  expect(measured.lazy).not.toContain("src/page/tools.js");
});
