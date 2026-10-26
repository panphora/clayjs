/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import { assertReleasePath } from "../../../scripts/build-offline-manifest.mjs";
import { verifyOfflineJournal } from "../../../scripts/verify-offline-journal.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const CLI = path.join(ROOT, "scripts/verify-offline-journal.mjs");

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "docs", "fonts", "compat"];

// src/lib/assets.js, by the entry it imports: all nine IDs a Journal can ask for.
const ASSETS = [
  "vendor/overtype.vendor.js",
  "vendor/marked.vendor.js",
  "vendor/highlight.vendor.js",
  "vendor/hljs-bash.vendor.js",
  "vendor/hljs-css.vendor.js",
  "vendor/hljs-javascript.vendor.js",
  "vendor/hljs-json.vendor.js",
  "vendor/hljs-python.vendor.js",
  "vendor/hljs-xml.vendor.js",
];

// The Journal and its legacy fixture live in the starter-templates checkout. A lane
// worktree keeps that checkout somewhere else, so STARTER_TEMPLATES names it first. With
// no checkout at all, this repo's own copies stand in: journal.html is byte-identical
// (scripts/refresh-load-fixtures.mjs keeps it so), and tests/fixtures/legacy holds a
// byte copy of the frozen old Journal that still names the legacy CDN scripts and fonts.
const FIXTURES = {
  "templates/00-journal/journal.html": "tests/fixtures/load/journal.html",
  "templates/00-journal/tests/fixtures/field-pad-old-script.html": "tests/fixtures/legacy/field-pad-old-script.html",
};

function starter(rel) {
  const dirs = [
    process.env.STARTER_TEMPLATES,
    path.join(path.dirname(ROOT), "starter-templates"),
    path.join(os.homedir(), "Documents/GitHub/hyper/starter-templates"),
  ].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, rel);
    if (existsSync(file)) return file;
  }
  const fixture = FIXTURES[rel];
  if (fixture && existsSync(path.join(ROOT, fixture))) return path.join(ROOT, fixture);
  throw new Error(`no starter-templates checkout carries ${rel}; set STARTER_TEMPLATES`);
}

const JOURNAL = starter("templates/00-journal/journal.html");
const OLD_JOURNAL = starter("templates/00-journal/tests/fixtures/field-pad-old-script.html");

let site;
let index;
let chunks;
let lock;
const scratch = [];

const names = (result, target) => result.problems.some((problem) => problem.includes(target));

async function scratchFile(name, text) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clay-journal-"));
  scratch.push(dir);
  const file = path.join(dir, name);
  await writeFile(file, text);
  return file;
}

// A mutated copy of the built index, verified against the package it was built from.
async function mutatedIndex(edit) {
  const next = JSON.parse(JSON.stringify(index));
  await edit(next);
  return scratchFile("offline-manifest.json", `${JSON.stringify(next, null, 2)}\n`);
}

const verify = (manifestFile, journalFile = JOURNAL) =>
  verifyOfflineJournal({ manifestFile, journalFile, packageRoot: site });

async function cli(args) {
  try {
    const { stdout } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.code, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

beforeAll(async () => {
  globalThis.fetch = () => {
    throw new Error("the offline Journal verifier must not touch the network");
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), "clay-journal-build-"));
  scratch.push(dir);
  site = dir;
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) {
    await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  }
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");
  await run(process.execPath, ["build.js", "--standalone"], { cwd: site });
  index = JSON.parse(await readFile(path.join(site, "dist/offline-manifest.json"), "utf8"));
  chunks = JSON.parse(await readFile(path.join(site, "dist/m/manifest.json"), "utf8"));
  lock = JSON.parse(await readFile(path.join(site, "compat/journal-assets.lock.json"), "utf8"));
}, 300000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

test("the current Journal is a complete offline closure", async () => {
  const result = await verify(path.join(site, "dist/offline-manifest.json"));
  expect(result.problems).toEqual([]);
  expect(result.counts.js).toBeGreaterThan(0);
  expect(result.counts.fonts).toBeGreaterThan(0);
  expect(result.counts.css).toBeGreaterThan(0);
  for (const name of ASSETS) {
    expect(chunks.entries[name]).toBeTruthy();
    expect(result.files).toContain(`m/${chunks.entries[name]}`);
  }
  expect(result.files).toContain(`m/${chunks.entries["plugins/derive.js"]}`);
}, 120000);

