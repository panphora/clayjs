/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOOT_IMPORTS, EDIT_BOOT_IMPORTS } from "../../../src/lib/boot-imports.js";
import { emitChunks } from "../../../scripts/build-chunks.mjs";

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
  for (const logical of ["loader.js", ...Object.keys(modules), ...Object.values(built.satellites)]) {
    const file = built.manifest.entries[logical];
    expect(file).toBeTruthy();
    expect(built.manifest.files[file]).toBeTruthy();
    expect((await readFile(path.join(outdir, file))).length).toBeGreaterThan(0);
  }
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
