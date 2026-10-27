/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DOCUMENT_LOAD_BUDGET } from "../../../scripts/document-load-budget.mjs";
import { cssImportsOf, measure, measureBuilt } from "../../../scripts/measure-load.mjs";
import { seedValue } from "../../../src/page/ybind/seed.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const { emitBootstraps, emitChunks } = await import("../../../scripts/build-chunks.mjs");

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

// The runtime preloads the plan and the editor, never a feature's view part: page.js
// imports a part once it has evaluated, so that part is a fetch stage after the
// preloaded plan. Counting it in the preload stage understates how deep a table or
// board Document goes.
let built;
beforeAll(async () => {
  built = mkdtempSync(join(tmpdir(), "clay-load-preload-"));
  const chunks = await emitChunks({ root: ROOT, outdir: join(built, "m") });
  await emitBootstraps({ root: ROOT, outdir: built, manifest: chunks.manifest, satellites: chunks.satellites });
}, 180000);

afterAll(() => {
  rmSync(built, { recursive: true, force: true });
});

test("a Document's built edit line counts a feature's part one fetch stage after the preloaded plan", async () => {
  const manifest = JSON.parse(readFileSync(join(built, "m/manifest.json"), "utf8"));
  const chunkOf = (entry) => `m/${manifest.entries[entry]}`;
  const rich = await measureBuilt({ html: fixture("document-rich.html"), mode: "edit", dir: built });
  const text = await measureBuilt({ html: fixture("document-text.html"), mode: "edit", dir: built });

  expect(paths(text)).toContain(chunkOf("page/editor.js"));
  expect(paths(rich)).toContain(chunkOf("page/editor.js"));
  expect(paths(rich)).toContain(chunkOf("page/features/table.js"));
  expect(paths(rich)).toContain(chunkOf("page/features/board.js"));
  expect(paths(rich)).toContain(chunkOf("page/features/chart.js"));
  expect(rich.js.depth).toBe(text.js.depth + 1);
  expect(rich.js.requests).toBe(text.js.requests + 4);
}, 180000);

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

// The owner of a copy made from a starter template loads the upgrade check on the late
// line: its own plugin and the version comparison it imports, asked of the host once
// ready resolves. The rules engine that upgrades a document is the click's, not the
// check's, so it is a lazy fetch here. A reader of a plain Document loads none of it.
test("the owner's shipped copy loads the upgrade check after ready but not its vendor, a Document counts neither", async () => {
  const shipped = await measure({ html: fixture("kanban.html"), mode: "view" });
  const plain = await measure({ html: fixture("document.html"), mode: "view" });
  const engine = "src/vendor/hyper-html-api-upgrade.vendor.js";

  expect(shipped.late).toContain("plugins/upgrade.js");
  expect(shipped.plugins).not.toContain("plugins/upgrade.js");
  expect(shipped.js.late.requests).toBeGreaterThan(0);
  expect(paths(shipped)).not.toContain("src/plugins/upgrade.js");
  expect(paths(shipped)).not.toContain(engine);
  expect(plain.plugins).not.toContain("plugins/upgrade.js");
  expect(plain.late).not.toContain("plugins/upgrade.js");
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

// The meter's own command line. A bare --built used to fall back to the source meter and
// print the same table twice; the flag now either names a build directory or fails.
const SCRIPT = new URL("../../../scripts/measure-load.mjs", import.meta.url).pathname;
const runMeter = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

test("a bare --built, or --built before another flag, exits nonzero with usage", () => {
  for (const args of [["--built"], ["--built", "--json"]]) {
    const run = runMeter(...args);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/--built needs the directory a build wrote/);
    expect(run.stderr).toMatch(/usage: node scripts\/measure-load\.mjs/);
    expect(run.stdout).toBe("");
  }
}, 120000);

test("a missing build manifest fails, from the command line and as a call", async () => {
  const empty = mkdtempSync(join(tmpdir(), "clay-no-build-"));
  try {
    const run = runMeter("--built", empty, "tests/fixtures/load/document.html");

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/no build manifest/);
    await expect(measureBuilt({ html: fixture("document.html"), mode: "view", dir: empty })).rejects.toThrow();
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}, 120000);

test("a missing fixture fails instead of measuring the rest", () => {
  const run = runMeter("--built", built, "tests/fixtures/load/no-such-document.html");

  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/no fixture at /);
});

// The report says which build it measured: the artifact's own directory, the manifest
// identity this build wrote, the fixture and the mode. Nothing in it comes from src/.
test("a valid --built directory is measured from the built graph, pinned to that build", async () => {
  const run = runMeter("--json", "--mode", "view", "--built", built, "tests/fixtures/load/document.html");

  expect(run.status).toBe(0);
  const [row] = JSON.parse(run.stdout);
  const direct = await measureBuilt({ html: fixture("document.html"), mode: "view", dir: built });
  const manifest = JSON.parse(readFileSync(join(built, "m/manifest.json"), "utf8"));
  const paths = row.js.files.map((file) => file.path);

  expect(row.file).toBe("tests/fixtures/load/document.html");
  expect(row.mode).toBe("view");
  expect(row.artifact).toBe(resolve(built));
  expect(row.manifest).toEqual({
    schema: manifest.schema,
    package: manifest.package,
    version: manifest.version,
    build: manifest.build,
    runtime: manifest.runtime,
    edit: manifest.edit,
  });
  expect(paths).toContain("clay.js");
  expect(paths.some((path) => path.startsWith("m/"))).toBe(true);
  expect(paths.filter((path) => path.startsWith("src/"))).toEqual([]);
  expect(row.js).toEqual(direct.js);
  expect(row.phases).toEqual(direct.phases);
}, 180000);

