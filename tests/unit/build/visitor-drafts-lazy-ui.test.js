/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { resolveModules } from "../../../src/loader-logic.js";

/**
 * A visitor's draft boot carries the prompt, and the prompt carries its own
 * stylesheet: the owner chip belongs to an owner, the prompt's CSS to the prompt,
 * and the autosave debug logger to a person who switched it on. None of the three
 * is in the walk a draft boot starts, so a visitor downloads none of them before
 * ready; each is a dynamic import of the module that needs it, which is why the
 * built chunks below exist at all.
 *
 * The plan comes from the fixtures' own script tags, the way a page boots, and the
 * bundle is the real one (esbuild, write:false) with nothing externalized.
 */

const LAZY = [
  "src/plugins/visitor-drafts/owner-chip.js",
  "src/plugins/visitor-drafts/prompt-style.js",
  "src/lib/autosave-debug.js",
];

// The modules that fetch each chunk, and only when it is needed: the owner chip is
// asked for by the draft plugin and by the owner's own, the other two by one module each.
const FETCHED_BY = {
  "src/plugins/visitor-drafts/owner-chip.js": {
    importer: "src/plugins/visitor-drafts.js",
    importers: ["src/plugins/visitor-drafts.js", "src/plugins/visitor-drafts-owner.js"],
  },
  "src/plugins/visitor-drafts/prompt-style.js": {
    importer: "src/plugins/visitor-drafts/prompt.js",
    importers: ["src/plugins/visitor-drafts/prompt.js"],
  },
  "src/lib/autosave-debug.js": {
    importer: "src/lib/autosave-debug-gate.js",
    importers: ["src/lib/autosave-debug-gate.js"],
  },
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
    outdir: "visitor-drafts-lazy-out",
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
      frontier.push(...staticDeps(inputs, file));
    }
    frontier = next;
  }
  return seen;
}

function fixtureBoot(file) {
  const html = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
  const src = html.match(/<script[^>]+src="([^"]*clay\.js[^"]*)"/);
  return {
    params: new URLSearchParams(new URL(src[1]).search),
    hasSap: /\ssap[\s>=]/.test(html.match(/<html[^>]*>/)[0]),
  };
}

for (const { mode, isEditMode, isDraftMode } of MODES) {
  test(`kanban ${mode}: no owner chip, prompt stylesheet or autosave debug logger is in the boot graph`, async () => {
    const { params, hasSap } = fixtureBoot("tests/fixtures/load/kanban.html");
    const plan = resolveModules(params, isEditMode, { isDraftMode, hasSap });
    const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
    const inputs = await inputsFor(entries);
    const graph = walk(inputs, ["src/loader.js", ...entries]);

    // The draft is the boot that would carry all three, and it carries the plugin
    // that fetches them, so the absence below is the laziness and not an unbuilt file.
    if (isDraftMode) expect(entries).toContain("src/plugins/visitor-drafts.js");
    // The gate stands where the logger stood: in the save path an edit or draft boots.
    expect(graph.has("src/lib/autosave-debug-gate.js")).toBe(isEditMode);
    expect([...graph].filter((file) => LAZY.includes(file))).toEqual([]);

    // Built, so each is there for the module that needs it to fetch...
    expect(Object.keys(inputs)).toEqual(expect.arrayContaining(LAZY));
    for (const [file, { importer, importers }] of Object.entries(FETCHED_BY)) {
      const dynamic = (inputs[importer]?.imports || [])
        .filter((im) => !im.external && im.kind === "dynamic-import")
        .map((im) => im.path);
      expect(dynamic).toContain(file);
      // ...and fetched by no module this test does not name.
      const found = Object.entries(inputs)
        .filter(([, input]) => (input.imports || []).some((imported) => imported.path === file))
        .map(([name]) => name);
      expect(found).toContain(importer);
      expect(found.filter((name) => !importers.includes(name))).toEqual([]);
    }
  });
}

test("a journal draft boot carries the prompt plugin and none of the three chunks", async () => {
  const { params, hasSap } = fixtureBoot("tests/fixtures/load/journal.html");
  const plan = resolveModules(params, true, { isDraftMode: true, hasSap });
  const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
  const graph = walk(await inputsFor(entries), ["src/loader.js", ...entries]);

  expect(entries).toContain("src/plugins/visitor-drafts.js");
  expect([...graph].filter((file) => LAZY.includes(file))).toEqual([]);
});
