// Rebuild src/vendor/shiki/ from pinned Shiki packages.
//
//   node scripts/build-shiki-vendor.mjs
//
// Syntax colours for the page plugin's code blocks. Shiki's core, its JavaScript
// regex engine (no WASM) and each language are separate ESM chunks, so nothing
// loads until a code block with a language is on screen, and then only the core
// and that language. The one theme is Shiki's CSS variables theme: every colour
// is a --page-code-* variable that the page themes set.
//
// The packages install into a temporary directory, so this never touches
// node_modules. The output is committed, like every other file in src/vendor/,
// because src/ is what npm publishes and what clayjs.com serves.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '4.5.0';
// Keep in step with LANGS in src/page/highlight.js.
const LANGS = ['javascript', 'typescript', 'jsx', 'tsx', 'json', 'html', 'css', 'python', 'shellscript', 'sql', 'go', 'rust', 'java', 'c', 'cpp', 'csharp', 'ruby', 'php', 'yaml', 'markdown', 'diff', 'swift', 'kotlin', 'xml'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'vendor', 'shiki');
const work = await mkdtemp(join(tmpdir(), 'clayjs-shiki-'));

try {
  execFileSync('npm', ['init', '-y'], { cwd: work, stdio: 'ignore' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `@shikijs/core@${VERSION}`, `@shikijs/engine-javascript@${VERSION}`, `@shikijs/langs@${VERSION}`], { cwd: work, stdio: 'inherit' });
  const entry = join(work, 'shiki.vendor.js');
  await writeFile(entry, [
    "import { createBundledHighlighter, createSingletonShorthands, createCssVariablesTheme } from '@shikijs/core';",
    "import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';",
    `const langs = {\n${LANGS.map((l) => `  '${l}': () => import('@shikijs/langs/${l}'),`).join('\n')}\n};`,
    "const page = createCssVariablesTheme({ name: 'page', variablePrefix: '--page-code-', fontStyle: true });",
    "const createHighlighter = createBundledHighlighter({ langs, themes: { page }, engine: () => createJavaScriptRegexEngine({ forgiving: true }) });",
    'export const { codeToTokensBase } = createSingletonShorthands(createHighlighter);',
    '',
  ].join('\n'));
  await rm(OUT, { recursive: true, force: true });
  await build({
    entryPoints: [entry],
    outdir: OUT,
    absWorkingDir: work,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    chunkNames: '[name]-[hash]',
    legalComments: 'none',
    banner: { js: `/* Shiki ${VERSION} (MIT), bundled for clayjs: https://shiki.style — regenerate with node scripts/build-shiki-vendor.mjs */` },
  });
} finally {
  await rm(work, { recursive: true, force: true });
}
console.log(`src/vendor/shiki/ <- Shiki ${VERSION}, ${LANGS.length} languages`);
