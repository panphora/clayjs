/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { BOOT_PREFIX, emitBootstraps, emitChunks, rollingBootstrap } from "../../../scripts/build-chunks.mjs";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);

let chunkdir;
let outdir;
let built;

function embedded(code) {
  const start = code.indexOf("})({");
  if (start < 0) throw new Error("no embedded manifest");
  let depth = 0;
  for (let i = start + 3; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return JSON.parse(code.slice(start + 3, i + 1));
  }
  throw new Error("unterminated embedded manifest");
}

async function read(name) {
  return readFile(path.join(outdir, name), "utf8");
}

beforeAll(async () => {
  chunkdir = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-"));
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-bootstraps-"));
  built = await emitChunks({ root, outdir: chunkdir });
  await emitBootstraps({ root, outdir, manifest: built.manifest, satellites: built.satellites });
}, 120000);

afterAll(async () => {
  await rm(chunkdir, { recursive: true, force: true });
  await rm(outdir, { recursive: true, force: true });
});

test("clay.js and each generated satellite parse as classic scripts", async () => {
  const names = ["clay.js", ...Object.keys(built.satellites)];
  expect(Object.keys(built.satellites)).toContain("all.js");
  for (const name of names) {
    const code = await read(name);
    expect(() => new vm.Script(code)).not.toThrow();
  }
});

test("each bootstrap names one chunk directory and files the manifest lists", async () => {
  const files = built.manifest.files;
  const exists = async (file) => (await readFile(path.join(chunkdir, file))).length > 0;
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    expect(code.split('"dir":"m/"').length - 1).toBe(1);
    const M = embedded(code);
    for (const file of [M.loader ?? M.entry, M.manifest, ...M.preload].filter(Boolean)) {
      expect(files[file]).toBeTruthy();
      expect(await exists(file)).toBe(true);
    }
  }
});

test("clay.js preloads the loader, the runtime manifest and the boot prefix", async () => {
  const M = embedded(await read("clay.js"));
  expect(M.preload).toContain(built.manifest.entries["loader.js"]);
  expect(M.preload).toContain(built.manifest.runtime);
  for (const prefix of BOOT_PREFIX) {
    expect(M.preload).toContain(built.manifest.entries[prefix]);
  }
  expect(M.loader).toBe(built.manifest.entries["loader.js"]);
  expect(M.manifest).toBe(built.manifest.runtime);
});

test("rollingBootstrap rewrites the one chunk directory", async () => {
  const code = await read("clay.js");
  const rolled = rollingBootstrap(code, "9.9.9");
  expect(rolled).toContain('"dir":"../9.9.9/m/"');
  expect(rolled.split('"dir":"m/"').length - 1).toBe(0);
  expect(() => rollingBootstrap("var a = 1;", "9.9.9")).toThrow();
  expect(() => rollingBootstrap('"dir":"m/" "dir":"m/"', "9.9.9")).toThrow();
});
