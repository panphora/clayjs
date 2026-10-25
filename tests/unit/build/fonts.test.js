/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// One family for now: the Kanban's Work Sans. The copy table in build.js is the
// source of truth for every family, so this test names the one it ships and reads the
// package itself for the bytes it expects.
const FONT_PKG = "@fontsource-variable/work-sans";
const WOFF2 = "work-sans-latin-wght-normal.woff2";
const CSS = "work-sans.css";
const LICENSE = "work-sans-LICENSE";

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts"];

let site;
let version;

async function build() {
  return run(process.execPath, ["build.js"], {
    cwd: site,
    env: { ...process.env, PATH: `${path.join(site, "bin")}:${process.env.PATH}` },
  });
}

const inPackage = (rel) => path.join(ROOT, "node_modules", FONT_PKG, rel);

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-fonts-"));
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  // No published versions: one pin, the working tree's own, and /v1/ rolls to it,
  // so the build reads no registry and unpacks no tarball.
  await mkdir(path.join(site, "bin"));
  await writeFile(path.join(site, "bin", "npm"), "#!/bin/sh\necho '[]'\n");
  await chmod(path.join(site, "bin", "npm"), 0o755);

  version = JSON.parse(await readFile(path.join(site, "package.json"), "utf8")).version;
  await build();
}, 300000);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

test("the pinned prefix carries the package's woff2 bytes, the stylesheet and the license", async () => {
  const dir = path.join(site, "public", version, "fonts");
  expect((await readdir(dir)).sort()).toEqual([LICENSE, CSS, WOFF2].sort());
  expect(sha256(await readFile(path.join(dir, WOFF2)))).toBe(sha256(await readFile(inPackage("files/" + WOFF2))));
  expect(sha256(await readFile(path.join(dir, CSS)))).toBe(sha256(await readFile(path.join(ROOT, "fonts", CSS))));
  expect(sha256(await readFile(path.join(dir, LICENSE)))).toBe(sha256(await readFile(inPackage("LICENSE"))));
});

test("the rolling prefix serves the same folder, so /v1/fonts/ rolls with /v1/", async () => {
  for (const name of [WOFF2, CSS, LICENSE]) {
    expect(sha256(await readFile(path.join(site, "public/v1/fonts", name)))).toBe(
      sha256(await readFile(path.join(site, "public", version, "fonts", name))),
    );
  }
});

test("the release manifest lists every font file with its size and hash", async () => {
  const manifest = JSON.parse(await readFile(path.join(site, "public", version, "m/manifest.json"), "utf8"));
  const assets = [...manifest.assets].sort((a, b) => (a.path < b.path ? -1 : 1));
  expect(assets.map((a) => a.path)).toEqual([`fonts/${LICENSE}`, `fonts/${WOFF2}`, `fonts/${CSS}`]);
  for (const asset of assets) {
    const bytes = await readFile(path.join(site, "public", version, asset.path));
    expect(asset.bytes).toBe(bytes.length);
    expect(asset.sha256).toBe(sha256(bytes));
  }
  expect(assets.find((a) => a.path.endsWith(".woff2")).contentType).toBe("font/woff2");
  expect(assets.find((a) => a.path.endsWith(".css")).contentType).toBe("text/css; charset=utf-8");
  // The rolling prefix's manifest describes the release it serves, fonts included.
  const rolling = JSON.parse(await readFile(path.join(site, "public/v1/m/manifest.json"), "utf8"));
  expect(rolling.assets).toEqual(manifest.assets);
});

test("the stylesheet's file name and unicode-range are the package's own", async () => {
  const css = await readFile(path.join(ROOT, "fonts", CSS), "utf8");
  const pkgCss = await readFile(inPackage("index.css"), "utf8");
  const range = (text, file) => {
    const block = text.split("@font-face").find((b) => b.includes(`url(./files/${file})`) || b.includes(`url(./${file})`));
    return block.match(/unicode-range:\s*([^;]+);/)[1].replace(/\s+/g, "");
  };
  expect(range(css, WOFF2)).toBe(range(pkgCss, WOFF2));
  // A relative url() is what lets a local host serve the woff2 from the same folder.
  expect(css).toContain(`url(./${WOFF2})`);
  expect(css).not.toMatch(/https?:/);
});

test("_headers gives the fonts folder CORS and the pinned prefix immutable caching", async () => {
  const headers = await readFile(path.join(site, "public/_headers"), "utf8");
  const block = (selector) => headers.split("\n\n").find((b) => b.split("\n")[0] === selector);
  expect(block("/:prefix/fonts/*")).toContain("Access-Control-Allow-Origin: *");
  expect(block(`/${version}/*`)).toContain("max-age=31536000, immutable");
  expect(block("/v1/*")).toContain("max-age=600");
});
