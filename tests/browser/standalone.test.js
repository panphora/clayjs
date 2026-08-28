import { expect } from '@esm-bundle/chai';

const FIXTURES = '/tests/browser/fixtures/';
const BUNDLE = '/dist/clay.standalone.js';

const SATELLITES = ['dom', 'utils', 'internals', 'all', 'ui', 'options', 'events', 'data', 'sap'];

async function open(name, query = '') {
  const iframe = document.createElement('iframe');
  iframe.src = FIXTURES + name + query;
  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    document.body.appendChild(iframe);
  });
  const win = iframe.contentWindow;
  await win.clay.ready;
  return win;
}

// Every script the page fetched, by path. Resource timing also lists the
// EventSource that sync and wire open against this origin; those are not code,
// so they are filtered out here and covered by the origin check instead. The
// test runner's dev server injects its own reload socket script into every
// HTML file it serves, fixtures included; that is the harness, not the page.
function scripts(win) {
  return win.performance.getEntriesByType('resource')
    .map((e) => new URL(e.name))
    .filter((u) => u.pathname.endsWith('.js') && !u.pathname.startsWith('/__web-dev-server__'))
    .map((u) => u.pathname);
}

function foreign(win) {
  return win.performance.getEntriesByType('resource')
    .map((e) => new URL(e.name))
    .filter((u) => u.origin !== win.location.origin)
    .map((u) => u.href);
}

describe('clay.standalone.js in edit mode', () => {
  let win;
  before(async () => { win = await open('standalone-edit.html'); });

  it('is the only script the page fetched, and nothing left the origin', () => {
    expect(scripts(win)).to.deep.equal([BUNDLE]);
    expect(foreign(win)).to.deep.equal([]);
  });

  it('boots the core and the requested plugins', () => {
    const clay = win.clay;
    expect(clay.isEditMode).to.equal(true);
    for (const member of ['save', 'getHTML', 'toggleEditMode', 'Mutation', 'RichClay', 'morph', 'undo', 'wire']) {
      expect(clay[member], `clay.${member}`).to.exist;
    }
  });

  it('wires [sortable] from the bundled vendor', () => {
    const list = win.document.querySelector('[sortable]');
    // Sortable stamps its instance on the element under a "Sortable<time>" key.
    expect(Object.keys(list).some((k) => k.startsWith('Sortable'))).to.equal(true);
  });

  it('carries every satellite', async () => {
    const clay = win.clay;
    for (const name of SATELLITES) await clay.loaded[name];
    expect(clay.utils).to.be.an('object');
    expect(clay.internals).to.be.an('object');
    expect(win.All).to.be.a('function');
    expect(clay.All).to.equal(win.All);
    expect(clay.extractData).to.be.a('function');
    expect(clay.applyData).to.be.a('function');
    expect(clay.Sap).to.exist;
    expect(win.Sap).to.exist;
    expect(scripts(win)).to.deep.equal([BUNDLE]);
    expect(foreign(win)).to.deep.equal([]);
  });
});

describe('clay.standalone.js in view mode', () => {
  let win;
  before(async () => { win = await open('standalone-view.html', '?editmode=false'); });

  it('honours ?editmode=false on the page URL over window.clayEditMode, and loads no edit-only module', () => {
    const clay = win.clay;
    expect(clay.isEditMode).to.equal(false);
    expect(clay.toggleEditMode).to.be.a('function');
    expect(clay.Mutation).to.exist;
    expect(clay.morph, 'sync is not editOnly').to.exist;
    expect(clay.save).to.equal(undefined);
    expect(clay.getHTML).to.equal(undefined);
    expect(clay.RichClay).to.equal(undefined);
    expect(scripts(win)).to.deep.equal([BUNDLE]);
  });
});

describe('the standalone build and clay.js', () => {
  it('snapshot the same document to the same bytes', async () => {
    // The standalone build carries every satellite, so its twin is clay.js plus
    // the nine satellite tags. The fixtures differ only in those script tags.
    const [standalone, entries] = await Promise.all([
      open('standalone-edit.html'),
      open('entries-edit.html'),
    ]);
    for (const win of [standalone, entries]) {
      for (const name of SATELLITES) await win.clay.loaded[name];
    }
    const strip = (html) => html.replace(/[ \t]*<script src="[^"]*"><\/script>\n?/g, '');
    expect(strip(standalone.clay.getHTML())).to.equal(strip(entries.clay.getHTML()));
  });
});
