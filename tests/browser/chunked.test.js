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

// A plugin's boot-time import is a boot stage of its own unless the plan preloads
// it: sortable awaits vendor/Sortable.vendor.js inside its ready, and the loader
// holds clay:ready on that. Every chunk the page fetched before clay:ready has to
// have had a preload link, or the browser fetched it one stage too late.
describe('a plugins=sortable edit page', () => {
  let win;

  before(async () => { win = await open('chunked-sortable-edit.html'); });

  it('fetches no chunk it did not preload', () => {
    const preloaded = new Set(win.preloadsAtReady.map((href) => new URL(href).pathname));
    const chunks = win.fetchedAtReady.filter((path) => path.startsWith('/dist/m/'));
    expect(chunks.length).to.be.above(0);

    expect(chunks.filter((path) => !preloaded.has(path))).to.deep.equal([]);
  });

  it('preloads the sortable vendor and the host metadata', async () => {
    const { runtime } = await fetch('/dist/m/manifest.json').then((response) => response.json());
    const manifest = (await import(`/dist/m/${runtime}`)).default;
    const preloaded = new Set(win.preloadsAtReady.map((href) => new URL(href).pathname));

    expect(preloaded.has(`/dist/m/${manifest.entries['vendor/Sortable.vendor.js']}`)).to.equal(true);
    expect(preloaded.has(`/dist/m/${manifest.entries['core/host-meta.js']}`)).to.equal(true);
  });
});

// One copy means one save pipeline: internals and core share the same
// addDocumentTransform registry, so a transform registered through the satellite
// reaches the bytes clay.getHTML() would write. Two copies of src/core/snapshot.js
// give two registries and the transform never arrives.
function expectOneCopy(win) {
  expect(win.clay.internals).to.exist;
  expect(win.clay.internals.addDocumentTransform).to.equal(win.clay.addDocumentTransform);
  win.clay.internals.addDocumentTransform((clone) => clone.setAttribute('data-internals-transform', '1'));
  expect(win.clay.getHTML()).to.contain('data-internals-transform="1"');
}

const bootedFromTree = (win) =>
  expect(fetched(win).some((path) => path.includes('/src/'))).to.equal(true);

const treeWarnings = (win) =>
  win.__warnings.filter((line) => line.includes('the bundled runtime did not load')).length;

// The runtime manifest is the probe every bootstrap uses to choose between the
// release and the module tree, so a page whose manifest 404s has to make that
// choice once and every script has to follow it.
async function blockManifest() {
  const { runtime } = await fetch('/dist/m/manifest.json').then((response) => response.json());
  const { routed } = await executeServerCommand('chunk-route', { blockFile: `/dist/m/${runtime}` });
  expect(routed).to.equal(true);
}

// A satellite can run before clay.js. The decision must still be made once: the
// satellite chooses the module tree for the page and clay.js follows it, rather
// than the satellite loading src/ while clay.js commits to the chunks.
// The manifest is the probe, so 404ing just that file is a release that cannot be
// chosen; the chunk files behind it are still on the disk and still reachable.
describe('a satellite that runs before clay.js, with no runtime manifest', () => {
  before(async () => { await blockManifest(); });
  after(async () => { await executeServerCommand('chunk-route', {}); });

  it('makes one choice, so the page holds one copy of the save pipeline', async () => {
    const win = await open('chunked-internals-first.html');

    expect(win.clay.__chunked).to.not.equal(true);
    bootedFromTree(win);
    expect(treeWarnings(win)).to.equal(1);
    expectOneCopy(win);
  });
});

// The same page with clay.js first: the second bootstrap finds the choice already
// made and imports its own entry from it.
describe('a satellite that runs after clay.js, with no runtime manifest', () => {
  before(async () => { await blockManifest(); });
  after(async () => { await executeServerCommand('chunk-route', {}); });

  it('makes one choice, so the page holds one copy of the save pipeline', async () => {
    const win = await open('chunked-internals-after.html');

    expect(win.clay.__chunked).to.not.equal(true);
    bootedFromTree(win);
    expect(treeWarnings(win)).to.equal(1);
    expectOneCopy(win);
  });
});

// The same missing manifest, stated as the claim the fix exists for: the page boots
// from src/, and a transform registered through clay.internals shows up in the bytes
// clay.getHTML() writes. Two copies of src/core/snapshot.js keep two registries.
describe('the runtime manifest 404s', () => {
  before(async () => { await blockManifest(); });
  after(async () => { await executeServerCommand('chunk-route', {}); });

  it('boots from src/ and sends the satellite transform into clay.getHTML()', async () => {
    const win = await open('chunked-internals-after.html');

    expect(win.clay.__chunked).to.not.equal(true);
    bootedFromTree(win);
    expect(win.clay.internals.addDocumentTransform).to.equal(win.clay.addDocumentTransform);
    expect(win.clay.internals.captureSnapshot).to.be.a('function');
    win.clay.internals.addDocumentTransform((clone) => clone.setAttribute('data-internals-transform', '1'));
    expect(win.clay.getHTML()).to.contain('data-internals-transform="1"');
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

  it('gives the satellite the same copy core uses', async () => {
    const win = await open('chunked-internals-after.html');

    expect(win.clay.__chunked).to.not.equal(true);
    bootedFromTree(win);
    expectOneCopy(win);
  });
});

// Two releases, built a line apart, served side by side: clay.js from one and
// clay-internals.js from the other. The first bootstrap picks a release and the
// second imports its own entry from that same release, so the modules stay single.
describe('clay.js and a satellite from two releases', () => {
  let win;

  before(async () => {
    const mounts = await executeServerCommand('mixed-release', {});
    expect(mounts).to.deep.equal({ a: '/mixed-a/', b: '/mixed-b/' });
    win = await open('chunked-mixed.html');
  });

  it('serves two distinct releases', async () => {
    const a = await fetch('/mixed-a/m/manifest.json').then((response) => response.json());
    const b = await fetch('/mixed-b/m/manifest.json').then((response) => response.json());
    expect(a.build).to.not.equal(b.build);
  });

  it('boots from the first release, not a second copy', async () => {
    expect(win.clay.__chunked).to.equal(true);
    expect(fetched(win).filter((path) => path.includes('/src/'))).to.deep.equal([]);
    expectOneCopy(win);
  });
});

// Three scripts, one release: each adds the preload links for its own entry when
// its script runs, and skips a link the head already has.
describe('clay.js, clay-dom.js and clay-events.js on one page', () => {
  let win;

  before(async () => { win = await open('chunked-satellites.html'); });

  it('adds no duplicate modulepreload link', () => {
    const hrefs = Array.prototype.map.call(
      win.document.head.querySelectorAll('link[rel="modulepreload"]'),
      (link) => link.href
    );
    expect(hrefs.length).to.be.above(0);
    expect([...new Set(hrefs)].length).to.equal(hrefs.length);
  });

  // clay-events imports its entry only after DOM ready, so a link that is already
  // in the head at DOMContentLoaded was added when the script ran.
  it('preloads the events entry before DOMContentLoaded', async () => {
    const { runtime } = await fetch('/dist/m/manifest.json').then((response) => response.json());
    const manifest = (await import(`/dist/m/${runtime}`)).default;
    const href = new URL(`/dist/m/${manifest.entries['events/index.js']}`, win.location.href).href;

    expect(win.preloadsAtDomReady).to.contain(href);
    await win.clay.loaded.events;
  });
});
