import { build as esbuild } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist/server');
const SOURCE = resolve(ROOT, 'src/server/checkpoint/index.js');

export async function buildServerCheckpoint() {
  await mkdir(DIST, { recursive: true });
  const result = await esbuild({
    entryPoints: [SOURCE],
    outfile: join(DIST, 'checkpoint.cjs'),
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    metafile: true,
    logOverride: { 'commonjs-variable-in-esm': 'silent' },
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (!inputs.some((file) => file.includes('src/server/checkpoint/')) ||
    !inputs.some((file) => file.includes('src/page/ybind/decode.js')) ||
    !inputs.some((file) => file.includes('src/page/projection.js'))) {
    throw new Error('the server checkpoint bundle is missing its checkpoint, decoder or projection source');
  }
  const source = await import(pathToFileURL(SOURCE).href);
  const names = Object.keys(source).filter((name) => name !== 'default').sort();
  const wrapper = `import checkpoint from './checkpoint.cjs';\nexport default checkpoint;\nexport const {\n${names.map((name) => `  ${name},`).join('\n')}\n} = checkpoint;\n`;
  await writeFile(join(DIST, 'checkpoint.mjs'), wrapper);
  return { inputs: inputs.length, names: names.length };
}
