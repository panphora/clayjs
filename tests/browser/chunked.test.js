import { expect } from '@esm-bundle/chai';
import { executeServerCommand, sendKeys } from '@web/test-runner-commands';
import { resolveModules } from '../../src/loader-logic.js';

/**
 * The chunked release in a real browser: `dist/clay.js` inlines the loader's
 * file, the runtime manifest's file and the boot prefix, the loader preloads the
 * rest of its plan in one round trip, and every module exists once under one
 * URL. A module that ran twice would split save and sync state, which no unit
 * test can see because jsdom loads each file from a path, not from a chunk.
 *
 * `dist/clay.js` and `dist/m/` are built first (`npm run test:standalone`).
 * Run: npx web-test-runner --config tests/browser/wtr.config.mjs
 */

const FIXTURES = '/tests/browser/fixtures/';

async function open(name) {
  const iframe = document.createElement('iframe');
  iframe.src = FIXTURES + name;
  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    document.body.appendChild(iframe);
  });
  const win = iframe.contentWindow;
  await win.clay.ready;
  return win;
}

// Every resource the page fetched, by path. The test runner's dev server injects
// its own reload socket script into each HTML file, fixtures included: that is
// the harness, not the page.
const fetched = (win) =>
  win.performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => !path.startsWith('/__web-dev-server__'));

// Every file the loader's plan will import, as the built manifest names it:
// the logical paths resolveModules picks, each one's static imports included.
async function planClosure(isEditMode) {
  const { runtime } = await fetch('/dist/m/manifest.json').then((response) => response.json());
  const manifest = (await import(`/dist/m/${runtime}`)).default;
  const plan = resolveModules(new URLSearchParams('plugins=page'), isEditMode, { isDraftMode: false, hasSap: false });
  const want = new Set();
  const add = (file) => {
    if (!file || want.has(file)) return;
    want.add(file);
    for (const dep of manifest.imports?.[file] ?? []) add(dep);
  };
  for (const path of [...plan.core, ...plan.plugins]) add(manifest.entries[path]);
  return [...want];
}

async function expectWholePlanPreloaded(win, isEditMode) {
  const closure = await planClosure(isEditMode);
  expect(closure.length).to.be.above(0);
  const preloaded = new Set(win.preloadsAtReady.map((href) => new URL(href).pathname));
  const missing = closure.filter((file) => !preloaded.has(`/dist/m/${file}`));
  expect(missing).to.deep.equal([]);
}

function expectEachModuleOnce(win) {
  const chunks = fetched(win).filter((path) => path.startsWith('/dist/m/'));
  expect(chunks.length).to.be.above(0);
  expect([...new Set(chunks)].length).to.equal(chunks.length);
  // Nothing from /src/ either: one module under two URLs is two copies of save
  // and of the page's state.
  expect(fetched(win).filter((path) => path.includes('/src/'))).to.deep.equal([]);
}

describe('the chunked release in view mode', () => {
  let win;
  before(async () => { win = await open('chunked-view.html'); });

  it('boots from the chunks, not the module tree', () => {
    expect(win.clay.__chunked).to.equal(true);
    expect(win.clay.toggleEditMode).to.be.a('function');
  });

  it('preloads every file of its plan before clay:ready', async () => {
    await expectWholePlanPreloaded(win, false);
  });

  it('runs every module once', () => {
    expectEachModuleOnce(win);
  });
});

describe('the chunked release in edit mode', () => {
  let win;
  const bodies = [];
  before(async () => {
    win = await open('chunked-edit.html');
    win.fetch = async (url, init) => {
      if (init && init.method === 'POST') {
        bodies.push(String(init.body));
        return new win.Response(JSON.stringify({ msg: 'Saved' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return fetch(url, init);
    };
  });

  it('resolves clay.ready and page.ready', async () => {
    expect(win.clay.__chunked).to.equal(true);
    expect(win.clay.page).to.exist;
    await win.clay.page.ready;
  });

  it('preloads every file of its plan before clay:ready', async () => {
    await expectWholePlanPreloaded(win, true);
  });

  it('runs every module once', () => {
    expectEachModuleOnce(win);
  });

  it('takes typing into the editor and saves it', async () => {
    const editor = win.document.querySelector('p[contenteditable]');
    win.focus();
    editor.focus();
    await sendKeys({ type: ' And more.' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(editor.textContent).to.contain('And more.');

    await win.clay.save.force();
    expect(bodies.at(-1)).to.contain('And more.');
  });
});

// The fallback covers a chunk directory that cannot be reached at all: the
// bootstrap warns and imports the module tree from /src/, so a bad release
// degrades to the loader every document had before chunks.
describe('an unreachable dist/m', () => {
  before(async () => {
    const { routed } = await executeServerCommand('chunk-route', { block: true });
    expect(routed).to.equal(true);
  });

  after(async () => {
    await executeServerCommand('chunk-route', { block: false });
  });

  it('boots from /src/ and says so', async () => {
    const win = await open('chunked-view.html');

    expect(win.clay.__chunked).to.not.equal(true);
    expect(win.clay.toggleEditMode).to.be.a('function');
    expect(fetched(win).some((path) => path.includes('/src/'))).to.equal(true);
    expect(win.__warnings.some((line) => line.includes('the bundled runtime did not load'))).to.equal(true);
  });
});
