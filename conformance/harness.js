import { readFile } from '@web/test-runner-commands';
import { setups } from './setups.js';
import { SNAPSHOT_MODULE, FIXTURES_DIR, modulesFor } from './config.js';

let manifestCache;
async function getEntry(name) {
  if (!manifestCache) {
    manifestCache = JSON.parse(await readFile({ path: `${FIXTURES_DIR}/manifest.json` }));
  }
  return manifestCache.fixtures.find((f) => f.name === name) || { name };
}

function makeHiddenIframe() {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;border:0;';
  return iframe;
}

// Import the client's snapshot module in the iframe realm so its `document` binds
// to the fixture, plus any extra client modules the fixture declares. A fixture
// that exercises form state loads the client's REAL persistence module
// (enablePersistentFormInputValues.js), which auto-registers its onSnapshot hook
// on import into the same snapshot instance — so the harness tests real client
// code, not a reimplemented hook.
async function loadClient(win, modules = []) {
  win.__hyperclayNoAutoExport = true;
  const client = await win.eval(`import(${JSON.stringify(SNAPSHOT_MODULE)})`);
  for (const mod of modules) {
    await win.eval(`import(${JSON.stringify(mod)})`);
  }
  return client;
}

async function withDocument(html, fn, { modules = [] } = {}) {
  const iframe = makeHiddenIframe();
  await new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
    iframe.addEventListener('error', () => reject(new Error('iframe failed to load')), { once: true });
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
  const win = iframe.contentWindow;
  try {
    const client = await loadClient(win, modules);
    return await fn({ win, doc: win.document, client });
  } finally {
    iframe.remove();
  }
}

// Read input.html straight off disk via the file command. This bypasses the
// @web/dev-server HTML transform, which injects a live-reload script into every
// .html it serves; fetching through the server and stripping that injection was
// byte-lossy (it consumed a real fixture newline), so the client parses the exact
// file bytes instead.
async function readInput(name) {
  const raw = await readFile({ path: `${FIXTURES_DIR}/${name}/input.html` });
  if (typeof raw !== 'string') throw new Error(`could not read input for fixture "${name}"`);
  return raw;
}

export async function withFixture(name, fn) {
  const entry = await getEntry(name);
  const input = await readInput(name);
  return withDocument(
    input,
    async (ctx) => {
      const setup = setups[name];
      if (setup) setup(ctx.doc, ctx.client);
      return fn(ctx);
    },
    { modules: modulesFor(entry) },
  );
}

export function capture(client) {
  const snapshotEl = client.captureSnapshot();
  return {
    snapshot: '<!DOCTYPE html>' + snapshotEl.outerHTML,
    document: client.captureForSave({ emitForSync: false }),
  };
}

export async function runFixture(name) {
  return withFixture(name, ({ client }) => capture(client));
}

export async function reserialize(documentBytes) {
  return withDocument(documentBytes, ({ client }) =>
    client.captureForSave({ emitForSync: false }),
  );
}
