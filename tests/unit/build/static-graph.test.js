/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolveModules } from "../../../src/loader-logic.js";
import { ASSETS as OPTIONAL_ASSETS } from "../../../scripts/vendor-optional.mjs";

/**
 * The merge engine is a first-merge download and parse5 is a first-owned-style one,
 * never a boot download. This walks the static imports of each plan a Kanban,
 * Journal or Document boots, the way the browser would fetch them, and fails if the
 * engine's vendor, its tag recognizers, or the parser an owned style needs are in
 * that walk. The `source` plugin, the other parse5 importer, loads late, after the
 * editor takes input, so it is not in these plans.
 *
 * The plans come from the loader itself (resolveModules) rather than a hand
 * copy, so a plugin that starts naming the engine shows up here.
 */

const FORBIDDEN = [
  "src/vendor/hyper-morph.vendor.js",
  "src/sync/merge-tags.js",
  "src/vendor/parse5.vendor.js",
  "src/core/style-comparisons.js",
];

// A Document reads its JSON with the small relaxed parser, so the engine and its
// tag recognizers are first-use downloads there, and so is the parse5 stripper: an
// owned style queues it only when the file already carries that tag. View mode is
// left out of the Document fixture: page/view.js morphs a saved article with the
// engine.
const FIXTURES = {
  kanban: { plugins: "sortable,people,upload,sync,visitor-drafts", exclude: "richclay", hasSap: true, forbidden: FORBIDDEN, forbiddenLabel: "the merge engine or parse5" },
  journal: { plugins: "sync,visitor-drafts", exclude: "richclay", hasSap: false, forbidden: FORBIDDEN, forbiddenLabel: "the merge engine or parse5" },
  document: { plugins: "page", exclude: "richclay", hasSap: false, modes: ["edit", "draft"], forbidden: FORBIDDEN, forbiddenLabel: "the merge engine or parse5" },
};

const MODES = [
  { mode: "view", isEditMode: false, isDraftMode: false },
  { mode: "draft", isEditMode: true, isDraftMode: true },
  { mode: "edit", isEditMode: true, isDraftMode: false },
];

async function inputsFor(entryPoints) {
  const result = await build({
    absWorkingDir: new URL("../../../", import.meta.url).pathname,
    entryPoints: [...new Set(["src/loader.js", ...entryPoints])],
    bundle: true,
    splitting: true,
    format: "esm",
    write: false,
    outdir: "static-graph-out",
    metafile: true,
    external: ["https://*"],
    logLevel: "silent",
  });
  return result.metafile.inputs;
}

function staticDeps(inputs, file) {
  return (inputs[file]?.imports || [])
    .filter((im) => !im.external && im.kind === "import-statement")
    .map((im) => im.path);
}

function walk(inputs, entries) {
  const seen = new Set();
  let frontier = [...entries];
  while (frontier.length) {
    const next = [];
    for (const file of frontier) {
      if (seen.has(file)) continue;
      seen.add(file);
      next.push(...staticDeps(inputs, file));
    }
    frontier = next;
  }
  return seen;
}

// OverType, marked and highlight.js are asked for by name at the moment a page needs
// them (clay.assets), so the plain-text reader paints before any of them arrives. The
// Journal is the fixture for all three. `src/lib/assets.js` is in the walk, so a static
// import of a library would show up here.
const VENDORED_OPTIONAL = OPTIONAL_ASSETS.map((asset) => `src/vendor/${asset.file}`);

