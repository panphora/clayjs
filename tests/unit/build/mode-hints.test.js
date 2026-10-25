/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN_PATHS } from "../../../src/loader-logic.js";
import { emitBootstraps, emitChunks } from "../../../scripts/build-chunks.mjs";
import { measureBuilt } from "../../../scripts/measure-load.mjs";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixtures = path.join(root, "tests/fixtures/load");
const htmlOf = async (name) => readFile(path.join(fixtures, name), "utf8");

// What a host sends on a document it serves to its owner. It is permission, not an
// edit request: the boot still resolves to view unless something explicit says edit.
const OWNER = "isAdminOfCurrentResource=1";
// A path only an editor's plan can name, so its entry lives in the supplement.
const EDIT_ONLY = PLUGIN_PATHS.page.path;
const CEILING = 46080;

let outdir;
let built;

async function read(name) {
  return readFile(path.join(outdir, name), "utf8");
}

// The payload a generated bootstrap inlines: the object literal of its last call.
function payloadEnd(code) {
  const start = code.indexOf("})({");
  if (start < 0) throw new Error("no embedded manifest");
  let depth = 0;
  for (let i = start + 3; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unterminated embedded manifest");
}

// The generated prelude on its own, run as the module it is, once with the page a
// reader or an editor gets. `base` is the directory the release is served from, so the
// imports it makes are the release's real files.
async function runBootstrap(code, { search = "", cookie = "", base }) {
  const start = code.indexOf("var __clayChunks = ");
  const prelude = code.slice(start, payloadEnd(code) + 2);
  const probes = await mkdtemp(path.join(os.tmpdir(), "clay-mode-hints-probe-"));
  const file = path.join(probes, "bootstrap.mjs");
  await writeFile(file, `export default function run(base, window, document) {\n${prelude}\nreturn __clayChunks;\n}\n`);
  const { default: run } = await import(pathToFileURL(file).href);
  const window = { location: { search }, clay: {} };
  const document = {
    cookie,
    head: { querySelectorAll: () => [], appendChild: () => {} },
    createElement: () => ({ setAttribute: () => {} }),
  };
  const chunks = run(base, window, document);
  await rm(probes, { recursive: true, force: true });
  return { chunks, clay: window.clay };
}

// The bootstrap's own predicate, evaluated as it ships rather than re-described here.
function predicateOf(code) {
  const at = code.indexOf("function __clayLikelyEdit");
  expect(at).toBeGreaterThan(-1);
  const end = code.indexOf("\n  }", at) + 4;
  return new Function(`${code.slice(at, end)}\n  return __clayLikelyEdit;`)();
}

const release = () => pathToFileURL(outdir + path.sep).href;
const paths = (measured) => measured.js.files.map((file) => file.path);
const countOf = (list, want) => list.filter((path) => path === want).length;

beforeAll(async () => {
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-mode-hints-"));
  built = await emitChunks({ root, outdir: path.join(outdir, "m") });
  await emitBootstraps({ root, outdir, manifest: built.manifest, satellites: built.satellites });
  // Outside the repository nothing says these generated modules are ESM.
  await writeFile(path.join(outdir, "package.json"), '{ "type": "module" }\n');
}, 120000);

afterAll(async () => {
  await rm(outdir, { recursive: true, force: true });
});

// The one question the bootstrap may answer before anything is resolved. An owner
// whose document opens in view pays for no hint index; an explicit edit still does.
test("the bootstrap asks for the supplement only for an explicit ?editmode=true", async () => {
  const likelyEdit = predicateOf(await read("clay.js"));

  expect(likelyEdit("?plugins=page", OWNER)).toBe(false);
  expect(likelyEdit("?plugins=page&editmode=false", OWNER)).toBe(false);
  expect(likelyEdit("?plugins=page", "")).toBe(false);
  expect(likelyEdit("?plugins=page&editmode=true", OWNER)).toBe(true);
  expect(likelyEdit("?plugins=page&editmode=true", "")).toBe(true);
});

// The reader's runtime: the main manifest, no supplement, and the cached fetch a
// resolved edit, draft or first entry asks for.
test("an owner's view boot downloads the main manifest and no supplement", async () => {
  const code = await read("clay.js");
  for (const context of [
    { search: "?plugins=page", cookie: OWNER },
    { search: "?plugins=page&editmode=false", cookie: OWNER },
    { search: "?plugins=page", cookie: "" },
  ]) {
    const { chunks, clay } = await runBootstrap(code, { ...context, base: release() });
    const runtime = await chunks.runtime;

    expect(runtime.chunks).toBe(true);
    expect(runtime.edit).toBe(null);
    expect(runtime.manifest.entries["loader.js"]).toBeTruthy();
    expect(runtime.manifest.entries[EDIT_ONLY]).toBeUndefined();
    expect(typeof runtime.loadEditHints).toBe("function");
    expect(clay.__runtime).toBe(chunks.runtime);
  }
});

// The first entry after view, and every later one, share one fetch: the same promise,
// the supplement's entries, and the edit-only path the main manifest does not hold.
test("the first entry after view fetches the hint index once and every later one reuses it", async () => {
  const { chunks } = await runBootstrap(await read("clay.js"), { search: "?plugins=page", cookie: OWNER, base: release() });
  const runtime = await chunks.runtime;

  const first = runtime.loadEditHints();
  expect(runtime.loadEditHints()).toBe(first);
  const hints = await first;

  expect(hints.entries[EDIT_ONLY]).toBeTruthy();
  expect(runtime.manifest.entries[EDIT_ONLY]).toBeUndefined();
  expect(hints.editBootImports).toBeTruthy();
  expect(runtime.loadEditHints()).toBe(first);
});

// An explicit edit already fetched the supplement beside the manifest, so the hint
// fetch hands back that same index instead of requesting it again.
test("an explicit edit's hint fetch reuses the supplement the bootstrap fetched", async () => {
  const { chunks } = await runBootstrap(await read("clay.js"), {
    search: "?plugins=page&editmode=true",
    cookie: OWNER,
    base: release(),
  });
  const runtime = await chunks.runtime;

  expect(runtime.edit).toBeTruthy();
  expect(runtime.edit.entries[EDIT_ONLY]).toBeTruthy();
  expect(await runtime.loadEditHints()).toBe(runtime.edit);
});

// A hint fetch that fails costs hints and nothing else: the main manifest is intact,
// and the rejected promise is cleared so the next entry tries again.
test("a failed hint fetch leaves the release alone and is retried by the next entry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clay-mode-hints-broken-"));
  await mkdir(path.join(dir, "m"));
  await writeFile(path.join(dir, "package.json"), '{ "type": "module" }\n');
  await cp(path.join(outdir, "m", built.manifest.runtime), path.join(dir, "m", built.manifest.runtime));
  const code = await read("clay.js");
  const { chunks } = await runBootstrap(code, { search: "?plugins=page", cookie: OWNER, base: pathToFileURL(dir + path.sep).href });
  const runtime = await chunks.runtime;

  try {
    expect(runtime.manifest.entries["loader.js"]).toBeTruthy();
    const first = runtime.loadEditHints();
    await expect(first).rejects.toThrow();
    const retry = runtime.loadEditHints();
    expect(retry).not.toBe(first);
    await expect(retry).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// The meter measures the boot the release really makes. An owner's view is the
// anonymous reader's view plus nothing, and it holds the Document reader ceiling.
test("the meter counts no supplement for an owner's view, default or explicit", async () => {
  const html = await htmlOf("document.html");
  const measured = [];

  for (const search of ["?plugins=page", "?plugins=page&editmode=false"]) {
    const view = await measureBuilt({ html, mode: "view", dir: outdir, search, owner: true });
    expect(paths(view)).not.toContain(`m/${built.manifest.edit}`);
    expect(view.js.requests).toBeGreaterThan(1);
    expect(view.js.depth).toBe(3);
    expect(view.js.brotli).toBeLessThanOrEqual(CEILING);
    measured.push(view);
  }
  const anonymous = await measureBuilt({ html, mode: "view", dir: outdir, owner: false });
  expect(paths(anonymous)).not.toContain(`m/${built.manifest.edit}`);

  // Nonzero and unvarying: the owner's view is the reader's, request for request.
  expect(measured[0].js.requests).toBe(anonymous.js.requests);
  expect(measured[0].js.brotli).toBe(anonymous.js.brotli);
  expect(measured[0].js.files).toEqual(anonymous.js.files);
});

// An initial explicit edit and a draft each download the hint index exactly once,
// in the stage beside the plan.
test("the meter counts the supplement once for an initial explicit edit and once for a draft", async () => {
  const document = await htmlOf("document.html");
  const edit = await measureBuilt({ html: document, mode: "edit", dir: outdir, search: "?plugins=page&editmode=true", owner: true });
  const view = await measureBuilt({ html: document, mode: "view", dir: outdir, search: "?plugins=page&editmode=true", owner: true });

  expect(countOf(paths(edit), `m/${built.manifest.edit}`)).toBe(1);
  expect(edit.js.depth).toBe(3);
  expect(edit.js.requests).toBeGreaterThan(view.js.requests);

  const kanban = await htmlOf("kanban.html");
  const draft = await measureBuilt({ html: kanban, mode: "draft", dir: outdir, search: "?plugins=sortable", owner: false });
  expect(countOf(paths(draft), `m/${built.manifest.edit}`)).toBe(1);
  expect(draft.js.depth).toBe(3);

  // The same boot the predicate describes: an explicit edit asks early, so the
  // loader's hint fetch has nothing left to download.
  expect(predicateOf(await read("clay.js"))("?plugins=page&editmode=true", OWNER)).toBe(true);
});
