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

let built = null;

export function buildServerCore() {
  built ??= (async () => {
    await mkdir(DIST, { recursive: true });
    const result = await esbuild({
      stdin: {
        contents: Object.entries(ENTRIES).map(([name, file]) => `export * as ${name} from ${JSON.stringify(file)};`).join('\n'),
        resolveDir: ROOT,
        sourcefile: 'server-core.js',
      },
      outfile: join(DIST, CORE),
      absWorkingDir: ROOT,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      metafile: true,
      logOverride: { 'commonjs-variable-in-esm': 'silent' },
    });
    return Object.keys(result.metafile.inputs);
  })();
  return built;
}

// The entry `name` re-exports its half of the core: `<name>.cjs` for require and
// `<name>.mjs` for import, both the same module instance.
export async function writeServerEntry(name) {
  const source = await import(pathToFileURL(ENTRIES[name]).href);
  const names = Object.keys(source).filter((key) => key !== 'default').sort();
  await writeFile(join(DIST, `${name}.cjs`), `module.exports = require('./${CORE}').${name};\n`);
  await writeFile(join(DIST, `${name}.mjs`),
    `import ${name} from './${name}.cjs';\nexport default ${name};\nexport const {\n${names.map((key) => `  ${key},`).join('\n')}\n} = ${name};\n`);
  return names;
}