for (const { mode, isEditMode, isDraftMode } of MODES) {
  test(`journal ${mode}: no optional library is in the boot graph`, async () => {
    const tag = FIXTURES.journal;
    const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
    const plan = resolveModules(params, isEditMode, { isDraftMode, hasSap: tag.hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    // Seeded with the loader itself: it is the entry a page boots, and the module
    // that publishes clay.assets.
    const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

    expect(graph.has("src/lib/assets.js")).toBe(true);
    expect([...graph].filter((file) => VENDORED_OPTIONAL.includes(file))).toEqual([]);
  });
}

// The conflict notice is 6.8 KB Brotli and most edit boots have nothing for it to
// show: core/conflict-notice.js is a shell that fetches conflict-notice-ui.js on the
// first event that does. The shell is in every edit plan; the notice it fetches must
// never be in the walk of one.
for (const [fixture, tag] of Object.entries(FIXTURES)) {
  test(`${fixture} edit: the conflict notice is fetched, not in the boot graph`, async () => {
    const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
    const plan = resolveModules(params, true, { isDraftMode: false, hasSap: tag.hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    const graph = walk(await inputsFor(entries), entries);

    expect(entries).toContain("src/core/conflict-notice.js");
    expect([...graph].filter((file) => file.startsWith("src/core/conflict-notice"))).toEqual(["src/core/conflict-notice.js"]);
  });
}

// The reader half of the Document is the only Document code a view-mode page has
// to download before it can apply a saved file. It projects markup key by key, so
// neither the merge engine nor its hyper-morph vendor belongs in its graph.
test("document view: the reader graph has no merge engine or hyper-morph vendor", async () => {
  const tag = FIXTURES.document;
  const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
  const plan = resolveModules(params, false, { isDraftMode: false, hasSap: tag.hasSap });
  expect(plan.plugins).toContain("plugins/page-view.js");
  const entry = "src/plugins/page-view.js";
  const graph = walk(await inputsFor([entry]), [entry]);

  expect([...graph].filter((file) => file === "src/sync/merge-engine.js" || /^src\/vendor\/hyper-morph/.test(file))).toEqual([]);
  expect(graph.has("src/sync/saved-stream.js")).toBe(true);
});

for (const [fixture, tag] of Object.entries(FIXTURES)) {
  for (const { mode, isEditMode, isDraftMode } of MODES) {
    if (tag.modes && !tag.modes.includes(mode)) continue;
    test(`${fixture} ${mode}: no plan statically loads ${tag.forbiddenLabel}`, async () => {
      const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
      const plan = resolveModules(params, isEditMode, { isDraftMode, hasSap: tag.hasSap });
      const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
      const inputs = await inputsFor(entries);
      const graph = walk(inputs, entries);

      expect(graph.size).toBeGreaterThanOrEqual(40);
      expect([...graph].filter((file) => tag.forbidden.includes(file))).toEqual([]);
      // The identity store is a module the plans may carry: it is what keeps
      // live sync's synthetic ids without the engine.
      if (entries.includes("src/sync/live-sync.js")) {
        expect(graph.has("src/sync/live-sync.js")).toBe(true);
        expect(graph.has("src/vendor/hyper-morph-identity.vendor.js")).toBe(true);
      }
    });
  }
}

// An owner editing the original reads the owner chip, not the draft store: the
// store, its hyper-html-api data engine, the prompt and the intro are a visitor's,
// and the loader resolves plugins/visitor-drafts-owner.js in edit mode. The draft
// run below is the control: the same walk finds the store when a visitor keeps one.
const DRAFT_STORE = ["src/plugins/visitor-drafts/store.js", "src/vendor/hyper-html-api-data.vendor.js"];

for (const fixture of ["kanban", "journal"]) {
  test(`${fixture} edit: the draft store is not in the boot graph`, async () => {
    const tag = FIXTURES[fixture];
    const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
    const plan = resolveModules(params, true, { isDraftMode: false, hasSap: tag.hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);

    expect(entries).toContain("src/plugins/visitor-drafts-owner.js");
    const graph = walk(await inputsFor(entries), entries);
    expect([...graph].filter((file) => DRAFT_STORE.includes(file))).toEqual([]);
  });
}

test("kanban draft: the same walk does find the draft store", async () => {
  const tag = FIXTURES.kanban;
  const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
  const plan = resolveModules(params, true, { isDraftMode: true, hasSap: tag.hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);

  expect(entries).toContain("src/plugins/visitor-drafts.js");
  const graph = walk(await inputsFor(entries), entries);
  expect(graph.has("src/plugins/visitor-drafts/store.js")).toBe(true);
});

// What the shipped Kanban view page asks for: its own loader tag, not a hand copy
// of the plugin list. A reader must never fetch the save graph, and parse5 comes in
// only through save.js's owned-style stripper.
test("kanban view: the reader graph has no save code or parse5", async () => {
  const html = readFileSync(new URL("../../../tests/fixtures/load/kanban.html", import.meta.url), "utf8");
  const tag = html.match(/<script[^>]+src="([^"]*clay\.js[^"]+)"/)[1];
  const params = new URL(tag).searchParams;
  const plan = resolveModules(params, false, { isDraftMode: false, hasSap: FIXTURES.kanban.hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const graph = walk(await inputsFor(entries), entries);

  expect(entries).toContain("src/sync/live-sync.js");
  expect(graph.has("src/core/save.js")).toBe(false);
  expect(graph.has("src/vendor/parse5.vendor.js")).toBe(false);
});

// The upgrade's save is a conditional POST of a whole document, and only a page that
// can be upgraded ever makes one. It lives outside the save core so that every edit
// boot, and every reader, carries none of it; the upgrade plugin is the one module
// that pulls it in.
test("edit mode without upgrade: the replace module is not in the boot graph", async () => {
  const tag = FIXTURES.kanban;
  const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
  const plan = resolveModules(params, true, { isDraftMode: false, hasSap: tag.hasSap });
  expect(plan.plugins).not.toContain("plugins/upgrade.js");
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const graph = walk(await inputsFor(entries), entries);

  expect(graph.has("src/core/save.js")).toBe(true);
  expect(graph.has("src/core/save-replace.js")).toBe(false);
});

test("the notice loads the replace module only through the upgrade runner", async () => {
  const entry = "src/plugins/upgrade.js";
  const plan = resolveModules(new URLSearchParams("plugins=upgrade&exclude=richclay"), true, {
    isDraftMode: false,
    hasSap: false,
  });
  expect(plan.plugins).toContain("plugins/upgrade.js");
  const noticeGraph = walk(await inputsFor([entry]), [entry]);
  expect(noticeGraph.has("src/core/save-replace.js")).toBe(false);
  expect(noticeGraph.has("src/plugins/upgrade-run.js")).toBe(false);

  const runner = "src/plugins/upgrade-run.js";
  const runnerGraph = walk(await inputsFor([runner]), [runner]);
  expect(runnerGraph.has("src/core/save-replace.js")).toBe(true);
});
// The recovery store is a dynamic import from core/recovery.js, and core/recovery.js
// is edit-only. So a reader never downloads the database code and never opens one,
// and a visitor's draft — which does carry the edit-only facade, because a draft is
// a tab this person edits — still carries neither the store nor the identity that
// scopes it. The plans here come from the fixtures' own script tags, so a fixture
// that starts naming a plugin is measured as it boot.
const RECOVERY_STORE = /^src\/recovery\//;
const FIXTURE_HTML = {
  journal: "tests/fixtures/load/journal.html",
  document: "tests/fixtures/load/document.html",
};

function fixtureBoot(file) {
  const html = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
  const src = html.match(/<script[^>]+src="([^"]*clay\.js[^"]*)"/);
  return {
    params: new URLSearchParams(new URL(src[1]).search),
    hasSap: /\ssap[\s>=]/.test(html.match(/<html[^>]*>/)[0]),
  };
}

for (const [fixture, file] of Object.entries(FIXTURE_HTML)) {
  for (const { mode, isEditMode, isDraftMode } of MODES) {
    test(`${fixture} ${mode}: no src/recovery module is in the boot graph`, async () => {
      const { params, hasSap } = fixtureBoot(file);
      const plan = resolveModules(params, isEditMode, { isDraftMode, hasSap });
      const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
      const inputs = await inputsFor(entries);
      const graph = walk(inputs, ["src/loader.js", ...entries]);

      expect([...graph].filter((imported) => RECOVERY_STORE.test(imported))).toEqual([]);
      // The test-only IndexedDB is a dev dependency the runtime must never reach,
      // statically or through a dynamic import, and the metafile sees both.
      expect(Object.keys(inputs).filter((imported) => imported.includes("fake-indexeddb"))).toEqual([]);
      if (isEditMode) expect(graph.has("src/core/recovery.js")).toBe(true);
      else expect(graph.has("src/core/recovery.js")).toBe(false);
    });
  }
}

// Journal 07 Step 3 records a lost conflict durably: the row as the notice words it,
// the pre-apply root as bytes, and the store both go to. A reader never records one —
// it has nothing unsaved for an incoming frame to win over — so none of that is in its
// graph. `sync/conflicts-edit.js` is the recording half the ledger fetches on the edit
// path, and `core/conflict-presentation.js` is the row wording it reads.
const CONFLICT_RECORDING = ["src/sync/conflicts-edit.js", "src/core/conflict-presentation.js"];

for (const fixture of ["kanban.html", "journal.html"]) {
  test(`${fixture} view: no conflict recording module is in the reader graph`, async () => {
    const { params, hasSap } = fixtureBoot(`tests/fixtures/load/${fixture}`);
    const plan = resolveModules(params, false, { isDraftMode: false, hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

    // The ledger itself is carried: a reader still sees a conflict it was handed.
    expect(graph.has("src/sync/conflicts.js")).toBe(true);
    expect([...graph].filter((file) => CONFLICT_RECORDING.includes(file))).toEqual([]);
    expect([...graph].filter((file) => RECOVERY_STORE.test(file))).toEqual([]);
  });
}

test("an edit boot fetches the conflict recording module, a reader never does", async () => {
  const tag = FIXTURES.kanban;
  const params = new URLSearchParams(`plugins=${tag.plugins}&exclude=${tag.exclude}`);
  const plan = resolveModules(params, true, { isDraftMode: false, hasSap: tag.hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const inputs = await inputsFor(entries);
  // Built, so the module exists for the edit path to fetch at all...
  expect(Object.keys(inputs)).toEqual(expect.arrayContaining(CONFLICT_RECORDING));
  // ...and fetched, not walked: it is a dynamic import, its own chunk.
  const graph = walk(inputs, entries);
  expect([...graph].filter((file) => CONFLICT_RECORDING.includes(file))).toEqual([]);
});
