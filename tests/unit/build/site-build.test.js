/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);

// The site build asks the registry which versions to pin and unpacks each one into
// .version-cache. Both are replaced here: a shim on PATH answers `npm view`, and the
// earlier release is a fixture, so this test reads no network and no real cache.
const CURRENT = "1.15.3";
const PREVIOUS = "1.15.0";
const PREVIOUS_ONLY = "clay-previous-AAAAAAA.js";

const COPIED_FILES = ["build.js", "package.json", "packed-contract.json", "THIRD-PARTY-NOTICES.md"];
const COPIED_DIRS = ["src", "entries", "scripts", "website", "docs"];

let site;

function embedded(code) {
  const start = code.indexOf("})({");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 3; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return JSON.parse(code.slice(start + 3, i + 1));
  }
  throw new Error("unterminated embedded manifest");
}

async function bootstrapFiles() {
  const files = [];
  for (const name of await readdir(path.join(site, "public/v1"), { withFileTypes: true })) {
    if (!name.isFile() || !name.name.endsWith(".js")) continue;
    const code = await readFile(path.join(site, "public/v1", name.name), "utf8");
    const payload = embedded(code);
    if (payload) files.push({ name: name.name, code, payload });
  }
  return files;
}

async function build() {
  return run(process.execPath, ["build.js"], {
    cwd: site,
    env: { ...process.env, PATH: `${path.join(site, "bin")}:${process.env.PATH}` },
  });
}

beforeAll(async () => {
  site = await mkdtemp(path.join(os.tmpdir(), "clay-site-"));
  for (const name of COPIED_FILES) await cp(path.join(ROOT, name), path.join(site, name));
  for (const name of COPIED_DIRS) await cp(path.join(ROOT, name), path.join(site, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(site, "node_modules"), "dir");

  const pkg = JSON.parse(await readFile(path.join(site, "package.json"), "utf8"));
  pkg.version = CURRENT;
  await writeFile(path.join(site, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  await mkdir(path.join(site, "bin"));
  await writeFile(path.join(site, "bin", "npm"), `#!/bin/sh\necho '["${PREVIOUS}"]'\n`);
  await chmod(path.join(site, "bin", "npm"), 0o755);

  // An earlier release that already ships chunks, tarball-shaped: entries/, dist/ with
  // its bootstraps and dist/m/, and src/. One chunk name is its alone, the way a
  // content-hashed name from a previous release is.
  const release = path.join(site, ".version-cache", PREVIOUS);
  for (const dir of ["entries", "src", "dist/m"]) await mkdir(path.join(release, dir), { recursive: true });
  await writeFile(path.join(release, "entries/clay.js"), "var a = 1;\n");
  await writeFile(path.join(release, "src/loader.js"), "export {};\n");
  await writeFile(path.join(release, "dist/clay.js"), 'var b = 1; /* "dir":"m/" */\n');
  await writeFile(path.join(release, "dist/sap.js"), "/* sap */\n");
  await writeFile(path.join(release, "dist/clay.standalone.js"), "/* standalone */\n");
  await writeFile(path.join(release, "dist/m/manifest.json"), `{"version":"${PREVIOUS}"}\n`);
  await writeFile(path.join(release, "dist/m", PREVIOUS_ONLY), 'console.log("previous release chunk");\n');

  await build();
}, 300000);

afterAll(async () => {
  await rm(site, { recursive: true, force: true });
});

test("the rolling prefix's bootstraps load m/ under the rolling prefix itself", async () => {
  const files = await bootstrapFiles();
  expect(files.length).toBeGreaterThan(1);
  for (const { name, code, payload } of files) {
    expect({ name, dir: payload.dir }).toEqual({ name, dir: "m/" });
    expect(code).not.toContain(`../${CURRENT}/m/`);
  }
});

test("every file the v1 bootstraps and manifest name exists under public/v1/m/", async () => {
  const m = path.join(site, "public/v1/m");
  const manifest = JSON.parse(await readFile(path.join(m, "manifest.json"), "utf8"));
  expect(manifest.version).toBe(CURRENT);

  const named = new Set(Object.keys(manifest.files));
  for (const { name, payload } of await bootstrapFiles()) {
    for (const file of [payload.manifest, ...payload.preload]) {
      expect({ name, file, named: named.has(file) }).toEqual({ name, file, named: true });
    }
  }
  for (const file of named) {
    const stat = await lstat(path.join(m, file)).catch(() => null);
    expect({ file, present: Boolean(stat?.isFile()) }).toEqual({ file, present: true });
  }
});

test("the previous chunked release's chunks stay under public/v1/m/", async () => {
  expect(await readdir(path.join(site, "public/v1/m"))).toContain(PREVIOUS_ONLY);
  expect(await readdir(path.join(site, `public/${PREVIOUS}/m`))).toContain(PREVIOUS_ONLY);
  // The rolling prefix's manifest describes the release the prefix itself serves.
  const manifest = JSON.parse(await readFile(path.join(site, "public/v1/m/manifest.json"), "utf8"));
  expect(manifest.version).toBe(CURRENT);
});

test("a same-name different-bytes pair stops the build", async () => {
  const current = (await readdir(path.join(site, `public/${CURRENT}/m`))).find((f) => f.startsWith("c-"));
  expect(current).toBeTruthy();
  const collide = path.join(site, ".version-cache", PREVIOUS, "dist/m", current);
  await writeFile(collide, "different bytes\n");
  try {
    await expect(build()).rejects.toMatchObject({
      stderr: expect.stringContaining(`public/v1/m/${current} is already there with different bytes`),
    });
  } finally {
    await rm(collide, { force: true });
  }
});
