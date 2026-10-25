/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOOT_IMPORTS, EDIT_BOOT_IMPORTS } from "../../../src/lib/boot-imports.js";
import { CORE_WAVES } from "../../../src/loader-logic.js";
import { emitBootstraps, emitChunks } from "../../../scripts/build-chunks.mjs";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let outdir;
let second;
let built;
let modules;

beforeAll(async () => {
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-"));
  second = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-"));
  built = await emitChunks({ root, outdir });
  modules = (await import(path.resolve(root, "src/loader-logic.js"))).MODULES;
}, 120000);

afterAll(async () => {
  await rm(outdir, { recursive: true, force: true });
  await rm(second, { recursive: true, force: true });
});

test("every loader target and satellite is an entry with a file on disk", async () => {
  // Many logical entries can name one asset: the always-wave core is one file.
  const files = new Set(["loader.js", ...Object.keys(modules), ...Object.values(built.satellites)]
    .map((logical) => {
      const file = built.manifest.entries[logical];
      expect(file).toBeTruthy();
      return file;
    }));
  expect(files.size).toBeGreaterThan(0);
  for (const file of files) {
    expect(built.manifest.files[file]).toBeTruthy();
    expect((await readFile(path.join(outdir, file))).length).toBeGreaterThan(0);
  }
});

test("the always-wave core is one entry whose export keys are its logical paths", async () => {
  const aggregate = built.manifest.entries["reader-core.js"];
  expect(aggregate).toBeTruthy();
  for (const file of CORE_WAVES.always) expect(built.manifest.entries[file]).toBe(aggregate);

  const code = await readFile(path.join(outdir, built.manifest.runtime), "utf8");
  const runtime = JSON.parse(code.slice("export default ".length).replace(/;\s*$/, ""));
  expect(runtime.core).toEqual({
    entry: "reader-core.js",
    exports: Object.fromEntries(CORE_WAVES.always.map((file) => [file, file])),
  });
  expect(runtime.entries["core/edit-mode.js"]).toBe(aggregate);
});

test("each always-wave module is inside the aggregate graph, not a file of its own", () => {
  const aggregate = built.manifest.entries["reader-core.js"];
  const inputs = (file) =>
    Object.entries(built.metafile.outputs).find(([out]) => path.basename(out) === file)?.[1].inputs ?? {};

  const seen = new Set([aggregate]);
  const stack = [aggregate];
  const inlined = new Set();
  while (stack.length) {
    const file = stack.pop();
    for (const input of Object.keys(inputs(file))) inlined.add(input);
    for (const dep of built.manifest.files[file].imports) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      stack.push(dep);
    }
  }

  for (const file of CORE_WAVES.always) {
    expect(inlined.has(`src/${file}`)).toBe(true);
    expect(built.manifest.files[aggregate].dynamicImports).not.toContain(built.manifest.entries[file]);
  }
  expect(Object.values(built.manifest.entries).filter((file) => file === aggregate)).toHaveLength(CORE_WAVES.always.length + 1);
});

test("every import target is a listed file on disk", async () => {
  for (const info of Object.values(built.manifest.files)) {
    for (const imp of [...info.imports, ...info.dynamicImports]) {
      expect(built.manifest.files[imp]).toBeTruthy();
      expect((await readFile(path.join(outdir, imp))).length).toBeGreaterThan(0);
    }
  }
});

test("every listed file has its size and sha256", async () => {
  for (const [file, info] of Object.entries(built.manifest.files)) {
    const bytes = await readFile(path.join(outdir, file));
    expect(info.bytes).toBeGreaterThan(0);
    expect(info.bytes).toBe(bytes.length);
    expect(info.sha256).toBe(sha256(bytes));
  }
});

test("no source module is in two outputs", () => {
  const seen = new Map();
  for (const [out, meta] of Object.entries(built.metafile.outputs)) {
    for (const input of Object.keys(meta.inputs)) {
      expect(seen.get(input) ?? out).toBe(out);
      seen.set(input, out);
    }
  }
  expect(seen.size).toBeGreaterThan(0);
});

test("the only external import in the metafile is the diff library", () => {
  const externals = [];
  for (const input of Object.values(built.metafile.inputs)) {
    for (const imp of input.imports) {
      if (imp.external) externals.push(imp.path);
    }
  }
  expect([...new Set(externals)]).toEqual(["https://esm.sh/diff@5.2.0"]);
});

test("a second build writes a byte-identical manifest.json", async () => {
  await emitChunks({ root, outdir: second });
  const first = await readFile(path.join(outdir, "manifest.json"));
  const again = await readFile(path.join(second, "manifest.json"));
  expect(again.equals(first)).toBe(true);
});

test("every boot-time import is its own entry", async () => {
  for (const logical of [...Object.values(BOOT_IMPORTS).flat(), ...EDIT_BOOT_IMPORTS]) {
    const file = built.manifest.entries[logical];
    expect(file).toBeTruthy();
    expect(built.manifest.files[file]).toBeTruthy();
    expect((await readFile(path.join(outdir, file))).length).toBeGreaterThan(0);
  }
});

test("the runtime manifest names each entry's boot imports and the edit-only ones", async () => {
  const code = await readFile(path.join(outdir, built.manifest.runtime), "utf8");
  const runtime = JSON.parse(code.slice("export default ".length).replace(/;\s*$/, ""));

  expect(runtime.bootImports).toEqual(BOOT_IMPORTS);
  expect(runtime.editBootImports).toEqual(EDIT_BOOT_IMPORTS);
});

// A budget is held against this manifest and nothing else, so the meter has to read the
// release's own inventory: a second size estimate could pass while the manifest served
// different bytes. The Document view is measured from a release emitted here.
test("the meter\'s built Document view is measured from the manifest\'s own files and bytes", async () => {
  const site = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-site-"));
  try {
    const chunks = await emitChunks({ root, outdir: path.join(site, "m") });
    await emitBootstraps({ root, outdir: site, manifest: chunks.manifest, satellites: chunks.satellites });
    const { measureBuilt } = await import("../../../scripts/measure-load.mjs");
    const html = await readFile(path.join(root, "tests/fixtures/load/document.html"), "utf8");
    const measured = await measureBuilt({ html, mode: "view", dir: site });

    expect(measured.js.requests).toBe(measured.js.files.length);
    expect(measured.js.depth).toBe(3);
    expect(measured.js.brotli).toBeGreaterThan(0);
    for (const file of measured.js.files) {
      const listed = file.path.startsWith("m/") ? chunks.manifest.files[file.path.slice(2)] : null;
      if (!listed) {
        // The facade is the generated bootstrap, written beside the manifest.
        expect(file.path).toBe("clay.js");
        continue;
      }
      expect(file.raw).toBe(listed.bytes);
    }
  } finally {
    await rm(site, { recursive: true, force: true });
  }
}, 120000);
