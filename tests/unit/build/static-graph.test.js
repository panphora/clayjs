/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { build } from "esbuild";
import { resolveModules } from "../../../src/loader-logic.js";

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
];

// A Document reads its JSON with the small relaxed parser, so the engine and its
// tag recognizers are first-use downloads there. parse5 still loads at boot for its
// owned-style adopter until the Kanban plan moves it too. View mode is left out of
// the Document fixture: page/view.js morphs a saved article with the engine.
const ENGINE = ["src/vendor/hyper-morph.vendor.js", "src/sync/merge-tags.js"];

const FIXTURES = {
  kanban: { plugins: "sortable,people,upload,sync,visitor-drafts", exclude: "richclay", hasSap: true, forbidden: FORBIDDEN, forbiddenLabel: "the merge engine or parse5" },
  journal: { plugins: "sync,visitor-drafts", exclude: "richclay", hasSap: false, forbidden: FORBIDDEN, forbiddenLabel: "the merge engine or parse5" },
  document: { plugins: "page", exclude: "richclay", hasSap: false, modes: ["edit"], forbidden: ENGINE, forbiddenLabel: "the merge engine" },
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
