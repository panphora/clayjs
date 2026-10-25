/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { build } from "esbuild";
import { resolveModules } from "../../src/loader-logic.js";

/**
 * The reader is the whole of clayjs on a view-mode Document: the loader, the core
 * modules and plugins/page-view.js. It paints no dialog, shows no notice and opens
 * no editor, so the theme UI, the Bevel controls it is drawn with, and the
 * hyper-morph package must not be in what it downloads. The reader holds exactly
 * one surface: configuration (ui/theme-config.js), which answers clay.theme()
 * synchronously and imports nothing.
 *
 * The plan is resolved by the loader itself rather than hand-copied, so a module
 * that starts naming a control shows up here, and the bundle is the real one
 * (esbuild, write:false): nothing is externalized to make the assertion pass.
 */

const READER = { plugins: "page", exclude: "richclay" };

const readerPlan = () =>
  resolveModules(new URLSearchParams(`plugins=${READER.plugins}&exclude=${READER.exclude}`), false, {
    isDraftMode: false,
    hasSap: false,
  });

async function inputsFor(entryPoints) {
  const result = await build({
    absWorkingDir: new URL("../../", import.meta.url).pathname,
    entryPoints: [...new Set(entryPoints)],
    bundle: true,
    splitting: true,
    format: "esm",
    write: false,
    outdir: "reader-imports-out",
    metafile: true,
    external: ["https://*"],
    logLevel: "silent",
  });
  return result.metafile.inputs;
}

// What the page fetches before it can apply a saved file: each module and the
// modules it imports statically. A dynamic import is a later stage by design and
// is not part of this set, which is how the tests below tell the two apart.
function eagerInputs(inputs, entries) {
  const seen = new Set();
  let frontier = [...entries];
  while (frontier.length) {
    const next = [];
    for (const file of frontier) {
      if (seen.has(file)) continue;
      seen.add(file);
      for (const imported of inputs[file]?.imports || []) {
        if (imported.external || imported.kind !== "import-statement") continue;
        next.push(imported.path);
      }
    }
    frontier = next;
  }
  return seen;
}

const THEME_UI = ["src/ui/theme.js", "src/ui/bevel-controls.js"];
const PARSER_PACKAGE = /^node_modules\/hyper-morph\//;

test("the resolved reader downloads no theme UI, no Bevel controls and no parser package", async () => {
  const plan = readerPlan();
  expect(plan.plugins).toContain("plugins/page-view.js");
  const entries = ["src/loader.js", ...[...plan.core, ...plan.plugins].map((path) => `src/${path}`)];
  const inputs = await inputsFor(entries);

  const fetched = eagerInputs(inputs, entries);
  expect(fetched.size).toBeGreaterThanOrEqual(40);
  expect([...fetched].filter((file) => THEME_UI.includes(file))).toEqual([]);
  // Configuration is the one surface a reader carries: clay.theme() still answers.
  expect(fetched.has("src/ui/theme-config.js")).toBe(true);

  // The whole input set, lazily imported chunks included, holds no copy of the
  // parser package: the reader's JSON comes from src/vendor/hyper-morph-json.
  expect(Object.keys(inputs).filter((file) => PARSER_PACKAGE.test(file))).toEqual([]);
});

// Not externalized and not renamed away: the same modules the reader leaves out are
// still the ones a page that does open a themed surface gets.
test("a themed surface still loads the theme UI and the Bevel controls it paints with", async () => {
  const inputs = await inputsFor(["src/ui/dialogs.js"]);
  const fetched = eagerInputs(inputs, ["src/ui/dialogs.js"]);

  expect(fetched.has("src/ui/theme.js")).toBe(true);
  expect(fetched.has("src/ui/bevel-controls.js")).toBe(true);
  expect(fetched.has("src/ui/theme-config.js")).toBe(true);
  expect(fetched.has("src/ui/page-scheme.js")).toBe(true);
});
