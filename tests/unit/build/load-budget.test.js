/**
 * @jest-environment node
 */
import { beforeAll, afterAll, describe, expect, test } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "parse5";
import { CORE_WAVES, PLUGIN_PATHS } from "../../../src/loader-logic.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const budget = JSON.parse(readFileSync(new URL("../../../scripts/load-budget.json", import.meta.url), "utf8"));
const { measure, measureBuilt } = await import("../../../scripts/measure-load.mjs");
const { emitBootstraps, emitChunks } = await import("../../../scripts/build-chunks.mjs");

const htmlOf = (fixture) => readFileSync(new URL(`../../../tests/fixtures/load/${fixture}`, import.meta.url), "utf8");

// Styles and fonts are counted on their own lines, not folded into the JavaScript
// number and not left out of it: a ceiling that hides 450 KB of fonts is not a ceiling.
function withinAssets(measured, limits) {
  for (const asset of ["css", "fonts"]) {
    expect(measured[asset].requests).toBeLessThanOrEqual(limits[asset].requests);
    expect(measured[asset].depth).toBeLessThanOrEqual(limits[asset].depth);
    if (limits[asset].raw !== undefined) expect(measured[asset].raw).toBeLessThanOrEqual(limits[asset].raw);
  }
}

// A request from another origin is a request the page really makes and one whose bytes
// nothing here can size, so the meter counts it and names it. The templates this
// milestone ships, and every Document, fetch nothing from another origin; the old
// shipped copies still link Google Fonts (and the Journal's also two CDN scripts), and
// each one has to still report them, so an empty list cannot mean "not seen".
const THIRD_PARTY_ALLOWED = new Set(["kanban-hyperclay.html", "journal-hyperclay.html", "kanban-local.html"]);

function withinThirdParty(fixture, measured) {
  if (THIRD_PARTY_ALLOWED.has(fixture)) expect(measured.thirdParty.length).toBeGreaterThan(0);
  else expect(measured.thirdParty).toEqual([]);
}

// The fixture files are the shipped templates, and a stub would satisfy every budget
// above. Counting what the template itself contains is the check a stub cannot pass.
const countOf = (html, tag, className) => {
  let count = 0;
  const walk = (node) => {
    const classes = (node.attrs || []).find(({ name }) => name === "class");
    if (node.tagName === tag && classes && classes.value.split(/\s+/).includes(className)) count++;
    for (const child of node.childNodes || []) walk(child);
  };
  walk(parse(html));
  return count;
};

for (const [fixture, modes] of Object.entries(budget)) {
  if (fixture === "built") continue;
  for (const [mode, limits] of Object.entries(modes)) {
    test(`${fixture} ${mode}: within its load budget`, async () => {
      const measured = await measure({ html: htmlOf(fixture), mode });

      expect(measured.bootstrap).toBe(true);
      expect(measured.js.requests).toBeGreaterThan(1);
      expect(measured.js.requests).toBeLessThanOrEqual(limits.requests);
      expect(measured.js.depth).toBeLessThanOrEqual(limits.depth);
      expect(measured.js.brotli).toBeLessThanOrEqual(limits.brotli);
      withinAssets(measured, limits);
      withinThirdParty(fixture, measured);
    });
  }
}

// The meter has to see a request from another origin at all: a Google Fonts sheet is
// one request whose bytes are not this repo's, and it fails the gate for a fixture the
// plans say fetches nothing from anywhere else.
test("a Google Fonts link is one third-party request and fails the gate", async () => {
  const html = "<script src=\"https://clayjs.com/v1/clay.js?plugins=menu\"></script>" +
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Inter&display=swap\">";
  const measured = await measure({ html, mode: "view" });

  expect(measured.thirdParty).toEqual([{
    url: "https://fonts.googleapis.com/css2?family=Inter&display=swap",
    origin: "https://fonts.googleapis.com",
    kind: "stylesheet",
  }]);
  expect(measured.css.requests).toBe(1);
  expect(measured.css.raw).toBe(0);
  expect(() => withinThirdParty("document.html", measured)).toThrow();
  expect(() => withinThirdParty("kanban.html", measured)).toThrow();
  expect(() => withinThirdParty("kanban-local.html", measured)).not.toThrow();
}, 180000);

test("the Kanban and Journal fixtures are the shipped templates, not stubs", () => {
  expect(countOf(htmlOf("kanban.html"), "li", "card")).toBeGreaterThan(0);
  expect(countOf(htmlOf("journal.html"), "article", "entry")).toBeGreaterThan(0);
});

