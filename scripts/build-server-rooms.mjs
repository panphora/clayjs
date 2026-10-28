import { buildServerCore, buildPageCompactionWorker, writeServerEntry } from './build-server-core.mjs';

export async function buildServerRooms(outdir) {
  const inputs = await buildServerCore(outdir);
  if (!inputs.some((file) => file.includes('src/server/rooms/'))) {
    throw new Error('the server rooms bundle has no src/server/rooms/ input');
  }
  if (!inputs.some((file) => file.includes('node_modules/cheerio/'))) {
    throw new Error('the server rooms bundle has no cheerio input; the parser must be bundled, not required');
  }
  if (!inputs.some((file) => file.includes('node_modules/hyper-morph/') && file.includes('json-parse'))) {
    throw new Error('the server rooms bundle has no hyper-morph parser input; the parser must be bundled, not required');
  }
  const names = await writeServerEntry('rooms', outdir);
  const worker = await buildPageCompactionWorker(outdir);
  return { inputs: inputs.length, names: names.length, worker: worker.length };
}
