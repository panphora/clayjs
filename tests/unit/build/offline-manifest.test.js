/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assertReleasePath, releaseFiles } from "../../../scripts/build-offline-manifest.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts"];

const AUTOSAVE_DEBUG = "https://esm.sh/diff@5.2.0";

let site;
let index;
let chunks;

async function build() {
  return run(process.execPath, ["build.js", "--standalone"], { cwd: site });
}

// A recorded source is relative to the package root, so it is read from the copy itself.
const sourceAt = (source) => path.join(site, source);

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-offline-"));
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  await build();
  index = JSON.parse(await readFile(path.join(site, "dist/offline-manifest.json"), "utf8"));
  chunks = JSON.parse(await readFile(path.join(site, "dist/m/manifest.json"), "utf8"));
}, 300000);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

test("the index names the release it describes", () => {
  expect(index.schema).toBe(1);
  expect(index.version).toBe(chunks.version);
  expect(index.chunkBuild).toBe(chunks.build);
  expect(index.aliases).toEqual({});
});

test("every module the chunk manifest names is in the index, plus the manifest itself", () => {
  const names = Object.keys(chunks.files);
  expect(names.length).toBeGreaterThan(100);
  for (const name of names) expect(index.files[`m/${name}`]).toBeDefined();
  expect(index.files["m/manifest.json"]).toBeDefined();
});

test("a generated bootstrap is served from dist/, not from the entries/ file it replaced", async () => {
  const bootstraps = (await readdir(path.join(site, "dist"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);
  expect(bootstraps).toEqual(expect.arrayContaining(["clay.js", "clay-ui.js"]));
  for (const name of bootstraps) {
    expect(index.files[name]).toBeDefined();
    expect(index.files[name].source).toBe(`dist/${name}`);
  }
});

test("the document URL serves the compiled sheet the package carries", async () => {
  expect(index.files["src/loader.js"].source).toBe("src/loader.js");
  expect(index.files["src/page/themes/light-1.css"].source).toBe("src/page/themes/light-1.css");
  const css = await readFile(path.join(site, "src/page/themes/light-1.css"), "utf8");
  expect(css).not.toContain("@import");
  expect(css).not.toContain("googleapis");
});

test("every font the release manifest names comes out of the package", () => {
  const fonts = chunks.assets.filter((asset) => asset.path.startsWith("fonts/")).map((asset) => asset.path);
  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) {
    expect(index.files[font]).toBeDefined();
    expect(index.files[font].source).toBe(font);
  }
  const woff2 = fonts.filter((font) => font.endsWith(".woff2"));
  expect(woff2.some((font) => font.includes("ibm-plex-sans"))).toBe(true);
  expect(woff2.some((font) => font.includes("inter-latin-wght"))).toBe(true);
});

test("every recorded hash and size is the source file's", async () => {
  const entries = Object.entries(index.files);
  expect(entries.length).toBeGreaterThan(100);
  let checked = 0;
  for (const [pub, file] of entries) {
    const bytes = await readFile(sourceAt(file.source));
    expect({ pub, sha256: file.sha256 }).toEqual({ pub, sha256: sha256(bytes) });
    expect({ pub, bytes: file.bytes }).toEqual({ pub, bytes: bytes.length });
    checked += 1;
  }
  expect(checked).toBeGreaterThan(100);
});

test("the index lists exactly the paths a prefix serves, and not itself", async () => {
  const served = [...(await releaseFiles(site)).keys()].sort();
  expect(Object.keys(index.files).sort()).toEqual(served);
  expect(Object.keys(index.files)).not.toContain("offline-manifest.json");
});

test("a release path is relative POSIX with no way out of the prefix", () => {
  for (const bad of ["../x", "a/../b", "a\\b", "/x", "a//b", "a/%2e%2e/b"]) {
    expect(() => assertReleasePath(bad)).toThrow(/release path/);
  }
  expect(() => assertReleasePath("m/x.js")).not.toThrow();
});

test("every online-only URL is one the published bytes really name", async () => {
  expect(Object.keys(index.onlineOnly)).toContain(AUTOSAVE_DEBUG);
  const published = await Promise.all(
    Object.values(index.files).map((file) => readFile(sourceAt(file.source), "utf8")),
  );
  for (const [url, reason] of Object.entries(index.onlineOnly)) {
    expect(url.startsWith("https://")).toBe(true);
    expect(typeof reason).toBe("string");
    expect(published.some((text) => text.includes(url))).toBe(true);
  }
});