// What a browser on clayjs.com actually downloads is the chunked release, so that
// gets its own budgets. Built once for the whole file: the chunk build is the slow
// part, and every fixture measures the same release.
let dir;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "clay-load-built-"));
  const chunks = await emitChunks({ root: ROOT, outdir: join(dir, "m") });
  await emitBootstraps({ root: ROOT, outdir: dir, manifest: chunks.manifest, satellites: chunks.satellites });
}, 180000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

for (const [fixture, modes] of Object.entries(budget.built)) {
  for (const [mode, limits] of Object.entries(modes)) {
    test(`${fixture} ${mode}: within its built load budget`, async () => {
      const measured = await measureBuilt({ html: htmlOf(fixture), mode, dir });

      expect(measured.bootstrap).toBe(true);
      expect(measured.js.requests).toBeGreaterThan(1);
      // Bootstrap, its preloads, then the plan: the depth this step is for.
      expect(measured.js.depth).toBe(3);
      expect(measured.js.requests).toBeLessThanOrEqual(limits.requests);
      expect(measured.js.depth).toBeLessThanOrEqual(limits.depth);
      expect(measured.js.brotli).toBeLessThanOrEqual(limits.brotli);
      withinAssets(measured, limits);
      withinThirdParty(fixture, measured);
    });
  }
}

// The Journal as it ships: its template and Hyperclay's copy, in every mode each file
// allows. The walk has to be real for the absence below to mean anything, and OverType,
// marked and highlight.js have to be reachable but never fetched before ready: a reader
// who does not edit must not pay for the editor, and a ceiling that folded them in
// would hide it. They are named in the manifest by their logical path, which is the
// chunk whose bytes a built page would fetch.
const VENDORED = ["overtype", "marked", "highlight"].map((name) => `vendor/${name}.vendor.js`);

for (const fixture of ["journal.html", "journal-hyperclay.html"]) {
  test(`${fixture}: more than 30 requests before ready, and no OverType, marked or highlight.js among them`, async () => {
    const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
    for (const mode of Object.keys(budget[fixture])) {
      const source = await measure({ html: htmlOf(fixture), mode });
      const built = await measureBuilt({ html: htmlOf(fixture), mode, dir });
      const sourcePaths = source.js.files.map((file) => file.path);
      const builtPaths = built.js.files.map((file) => file.path);

      expect(source.js.requests).toBeGreaterThan(30);
      expect(built.js.requests).toBeGreaterThan(30);
      for (const entry of VENDORED) {
        expect(sourcePaths).not.toContain(`src/${entry}`);
        expect(builtPaths).not.toContain(`m/${manifest.entries[entry]}`);
        expect(source.lazy).toContain(`src/${entry}`);
        expect(built.lazy).toContain(`m/${manifest.entries[entry]}`);
      }
    }
  }, 180000);
}

// The board ships as three files, the template and the two host copies, and each is
// walked whole: a budget over a stub would pass while the real file loads anything.
const KANBAN_FIXTURES = ["kanban.html", "kanban-hyperclay.html", "kanban-local.html"];

for (const fixture of KANBAN_FIXTURES) {
  test(`${fixture}: every mode walks the whole board`, async () => {
    for (const mode of ["view", "edit", "draft"]) {
      const measured = await measure({ html: htmlOf(fixture), mode });
      const shipped = await measureBuilt({ html: htmlOf(fixture), mode, dir });

      expect(measured.js.requests).toBeGreaterThan(30);
      expect(shipped.js.requests).toBeGreaterThan(30);
    }
  }, 180000);

  test(`${fixture}: the draft loads the visitor's own plugin`, async () => {
    const measured = await measure({ html: htmlOf(fixture), mode: "draft" });

    expect(measured.js.files.map(({ path }) => path)).toContain("src/plugins/visitor-drafts.js");
    expect(measured.js.files.map(({ path }) => path)).not.toContain("src/sync/live-sync.js");
  });
}

// The view parts a file's own block types need are fetches before input, so the
// built edit line has to count them: a budget that leaves them out passes falsely.
test(`a Document's built edit line counts the view parts its blocks need, and a text-only one counts none`, async () => {
  const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
  const chunkOf = (entry) => `m/${manifest.entries[entry]}`;
  const rich = await measureBuilt({ html: htmlOf("document-rich.html"), mode: "edit", dir });
  const text = await measureBuilt({ html: htmlOf("document-text.html"), mode: "edit", dir });

  expect(rich.js.files.map(({ path }) => path)).toContain(chunkOf("page/features/table.js"));
  expect(rich.js.files.map(({ path }) => path)).toContain(chunkOf("page/features/board.js"));
  expect(text.js.files.map(({ path }) => path)).not.toContain(chunkOf("page/features/table.js"));
  expect(text.js.files.map(({ path }) => path)).not.toContain(chunkOf("page/features/board.js"));
  expect(rich.js.requests - text.js.requests).toBe(2);
}, 180000);

