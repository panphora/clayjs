/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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
const COPIED_DIRS = ["src", "entries", "scripts", "website", "docs", "fonts", "compat", "tests/fixtures/offline-runtime"];

// A string that exists nowhere in the tree, so the only way it reaches public/ is if
// the build served the seed tarball the tests handed it.
const SEED_MARKER = "seeded-from-the-tested-tarball-b7e1";
const PACK_ATTEMPTS = "pack-attempts.log";

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

async function makeSite({ guardedPack = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "clay-site-"));
  for (const name of COPIED_FILES) await cp(path.join(ROOT, name), path.join(dir, name));
  for (const name of COPIED_DIRS) await cp(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  await symlink(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");

  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  pkg.version = CURRENT;
  await writeFile(path.join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  await mkdir(path.join(dir, "bin"));
  // The guarded shim answers the registry lookup with the earlier release alone and
  // makes `npm pack` fail loudly, the way npm behaves while a version is listed but
  // its tarball is not served yet. It records any attempt, so a test can prove none
  // happened.
  const shim = guardedPack
    ? `#!/bin/sh
case "$1" in
  view) echo '[${JSON.stringify(PREVIOUS)}]' ;;
  pack) echo "npm pack must not run: the seed already carries this release" >&2
    echo "$@" >> "${path.join(dir, PACK_ATTEMPTS)}"
    exit 1 ;;
  *) echo "unexpected npm command: $*" >&2
    exit 1 ;;
esac
`
    : `#!/bin/sh\necho '["${PREVIOUS}"]'\n`;
  await writeFile(path.join(dir, "bin", "npm"), shim);
  await chmod(path.join(dir, "bin", "npm"), 0o755);

  const release = path.join(dir, ".version-cache", PREVIOUS);
  for (const name of ["entries", "src", "dist/m"]) await mkdir(path.join(release, name), { recursive: true });
  await writeFile(path.join(release, "entries/clay.js"), "var a = 1;\n");
  await writeFile(path.join(release, "src/loader.js"), "export {};\n");
  await writeFile(path.join(release, "dist/clay.js"), 'var b = 1; /* "dir":"m/" */\n');
  await writeFile(path.join(release, "dist/sap.js"), "/* sap */\n");
  await writeFile(path.join(release, "dist/clay.standalone.js"), "/* standalone */\n");
  await writeFile(path.join(release, "dist/m/manifest.json"), `{"version":"${PREVIOUS}"}\n`);
  await writeFile(path.join(release, "dist/m", PREVIOUS_ONLY), 'console.log("previous release chunk");\n');

  return dir;
}

async function build(dir = site, env = {}) {
  const base = { ...process.env };
  delete base.CLAYJS_SEED_RELEASE;
  delete base.CLAYJS_SEED_INTEGRITY;
  return run(process.execPath, ["build.js"], {
    cwd: dir,
    env: { ...base, PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, ...env },
  });
}

// A tarball shaped like the release this tree is publishing: package/package.json
// plus the files the site reads. Its dist/clay.js carries the marker, because dist/
// is what a release serves as clay.js.
async function seedTarball(dir, { name, version = CURRENT } = {}) {
  const stage = await mkdtemp(path.join(os.tmpdir(), "clay-seed-"));
  const pkgName = name ?? JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).name;
  const p = path.join(stage, "package");
  for (const d of ["entries", "src", "dist/m"]) await mkdir(path.join(p, d), { recursive: true });
  await writeFile(path.join(p, "package.json"), `${JSON.stringify({ name: pkgName, version }, null, 2)}\n`);
  await writeFile(path.join(p, "entries/clay.js"), `/* ${SEED_MARKER} */\nvar seeded = 1;\n`);
  await writeFile(path.join(p, "src/loader.js"), "export {};\n");
  await writeFile(path.join(p, "dist/clay.js"), `/* ${SEED_MARKER} */\nvar clay = 1; /* "dir":"m/" */\n`);
  await writeFile(path.join(p, "dist/sap.js"), "/* sap */\n");
  await writeFile(path.join(p, "dist/clay.standalone.js"), "/* standalone */\n");
  await writeFile(path.join(p, "dist/m/manifest.json"), `{"version":"${version}"}\n`);
  const tarball = path.join(stage, "clayjs-seed.tgz");
  await run("tar", ["-czf", tarball, "-C", stage, "package"]);
  const integrity = `sha512-${createHash("sha512").update(await readFile(tarball)).digest("base64")}`;
  return { tarball, integrity, cleanup: () => rm(stage, { recursive: true, force: true }) };
}

async function expectNoSeededCache(dir) {
  for (const name of [CURRENT, `${CURRENT}.partial`]) {
    const present = Boolean(await lstat(path.join(dir, ".version-cache", name)).catch(() => null));
    expect({ name, present }).toEqual({ name, present: false });
  }
}

beforeAll(async () => {
  site = await makeSite();
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

test("the current release's prefixes carry its offline index, and every file it names", async () => {
  for (const prefix of ["v1", CURRENT]) {
    const index = JSON.parse(await readFile(path.join(site, "public", prefix, "offline-manifest.json"), "utf8"));
    expect(index.version).toBe(CURRENT);
    const paths = Object.keys(index.files);
    expect(paths.length).toBeGreaterThan(100);
    for (const file of paths) {
      const stat = await lstat(path.join(site, "public", prefix, file)).catch(() => null);
      expect({ prefix, file, present: Boolean(stat?.isFile()) }).toEqual({ prefix, file, present: true });
    }
  }
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

test.each([
  ["a matching integrity", true],
  ["no integrity", false],
])("a seed with %s builds every prefix from the tested tarball", async (_label, withIntegrity) => {
  const dir = await makeSite({ guardedPack: true });
  const seed = await seedTarball(dir);
  try {
    const env = { CLAYJS_SEED_RELEASE: seed.tarball };
    if (withIntegrity) env.CLAYJS_SEED_INTEGRITY = seed.integrity;
    await build(dir, env);

    for (const prefix of [CURRENT, "v1"]) {
      const clay = await readFile(path.join(dir, "public", prefix, "clay.js"), "utf8");
      expect({ prefix, seeded: clay.includes(SEED_MARKER) }).toEqual({ prefix, seeded: true });
    }
    // The earlier release keeps the address it was published at.
    expect(await lstat(path.join(dir, "public", PREVIOUS, "clay.js"))).toBeTruthy();
    // Nothing asked npm for a tarball, and the caller's file is still there.
    expect(await lstat(path.join(dir, PACK_ATTEMPTS)).catch(() => null)).toBeNull();
    expect((await lstat(seed.tarball)).isFile()).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await seed.cleanup();
  }
}, 300000);

test("a seed whose integrity does not match is refused, naming both values", async () => {
  const dir = await makeSite({ guardedPack: true });
  const seed = await seedTarball(dir);
  try {
    const wrong = `sha512-${createHash("sha512").update("not the seed").digest("base64")}`;
    await expect(build(dir, { CLAYJS_SEED_RELEASE: seed.tarball, CLAYJS_SEED_INTEGRITY: wrong })).rejects.toMatchObject({
      stderr: expect.stringContaining(`CLAYJS_SEED_INTEGRITY mismatch: expected ${wrong}, got ${seed.integrity}`),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await seed.cleanup();
  }
}, 300000);

test("a seed of a different version is refused", async () => {
  const dir = await makeSite({ guardedPack: true });
  const name = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).name;
  const seed = await seedTarball(dir, { version: "9.9.9" });
  try {
    await expect(build(dir, { CLAYJS_SEED_RELEASE: seed.tarball })).rejects.toMatchObject({
      stderr: expect.stringContaining(`CLAYJS_SEED_RELEASE package mismatch: expected ${name}@${CURRENT}, got ${name}@9.9.9`),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await seed.cleanup();
  }
}, 300000);

test("a seed of a different package is refused", async () => {
  const dir = await makeSite({ guardedPack: true });
  const name = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).name;
  const seed = await seedTarball(dir, { name: "not-clayjs" });
  try {
    await expect(build(dir, { CLAYJS_SEED_RELEASE: seed.tarball })).rejects.toMatchObject({
      stderr: expect.stringContaining(`CLAYJS_SEED_RELEASE package mismatch: expected ${name}@${CURRENT}, got not-clayjs@${CURRENT}`),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await seed.cleanup();
  }
}, 300000);

test("a relative seed path is refused", async () => {
  const dir = await makeSite({ guardedPack: true });
  try {
    await expect(build(dir, { CLAYJS_SEED_RELEASE: "clayjs-seed.tgz" })).rejects.toMatchObject({
      stderr: expect.stringContaining("CLAYJS_SEED_RELEASE must be an absolute path: clayjs-seed.tgz"),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 300000);

test("a missing seed path is refused", async () => {
  const dir = await makeSite({ guardedPack: true });
  const missing = path.join(dir, "no-such-seed.tgz");
  try {
    await expect(build(dir, { CLAYJS_SEED_RELEASE: missing })).rejects.toMatchObject({
      stderr: expect.stringContaining(`CLAYJS_SEED_RELEASE must be a regular file: ${missing}`),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 300000);

test("a directory seed path is refused", async () => {
  const dir = await makeSite({ guardedPack: true });
  const seed = await seedTarball(dir);
  try {
    await expect(build(dir, { CLAYJS_SEED_RELEASE: path.dirname(seed.tarball) })).rejects.toMatchObject({
      stderr: expect.stringContaining(`CLAYJS_SEED_RELEASE must be a regular file: ${path.dirname(seed.tarball)}`),
    });
    await expectNoSeededCache(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await seed.cleanup();
  }
}, 300000);
