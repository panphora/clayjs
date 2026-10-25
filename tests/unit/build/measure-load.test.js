/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { cssImportsOf, measure } from "../../../scripts/measure-load.mjs";

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