// The milestone's own gate, written as the number it is rather than as whatever the
// release happens to measure: 45 KiB of Brotli q4 JavaScript in three dependent
// stages, counting every module the reader activates before it is ready.
test("the standard Document built view holds the 46,080-byte, three-stage reader ceiling", async () => {
  expect(budget.built["document.html"].view.brotli).toBe(46080);
  expect(budget.built["document.html"].view.depth).toBe(3);

  const measured = await measureBuilt({ html: htmlOf("document.html"), mode: "view", dir });

  expect(measured.js.depth).toBe(3);
  expect(measured.js.brotli).toBeLessThanOrEqual(46080);
}, 180000);

// Everything the canonical Document fetches before its ready boundary: the loader
// facade, the always-wave core and the reader. The menu loads after ready, so it is
// not in that set and is counted on the late line instead. An edit-only module
// riding along would be paid for by a reader who never opens the editor.
test("the Document built view counts the facade, the core and the reader before ready, leaves the menu late, and no edit-only module", async () => {
  const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
  const chunkOf = (entry) => `m/${manifest.entries[entry]}`;
  const measured = await measureBuilt({ html: htmlOf("document.html"), mode: "view", dir });
  const paths = measured.js.files.map((file) => file.path);

  expect(paths).toContain("clay.js");
  expect(paths).toContain(`m/${manifest.runtime}`);
  expect(paths).toContain(chunkOf("reader-core.js"));
  expect(paths).toContain(chunkOf("plugins/page-view.js"));
  expect(manifest.entries["plugins/menu.js"]).toBeTruthy();
  expect(paths).not.toContain(chunkOf("plugins/menu.js"));
  expect(measured.js.late.requests).toBeGreaterThan(0);

  const editOnly = [
    ...CORE_WAVES.editOnly,
    ...Object.values(PLUGIN_PATHS).filter((plugin) => plugin.editOnly).map((plugin) => plugin.path),
  ];
  for (const entry of editOnly) expect(paths).not.toContain(chunkOf(entry));
}, 180000);

// The released bytes are the manifest's bytes: the meter reads the same inventory the
// release publishes, so the budget cannot drift from what a browser downloads.
test("the Document built view's requests are the release manifest's files, byte for byte", async () => {
  const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
  const measured = await measureBuilt({ html: htmlOf("document.html"), mode: "view", dir });

  expect(measured.js.requests).toBe(measured.js.files.length);
  for (const file of measured.js.files) {
    const listed = file.path.startsWith("m/") ? manifest.files[file.path.slice(2)] : null;
    if (!listed) {
      // The classic facade is the generated bootstrap, written beside the manifest.
      expect(file.path).toBe("clay.js");
      expect(file.raw).toBe(readFileSync(join(dir, file.path)).length);
      continue;
    }
    expect(listed.bytes).toBe(file.raw);
  }
}, 180000);

// M3's comparison, kept visible beside the milestone gate: the source-mode Document
// view is the depth M3 had to bring under 23 stages, the built one is three.
test("the Document view stays below M3's 23-stage source limit and is three stages built", async () => {
  const source = await measure({ html: htmlOf("document.html"), mode: "view" });
  const built = await measureBuilt({ html: htmlOf("document.html"), mode: "view", dir });

  expect(source.js.depth).toBeLessThan(23);
  expect(built.js.depth).toBe(3);
}, 180000);

// Recovery is the editor's own business. A reader who never writes must not fetch
// the driver, the store or any IndexedDB code, and the Journal must never pull a
// Document's page code into any of its closures. A chunk is what a browser really
// downloads, so a built check asks the manifest which logical modules landed in the
// file rather than trusting the chunk's name. Every list is checked to be non-empty
// first: an empty closure would otherwise satisfy every absence below.
const JOURNAL_FIXTURES = ["journal.html", "journal-hyperclay.html"];

const entriesUnder = (manifest, prefix) =>
  Object.entries(manifest.entries).filter(([entry]) => entry.startsWith(prefix));

const codeOfBuilt = (builtDir, path) =>
  readFileSync(path.startsWith("entries/") ? join(ROOT, path) : join(builtDir, path), "utf8");

