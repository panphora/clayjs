/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    expect(() => new Function(code)).not.toThrow();
  }
});

test("each bootstrap carries the shared runtime prelude exactly once", async () => {
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    expect(code.split("/* clay:chunk-prelude */").length - 1).toBe(0);
    expect(code.split("var __clayChunks = ").length - 1).toBe(1);
    expect(code.split("if (!clay.__runtime)").length - 1).toBe(1);
  }
});

test("no bootstrap imports from src/ outside the module-tree branch", async () => {
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    const src = code.split("\n").filter((line) => line.includes("import(") && line.includes("/src/"));
    expect(src.length).toBe(1);
    expect(src[0]).toContain('if (!R.chunks) return import(__clayChunks.tree + "/src/');
    expect(code.split('import(__clayChunks.tree + "/src/').length - 1).toBe(1);
    expect(code).not.toContain('import(base + "/src/');
  }
});

test("each bootstrap names one chunk directory and files the manifest lists", async () => {
  const files = built.manifest.files;
  const exists = async (file) => (await readFile(path.join(chunkdir, file))).length > 0;
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    expect(code.split('"dir":"m/"').length - 1).toBe(1);
    const M = embedded(code);
    expect(M.dir).toBe("m/");
    for (const file of [M.manifest, ...M.preload].filter(Boolean)) {
      expect(files[file]).toBeTruthy();
      expect(await exists(file)).toBe(true);
    }
  }
});

test("clay.js preloads the loader, the runtime manifest and the boot prefix", async () => {
  const code = await read("clay.js");
  const M = embedded(code);
  expect(M.preload).toContain(built.manifest.entries["loader.js"]);
  expect(M.preload).toContain(built.manifest.runtime);
  for (const prefix of BOOT_PREFIX) {
    expect(M.preload).toContain(built.manifest.entries[prefix]);
  }
  expect(code).toContain('R.manifest.entries["loader.js"]');
  expect(M.manifest).toBe(built.manifest.runtime);
  expect(M.version).toBe(built.manifest.version);
});

test("each satellite preloads its own entry and the runtime manifest", async () => {
  for (const [name, target] of Object.entries(built.satellites)) {
    if (name === "clay.js") continue;
    const code = await read(name);
    const M = embedded(code);
    expect(M.preload[0]).toBe(built.manifest.entries[target]);
    expect(M.preload).toContain(built.manifest.runtime);
    expect(code).toContain(`R.manifest.entries["${target}"]`);
  }
});

test("rollingBootstrap rewrites the one chunk directory", async () => {
  const code = await read("clay.js");
  const rolled = rollingBootstrap(code, "9.9.9");
  expect(rolled).toContain('"dir":"../9.9.9/m/"');
  expect(rolled.split('"dir":"m/"').length - 1).toBe(0);
  expect(() => rollingBootstrap("var a = 1;", "9.9.9")).toThrow();
  expect(() => rollingBootstrap('"dir":"m/" "dir":"m/"', "9.9.9")).toThrow();
});
