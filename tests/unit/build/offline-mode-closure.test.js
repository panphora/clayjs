/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { measureBuilt } from "../../../scripts/measure-load.mjs";
import { verifyOfflineClosure } from "../../../scripts/verify-offline-closure.mjs";

/**
 * The first switch from view to edit is an edit boot: setMode writes the receipt and reloads
 * (src/core/edit-mode.js), so every file that boot reaches, its later dynamic imports
 * included, must be inside the offline release a local host bundles. The set comes from
 * measureBuilt, the same reading the load budgets use, so it follows the real plan.
 */

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/load");

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts", "compat"];

let site;
let stage;
let index;
let chunks;
const scratch = [];

const publicPath = (file) => (file.startsWith("entries/") ? file.slice("entries/".length) : file);

async function switchSet(html) {
  const dir = path.join(site, "dist");
  const edit = await measureBuilt({ html, mode: "edit", dir });
  const view = await measureBuilt({ html, mode: "view", dir });
  const set = new Set();
  const stack = [...edit.js.files.map((file) => file.path), ...edit.lazy].map(publicPath);
  while (stack.length) {
    const file = stack.pop();
    if (set.has(file)) continue;
    set.add(file);
    if (!file.startsWith("m/")) continue;
    const entry = chunks.files[file.slice(2)];
    for (const dep of [...(entry?.imports ?? []), ...(entry?.dynamicImports ?? [])]) stack.push(`m/${dep}`);
  }
  return { set, view: new Set(view.js.files.map((file) => publicPath(file.path))) };
}

const missing = (files, set) => [...set].filter((file) => !Object.hasOwn(files, file));

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-mode-closure-"));
  scratch.push(site);
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");
  await run(process.execPath, ["build.js", "--standalone"], { cwd: site });
  index = JSON.parse(await readFile(path.join(site, "dist/offline-manifest.json"), "utf8"));
  chunks = JSON.parse(await readFile(path.join(site, "dist/m/manifest.json"), "utf8"));

  stage = path.join(site, "stage");
  for (const [pub, entry] of Object.entries(index.files)) {
    const to = path.join(stage, pub);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(path.join(site, entry.source), to);
  }
  await cp(path.join(site, "dist/offline-manifest.json"), path.join(stage, "offline-manifest.json"));
}, 300000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

test("every load fixture's first switch to edit stays inside the offline release", async () => {
  const controller = `m/${chunks.entries["core/mode-lifecycle.js"]}`;
  const editor = `m/${chunks.entries["page/editor.js"]}`;
  const fixtures = (await readdir(FIXTURES)).filter((name) => name.endsWith(".html")).sort();
  expect(fixtures.length).toBeGreaterThanOrEqual(5);
  let documents = 0;
  for (const name of fixtures) {
    const { set, view } = await switchSet(await readFile(path.join(FIXTURES, name), "utf8"));
    expect({ name, missing: missing(index.files, set) }).toEqual({ name, missing: [] });
    expect({ name, controller: set.has(controller) }).toEqual({ name, controller: true });
    expect(set.size).toBeGreaterThan(view.size);
    if (name.startsWith("document")) {
      documents += 1;
      expect({ name, editor: set.has(editor) }).toEqual({ name, editor: true });
    }
  }
  expect(documents).toBeGreaterThanOrEqual(1);
}, 120000);

test("a mode asset missing from the release is caught by the check and by the verifier", async () => {
  const editor = `m/${chunks.entries["page/editor.js"]}`;
  const { set } = await switchSet(await readFile(path.join(FIXTURES, "document.html"), "utf8"));
  const { [editor]: dropped, ...without } = index.files;
  expect(dropped).toBeTruthy();
  expect(missing(without, set)).toEqual([editor]);

  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), "clay-mode-closure-")), "prefix");
  scratch.push(path.dirname(dir));
  await cp(stage, dir, { recursive: true });
  await unlink(path.join(dir, editor));
  const result = await verifyOfflineClosure({ publishedRoot: dir });
  expect(result.problems.some((problem) => problem.includes(editor))).toBe(true);
}, 120000);
