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

// A reader must never fetch the switch: the declaration is one attribute read, and the
// decision, the controller, the support table and every edit half behind them are dynamic
// targets fetched by the first switch. The three templates' own loader tags are the plans,
// so a plan that starts naming one of them shows up here.
const SWITCH_ONLY = [
  "src/core/mode-switch.js",
  "src/core/mode-support.js",
  "src/core/mode-lifecycle.js",
  "src/sync/live-sync-edit.js",
  "src/core/save.js",
  "src/plugins/page.js",
];

for (const [name, fixture] of [["document.html", "document"], ["kanban.html", "kanban"], ["journal.html", "journal"]]) {
  test(`${name} view: the reader graph has no mode switch and no edit half`, async () => {
    const html = readFileSync(new URL(`../../../tests/fixtures/load/${name}`, import.meta.url), "utf8");
    const tag = html.match(/<script[^>]+src="([^"]*clay\.js[^"]+)"/)[1];
    const plan = resolveModules(new URL(tag, "https://clayjs.com/").searchParams, false, {
      isDraftMode: false,
      hasSap: FIXTURES[fixture].hasSap,
    });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

    expect(graph.size).toBeGreaterThanOrEqual(40);
    expect([...graph].filter((file) => SWITCH_ONLY.includes(file))).toEqual([]);
  });
}

// The dialog, the avatars and the editing markers are UI a reader may never be shown:
// a lone reader opens no name prompt and draws nobody, so the Bevel subset they paint
// with is fetched at first use and is not in the reader's walk. The edges below say
// the modules still exist to be fetched, and are dynamic.
const FIRST_USE_UI = [
  "src/ui/bevel-dialog.js",
  "src/ui/bevel-controls.js",
  "src/ui/bevel.js",
  "src/ui/theme-parts.js",
];

const dynamicDeps = (inputs, file) =>
  (inputs[file]?.imports || []).filter((im) => im.kind === "dynamic-import").map((im) => im.path);

