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
// LAYOUT
//
//   public/
//     index.html docs.html …           the site, from website/, flattened
//     llms.txt                         docs/reference.md, renamed
//     THIRD-PARTY-NOTICES.md           linked from the site footer
//     _headers                         from website/
//     v1/     clay.js …  src/**        latest 1.x, what everyone is told to use
//     1.0.0/  clay.js …  src/**        that exact release, immutable, forever
//
// There is no unversioned /clay.js. It was retired before 1.0 on purpose: an
// unversioned URL means the library can never make a breaking change, because
// every saved document hardcodes its script URL and nothing can reach those
// documents to migrate them.
//
// The version prefix has to be a DIRECTORY, not a filename. clay.js derives its
// base from its own URL and imports base + "/src/loader.js", so /v1/clay.js pulls
// /v1/src/loader.js and the whole module graph versions with the entry. A
// /clay-1.js would pull a shared /src/loader.js and version nothing.
//
// The library file list is DERIVED, not written down here:
//
//   library payload = package.json "files" (entries/ flattened, plus src/)
//
// package.json "files" is the list npm publishes, so it is already the thing you
// must edit to ship a new satellite. Deriving from it means a satellite cannot
// reach npm and miss the site. That exact miss is why this script exists.

import { readdir, readFile, mkdir, copyFile, rm, rename, lstat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const WEBSITE = resolve(ROOT, 'website');
// Unpacked tarballs of already-published versions. Gitignored: it is a cache, so a
// normal rebuild needs no network, and deleting it only costs one slow build.
const CACHE = resolve(ROOT, '.version-cache');

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

// Entries of "files" that make up the versioned library payload, and where each
// lands inside a version prefix. entries/ flattens: entries/clay.js is served as
// <prefix>/clay.js, which is the URL saved documents point at. src/ keeps its name
// because clay.js imports it by that literal path.
const LIBRARY = new Map([['entries/', ''], ['src/', 'src/']]);

// Everything else in "files" is served once, at the site root.
const RENAMED = new Map([['docs/reference.md', 'llms.txt']]);

// Rolling prefixes are derived from every version that exists, not from the working
// tree's own version. The day 2.0.0 ships, /v1/ still has to serve the last 1.x, and
// nothing in the working tree is 1.x any more.
function rollingHeads(versions) {
  const best = new Map();
  for (const v of versions) {
    const major = v.split('.')[0];
    if (!best.has(major) || cmpVersion(v, best.get(major)) > 0) best.set(major, v);
  }
  return best;
}

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
  // Belt and braces on the join above: a path containing .. would otherwise write
  // outside public/.
  if (dest !== PUBLIC && !dest.startsWith(PUBLIC + sep)) {
    throw new Error(`refusing to write outside public/: ${dest}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(fromAbs, dest);
  return 1;
}

// Copy a library payload under one prefix. `from` is the working tree for the
// version being built, or an unpacked tarball for anything already released.
async function emitLibrary(from, prefix) {
  let n = 0;
  for (const [name, sub] of LIBRARY) {
    const abs = join(from, name);
    if (!(await lstat(abs).catch(() => null))) throw new Error(`${from} has no ${name}`);
    for (const rel of await walk(abs)) n += await copyInto(join(abs, rel), join(prefix, sub, rel));
  }
  return n;
}

// Republish every already-released 1.x from the registry, so a pinned URL keeps
// answering after the next release rebuilds public/ from scratch. Without this,
// shipping 1.0.1 would delete /1.0.0/ and break every document that pinned it, and
// an immutable URL that disappears is worse than never offering one.
//
// Only >= 1.0.0: pinned URLs did not exist before 1.0, so there is nothing to keep
// alive, and the 0.x tarballs have the pre-entries/ layout anyway.
function cmpVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const isRelease = (v) => /^\d+\.\d+\.\d+$/.test(v) && cmpVersion(v, '1.0.0') >= 0;

// Every release we have already unpacked. The cache is a durable second record of
// what was pinned, so a version the registry momentarily fails to list is still
// preserved rather than deleted from the site.
async function cachedPins() {
  return (await readdir(CACHE).catch(() => [])).filter(isRelease);
}

async function publishedPins() {
  let versions = [];
  try {
    const { stdout } = await run('npm', ['view', `${pkg.name}`, 'versions', '--json'], { timeout: 30000 });
    const parsed = JSON.parse(stdout);
    versions = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    // Not published yet is the normal case before the first release, and is fine:
    // there are no past pins to keep alive. Anything else is a network or registry
    // failure and has to stop the build. public/ is rebuilt from scratch and
    // deployed by replacement, so a build that shrugs and carries on with an empty
    // list deletes every pinned URL and every rolling prefix except its own, and
    // exits 0 doing it. A pin that disappears is the one failure this whole file
    // exists to prevent, so it is never a warning.
    const text = `${err.stderr || ''}${err.stdout || ''}${err.message || ''}`;
    if (!text.includes('E404')) {
      throw new Error(`could not read published versions of ${pkg.name}: ${err.message}`);
    }
    console.warn(`build: ${pkg.name} is not published yet; no pinned versions to preserve`);
  }
  return [...new Set([...versions.filter(isRelease), ...(await cachedPins())])];
}

async function unpackRelease(version) {
  const dir = join(CACHE, version);
  if (await lstat(dir).catch(() => null)) return dir;

  await mkdir(CACHE, { recursive: true });
  const { stdout } = await run('npm', [
    'pack', `${pkg.name}@${version}`,
    '--pack-destination', CACHE,
    // This machine sets min-release-age=7, which would refuse to fetch our own
    // release for a week after publishing it. Packing the previous version is
    // exactly the case that hits: publish 1.0.1, bump to 1.0.2, rebuild, and the
    // pin for 1.0.1 cannot be fetched. It is our own package, so the delay buys
    // nothing here.
    '--min-release-age=0',
    '--json',
  ], { timeout: 60000 });
  const tarball = join(CACHE, JSON.parse(stdout)[0].filename);

  // Unpack into a staging directory and rename it into place. tar is not atomic, so
  // extracting straight into the final path means an interruption leaves a
  // half-unpacked directory that every later build accepts as a complete cached
  // release: the existence check passes, npm pack is skipped, and the missing
  // modules ship under a year-long immutable cache policy. rename is atomic, so the
  // directory either does not exist or is whole.
  const staging = `${dir}.partial`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await run('tar', ['-xzf', tarball, '-C', staging, '--strip-components', '1']);
  await rm(tarball, { force: true });
  await rename(staging, dir);
  return dir;
}

// Where a version's bytes come from. Published means published: the tarball is what
// npm handed out and what the pinned URL already served, so it stays the source even
// while the working tree still carries that version number. Sourcing the current
// version from the tree instead meant every deploy made between publishing 1.0.0 and
// bumping the version rewrote /1.0.0/, an address advertised as immutable for a year,
// so the same URL named two different clients depending on when a browser first
// asked. Only a version that does not exist on the registry yet comes from the tree.
async function sourceFor(version, published) {
  return published.has(version) ? unpackRelease(version) : ROOT;
}

// Clean rebuild, so a file deleted from source disappears from the site instead of
// lingering forever. Scoped to PUBLIC, which is computed from this file's own
// location and never from input.
await rm(PUBLIC, { recursive: true, force: true });
await mkdir(PUBLIC, { recursive: true });

let count = 0;

for (const name of LIBRARY.keys()) {
  if (!(pkg.files || []).includes(name)) {
    throw new Error(`package.json "files" no longer lists ${name}; the library payload is derived from it`);
  }
}

// A prerelease is not a version this site can serve. cmpVersion parses "0-beta.1"
// as NaN, so ordering it is undefined, and rollingHeads compares only the minor: a
// 1.1.0-beta.1 in the working tree would take /v1/ away from the released 1.0.0 and
// hand every rolling document prerelease code. It would also mint /1.1.0-beta.1/
// under a year of immutable, and the exact-version filter drops it from the registry
// list next build, so that supposedly permanent address disappears.
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error(
    `package.json version "${pkg.version}" is not X.Y.Z; clayjs.com serves released versions only`
  );
}

const published = new Set(await publishedPins());
const pins = [...new Set([pkg.version, ...published])].sort(cmpVersion);
const heads = rollingHeads(pins);

for (const version of pins) count += await emitLibrary(await sourceFor(version, published), version);
for (const [major, version] of heads) {
  count += await emitLibrary(await sourceFor(version, published), `v${major}`);
}

// Root-level entries from "files": everything the library payload did not claim.
for (const name of (pkg.files || []).filter((n) => !LIBRARY.has(n))) {
  const abs = resolve(ROOT, name);
  const stat = await lstat(abs).catch(() => null);
  if (!stat) throw new Error(`package.json "files" lists ${name}, which does not exist`);
  if (stat.isSymbolicLink()) throw new Error(`refusing to copy a symlink: ${abs}`);
  if (stat.isDirectory()) {
    for (const rel of await walk(abs)) count += await copyInto(join(abs, rel), join(name, rel));
  } else {
    count += await copyInto(abs, name);
  }
}

for (const [from, to] of RENAMED) {
  const abs = resolve(ROOT, from);
  const stat = await lstat(abs).catch(() => null);
  if (!stat?.isFile()) throw new Error(`renamed source missing: ${from}`);
  count += await copyInto(abs, to);
}

// The site's pages sit at the root of the served directory, not under /website/.
const siteFiles = [];
for (const rel of await walk(WEBSITE)) {
  siteFiles.push(rel);
  count += await copyInto(join(WEBSITE, rel), rel);
}

// The caching and CORS rules are appended to website/_headers rather than written
// there by hand, because they are per version prefix and Cloudflare JOINS duplicate
// headers instead of overriding them. A Cache-Control on /* plus one on a pinned
// prefix sends both values, so the prefixes have to be disjoint, which means every
// path needs naming, which a hand-maintained file would get wrong on the first
// release someone forgot to update.
const blocks = [`
# ---- appended by build.js ----
#
# The rolling prefix gets a short life and deliberately no stale-while-revalidate:
# clay.js imports ~49 module URLs, each with its own freshness clock, and a
# view-mode load fetches a different subset than an edit-mode load, so a stale
# window lets one browser hold half the graph from before a deploy and half from
# after. That fails silently.
#
# A pinned prefix cannot have that problem, because those bytes never change. So it
# gets a year and immutable, which is the entire reason pinning is offered.`];

for (const major of heads.keys()) {
  blocks.push(`/v${major}/*\n  Cache-Control: public, max-age=600`);
  blocks.push(`/v${major}/src/*\n  Access-Control-Allow-Origin: *`);
}
for (const version of pins) {
  blocks.push(`/${version}/*\n  Cache-Control: public, max-age=31536000, immutable`);
  blocks.push(`/${version}/src/*\n  Access-Control-Allow-Origin: *`);
}
// Cloudflare Pages serves an HTML page at its extensionless path and answers the
// .html spelling with a 307, so a rule naming only the file lands on the redirect
// and the page itself carries no Cache-Control at all. Both spellings get the rule,
// which is what the hand-written /my-list block above already does by hand.
function servedPaths(rel) {
  if (!rel.endsWith('.html')) return [`/${rel}`];
  const base = rel.slice(0, -'.html'.length);
  if (base === 'index') return ['/', `/${rel}`];
  return base.endsWith('/index')
    ? [`/${base.slice(0, -'index'.length)}`, `/${rel}`]
    : [`/${base}`, `/${rel}`];
}

// The site's own files, named one by one so no rule overlaps a version prefix.
const siteRules = [...siteFiles.filter((f) => f !== '_headers'), 'llms.txt', 'THIRD-PARTY-NOTICES.md', 'versions.json']
  .sort()
  .flatMap(servedPaths);
for (const path of siteRules) {
  blocks.push(`${path}\n  Cache-Control: public, max-age=600`);
}
const headersPath = join(PUBLIC, '_headers');
const headers = (await readFile(headersPath, 'utf8')).trimEnd() + '\n' + blocks.join('\n\n') + '\n';
await writeFile(headersPath, headers);

// Cloudflare Pages stops at 100 rules and ignores the rest, silently. Each release
// adds two, so this grows on its own and the first symptom would be a pinned prefix
// quietly losing its CORS header long after the release that crossed the line.
const ruleCount = headers.split('\n').filter((line) => line.startsWith('/')).length;
if (ruleCount > 90) {
  throw new Error(
    `_headers has ${ruleCount} rules and Cloudflare ignores everything past 100. ` +
      `Collapse the pinned prefixes into a shared parent (serve pins under /pin/<version>/) ` +
      `so old releases cost one rule instead of two each.`
  );
}

// Assertions, because both test suites can be green while the deploy output is
// broken. _headers earns its own check twice over: without it the site serves no
// Cache-Control and, worse, no Access-Control-Allow-Origin on the module tree,
// which silently breaks every page loading clay.js from another origin.
const required = ['_headers', 'index.html', 'llms.txt', 'THIRD-PARTY-NOTICES.md'];
for (const prefix of [...[...heads.keys()].map((m) => `v${m}`), ...pins]) {
  required.push(`${prefix}/clay.js`, `${prefix}/src/loader.js`, `${prefix}/sap.js`);
}
for (const rel of required) {
  const stat = await lstat(join(PUBLIC, rel)).catch(() => null);
  if (!stat?.isFile()) throw new Error(`build produced no public/${rel}`);
}

// The retired unversioned URL must stay retired. A stray clay.js at the root would
// quietly become the address everyone uses again, and then it can never be removed.
if (await lstat(join(PUBLIC, 'clay.js')).catch(() => null)) {
  throw new Error('public/clay.js exists; the unversioned URL was retired at 1.0');
}

// A manifest so the deployed site can be checked against what was intended.
await writeFile(join(PUBLIC, 'versions.json'), JSON.stringify({
  latest: pkg.version,
  rolling: Object.fromEntries([...heads].map(([major, v]) => [`v${major}`, v])),
  pinned: pins,
}, null, 2) + '\n');

console.log(`built public/: ${count} files · ${[...heads].map(([m, v]) => `v${m} -> ${v}`).join(', ')} · pinned: ${pins.join(', ')}`);
