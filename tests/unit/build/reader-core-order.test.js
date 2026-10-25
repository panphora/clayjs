import { afterAll, beforeAll, expect, jest, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_WAVES, resolveModules } from "../../../src/loader-logic.js";

/**
 * The built release carries the always-wave core as one aggregate. This is the proof
 * that coalescing it changed nothing a page can see: an instrumented module graph
 * records every module's evaluation, for the built release and for a graph built the
 * way source mode fetches the same modules, and the two recordings are compared.
 *
 * The expectation is the source graph's own order, not a hand-authored list, so an
 * always-wave module that another module already imports evaluates at that point in
 * both graphs and the comparison still holds.
 *
 * esbuild cannot run in jsdom's realm, so both graphs are built in a child process.
 * Each boot gets its own copy of the files, so no module instance survives from a
 * previous boot and hides its own first-boot work.
 */

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const ALWAYS = CORE_WAVES.always;
const CORE = [...CORE_WAVES.always, ...CORE_WAVES.editOnly];
// src/loader.js imports these three through MODULES before it resolves a plan.
const PREFIX = ["core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js"];
const BODY = `<article class="page" clay="freeze"><p data-id="p1">Keep me</p></article>`;

let built;
let source;
const dirs = [];
let recorded = [];
let copies = 0;

beforeAll(async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "clay-core-order-"));
  dirs.push(out);
  const script = path.join(out, "build.mjs");
  await writeFile(script, buildScript());
  const printed = execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  const made = JSON.parse(printed.slice(printed.lastIndexOf("\n{") + 1));
  built = made.built;
  source = made.source;
}, 180000);

afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  delete globalThis.__clayEval;
});

// Both graphs get the same onLoad prepend, so a module records itself after its own
// static imports have recorded themselves: ESM evaluation order.
function buildScript() {
  return `import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = ${JSON.stringify(root)};
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");
const { emitChunks } = await import(pathToFileURL(path.join(root, "scripts/build-chunks.mjs")).href);
const { MODULES } = await import(pathToFileURL(path.join(root, "src/loader-logic.js")).href);

const evalOrder = {
  name: "eval-order",
  setup(build) {
    build.onLoad({ filter: /\\.js$/ }, async (args) => {
      const rel = path.relative(root, args.path).split(path.sep).join("/");
      if (!rel.startsWith("src/") || rel.startsWith("src/vendor/")) return null;
      const contents = "globalThis.__clayEval && globalThis.__clayEval(" + JSON.stringify(rel) + ");\\n" +
        await readFile(args.path, "utf8");
      return { contents, loader: "js" };
    });
  },
};

const built = await mkdtemp(path.join(os.tmpdir(), "clay-core-built-"));
await emitChunks({ root, outdir: path.join(built, "m"), plugins: [evalOrder] });
await writeFile(path.join(built, "package.json"), '{"type":"module"}\\n');

// Source mode as the loader runs it: one entry per MODULES path, each fetched by its
// own dynamic import, sharing only what the modules themselves share.
const source = await mkdtemp(path.join(os.tmpdir(), "clay-core-source-"));
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["loader.js", ...Object.keys(MODULES)].map((file) => "src/" + file),
  outbase: "src",
  outdir: source,
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  entryNames: "[dir]/[name]",
  chunkNames: "c-[hash]",
  external: ["https://*"],
  logLevel: "warning",
  plugins: [evalOrder],
});
await writeFile(path.join(source, "package.json"), '{"type":"module"}\\n');
console.log("\\n" + JSON.stringify({ built, source }));
`;
}

function stubHost() {
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    close() { this.readyState = 2; }
  };
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ extensions: [] }),
    text: async () => "",
    headers: { get: () => null },
  }));
}

function freshDocument(editMode) {
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  window.clay = {};
  window.clayEditMode = editMode;
  stubHost();
  recorded = [];
  globalThis.__clayEval = (file) => recorded.push(file);
}

