// Rebuild src/vendor/pierre/ from a pinned @pierre/highlights.
//
//   node scripts/build-pierre-vendor.mjs
//
// Syntax colours for the page plugin's code blocks. One WebAssembly lexer covers
// every language, inlined as base64 so the module needs no second request and the
// standalone build stays one file. Only codeToTokens is kept: Pierre's bundled
// themes are left out, because the page themes set the colours as CSS variables.
//
// The package installs into a temporary directory, so this never touches
// node_modules. The output is committed, like every other file in src/vendor/,
// because src/ is what npm publishes and what clayjs.com serves.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.2.0';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'vendor', 'pierre');
const work = await mkdtemp(join(tmpdir(), 'clayjs-pierre-'));

try {
  execFileSync('npm', ['init', '-y'], { cwd: work, stdio: 'ignore' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `@pierre/highlights@${VERSION}`], { cwd: work, stdio: 'inherit' });
  const entry = join(work, 'pierre.vendor.js');
  await writeFile(entry, "export { codeToTokens } from '@pierre/highlights';\n");
  await rm(OUT, { recursive: true, force: true });
  await build({
    entryPoints: [entry],
    outfile: join(OUT, 'pierre.vendor.js'),
    absWorkingDir: work,
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    banner: { js: `/* Highlights from Pierre ${VERSION} (Apache-2.0), bundled for clayjs: https://github.com/pierrecomputer/pierre/tree/main/packages/highlights — regenerate with node scripts/build-pierre-vendor.mjs */` },
  });
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log(`src/vendor/pierre/ <- @pierre/highlights ${VERSION}`);
