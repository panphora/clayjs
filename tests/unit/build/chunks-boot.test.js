import { afterAll, beforeAll, expect, jest, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveModules } from "../../../src/loader-logic.js";
import { mergeManifests } from "../../../src/lib/preload.js";

/**
 * The built loader boots a document. esbuild's code splitting decides what one
 * minified file imports before another, so this runs the real built plan in a real
 * (jsdom) document and compares the client it assembles, key for key, with the
 * unbundled loader's. A module that reads window.clay before assembleCore, or one
 * that runs in a different order, changes those keys or throws.
 *
 * Every boot loads its own copy of the built files: a module instance that survives
 * from a previous boot skips its own first-boot work, which is exactly the state the
 * comparison is about.
 */

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const BODY = `<article class="page" clay="freeze"><p data-id="p1">Keep me</p></article>`;

let outdir;
let copies = 0;
const dirs = [];

// esbuild refuses to run in jsdom's realm (its Uint8Array invariant fails across the
// two realms), so the build runs in a child process, as the standalone build does.
beforeAll(async () => {
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-"));
  const build = pathToFileURL(path.join(root, "scripts/build-chunks.mjs")).href;
  execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `const { emitChunks } = await import(${JSON.stringify(build)}); await emitChunks({ root: ${JSON.stringify(root)}, outdir: ${JSON.stringify(outdir)} });`,
  ], { cwd: root, stdio: "pipe" });
  // jest decides ESM by the nearest package.json, and the temp dir has none.
  await writeFile(path.join(outdir, "package.json"), '{"type":"module"}\n');
}, 120000);

afterAll(async () => {
  for (const dir of [outdir, ...dirs]) await rm(dir, { recursive: true, force: true });
});

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
}

async function bootWith(boot, editMode, manifest = null, supplement = null) {
  freshDocument(editMode);
  let ready = null;
  await boot("https://clayjs.com/1.0.0", new URLSearchParams("plugins=page"), (clay) => { ready = clay; }, manifest, supplement);
  return { ready, keys: Object.keys(window.clay).sort() };
}

// `supplement: false` boots the way a page that did not look editable does: the
// bootstrap fetched the main manifest and nothing else.
async function bootBuilt(editMode, { supplement = editMode } = {}) {
  const dir = `${outdir}-boot-${++copies}`;
  dirs.push(dir);
  await cp(outdir, dir, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  const base = pathToFileURL(dir + path.sep).href;
  const runtime = { ...(await import(new URL(manifest.runtime, base).href)).default, base };
  const edit = supplement ? { ...(await import(new URL(manifest.edit, base).href)).default, base } : null;
  const { boot } = await import(new URL(manifest.entries["loader.js"], base).href);
  return { ...(await bootWith(boot, editMode, runtime, edit)), runtime: mergeManifests(runtime, edit) };
}

const preloaded = () => [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href).sort();

function closure(runtime, paths) {
  const want = new Set();
  const add = (file) => {
    if (!file || want.has(file)) return;
    want.add(file);
    for (const dep of runtime.imports[file] ?? []) add(dep);
  };
  for (const p of paths) add(runtime.entries[p]);
  return [...want].map((file) => new URL(file, runtime.base).href).sort();
}

async function bootUnbundled(editMode) {
  jest.resetModules();
  const { boot } = await import("../../../src/loader.js");
  return bootWith(boot, editMode);
}

for (const editMode of [false, true]) {
  const mode = editMode ? "edit" : "view";

  test(`the built loader boots a ${mode}-mode document and preloads its whole plan`, async () => {
    const { ready, runtime } = await bootBuilt(editMode);

    expect(ready).toBe(window.clay);
    expect(Object.keys(window.clay).length).toBeGreaterThan(0);

    const plan = resolveModules(new URLSearchParams("plugins=page"), editMode, { isDraftMode: false, hasSap: false });
    const boot = editMode ? [...runtime.editBootImports, ...(runtime.editorBootImports ?? [])] : [];
    expect(preloaded()).toEqual(closure(runtime, [...plan.core, ...plan.plugins, ...boot]));
  }, 60000);

  if (!editMode) continue;

  // A page whose URL and cookies did not say "editable" never fetched the supplement.
  // boot() preloads what the main manifest knows and loads every module anyway: the
  // missing hints cost a stage, never a module.
  test("the built loader boots an edit-mode document with no supplement, and preloads what the main manifest knows", async () => {
    const full = await bootBuilt(editMode);
    const fullHrefs = preloaded();
    const bare = await bootBuilt(editMode, { supplement: false });

    expect(bare.ready).toBe(window.clay);
    expect(bare.keys).toEqual(full.keys);
    expect(bare.runtime.editBootImports).toBeUndefined();

    const plan = resolveModules(new URLSearchParams("plugins=page"), editMode, { isDraftMode: false, hasSap: false });
    const bareHrefs = preloaded();
    expect(bareHrefs).toEqual(closure(bare.runtime, [...plan.core, ...plan.plugins]));
    expect(bareHrefs.length).toBeLessThan(fullHrefs.length);
    // Two boot copies, so the names are compared rather than the directories.
    const names = (hrefs) => hrefs.map((href) => href.slice(href.lastIndexOf("/") + 1));
    for (const name of names(bareHrefs)) expect(names(fullHrefs)).toContain(name);
  }, 60000);

  test(`the built loader assembles the same ${mode}-mode client as the unbundled loader`, async () => {
    const bundled = await bootBuilt(editMode);
    const unbundled = await bootUnbundled(editMode);

    expect(bundled.keys).toEqual(unbundled.keys);
  }, 60000);
}
