// Rebuild src/vendor/yjs.vendor.js from the installed yjs and lib0 packages.
//
//   node scripts/build-yjs-vendor.mjs
//
// The page's collaborative text. One ESM bundle so yjs is a single copy: two
// copies break its instanceof checks and print "Yjs was already imported".
//
// Committed, like every other file in src/vendor/, because src/ is what npm
// publishes and what clayjs.com serves.
import { build } from 'esbuild';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['yjs', 'lib0'];
const ENTRY = join(ROOT, 'scripts', '.yjs-entry.js');
const OUT = join(ROOT, 'src', 'vendor', 'yjs.vendor.js');

const versions = [];
for (const name of PACKAGES) {
  const { version } = JSON.parse(await readFile(join(ROOT, `node_modules/${name}/package.json`), 'utf8'));
  versions.push(`${name} ${version}`);
}

await writeFile(ENTRY, "export * from 'yjs';\nexport { toBase64, fromBase64 } from 'lib0/buffer';\n");
try {
  await build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    banner: {
      js: `/* Yjs (MIT) and lib0 (MIT), bundled for clayjs: ${versions.join(', ')}.\n` +
        `   https://github.com/yjs/yjs, regenerate with node scripts/build-yjs-vendor.mjs */`,
    },
  });
} finally {
  await rm(ENTRY, { force: true });
}
console.log(`src/vendor/yjs.vendor.js <- ${versions.join(', ')}`);
