import { buildServerCore, writeServerEntry } from './build-server-core.mjs';

export async function buildServerCheckpoint() {
  const inputs = await buildServerCore();
  if (!inputs.some((file) => file.includes('src/server/checkpoint/')) ||
    !inputs.some((file) => file.includes('src/page/ybind/decode.js')) ||
    !inputs.some((file) => file.includes('src/page/projection.js'))) {
    throw new Error('the server checkpoint bundle is missing its checkpoint, decoder or projection source');
  }
  const names = await writeServerEntry('checkpoint');
  return { inputs: inputs.length, names: names.length };
}