test("an old Journal's exact legacy scripts and fonts resolve to packaged files", async () => {
  const copy = await scratchFile("field-pad-old-script.html", await readFile(OLD_JOURNAL, "utf8"));
  const result = await verify(path.join(site, "dist/offline-manifest.json"), copy);
  expect(result.problems).toEqual([]);
  expect(result.counts.aliases).toBe(3);
  expect(result.counts.js).toBeGreaterThan(0);
  expect(result.counts.fonts).toBeGreaterThan(0);
  expect(result.files).toContain("compat/overtype-2.6.1.min.js");
  expect(result.files).toContain("compat/highlight-11.9.0.min.js");
  expect(result.files).toContain("fonts/ibm-plex.css");
  expect(result.files).toContain("fonts/ibm-plex-mono-latin-400-italic.woff2");
  for (const name of ASSETS) expect(result.files).toContain(`m/${chunks.entries[name]}`);
}, 120000);

test("a file whose bytes changed is a problem", async () => {
  const file = "compat/highlight-11.9.0.min.js";
  const manifestFile = await mutatedIndex((next) => {
    next.files[file].sha256 = "0".repeat(64);
  });
  const result = await verify(manifestFile);
  expect(names(result, file)).toBe(true);
}, 120000);

test("a dropped derive chunk is a problem", async () => {
  const chunk = `m/${chunks.entries["plugins/derive.js"]}`;
  const manifestFile = await mutatedIndex((next) => {
    delete next.files[chunk];
  });
  const result = await verify(manifestFile);
  expect(names(result, chunk)).toBe(true);
  expect((await cli(["--manifest", manifestFile, "--journal", JOURNAL, "--package-root", site])).code).toBe(1);
}, 120000);

test("a dropped highlight language chunk is a problem", async () => {
  const chunk = `m/${chunks.entries["vendor/hljs-python.vendor.js"]}`;
  const manifestFile = await mutatedIndex((next) => {
    delete next.files[chunk];
  });
  const result = await verify(manifestFile);
  expect(names(result, chunk)).toBe(true);
}, 120000);

test("a dropped font is a problem", async () => {
  const font = "fonts/ibm-plex-mono-latin-400-italic.woff2";
  const manifestFile = await mutatedIndex((next) => {
    delete next.files[font];
  });
  const result = await verify(manifestFile);
  expect(names(result, font)).toBe(true);
}, 120000);

test("a legacy URL that is not an exact alias is a problem", async () => {
  const copy = await scratchFile("field-pad-old-script.html", await readFile(OLD_JOURNAL, "utf8"));
  const overtype = "https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js";
  const highlight = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
  const inexact = [
    [overtype, "https://cdn.jsdelivr.net/npm/overtype@2.6.2/dist/overtype.min.js"],
    [highlight, `${highlight}?v=11.9.0`],
    [overtype, "http://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js"],
  ];
  for (const [exact, other] of inexact) {
    const manifestFile = await mutatedIndex((next) => {
      next.aliases[other] = next.aliases[exact];
      delete next.aliases[exact];
    });
    const result = await verify(manifestFile, copy);
    expect(names(result, exact)).toBe(true);
  }
}, 120000);

test("a lock target that leaves the release is refused", () => {
  expect(() => assertReleasePath("../escape.js")).toThrow(/\.\./);
  expect(() => assertReleasePath("compat/../../escape.js")).toThrow(/\.\./);
});

test("the classic scripts define the globals an old Journal expects", async () => {
  const element = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const document = {
    readyState: "complete",
    createElement: element,
    createTextNode: () => ({}),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    head: element(),
    body: element(),
    documentElement: element(),
  };
  const window = { document, navigator: { userAgent: "node" }, location: { href: "http://127.0.0.1/" } };
  window.window = window;
  window.self = window;
  const context = vm.createContext(window);

  expect(globalThis.fetch).toBeDefined();
  vm.runInContext(await readFile(path.join(site, "compat/overtype-2.6.1.min.js"), "utf8"), context, {
    filename: "compat/overtype-2.6.1.min.js",
  });
  expect(typeof context.OverType).toBe("function");

  vm.runInContext(await readFile(path.join(site, "compat/highlight-11.9.0.min.js"), "utf8"), context, {
    filename: "compat/highlight-11.9.0.min.js",
  });
  expect(context.hljs).toBeTruthy();
  const highlighted = context.hljs.highlight("const a = 1", { language: "javascript" });
  expect(highlighted.value).toContain("hljs-keyword");
});

test("the built index carries exactly the aliases the lock names", () => {
  expect(Object.keys(index.aliases).sort()).toEqual(Object.keys(lock.aliases).sort());
  for (const [url, entry] of Object.entries(lock.aliases)) {
    expect(index.aliases[url]).toBe(entry.path);
    expect(index.files[entry.path].sha256).toBe(entry.sha256);
  }
});