async function bootCopy(editMode) {
  const dir = `${built}-boot-${++copies}`;
  dirs.push(dir);
  await cp(built, dir, { recursive: true });
  freshDocument(editMode);
  const manifest = JSON.parse(await readFile(path.join(dir, "m/manifest.json"), "utf8"));
  const base = pathToFileURL(path.join(dir, "m") + path.sep).href;
  const runtime = { ...(await import(new URL(manifest.runtime, base).href)).default, base };
  const { boot } = await import(new URL(manifest.entries["loader.js"], base).href);
  let ready = null;
  await boot("https://clayjs.com/1.0.0", new URLSearchParams("plugins=page"), (clay) => { ready = clay; }, runtime);
  return { ready, runtime, record: [...recorded] };
}

async function bootSource(editMode) {
  const dir = `${source}-boot-${++copies}`;
  dirs.push(dir);
  await cp(source, dir, { recursive: true });
  freshDocument(editMode);
  const { boot } = await import(pathToFileURL(path.join(dir, "loader.js")).href);
  let ready = null;
  await boot("https://clayjs.com/1.0.0", new URLSearchParams("plugins=page"), (clay) => { ready = clay; }, null);
  return { ready, record: [...recorded] };
}

const named = (files) => files.map((file) => `src/${file}`);
const of = (record, files) => record.filter((file) => named(files).includes(file));

for (const editMode of [false, true]) {
  const mode = editMode ? "edit" : "view";

  test(`the built ${mode} graph evaluates every module once and loads the aggregate`, async () => {
    const { ready, record } = await bootCopy(editMode);

    expect(ready).toBe(window.clay);
    expect(new Set(record).size).toBe(record.length);
    expect(record).toContain("src/reader-core.js");
    for (const file of named(ALWAYS)) expect(record).toContain(file);
  }, 120000);

  test(`the built ${mode} graph evaluates the core in the source graph's order`, async () => {
    const fromBuilt = (await bootCopy(editMode)).record;
    const fromSource = (await bootSource(editMode)).record;

    expect(of(fromBuilt, ALWAYS)).toEqual(of(fromSource, ALWAYS));
    expect(of(fromBuilt, PREFIX)).toEqual(of(fromSource, PREFIX));
    expect(of(fromBuilt, CORE)).toEqual(of(fromSource, CORE));

    // An always-wave module that the loader or the prefix already imports evaluates
    // before the prefix in both graphs, and only those do.
    const before = (record) => {
      const at = Math.min(...named(PREFIX).map((file) => record.indexOf(file)));
      return named(ALWAYS).filter((file) => record.indexOf(file) < at);
    };
    expect(before(fromBuilt)).toEqual(before(fromSource));
    // The aggregate itself loads after the prefix has finished.
    for (const file of named(PREFIX)) expect(fromBuilt.indexOf(file)).toBeGreaterThan(-1);
    expect(fromBuilt.indexOf("src/reader-core.js")).toBeGreaterThan(fromBuilt.indexOf("src/loader.js"));
  }, 120000);

  test(`the built ${mode} graph activates every core module before any plugin`, async () => {
    const { record } = await bootCopy(editMode);
    const plan = resolveModules(new URLSearchParams("plugins=page"), editMode, { isDraftMode: false, hasSap: false });
    const plugins = named(plan.plugins);

    expect(plan.core.length).toBeGreaterThanOrEqual(ALWAYS.length);
    for (const file of plugins) expect(record).toContain(file);
    const coreEnd = Math.max(...of(record, plan.core).map((file) => record.indexOf(file)));
    expect(Math.min(...plugins.map((file) => record.indexOf(file)))).toBeGreaterThan(coreEnd);
  }, 120000);
}

test("a reader boot and then an editor import in one realm share one copy of the core", async () => {
  const { runtime } = await bootCopy(false);
  const core = await import(new URL(runtime.entries["reader-core.js"], runtime.base).href);

  expect(core.core["lib/mutation.js"].default).toBe(window.clay.Mutation);
  expect(core.core["core/page-data.js"].readData).toBe(window.clay.readData);

  // The editor's page plugin imports the same aggregate, so no always-wave module
  // evaluates a second time in that realm.
  recorded = [];
  globalThis.__clayEval = (file) => recorded.push(file);
  const editor = await import(new URL(runtime.entries["plugins/page.js"], runtime.base).href);

  expect(typeof editor.page).toBe("object");
  expect(recorded.length).toBeGreaterThan(0);
  expect(of(recorded, ALWAYS)).toEqual([]);
  expect(new Set(recorded).size).toBe(recorded.length);
}, 120000);
