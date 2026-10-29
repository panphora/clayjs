import { build as esbuild } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = resolve(ROOT, 'dist/server');
export const CORE = 'core.cjs';

// Both server entries live in one bundle. Built apart, each inlined its own Yjs, its
// own ybind and checkpoint's own copy of rooms, so a process that loaded both ran Yjs
// twice ("Yjs was already imported") and held two of every class they share.
const ENTRIES = {
  rooms: resolve(ROOT, 'src/server/rooms/index.js'),
  checkpoint: resolve(ROOT, 'src/server/checkpoint/index.js'),
};

// The compactor hands a job to a worker_threads worker, so that worker is its own
// realm with its own Yjs. It is emitted beside the core, and the core bundle is told
// the sibling's name: `createPageCompactor` resolves it against the directory of the
// running module, which is __dirname in the cjs bundle and import.meta.url in source.
export const COMPACTION_WORKER = 'page-compaction-worker.cjs';
export const COMPACTION_WORKER_ENTRY = resolve(ROOT, 'src/server/rooms/page-compaction-worker.js');

let built = null;

export function buildServerCore(outdir = DIST) {
  built ??= (async () => {
    await mkdir(outdir, { recursive: true });
    const result = await esbuild({
      stdin: {
        contents: Object.entries(ENTRIES).map(([name, file]) => `export * as ${name} from ${JSON.stringify(file)};`).join('\n'),
        resolveDir: ROOT,
        sourcefile: 'server-core.js',
      },
      outfile: join(outdir, CORE),
      absWorkingDir: ROOT,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      metafile: true,
      logOverride: { 'commonjs-variable-in-esm': 'silent', 'empty-import-meta': 'silent' },
      define: { __PAGE_COMPACTION_WORKER__: JSON.stringify(`./${COMPACTION_WORKER}`) },
    });
    return Object.keys(result.metafile.inputs);
  })();
  return built;
}

export async function buildPageCompactionWorker(outdir = DIST) {
  await mkdir(outdir, { recursive: true });
  const result = await esbuild({
    entryPoints: [COMPACTION_WORKER_ENTRY],
    outfile: join(outdir, COMPACTION_WORKER),
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    metafile: true,
    logOverride: { 'commonjs-variable-in-esm': 'silent' },
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (!inputs.some((file) => file.includes('src/live/page-compaction.js'))) {
    throw new Error('the page compaction worker bundle has no page-compaction input');
  }
  return inputs;
}

// The entry `name` re-exports its half of the core: `<name>.cjs` for require and
// `<name>.mjs` for import, both the same module instance.
export async function writeServerEntry(name, outdir = DIST) {
  const source = await import(pathToFileURL(ENTRIES[name]).href);
  const names = Object.keys(source).filter((key) => key !== 'default').sort();
  await writeFile(join(outdir, `${name}.cjs`), `module.exports = require('./${CORE}').${name};\n`);
  await writeFile(join(outdir, `${name}.mjs`),
    `import ${name} from './${name}.cjs';\nexport default ${name};\nexport const {\n${names.map((key) => `  ${key},`).join('\n')}\n} = ${name};\n`);
  return names;
}