const PHASES = ["viewReady", "editReady", "late", "firstSave", "firstAdoption", "firstUse"];

test("every built phase the page reaches is nonzero, and no asset is counted in two phases", async () => {
  const view = await measureBuilt({ html: fixture("document-text.html"), mode: "view", dir: built });
  const edit = await measureBuilt({ html: fixture("document-text.html"), mode: "edit", dir: built });

  for (const key of ["viewReady", "late", "firstSave", "firstAdoption", "firstUse"]) {
    expect(view.phases[key].requests).toBeGreaterThan(0);
    expect(view.phases[key].brotli).toBeGreaterThan(0);
  }
  // A reader never enters editing, so the editor's own increment is not a reader's phase.
  expect(view.phases.editReady.requests).toBe(0);
  for (const key of PHASES) {
    expect(edit.phases[key].requests).toBeGreaterThan(0);
    expect(edit.phases[key].brotli).toBeGreaterThan(0);
  }

  const counted = PHASES.flatMap((key) => edit.phases[key].files.map((file) => file.path));
  expect(new Set(counted).size).toBe(counted.length);
  expect(edit.phases.viewReady.files.length + edit.phases.editReady.files.length).toBe(edit.js.files.length);
  expect(edit.phases.late.requests).toBe(edit.js.late.requests);
  // What view ready already paid is the editor's increment's to leave alone.
  const viewReady = new Set(edit.phases.viewReady.files.map((file) => file.path));
  expect(edit.phases.editReady.files.filter((file) => viewReady.has(file.path))).toEqual([]);
  expect(view.phases.viewReady.requests + view.phases.editReady.requests).toBe(view.js.files.length);
  expect(view.phases.viewReady.requests).toBe(view.js.files.length);
}, 180000);

// A phase report that cannot say what a chunk is would hide the one thing this step is
// about: parse5 loads with the source plugin, and the merge engine is the reader's.
test("parse5 and the merge engine are recognized by name in the phase they load", async () => {
  const edit = await measureBuilt({ html: fixture("document-text.html"), mode: "edit", dir: built });

  expect(edit.phases.viewReady.modules).toContain("sync/merge-engine.js");
  expect(edit.phases.late.modules).toContain("core/source-map.js");
  expect(edit.phases.late.modules).toContain("plugins/source.js");
  expect(edit.phases.late.modules).toContain("vendor/parse5.vendor.js");
  expect(edit.phases.firstAdoption.modules).toContain("vendor/hyper-morph.vendor.js");
  for (const key of ["viewReady", "editReady", "firstSave", "firstUse"]) {
    expect(edit.phases[key].modules).not.toContain("vendor/parse5.vendor.js");
    expect(edit.phases[key].modules).not.toContain("core/source-map.js");
  }
  expect(edit.phases.viewReady.modules).not.toContain("vendor/hyper-morph.vendor.js");
}, 180000);

// Today's Document baseline, against the ceilings the tests and the meter share: never
// raised here, and a fixture the ceiling does not cover is reported rather than excused.
test("the Document baseline is reported against the checked-in load ceilings", async () => {
  const view = await measureBuilt({ html: fixture("document-text.html"), mode: "view", dir: built });
  const text = await measureBuilt({ html: fixture("document-text.html"), mode: "edit", dir: built });
  const rich = await measureBuilt({ html: fixture("document-rich.html"), mode: "edit", dir: built });

  expect(view.js.brotli).toBeLessThanOrEqual(DOCUMENT_LOAD_BUDGET.readerBrotli);
  expect(view.js.depth).toBeLessThanOrEqual(DOCUMENT_LOAD_BUDGET.maxBuiltDepth);
  expect(text.js.brotli).toBeLessThanOrEqual(DOCUMENT_LOAD_BUDGET.textEditorBrotli);
  expect(text.js.depth).toBeLessThanOrEqual(DOCUMENT_LOAD_BUDGET.maxBuiltDepth);
  expect(text.budget.line).toBe("textEditorBrotli");
  expect(text.budget.stretchReached).toBe(text.js.brotli <= DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli);
  expect(rich.budget.within).toBe(rich.js.brotli <= DOCUMENT_LOAD_BUDGET.textEditorBrotli);
  expect(rich.budget.depthWithin).toBe(rich.js.depth <= DOCUMENT_LOAD_BUDGET.maxBuiltDepth);
  console.log(`document-text.html built view is ${view.js.brotli} B Brotli in ${view.js.requests} requests at depth ${view.js.depth}, ` +
    `of the ${DOCUMENT_LOAD_BUDGET.readerBrotli} B reader ceiling`);
  console.log(`document-text.html built edit is ${text.js.brotli} B Brotli at depth ${text.js.depth}, ` +
    `of the ${DOCUMENT_LOAD_BUDGET.textEditorBrotli} B edit ceiling and the ${DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli} B stretch ` +
    `(${text.budget.stretchReached ? "reached" : "not reached"})`);
  console.log(`document-rich.html built edit is ${rich.js.brotli} B Brotli at depth ${rich.js.depth}: ` +
    `${rich.js.brotli - DOCUMENT_LOAD_BUDGET.textEditorBrotli} B over the edit ceiling, depth over by ${rich.js.depth - DOCUMENT_LOAD_BUDGET.maxBuiltDepth}`);
}, 180000);
