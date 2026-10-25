/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Light 1's fonts, by the subset names the Google Fonts CSS used for the families the
// theme names. The compiler reads the same package sheets, so this list is what "every
// subset, not latin alone" means in bytes.
const FONTS = [
  {
    pkg: "@fontsource-variable/inter",
    family: "Inter",
    variant: "wght",
    subsets: ["cyrillic-ext", "cyrillic", "greek-ext", "greek", "vietnamese", "latin-ext", "latin"],
    files: (subset) => `inter-${subset}-wght-normal.woff2`,
    license: "inter-LICENSE",
  },
  {
    pkg: "@fontsource-variable/newsreader",
    family: "Newsreader",
    variant: "opsz",
    subsets: ["vietnamese", "latin-ext", "latin"],
    files: (subset) => `newsreader-${subset}-opsz-normal.woff2`,
    license: "newsreader-LICENSE",
  },
];
const WOFF2 = FONTS.flatMap((font) => font.subsets.map(font.files));
const THEME = "page/themes/light-1.css";
const DOCUMENT_URL = "src/page/themes/light-1.css";

// The theme is served at the document URL saved documents name, and beside the fonts in
// the release. Each copy's font URLs are relative to its own depth.
const SHEETS = [
  { path: DOCUMENT_URL, fonts: "../../../fonts/" },
  { path: THEME, fonts: "../../fonts/" },
];

const PACKAGE_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const PACKAGE_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts", "dist"];

let site;
let version;
let publicDir;
let manifest;

async function build() {
  return run(process.execPath, ["build.js"], {
    cwd: site,
    env: { ...process.env, PATH: `${path.join(site, "bin")}:${process.env.PATH}` },
  });
}

const inPackage = (pkg, rel, options) => readFile(path.join(ROOT, "node_modules", pkg, rel), options);

// The package's own @font-face blocks, so the ranges and weights are the ones the pinned
// version ships rather than anything written here from memory.
async function packageFaces(font) {
  const css = await inPackage(font.pkg, `${font.variant}.css`, "utf8");
  const faces = new Map();
  for (const block of css.split("@font-face").slice(1)) {
    const field = (name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();
    const file = field("src").match(/url\(\.\/files\/([^)]+)\)/)[1];
    faces.set(file, { weight: field("font-weight"), range: field("unicode-range").replace(/\s+/g, "") });
  }
  return faces;
}

const facesOf = (css) => {
  const faces = new Map();
  for (const block of css.split("@font-face").slice(1)) {
    const field = (name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();
    const file = field("src").match(/url\(([^)]+)\)/)[1].split("/").pop();
    faces.set(file, { family: field("font-family"), weight: field("font-weight"), range: field("unicode-range").replace(/\s+/g, ""), display: field("font-display") });
  }
  return faces;
};

const urlsOf = (css) => [...css.matchAll(/url\("?([^")]+)"?\)/g)].map((match) => match[1]).filter((url) => !url.startsWith("data:"));
const familyOf = (file) => FONTS.find((font) => font.subsets.some((subset) => font.files(subset) === file));

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-theme-"));
  for (const name of PACKAGE_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of PACKAGE_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  // No published versions: one pin, the working tree's own, and /v1/ rolls to it, so the
  // build serves this tree instead of unpacking a tarball.
  await mkdir(path.join(site, "bin"));
  await writeFile(path.join(site, "bin", "npm"), "#!/bin/sh\necho '[]'\n");
  await chmod(path.join(site, "bin", "npm"), 0o755);

  version = JSON.parse(await readFile(path.join(site, "package.json"), "utf8")).version;
  await build();
  publicDir = path.join(site, "public", version);
  manifest = JSON.parse(await readFile(path.join(publicDir, "m/manifest.json"), "utf8"));
}, 300000);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

