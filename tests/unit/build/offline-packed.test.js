/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { verifyOfflineClosure } from "../../../scripts/verify-offline-closure.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts"];

let site;
let unpacked;
let index;
let packed;

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-packed-"));
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  await run(process.execPath, ["build.js", "--standalone"], { cwd: site });

  const out = path.join(site, "out");
  await mkdir(out, { recursive: true });
  const { stdout } = await run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", out], {
    cwd: site,
    maxBuffer: 64 * 1024 * 1024,
  });
  [packed] = JSON.parse(stdout);

  unpacked = path.join(site, "unpacked");
  await mkdir(unpacked, { recursive: true });
  await run("tar", ["-xzf", path.join(out, packed.filename), "-C", unpacked]);

  index = JSON.parse(await readFile(path.join(unpacked, "package/dist/offline-manifest.json"), "utf8"));
}, 600000);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

test("the unpacked tarball is a complete offline closure", async () => {
  const result = await verifyOfflineClosure({ packageRoot: path.join(unpacked, "package") });
  console.log(
    `packed ${packed.filename}: ${packed.size} bytes, ${packed.entryCount} entries; ` +
      `closure ${result.files} files, ${result.fonts} fonts, ${result.dynamicEdges} dynamic edges`,
  );
  expect(result.problems).toEqual([]);
  expect(result.files).toBeGreaterThan(400);
  expect(result.fonts).toBeGreaterThanOrEqual(10);
  expect(result.dynamicEdges).toBeGreaterThan(0);
});

test("every source the unpacked manifest records is a file the tarball carries", async () => {
  const sources = Object.values(index.files).map((file) => file.source);
  expect(sources.length).toBeGreaterThan(400);
  const missing = [];
  for (const source of sources) {
    try {
      await access(path.join(unpacked, "package", source));
    } catch {
      missing.push(source);
    }
  }
  expect(missing).toEqual([]);
});