test("kanban view: the dialog, presence and markers paint from a first-use download", async () => {
  const html = readFileSync(new URL("../../../tests/fixtures/load/kanban.html", import.meta.url), "utf8");
  const params = new URL(html.match(/<script[^>]+src="([^"]*clay\.js[^"]+)"/)[1]).searchParams;
  const plan = resolveModules(params, false, { isDraftMode: false, hasSap: FIXTURES.kanban.hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const inputs = await inputsFor(entries);
  const graph = walk(inputs, entries);

  expect(entries).toContain("src/plugins/people.js");
  expect(graph.has("src/sync/presence.js")).toBe(true);
  expect(graph.has("src/sync/editing-marker.js")).toBe(true);
  expect([...graph].filter((file) => FIRST_USE_UI.includes(file))).toEqual([]);

  // Built, so each first use has something to fetch when it happens...
  expect(Object.keys(inputs)).toEqual(expect.arrayContaining(FIRST_USE_UI));
  expect(dynamicDeps(inputs, "src/plugins/people.js")).toEqual(expect.arrayContaining([
    "src/ui/bevel-dialog.js", "src/ui/bevel-controls.js", "src/ui/theme.js",
  ]));
  for (const file of ["src/sync/presence.js", "src/sync/editing-marker.js"]) {
    expect(dynamicDeps(inputs, file)).toEqual(expect.arrayContaining(["src/ui/bevel-controls.js", "src/ui/bevel.js"]));
  }
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
// The upgrade check reads the file's `hyper-version` and the published one and compares
// them; the rules engine that moves a document's data into a new version is a different,
// larger module, and only the click that runs an upgrade needs it. A page whose owner is
// offered no upgrade carries the comparison, not the engine: the click lands on
// `clay:upgrade-requested`, which is where the runner that carries the engine is fetched.
const UPGRADE_ENGINE = "src/vendor/hyper-html-api-upgrade.vendor.js";

test("kanban view: the upgrade check is in the reader graph and the engine is not", async () => {
  const html = readFileSync(new URL("../../../tests/fixtures/load/kanban.html", import.meta.url), "utf8");
  const params = new URL(html.match(/<script[^>]+src="([^"]*clay\.js[^"]+)"/)[1]).searchParams;
  // The meter counts a template copy for its owner, which is the page that carries the
  // check: `resolveModules` adds plugins/upgrade.js for exactly this combination.
  const templateSource = html.match(/<meta name="hyper-source" content="([^"]+)"/)?.[1] ?? null;
  const plan = resolveModules(params, false, { isDraftMode: false, hasSap: FIXTURES.kanban.hasSap, canEdit: true, templateSource });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const inputs = await inputsFor(entries);
  const graph = walk(inputs, entries);

  expect(entries).toContain("src/plugins/upgrade.js");
  expect(graph.size).toBeGreaterThanOrEqual(40);
  expect(graph.has("src/plugins/upgrade.js")).toBe(true);
  expect(graph.has("src/core/version.js")).toBe(true);
  expect(graph.has(UPGRADE_ENGINE)).toBe(false);

  // Built, so the engine exists for the click that runs an upgrade to fetch...
  expect(Object.keys(inputs)).toContain(UPGRADE_ENGINE);
  expect(dynamicDeps(inputs, "src/plugins/upgrade.js")).toContain("src/plugins/upgrade-run.js");
  // ...and the runner is what carries it, statically, once that fetch lands.
  const runner = "src/plugins/upgrade-run.js";
  const runnerGraph = walk(inputs, [runner]);
  expect(runnerGraph.has(UPGRADE_ENGINE)).toBe(true);
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

// Kanban 08 puts the undo plugin in both host tags, and it stays edit-only: the
// recorder has to be ready before the first editable action, and a reader never
// writes. The fixtures' own tags are the plans, but their recorded rows predate the
// plugin, so the plan is asked the question the canonical template's tag asks. The
// engine, the plugin, the driver that keeps a refused step and the notice's UI are
// all named: a reader that loaded any of them would be paying for an editor.
const UNDO_ONLY = [
  "src/vendor/hyper-undo.vendor.js",
  "src/plugins/undo.js",
  "src/recovery/undo.js",
  "src/core/conflict-notice-ui.js",
];

const withUndo = (params) => {
  const plugins = params.get("plugins").split(",").filter(Boolean);
  if (!plugins.includes("undo")) params.set("plugins", [...plugins, "undo"].join(","));
  return params;
};

// The database is opened by the recovery store, one dynamic import from the facade.
// A module that names it at all in a reader's walk is a reader opening a database.
const mentionsDatabase = (files) =>
  files.filter((file) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8").includes("indexedDB"));

for (const fixture of ["kanban.html", "journal.html"]) {
  test(`${fixture} view: the reader graph carries no undo, projection, recovery driver or notice UI`, async () => {
    const { params, hasSap } = fixtureBoot(`tests/fixtures/load/${fixture}`);
    withUndo(params);
    const plan = resolveModules(params, false, { isDraftMode: false, hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

    expect(entries).not.toContain("src/plugins/undo.js");
    expect(graph.size).toBeGreaterThanOrEqual(40);
    expect([...graph].filter((file) => UNDO_ONLY.includes(file) || RECOVERY_STORE.test(file))).toEqual([]);
    expect(mentionsDatabase([...graph])).toEqual([]);

    // The same tag in edit does carry the recorder, so the absence above is the
    // reader's and not the tag's.
    const edit = resolveModules(params, true, { isDraftMode: false, hasSap });
    expect(edit.plugins).toContain("plugins/undo.js");
  });
}

// Kanban 07's move API lives in the sortable plugin, which is edit-only and late: a
// reader who cannot move anything must not fetch the plugin, and the fixture's own tag
// is the plan, so a tag that starts naming it shows up here. The same tag in edit
// carries the plugin, so the absence below is the reader's and not the tag's.
const SORTABLE_ONLY = /^src\/(plugins\/sortable[^/]*\.js|vendor\/Sortable\.vendor\.js)$/;

test("kanban.html view: the reader graph carries no sortable plugin or drag vendor", async () => {
  const { params, hasSap } = fixtureBoot("tests/fixtures/load/kanban.html");
  withUndo(params);
  const plan = resolveModules(params, false, { isDraftMode: false, hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

  expect(entries).not.toContain("src/plugins/sortable.js");
  expect(graph.size).toBeGreaterThanOrEqual(40);
  expect([...graph].filter((file) => SORTABLE_ONLY.test(file))).toEqual([]);

  // Sortable is one of the late plugins, so the same tag in edit names it after ready.
  const edit = resolveModules(params, true, { isDraftMode: false, hasSap });
  expect(edit.late).toContain("plugins/sortable.js");
  expect(plan.late).not.toContain("plugins/sortable.js");
});

// A refused step's durable copy is Journal 07's recovery service, and the module that
// stages it is fetched by the first refusal or keep: `plugins/undo.js` names it in one
// dynamic import and nothing imports it statically. An edit or draft boot therefore
// holds the recorder and not the driver, and opens no database until one is needed.
test("kanban edit and draft: the undo driver is one dynamic import of the undo plugin, never a ready module", async () => {
  const { params, hasSap } = fixtureBoot("tests/fixtures/load/kanban.html");
  withUndo(params);

  for (const [mode, isDraftMode] of [["edit", false], ["draft", true]]) {
    const plan = resolveModules(params, true, { isDraftMode, hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    expect(entries).toContain("src/plugins/undo.js");
    const inputs = await inputsFor(entries);

    // Built, so the driver exists for that first refusal to fetch at all...
    expect(Object.keys(inputs)).toContain("src/recovery/undo.js");
    expect(dynamicDeps(inputs, "src/plugins/undo.js")).toContain("src/recovery/undo.js");
    const importers = Object.entries(inputs)
      .filter(([, input]) => (input.imports || []).some((imported) => imported.path === "src/recovery/undo.js"))
      .map(([file]) => file);
    expect(importers).toEqual(["src/plugins/undo.js"]);

    // ...and fetched, not walked, in either mode.
    const graph = walk(inputs, ["src/loader.js", ...entries]);
    expect(graph.size).toBeGreaterThanOrEqual(40);
    expect(graph.has("src/recovery/undo.js")).toBe(false);
    expect([...graph].filter((file) => RECOVERY_STORE.test(file))).toEqual([]);
    // The facade takes a factory as an injected option; it never opens one itself.
    expect(mentionsDatabase([...graph])).toEqual(["src/core/recovery.js"]);
  }
});
