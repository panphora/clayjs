// Rebuild src/vendor/prosemirror.vendor.js from the installed ProseMirror packages.
//
//   node scripts/build-prosemirror-vendor.mjs
//
// The page plugin's editor. One ESM bundle so prosemirror-model is a single copy:
// two copies of it make every node from one fail the other's instanceof checks.
// Each package is a namespace export, because their flat export lists overlap.
//
// Committed, like every other file in src/vendor/, because src/ is what npm
// publishes and what clayjs.com serves.
import { build } from 'esbuild';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['model', 'state', 'view', 'transform', 'history', 'keymap', 'commands', 'inputrules', 'dropcursor', 'gapcursor'];
const ENTRY = join(ROOT, 'scripts', '.prosemirror-entry.js');
const OUT = join(ROOT, 'src', 'vendor', 'prosemirror.vendor.js');

const versions = [];
for (const name of PACKAGES) {
  const { version } = JSON.parse(await readFile(join(ROOT, `node_modules/prosemirror-${name}/package.json`), 'utf8'));
  versions.push(`${name} ${version}`);
}

await writeFile(ENTRY, PACKAGES.map((name) => `export * as ${name} from 'prosemirror-${name}';\n`).join(''));
try {
  await build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    banner: {
      js: `/* ProseMirror (MIT), bundled for clayjs: ${versions.join(', ')}.\n` +
        `   https://prosemirror.net — regenerate with node scripts/build-prosemirror-vendor.mjs */`,
    },
  });
} finally {
  await rm(ENTRY, { force: true });
}
console.log(`src/vendor/prosemirror.vendor.js <- ${versions.join(', ')}`);