describe("recovery stays out of readers", () => {
  test("no fixture's view closure carries the recovery driver, the store or any IndexedDB code", async () => {
    const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
    const driverChunks = new Set(entriesUnder(manifest, "recovery/").map(([, file]) => `m/${file}`));

    for (const fixture of Object.keys(budget)) {
      if (fixture === "built") continue;
      for (const mode of Object.keys(budget[fixture])) {
        if (mode !== "view") continue;
        const source = await measure({ html: htmlOf(fixture), mode });
        const built = await measureBuilt({ html: htmlOf(fixture), mode, dir });
        const sourcePaths = source.js.files.map(({ path }) => path);
        const builtPaths = built.js.files.map(({ path }) => path);

        expect(sourcePaths.length).toBeGreaterThan(0);
        expect(builtPaths.length).toBeGreaterThan(0);
        expect(sourcePaths.filter((path) => path.startsWith("src/recovery/"))).toEqual([]);
        expect(builtPaths.filter((path) => driverChunks.has(path))).toEqual([]);
        expect(sourcePaths.filter((path) => readFileSync(join(ROOT, path), "utf8").includes("indexedDB"))).toEqual([]);
        expect(builtPaths.filter((path) => codeOfBuilt(dir, path).includes("indexedDB"))).toEqual([]);
      }
    }
  }, 300000);

  // The facade is at ready in the editor, small against the edit budget 04 set, and
  // the store that opens the database is not: it is deferred to the first use, which
  // is the whole reason the reader pays nothing for it.
  test("the Journal editor's recovery facade is at ready, small, and its driver is deferred", async () => {
    const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
    const chunkOf = (entry) => `m/${manifest.entries[entry]}`;

    for (const fixture of JOURNAL_FIXTURES) {
      const source = await measure({ html: htmlOf(fixture), mode: "edit" });
      const built = await measureBuilt({ html: htmlOf(fixture), mode: "edit", dir });
      const sourcePaths = source.js.files.map(({ path }) => path);
      const builtPaths = built.js.files.map(({ path }) => path);
      const sourceFacade = source.js.files.find(({ path }) => path === "src/core/recovery.js");
      const builtFacade = built.js.files.find(({ path }) => path === chunkOf("core/recovery.js"));
      const editLimits = budget[fixture].edit;

      expect(sourcePaths.length).toBeGreaterThan(0);
      expect(builtPaths.length).toBeGreaterThan(0);
      expect(sourcePaths).toContain("src/core/recovery.js");
      expect(builtPaths).toContain(chunkOf("core/recovery.js"));
      expect(sourceFacade.brotli).toBeGreaterThan(0);
      expect(builtFacade.brotli).toBeGreaterThan(0);
      console.log(`${fixture} edit: the recovery facade is ${sourceFacade.brotli} B Brotli in source, ` +
        `${builtFacade.brotli} B Brotli built, of the ${editLimits.brotli} B edit budget`);
      expect(sourceFacade.brotli * 8).toBeLessThanOrEqual(editLimits.brotli);

      for (const entry of ["recovery/store.js", "recovery/conflicts.js"]) {
        expect(sourcePaths).not.toContain(`src/${entry}`);
        expect(builtPaths).not.toContain(chunkOf(entry));
        expect(source.lazy).toContain(`src/${entry}`);
        expect(built.lazy).toContain(chunkOf(entry));
      }
    }
  }, 300000);

  // The Journal is not a Document: its editor, its view parts and its tables belong
  // to another template, and a Journal that loaded them would be paying for a page
  // it does not have. Both the ready set and the deferred one are checked.
  test("no Journal closure holds a Document page file", async () => {
    const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
    const pageChunks = new Set(entriesUnder(manifest, "page/").map(([, file]) => `m/${file}`));

    expect(pageChunks.size).toBeGreaterThan(0);
    for (const fixture of JOURNAL_FIXTURES) {
      for (const mode of Object.keys(budget[fixture])) {
        const source = await measure({ html: htmlOf(fixture), mode });
        const built = await measureBuilt({ html: htmlOf(fixture), mode, dir });
        const sourcePaths = source.js.files.map(({ path }) => path);
        const builtPaths = built.js.files.map(({ path }) => path);

        expect(sourcePaths.length).toBeGreaterThan(0);
        expect(builtPaths.length).toBeGreaterThan(0);
        expect(sourcePaths.filter((path) => path.startsWith("src/page/"))).toEqual([]);
        expect(builtPaths.filter((path) => pageChunks.has(path))).toEqual([]);
        expect(source.lazy.filter((path) => path.startsWith("src/page/"))).toEqual([]);
        expect(built.lazy.filter((path) => pageChunks.has(path))).toEqual([]);
      }
    }
  }, 300000);
});
