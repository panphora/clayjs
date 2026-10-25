// Rebuild the optional libraries a document loads by name from clay.assets.
//
//   node scripts/vendor-optional.mjs          (npm run vendor:optional)
//   node scripts/vendor-optional.mjs --check  (npm run check:vendor-optional)
//
// OverType, marked and highlight.js are never in a page's boot graph: a document asks
// for one by name (src/lib/assets.js) and gets the module built here, from this
// release. Each file re-exports only what a document uses, and highlight.js is split
// so a fence's language is a download of its own.
//
// Committed, like every other file in src/vendor/, because src/ is what npm publishes
// and what clayjs.com serves. Never edit them by hand.
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'vendor');
const LICENSES = 'LICENSES-optional.md';

const HIGHLIGHT = 'https://github.com/highlightjs/highlight.js';
const HIGHLIGHT_LANGUAGES = ['bash', 'css', 'javascript', 'json', 'python', 'xml'];

export const ASSETS = [
  {
    file: 'overtype.vendor.js',
    source: "export { default, toolbarButtons } from 'overtype';",
    package: 'overtype',
  },
  {
    file: 'marked.vendor.js',
    source: "export { Marked } from 'marked';",
    package: 'marked',
  },
  {
    file: 'highlight.vendor.js',
    source: "export { default } from 'highlight.js/lib/core';",
    package: 'highlight.js',
  },
  ...HIGHLIGHT_LANGUAGES.map((name) => ({
    file: `hljs-${name}.vendor.js`,
    source: `export { default } from 'highlight.js/lib/languages/${name}';`,
    package: 'highlight.js',
  })),
];

// Every package whose code ends up inside those files, so its license ships beside
// them: overtype bundles the floating-ui pair (and its utils) and markdown-actions.
export const PACKAGES = [
  { name: 'overtype', url: 'https://github.com/panphora/overtype' },
  { name: 'marked', url: 'https://github.com/markedjs/marked' },
  { name: 'highlight.js', url: HIGHLIGHT },
  { name: '@floating-ui/dom', url: 'https://github.com/floating-ui/floating-ui' },
  { name: '@floating-ui/core', url: 'https://github.com/floating-ui/floating-ui' },
  { name: '@floating-ui/utils', url: 'https://github.com/floating-ui/floating-ui' },
  { name: 'markdown-actions', url: 'https://github.com/panphora/markdown-actions' },
];

async function versionsOf() {
  const versions = {};
  for (const { name, url } of PACKAGES) {
    const manifest = JSON.parse(await readFile(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
    versions[name] = { version: manifest.version, license: manifest.license, url };
  }
  return versions;
}

async function licensesText(versions) {
  const parts = [
    '# Optional library licenses',
    '',
    'These files are ES modules built from the exact devDependencies in package.json by',
    '`scripts/vendor-optional.mjs`: OverType, marked and highlight.js (its core and one',
    'file per grammar). A document loads them by name through `clay.assets.load(name)`;',
    'none of them is in a page\u2019s boot graph. Regenerate them with `npm run',
    'vendor:optional`. clayjs\u2019s own code is MIT-0 (see LICENSE).',
    '',
  ];
  for (const { name } of PACKAGES) {
    const { version, license, url } = versions[name];
    const files = ASSETS.filter((asset) => asset.package === name).map((asset) => `src/vendor/${asset.file}`);
    parts.push('---', '', `## ${name} ${version} (${license})`, '');
    for (const file of files) parts.push(`- ${file}`);
    parts.push(`- ${url}`, '');
    const text = await readFile(join(ROOT, 'node_modules', name, 'LICENSE'), 'utf8');
    parts.push(text.trimEnd(), '');
  }
  return `${parts.join('\n')}\n`;
}

function banner(asset, versions) {
  const { version } = versions[asset.package];
  return `/* ${asset.package} ${version}, bundled for clayjs: regenerate with npm run vendor:optional */`;
}

async function buildAssets(outdir, versions) {
  await mkdir(outdir, { recursive: true });
  for (const asset of ASSETS) {
    await build({
      stdin: { contents: `${asset.source}\n`, resolveDir: ROOT, sourcefile: asset.file.replace(/\.vendor\.js$/, '.entry.js') },
      outfile: join(outdir, asset.file),
      bundle: true,
      format: 'esm',
      minify: true,
      legalComments: 'none',
      target: 'es2020',
      banner: { js: banner(asset, versions) },
      logLevel: 'silent',
    });
  }
  await writeFile(join(outdir, LICENSES), await licensesText(versions));
  return [...ASSETS.map((asset) => asset.file), LICENSES];
}

export async function vendorOptional({ outdir = OUT_DIR } = {}) {
  return buildAssets(outdir, await versionsOf());
}

async function check() {
  const outdir = await mkdtemp(join(tmpdir(), 'clayjs-vendor-optional-'));
  try {
    const names = await vendorOptional({ outdir });
    const stale = [];
    for (const name of names) {
      const built = await readFile(join(outdir, name));
      const current = await readFile(join(OUT_DIR, name)).catch(() => null);
      if (!current || !built.equals(current)) stale.push(name);
    }
    if (stale.length) {
      for (const name of stale) console.error(`Stale: src/vendor/${name} (run npm run vendor:optional)`);
      process.exitCode = 1;
      return;
    }
    console.log(`In sync: ${names.length} optional vendor files (src/vendor/${LICENSES} included)`);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) await check();
  else {
    const names = await vendorOptional();
    for (const name of names) console.log(`src/vendor/${name}`);
  }
}
