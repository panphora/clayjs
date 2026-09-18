// Rebuild src/vendor/parse5.vendor.js from the installed parse5.
//
//   node scripts/build-parse5-vendor.mjs
//
// The source map needs a spec-conformant parse with byte offsets, and no browser
// exposes one: DOMParser gives the same tree with no offsets, and every small HTML
// parser gets implied tags, foster parenting or raw-text elements wrong somewhere,
// which is exactly where a pairing has to be right. So parse5 is vendored.
//
// Only `parse` is exported. parse5's serializer is deliberately left out: this
// library never serializes a parse5 tree, and shipping a second serializer beside
// the one whose output we are trying to stop writing would invite somebody to use
// it. Dropping it is also about a fifth of the bytes.
//
// Committed, like every other file in src/vendor/, because src/ is what npm
// publishes and what clayjs.com serves.
import { build } from 'esbuild';
import { writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Read the manifest by path: parse5's "exports" map does not expose ./package.json.
const { version, license } = JSON.parse(await readFile(join(ROOT, 'node_modules/parse5/package.json'), 'utf8'));
const ENTRY = join(ROOT, 'scripts', '.parse5-entry.js');
const OUT = join(ROOT, 'src', 'vendor', 'parse5.vendor.js');

await writeFile(ENTRY, "export { parse } from 'parse5';\n");
try {
  await build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    banner: {
      js: `/* parse5 ${version} (${license}), bundled for clayjs: the \`parse\` export only.\n` +
        `   https://github.com/inikulin/parse5 — regenerate with node scripts/build-parse5-vendor.mjs */`,
    },
  });
} finally {
  await rm(ENTRY, { force: true });
}
console.log(`src/vendor/parse5.vendor.js <- parse5 ${version}`);
