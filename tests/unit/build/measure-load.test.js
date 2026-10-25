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

test("Kanban edit boot loads Sortable after ready, not in the boot graph", async () => {
  const measured = await measure({ html: clayTag('"', "sortable"), mode: "edit" });
  const bare = await measure({ html: clayTag('"', ""), mode: "edit" });

  expect(measured.js.files.map(({ path }) => path)).not.toContain("src/vendor/Sortable.vendor.js");
  expect(measured.js.late.brotli).toBeGreaterThan(bare.js.late.brotli);
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

// The release serves its font sheets from /v1/fonts/, beside the font files, so a page
// that links one fetches that CSS and the fonts it names: neither is a third party, and
// neither may land in the external bin the budgets never check.
test("a /v1/fonts stylesheet link counts the CSS and the font files it names", async () => {
  const sheet = "https://clayjs.com/v1/fonts/work-sans.css";
  const measured = await measure({ html: `${clayTag()}<link rel="stylesheet" href="${sheet}">`, mode: "view" });

  expect(measured.css.requests).toBe(1);
  expect(measured.css.raw).toBe(readFileSync(new URL("../../../fonts/work-sans.css", import.meta.url)).length);
  expect(measured.css.external).toEqual([]);
  expect(measured.fonts.requests).toBe(1);
  expect(measured.fonts.raw).toBe(readFileSync(new URL("../../../fonts/work-sans-latin-wght-normal.woff2", import.meta.url)).length);
  expect(measured.fonts.external).toEqual([]);
  expect(measured.thirdParty).toEqual([]);
});

// A preloaded font is a request before the sheet that names it arrives, so it counts even
// where it is the same file: one request, not two and not none.
test("a preloaded clayjs font counts once, and never as a third party", async () => {
  const font = "https://clayjs.com/v1/fonts/work-sans-latin-wght-normal.woff2";
  const html = `${clayTag()}<link rel="preload" href="${font}" as="font" type="font/woff2" crossorigin>` +
    `<link rel="stylesheet" href="https://clayjs.com/v1/fonts/work-sans.css">`;
  const measured = await measure({ html, mode: "view" });

  expect(measured.fonts.requests).toBe(1);
  expect(measured.fonts.depth).toBe(1);
  expect(measured.thirdParty).toEqual([]);
});

// A blocking CDN script in the head is a request before ready and its bytes are not this
// repo's: it counts against the JavaScript line and is named, so a fixture that drops the
// tag changes the number instead of measuring the same.
test("a third-party script counts against the JavaScript line and is named", async () => {
  const cdn = "https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js";
  const bare = await measure({ html: clayTag(), mode: "view" });
  const withCdn = await measure({ html: `${clayTag()}<script src="${cdn}"></script>`, mode: "view" });

  expect(withCdn.js.requests).toBe(bare.js.requests + 1);
  expect(withCdn.thirdParty).toEqual([{ url: cdn, origin: "https://cdn.jsdelivr.net", kind: "script" }]);
});

// The owner of a copy made from a starter template loads the upgrade check before ready:
// its own plugin and the version comparison it imports. The rules engine that upgrades a
// document is the click's, not the check's, so it is a lazy fetch here. A reader of a
// plain Document loads none of it.
test("the owner's shipped copy counts the upgrade check but not its vendor, a Document counts neither", async () => {
  const shipped = await measure({ html: fixture("kanban.html"), mode: "view" });
  const plain = await measure({ html: fixture("document.html"), mode: "view" });
  const engine = "src/vendor/hyper-html-api-upgrade.vendor.js";

  expect(shipped.plugins).toContain("plugins/upgrade.js");
  expect(paths(shipped)).toContain("src/plugins/upgrade.js");
  expect(paths(shipped)).toContain("src/core/version.js");
  expect(paths(shipped)).not.toContain(engine);
  // The runner the click fetches is what carries the engine, so it stays reachable.
  expect(shipped.lazy).toContain("src/plugins/upgrade-run.js");
  expect(shipped.lazy).not.toContain(engine);
  expect(plain.plugins).not.toContain("plugins/upgrade.js");
  expect(paths(plain)).not.toContain("src/plugins/upgrade.js");
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