test("the document URL serves one compiled sheet: no @import and no external font", async () => {
  const css = await readFile(path.join(publicDir, DOCUMENT_URL), "utf8");
  expect(css).not.toContain("@import");
  expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  expect(urlsOf(css).filter((url) => /^(https?:)?\/\//.test(url))).toEqual([]);
  // Not latin alone: the faces the Google Fonts CSS declared for both families.
  expect(css.match(/@font-face/g)).toHaveLength(WOFF2.length);
});

test("each emitted copy names the same fonts at its own depth, one URL per font", async () => {
  for (const sheet of SHEETS) {
    const css = await readFile(path.join(publicDir, sheet.path), "utf8");
    const urls = urlsOf(css);
    expect(urls).toHaveLength(WOFF2.length);
    const names = urls.map((url) => url.split("/").pop());
    expect(names.slice().sort()).toEqual(WOFF2.slice().sort());
    // The same woff2 is never listed twice, and never through a second address.
    expect(new Set(names).size).toBe(names.length);
    for (const [index, url] of urls.entries()) {
      expect(url.startsWith(sheet.fonts)).toBe(true);
      const file = path.resolve(path.dirname(path.join(publicDir, sheet.path)), url);
      expect(sha256(await readFile(file))).toBe(sha256(await inPackage(familyOf(names[index]).pkg, `files/${names[index]}`)));
    }
  }
});

test("every face is its pinned package's file, range and weight", async () => {
  const css = await readFile(path.join(publicDir, DOCUMENT_URL), "utf8");
  const faces = facesOf(css);
  for (const font of FONTS) {
    const expected = await packageFaces(font);
    for (const subset of font.subsets) {
      const file = font.files(subset);
      const face = faces.get(file);
      expect(face).toBeDefined();
      expect(face.family).toBe(`"${font.family}"`);
      expect(face.display).toBe("swap");
      expect(face.range).toBe(expected.get(file).range);
      expect(face.weight).toBe(expected.get(file).weight);
      // The weights the theme uses are inside the face that now carries them.
      for (const weight of font.family === "Inter" ? ["400", "500", "600"] : ["500"]) {
        const [min, max = min] = face.weight.split(" ");
        expect(Number(weight)).toBeGreaterThanOrEqual(Number(min));
        expect(Number(weight)).toBeLessThanOrEqual(Number(max));
      }
    }
  }
  // The faces are the pinned package's bytes at all three addresses: package, repo, site.
  for (const file of WOFF2) {
    const built = await readFile(path.join(publicDir, "fonts", file));
    expect(sha256(built)).toBe(sha256(await readFile(path.join(ROOT, "fonts", file))));
    expect(sha256(built)).toBe(sha256(await inPackage(familyOf(file).pkg, `files/${file}`)));
  }
});

test("content.css and the Light 1 rules are compiled in their existing order", async () => {
  const css = await readFile(path.join(publicDir, DOCUMENT_URL), "utf8");
  const source = await readFile(path.join(ROOT, "src/page/themes/light-1.css"), "utf8");
  const content = await readFile(path.join(ROOT, "src/page/themes/content.css"), "utf8");
  const rules = source.slice(source.indexOf(":where(article[data-page], .page-shell) {"));

  expect(css).toContain(content);
  expect(css.endsWith(rules)).toBe(true);
  expect(css.indexOf(content.trimEnd())).toBeGreaterThan(css.indexOf("@font-face"));
  // @layer page survives, once, around content.css rather than flattened away.
  expect(css.match(/@layer page \{/g)).toHaveLength(1);
  for (const declaration of ["--page-bg: #F7F6F2;", "--page-font: Inter,", "--page-font-display: Newsreader,", "--page-measure: 632px;", "--page-accent: #2F5E9E;"]) {
    expect(css).toContain(declaration);
  }
});

test("the manifest lists nonzero styles and fonts with sizes, hashes and MIME types", async () => {
  const assets = manifest.assets;
  expect(assets.filter((asset) => asset.path.endsWith(".woff2")).length).toBeGreaterThanOrEqual(WOFF2.length);
  expect(assets.filter((asset) => asset.path.endsWith(".css")).length).toBeGreaterThan(0);
  expect(assets.map((asset) => asset.path)).toEqual(expect.arrayContaining([THEME, "fonts/inter.css", "fonts/newsreader.css", ...WOFF2.map((file) => `fonts/${file}`)]));

  const types = { ".woff2": "font/woff2", ".css": "text/css; charset=utf-8" };
  for (const asset of assets) {
    const bytes = await readFile(path.join(publicDir, asset.path));
    expect(asset.bytes).toBe(bytes.length);
    expect(asset.sha256).toBe(sha256(bytes));
    expect(asset.contentType).toBe(types[path.extname(asset.path)] ?? "text/plain; charset=utf-8");
  }
  // The release style asset is the same sheet the document URL serves: one depth shallower,
  // so only the font URLs differ, and they name the same files.
  const asset = await readFile(path.join(publicDir, THEME), "utf8");
  const served = await readFile(path.join(publicDir, DOCUMENT_URL), "utf8");
  expect(asset.replaceAll("url(../../fonts/", "url(../../../fonts/")).toBe(served);
  // The rolling prefix carries the same assets as its release.
  const rolling = JSON.parse(await readFile(path.join(site, "public/v1/m/manifest.json"), "utf8"));
  expect(rolling.assets).toEqual(manifest.assets);
});

test("the npm package carries the fonts, their licenses and the compiled theme", async () => {
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: site });
  const files = JSON.parse(stdout)[0].files.map((file) => file.path);
  for (const name of ["fonts/inter.css", "fonts/newsreader.css", ...WOFF2.map((file) => `fonts/${file}`), ...FONTS.map((font) => `fonts/${font.license}`), `dist/${THEME}`]) {
    expect(files).toContain(name);
  }
}, 120000);
