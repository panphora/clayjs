// The release inventory: one entry per public path a version prefix serves, naming the
// package file whose bytes are served there. A local host copies the release out of the
// npm package and serves it offline, so the inventory has to be complete without eager
// loading: nothing here imports the library, and nothing here reads the network.
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

// Never follow a symlink out of the tree, and never copy something that is not a
// regular file. Same rule as malleabledocument's sync-fixtures.mjs, for the same
// reason: a copier that follows links can write anywhere.
export async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing to copy a symlink: ${abs}`);
    if (entry.isDirectory()) out.push(...(await walk(abs, base)));
    else if (entry.isFile()) out.push(relative(base, abs));
    else throw new Error(`refusing to copy a non-regular file: ${abs}`);
  }
  return out;
}

// Every file a release prefix serves, as Map<publicPath, sourcePath>, both POSIX and
// relative: publicPath to the prefix, sourcePath to `from` (a package root or an
// unpacked tarball). dist/ wins over entries/ (generated bootstraps) and src/, which is
// the order emitLibrary already resolves by hand.
export async function releaseFiles(from, { dist = join(from, "dist"), allowMissingDist = false } = {}) {
  const out = new Map();
  const posix = (rel) => rel.split(sep).join("/");
  const stat = await lstat(dist).catch(() => null);
  if (stat) {
    // The index itself is the one file a prefix serves that a package file does not
    // stand in for: it IS the inventory, so it cannot be an entry in it.
    for (const rel of await walk(dist)) {
      if (rel === "offline-manifest.json") continue;
      out.set(posix(rel), `dist/${posix(rel)}`);
    }
  } else if (!allowMissingDist) {
    throw new Error(`${from} has no dist/`);
  }
  // fonts/ is served under every prefix as fonts/, the same files fontSources() copies.
  // Tarballs from before the fonts folder have none, and their pins still rebuild.
  for (const [name, sub, optional] of [["entries/", ""], ["src/", "src/"], ["fonts/", "fonts/", true]]) {
    const abs = join(from, name);
    if (!(await lstat(abs).catch(() => null))) {
      if (optional) continue;
      throw new Error(`${from} has no ${name}`);
    }
    for (const rel of await walk(abs)) {
      const pub = posix(join(sub, rel));
      if (out.has(pub)) continue;
      out.set(pub, posix(join(name, rel)));
    }
  }
  return out;
}

// A release path is a URL path someday, so it is held to what one can spell: relative,
// POSIX, no empty, . or .. segment, no backslash, no leading slash and no percent, so
// no encoded separators either.
export function assertReleasePath(relPath) {
  const fail = (why) => {
    throw new Error(`release path ${JSON.stringify(relPath)} ${why}`);
  };
  if (typeof relPath !== "string" || relPath === "") fail("is empty");
  if (relPath.startsWith("/")) fail("is absolute");
  if (relPath.includes("\\")) fail("contains a backslash");
  if (relPath.includes("%")) fail("is percent-encoded");
  for (const segment of relPath.split("/")) {
    if (segment === "") fail("has an empty segment");
    if (segment === "." || segment === "..") fail(`has a ${segment} segment`);
  }
}

export const CONTENT_TYPES = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".cjs", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".css", "text/css; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".md", "text/markdown; charset=utf-8"],
]);

// The external URLs the published files still reach for, each with the reason a local
// host serving the release offline can let the request fail. Journal 10 adds the exact
// legacy CDN addresses as aliases; this is the other list.
const ONLINE_ONLY = {
  "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Inter:wght@400;500;600&display=swap": "light-1.source.css is the authoring chain; pages load the compiled light-1.css, which reaches for nothing",
  "https://esm.sh/diff@5.2.0": "autosave debugging is opt-in; the library itself never imports it",
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap": "Light 2 is not compiled; offline the page falls back to system fonts",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500&display=swap": "Light 4 is not compiled; offline the page falls back to system fonts",
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500&display=swap": "the visitor-drafts prompt names its fonts on Google Fonts; offline it falls back to system fonts",
  "https://cdn.jsdelivr.net/npm/mirk-interface@2.2.0/fonts/DepartureMono-1.500/DepartureMono-Regular.woff2": "the CMS editor's monospace face; offline its controls fall back to the system monospace",
};

// A source path is relative to the package root, but dist/ is not always the package's
// own dist/: `--dist=<dir>` builds somewhere else, and the inventory still records the
// path the tarball would carry.
const sourceAt = (root, dist, source) =>
  source.startsWith("dist/") ? join(dist, source.slice("dist/".length)) : join(root, source);

const REQUIRED = [
  "clay.js",
  "m/manifest.json",
  "src/loader.js",
  "src/page/themes/light-1.css",
  "fonts/inter-latin-wght-normal.woff2",
  "fonts/ibm-plex-sans-latin-400-normal.woff2",
];

export async function buildOfflineManifest({ root, dist }) {
  const manifest = JSON.parse(await readFile(join(dist, "m", "manifest.json"), "utf8"));
  const entries = [...(await releaseFiles(root, { dist })).entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const files = {};
  for (const [pub, source] of entries) {
    assertReleasePath(pub);
    assertReleasePath(source);
    const bytes = await readFile(sourceAt(root, dist, source));
    files[pub] = {
      source,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      type: CONTENT_TYPES.get(extname(pub).toLowerCase()) ?? "text/plain; charset=utf-8",
    };
  }
  if (!Object.keys(files).length) throw new Error("the offline manifest would list no files");
  for (const pub of REQUIRED) {
    if (!files[pub]) throw new Error(`the release carries no ${pub}; the offline manifest would be incomplete`);
  }
  for (const file of Object.keys(manifest.files)) {
    if (!files[`m/${file}`]) {
      throw new Error(`the release carries no m/${file}, which the chunk manifest names; the offline manifest would be incomplete`);
    }
  }

  const index = {
    schema: 1,
    version: manifest.version,
    chunkBuild: manifest.build,
    files,
    aliases: {},
    onlineOnly: { ...ONLINE_ONLY },
  };
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, "offline-manifest.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
