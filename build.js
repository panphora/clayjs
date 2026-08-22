// Assemble public/, the directory wrangler serves to clayjs.com.
//
//   node build.js          rebuild public/ from source
//   npm run deploy         rebuild, then wrangler deploy
//
// public/ is gitignored and disposable: it is a build output, never a source of
// truth. It used to be maintained by hand, which failed the way hand-maintained
// mirrors always fail — it sat a day stale while the site served a clay.js with
// three known data-loss bugs, and adding a satellite meant remembering two places.
//
// So the file list is DERIVED, not written down here:
//
//   public/ = package.json "files" (minus the ones nothing serves) + website/*
//
// package.json "files" is the list npm publishes, so it is already the thing you
// must edit to ship a new satellite. Deriving from it means a satellite cannot
// reach npm and miss the site. That exact miss is why this script exists.

import { readdir, readFile, mkdir, copyFile, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const WEBSITE = resolve(ROOT, 'website');

// Everything in "files" is served. THIRD-PARTY-NOTICES.md used to sit out here
// because nothing linked it; the footers link it now, so it ships with the site.
const NOT_SERVED = new Set();

// Never follow a symlink out of the tree, and never copy something that is not a
// regular file. Same rule as malleablehtmlfile's sync-fixtures.mjs, for the same
// reason: a copier that follows links can write anywhere.
async function walk(dir, base = dir) {
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

async function copyInto(fromAbs, relPath) {
  const dest = join(PUBLIC, relPath);
  // Belt and braces on the join above: a "files" entry containing .. would
  // otherwise write outside public/.
  if (dest !== PUBLIC && !dest.startsWith(PUBLIC + sep)) {
    throw new Error(`refusing to write outside public/: ${dest}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(fromAbs, dest);
}

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const entries = (pkg.files || []).filter((name) => !NOT_SERVED.has(name));
if (!entries.length) throw new Error('package.json "files" is empty; nothing to build');

// Clean rebuild, so a file deleted from source disappears from the site instead of
// lingering forever. Scoped to PUBLIC, which is computed from this file's own
// location and never from input.
await rm(PUBLIC, { recursive: true, force: true });
await mkdir(PUBLIC, { recursive: true });

let count = 0;
for (const name of entries) {
  const abs = resolve(ROOT, name);
  const stat = await lstat(abs).catch(() => null);
  if (!stat) throw new Error(`package.json "files" lists ${name}, which does not exist`);
  if (stat.isSymbolicLink()) throw new Error(`refusing to copy a symlink: ${abs}`);

  if (stat.isDirectory()) {
    for (const rel of await walk(abs)) {
      await copyInto(join(abs, rel), join(name, rel));
      count++;
    }
  } else {
    await copyInto(abs, name);
    count++;
  }
}

// The site's pages sit at the root of the served directory, not under /website/.
for (const rel of await walk(WEBSITE)) {
  await copyInto(join(WEBSITE, rel), rel);
  count++;
}

console.log(`built public/: ${count} files from ${entries.length} package entries + website/`);
