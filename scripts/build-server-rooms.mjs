import { build as esbuild } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist/server');
const SOURCE = resolve(ROOT, 'src/server/rooms/index.js');
const BUNDLE = 'rooms.cjs';
const WRAPPER = 'rooms.mjs';

export async function buildServerRooms() {
  await mkdir(DIST, { recursive: true });
  const result = await esbuild({
    entryPoints: [SOURCE],
    outfile: join(DIST, BUNDLE),
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    metafile: true,
    logOverride: { 'commonjs-variable-in-esm': 'silent' },
  });

  const inputs = Object.keys(result.metafile.inputs);
  if (!inputs.some((file) => file.includes('src/server/rooms/'))) {
    throw new Error('the server rooms bundle has no src/server/rooms/ input');
  }
  if (!inputs.some((file) => file.includes('node_modules/cheerio/'))) {
    throw new Error('the server rooms bundle has no cheerio input; the parser must be bundled, not required');
  }
  if (!inputs.some((file) => file.includes('node_modules/hyper-morph/') && file.includes('json-parse'))) {
    throw new Error('the server rooms bundle has no hyper-morph parser input; the parser must be bundled, not required');
  }

  const source = await import(pathToFileURL(SOURCE).href);
  const names = Object.keys(source).filter((name) => name !== 'default').sort();
  const wrapper = `import rooms from './${BUNDLE}';\nexport default rooms;\nexport const {\n${names.map((name) => `  ${name},`).join('\n')}\n} = rooms;\n`;
  await writeFile(join(DIST, WRAPPER), wrapper);

  return { inputs: inputs.length, names: names.length };
}
