import { build as esbuild } from 'esbuild';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = resolve(ROOT, 'src/server/offline-runtime/index.js');

// Two bundles, no shared core: these are pure functions that hold no state, so a
// process that imports and requires this entry twice shares nothing by accident.
export async function buildServerOfflineRuntime(outdir) {
  const inputs = new Set();
  for (const [format, file] of [['cjs', 'offline-runtime.cjs'], ['esm', 'offline-runtime.mjs']]) {
    const result = await esbuild({
      entryPoints: [ENTRY],
      outfile: join(outdir, file),
      absWorkingDir: ROOT,
      bundle: true,
      platform: 'node',
      format,
      target: 'node20',
      metafile: true,
      logOverride: { 'commonjs-variable-in-esm': 'silent' },
    });
    for (const input of Object.keys(result.metafile.inputs)) inputs.add(input);
  }
  if (![...inputs].some((file) => file.includes('src/server/offline-runtime/'))) {
    throw new Error('the server offline-runtime bundle has no src/server/offline-runtime/ input');
  }
  return { inputs: inputs.size, names: 2 };
}
