/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { verifyOfflineClosure } from "../../../scripts/verify-offline-closure.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const CLI = path.join(ROOT, "scripts/verify-offline-closure.mjs");

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let site;
let stage;
let index;
let chunks;

const gitless = [];

async function staged() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clay-closure-"));
  gitless.push(dir);
  const copy = path.join(dir, "prefix");
  await cp(stage, copy, { recursive: true });
  return copy;
}

const readIndex = async (dir) => JSON.parse(await readFile(path.join(dir, "offline-manifest.json"), "utf8"));
const writeIndex = async (dir, next) =>
  writeFile(path.join(dir, "offline-manifest.json"), `${JSON.stringify(next, null, 2)}\n`);

async function cli(args) {
  try {
    const { stdout } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

// A fresh copy of the staged prefix, one mutation, then both readers over it.
async function mutated(edit) {
  const dir = await staged();
  await edit(dir, await readIndex(dir));
  return dir;
}

const names = (result, target) => result.problems.some((problem) => problem.includes(target));

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-closure-build-"));
  gitless.push(site);
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  await run(process.execPath, ["build.js", "--standalone"], { cwd: site });
  index = JSON.parse(await readFile(path.join(site, "dist/offline-manifest.json"), "utf8"));
  chunks = JSON.parse(await readFile(path.join(site, "dist/m/manifest.json"), "utf8"));

  // The prefix a host bundles: every public path at its release path, and the index itself.
  stage = path.join(site, "stage");
  for (const [pub, entry] of Object.entries(index.files)) {
    const to = path.join(stage, pub);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(path.join(site, entry.source), to);
  }
  await cp(path.join(site, "dist/offline-manifest.json"), path.join(stage, "offline-manifest.json"));
}, 300000);

afterAll(async () => {
  for (const dir of gitless) await rm(dir, { recursive: true, force: true });
});

test("the package build is a complete offline closure", async () => {
  const result = await verifyOfflineClosure({ packageRoot: site });
  expect(result.problems).toEqual([]);
  expect(result.files).toBeGreaterThan(400);
  expect(result.js).toBeGreaterThan(400);
  expect(result.staticEdges).toBeGreaterThan(50);
  expect(result.dynamicEdges).toBeGreaterThan(0);
  expect(result.cssRefs).toBeGreaterThan(10);
  expect(result.fonts).toBeGreaterThanOrEqual(10);
  expect(result.external).toBeGreaterThanOrEqual(1);
}, 120000);

test("the staged prefix is the same closure", async () => {
  const result = await verifyOfflineClosure({ publishedRoot: stage });
  expect(result.problems).toEqual([]);
  expect(result.files).toBeGreaterThan(400);
  expect(result.js).toBeGreaterThan(400);
  expect(result.staticEdges).toBeGreaterThan(50);
  expect(result.dynamicEdges).toBeGreaterThan(0);
  expect(result.cssRefs).toBeGreaterThan(10);
  expect(result.fonts).toBeGreaterThanOrEqual(10);
  expect(result.external).toBeGreaterThanOrEqual(1);
}, 120000);

test("a chunk whose bytes changed is a problem", async () => {
  const chunk = `m/${Object.keys(chunks.files)[0]}`;
  const dir = await mutated(async (root) => {
    const file = path.join(root, chunk);
    const bytes = await readFile(file);
    bytes[bytes.length - 1] ^= 0xff;
    await writeFile(file, bytes);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, chunk)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("a deleted chunk is a problem", async () => {
  const chunk = `m/${Object.keys(chunks.files)[1]}`;
  const dir = await mutated((root) => unlink(path.join(root, chunk)));
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, chunk)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("a required entry removed from the index is a problem", async () => {
  const chunk = `m/${chunks.entries["plugins/derive.js"]}`;
  const dir = await mutated(async (root, manifest) => {
    delete manifest.files[chunk];
    await writeIndex(root, manifest);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, chunk)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("a deleted font is a problem", async () => {
  const font = "fonts/inter-latin-wght-normal.woff2";
  const dir = await mutated((root) => unlink(path.join(root, font)));
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, font)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("a relative import pointed at a missing file is a problem", async () => {
  const source = "src/lib/dom-ready.js";
  const dir = await mutated(async (root) => {
    const file = path.join(root, source);
    const code = await readFile(file, "utf8");
    await writeFile(file, `import "./closure-missing-file.js";\n${code}`);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, "closure-missing-file.js")).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("an unclassified https import is a problem", async () => {
  const source = "src/lib/dom-ready.js";
  const url = "https://example.invalid/closure.js";
  const dir = await mutated(async (root) => {
    const file = path.join(root, source);
    const code = await readFile(file, "utf8");
    await writeFile(file, `import "${url}";\n${code}`);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, url)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("an online-only URL no file names is a problem", async () => {
  const url = "https://example.invalid/stale.js";
  const dir = await mutated(async (root, manifest) => {
    manifest.onlineOnly[url] = "nothing reaches it";
    await writeIndex(root, manifest);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, url)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("an index key that leaves the release is a problem", async () => {
  const escape = "../escape.js";
  const dir = await mutated(async (root, manifest) => {
    const bytes = await readFile(path.join(root, "src/loader.js"));
    manifest.files[escape] = {
      source: "src/loader.js",
      sha256: sha256(bytes),
      bytes: bytes.length,
      type: "text/javascript; charset=utf-8",
    };
    await writeIndex(root, manifest);
  });
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(names(result, escape)).toBe(true);
  expect((await cli(["--published-root", dir])).code).toBe(1);
}, 120000);

test("the CLI rejects both modes or neither", async () => {
  expect((await cli(["--package-root", site, "--published-root", stage])).code).toBe(2);
  expect((await cli([])).code).toBe(2);
}, 60000);

test("the CLI takes --base-url with an optional --index and no other mode", async () => {
  const baseURL = "http://127.0.0.1:1/_/clayjs/1.15.2/";
  expect((await cli(["--base-url", baseURL, "--package-root", site])).code).toBe(2);
  expect((await cli(["--base-url", baseURL, "--published-root", stage])).code).toBe(2);
  expect((await cli(["--index", stage])).code).toBe(2);
  expect((await cli(["--base-url"])).code).toBe(2);
}, 60000);
