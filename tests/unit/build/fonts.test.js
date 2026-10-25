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

// The families the folder ships: the Kanban's Work Sans, the Journal's two IBM Plex
// packages and the Document's Light 1 pair. The copy table in build.js is the source of
// truth for every family, so this test names each one it ships and reads the package
// itself for the bytes it expects.
const FAMILIES = [
  {
    pkg: "@fontsource-variable/work-sans",
    css: "work-sans.css",
    woff2: ["work-sans-latin-wght-normal.woff2"],
    license: "work-sans-LICENSE",
  },
  {
    pkg: "@fontsource/ibm-plex-mono",
    css: "ibm-plex.css",
    woff2: [
      "ibm-plex-mono-latin-300-normal.woff2",
      "ibm-plex-mono-latin-400-normal.woff2",
      "ibm-plex-mono-latin-500-normal.woff2",
      "ibm-plex-mono-latin-600-normal.woff2",
      "ibm-plex-mono-latin-400-italic.woff2",
    ],
    license: "ibm-plex-mono-LICENSE",
  },
  {
    pkg: "@fontsource/ibm-plex-sans",
    css: "ibm-plex.css",
    woff2: [
      "ibm-plex-sans-latin-400-normal.woff2",
      "ibm-plex-sans-latin-500-normal.woff2",
      "ibm-plex-sans-latin-600-normal.woff2",
    ],
    license: "ibm-plex-sans-LICENSE",
  },
  {
    pkg: "@fontsource-variable/inter",
    css: "inter.css",
    woff2: [
      "inter-cyrillic-ext-wght-normal.woff2",
      "inter-cyrillic-wght-normal.woff2",
      "inter-greek-ext-wght-normal.woff2",
      "inter-greek-wght-normal.woff2",
      "inter-vietnamese-wght-normal.woff2",
      "inter-latin-ext-wght-normal.woff2",
      "inter-latin-wght-normal.woff2",
    ],
    license: "inter-LICENSE",
  },
  {
    pkg: "@fontsource-variable/newsreader",
    css: "newsreader.css",
    woff2: [
      "newsreader-vietnamese-opsz-normal.woff2",
      "newsreader-latin-ext-opsz-normal.woff2",
      "newsreader-latin-opsz-normal.woff2",
    ],
    license: "newsreader-LICENSE",
  },
];

const WOFF2 = FAMILIES.flatMap((family) => family.woff2);
const CSS = [...new Set(FAMILIES.map((family) => family.css))];
const LICENSE = FAMILIES.map((family) => family.license);
const SHIPPED = [...WOFF2, ...CSS, ...LICENSE].sort();

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts", "compat", "tests/fixtures/offline-runtime"];

let site;
let version;

async function build() {
  return run(process.execPath, ["build.js"], {
    cwd: site,
    env: { ...process.env, PATH: `${path.join(site, "bin")}:${process.env.PATH}` },
  });
}

const inPackage = (pkg, rel) => path.join(ROOT, "node_modules", pkg, rel);

// The package's own @font-face blocks, whichever of its stylesheets declares them.
async function packageCss(pkg) {
  const dir = path.join(ROOT, "node_modules", pkg);
  let text = "";
  for (const name of (await readdir(dir)).filter((name) => name.endsWith(".css")).sort()) {
    text += await readFile(path.join(dir, name), "utf8");
  }
  return text;
}

const range = (text, file) => {
  const block = text
    .split("@font-face")
    .find((b) => b.includes(`url(./files/${file})`) || b.includes(`url(./${file})`));
  return block.match(/unicode-range:\s*([^;]+);/)[1].replace(/\s+/g, "");
};

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

test("the pinned prefix carries every package's woff2 bytes, the stylesheets and the licenses", async () => {
  const dir = path.join(site, "public", version, "fonts");
  expect((await readdir(dir)).sort()).toEqual(SHIPPED);
  for (const family of FAMILIES) {
    for (const file of family.woff2) {
      expect(sha256(await readFile(path.join(dir, file)))).toBe(
        sha256(await readFile(inPackage(family.pkg, "files/" + file))),
      );
    }
    expect(sha256(await readFile(path.join(dir, family.license)))).toBe(
      sha256(await readFile(inPackage(family.pkg, "LICENSE"))),
    );
  }
  for (const file of CSS) {
    expect(sha256(await readFile(path.join(dir, file)))).toBe(
      sha256(await readFile(path.join(ROOT, "fonts", file))),
    );
  }
});

test("the rolling prefix serves the same folder, so /v1/fonts/ rolls with /v1/", async () => {
  for (const name of SHIPPED) {
    expect(sha256(await readFile(path.join(site, "public/v1/fonts", name)))).toBe(
      sha256(await readFile(path.join(site, "public", version, "fonts", name))),
    );
  }
});

test("the release manifest lists every font file with its size and hash", async () => {
  const manifest = JSON.parse(await readFile(path.join(site, "public", version, "m/manifest.json"), "utf8"));
  // The manifest also carries the compiled page theme; that is reader-theme-assets's subject.
  const assets = manifest.assets.filter((asset) => asset.path.startsWith("fonts/")).sort((a, b) => (a.path < b.path ? -1 : 1));
  expect(assets.map((a) => a.path)).toEqual(SHIPPED.map((name) => `fonts/${name}`));
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

test("each stylesheet's file names and unicode-ranges are the packages' own", async () => {
  for (const sheet of CSS) {
    const families = FAMILIES.filter((family) => family.css === sheet);
    const files = families.flatMap((family) => family.woff2);
    const css = await readFile(path.join(ROOT, "fonts", sheet), "utf8");
    // One face per woff2 the copy table names: no extra subset, no weight or style the
    // Journal does not use.
    expect(css.match(/@font-face/g)).toHaveLength(files.length);
    expect(css).toContain("font-display: swap");
    expect(css).not.toMatch(/https?:/);
    for (const family of families) {
      const pkgCss = await packageCss(family.pkg);
      for (const file of family.woff2) {
        expect(range(css, file)).toBe(range(pkgCss, file));
        // A relative url() is what lets a local host serve the woff2 from the same folder.
        expect(css).toContain(`url(./${file})`);
      }
    }
  }
});

test("_headers gives the fonts folder CORS and the pinned prefix immutable caching", async () => {
  const headers = await readFile(path.join(site, "public/_headers"), "utf8");
  const block = (selector) => headers.split("\n\n").find((b) => b.split("\n")[0] === selector);
  expect(block("/:prefix/fonts/*")).toContain("Access-Control-Allow-Origin: *");
  expect(block(`/${version}/*`)).toContain("max-age=31536000, immutable");
  expect(block("/v1/*")).toContain("max-age=600");
});
