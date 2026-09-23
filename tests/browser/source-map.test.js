import { expect } from '@esm-bundle/chai';

/**
 * The source map in a real browser.
 *
 * This suite exists because the jsdom tests cannot prove the thing the whole
 * mechanism rests on. Pairing a live DOM to byte ranges assumes the browser's parse
 * tree and parse5's parse tree are the same tree, node for node, including every
 * implied tag and every whitespace node the parser relocates. jsdom IS parse5, so a
 * jsdom test compares parse5 against itself and agrees by construction. Only a real
 * browser can disagree.
 *
 * The fixture is written to make disagreement likely if it exists: single-quoted and
 * unquoted attributes, a bare ampersand, whitespace between inline elements both as a
 * space and as a wrapped newline, a <pre> whose first character is a newline, a
 * <template>, inline SVG with camelCase names, and a <script> containing `<` and `&`.
 *
 * The fallback path is NOT retested here. It is render, then verify, then hand back
 * today's bytes, and none of those three steps is browser-specific; the jsdom suite
 * drives it end to end, including the event and the counter. Repeating it here would
 * have meant exporting a test-only handle from the shipping library, which is a worse
 * trade than the coverage is worth.
 */

const FIXTURE = '/tests/browser/fixtures/source-edit.html';

let win;
let served;

async function open(url) {
  const iframe = document.createElement('iframe');
  iframe.src = url;
  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    document.body.appendChild(iframe);
  });
  await iframe.contentWindow.clay.ready;
  await iframe.contentWindow.clay.source.ready;
  return iframe.contentWindow;
}

describe('the source map, against a real browser parse', () => {
  before(async () => {
    win = await open(FIXTURE);
    // The bytes the page was served, which is what a save has to give back. Not the
    // bytes on disk: the test runner's dev server injects its own reload script into
    // every HTML file it serves, and that injection is part of the served document.
    served = await (await fetch(FIXTURE, { cache: 'no-store' })).text();
  });

  it('installed and paired the whole document', () => {
    const stats = win.clay.source.stats();
    expect(stats.installed, stats.refused || 'refused').to.equal(true);
    expect(stats.paired).to.be.greaterThan(30);
    expect(stats.unmatchedLive, JSON.stringify(win.clay.source.unpaired())).to.equal(0);
    expect(stats.unmatchedSource, JSON.stringify(win.clay.source.unpaired())).to.equal(0);
    expect(stats.unresolved).to.equal(0);   // every clone node traced back to a live one
  });

  it('holds the bytes the page was served', () => {
    expect(win.clay.source.text()).to.equal(served);
  });

  it('the page really is in edit mode, with the inert attributes activated', () => {
    // Otherwise the next test would be proving that an untouched document round trips,
    // which is a much weaker claim than the one being made.
    expect(win.clay.isEditMode).to.equal(true);
    const h1 = win.document.querySelector('h1');
    expect(h1.getAttribute('contenteditable')).to.equal('true');
    expect(h1.hasAttribute('inert-contenteditable')).to.equal(false);
  });

  it('a no-edit save gives the file back, byte for byte', () => {
    expect(win.clay.getHTML()).to.equal(served);
  });

  it('and it did not have to fall back to do it', async () => {
    // Reprints are counted when the host accepts a save, not when a render runs, so
    // this has to be a save the host takes. A getHTML() alone counts nothing.
    const before = win.clay.source.stats();
    const realFetch = win.fetch;
    const sent = [];
    win.fetch = async (url, init) => {
      if (init && init.method === 'POST') {
        sent.push(String(init.body));
        return new win.Response(JSON.stringify({ msg: 'Saved' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url, init);
    };
    try {
      await win.clay.save.force();
    } finally {
      win.fetch = realFetch;
    }
    const after = win.clay.source.stats();
    expect(sent).to.deep.equal([served]);
    expect(after.saves).to.equal(before.saves + 1);
    expect(after.reprints, after.lastReprint || '').to.equal(before.reprints);
    expect(after.partialReprints, after.lastPartialReprint || '').to.equal(before.partialReprints);
  });

  it('an edit reprints the edit and copies every other line', () => {
    const li = win.document.querySelector("[data-id='b']");
    li.firstChild.data = 'BETA';
    const out = win.clay.getHTML();
    li.firstChild.data = 'beta';

    expect(out).to.contain(`<li data-id='b' class="row">BETA</li>`);
    expect(out).to.contain(`<li data-id='a' class="row">alpha</li>`);
    expect(out).to.contain('<ul id=list>');

    const before = served.split('\n');
    const after = out.split('\n');
    expect(after.length).to.equal(before.length);
    const changed = before.filter((line, i) => line !== after[i]);
    expect(changed.length, JSON.stringify(changed)).to.equal(1);
  });

  it('a new element is printed and its siblings keep their own bytes', () => {
    const list = win.document.querySelector('#list');
    const li = win.document.createElement('li');
    li.setAttribute('data-id', 'c');
    li.className = 'row';
    li.textContent = 'gamma';
    list.appendChild(li);
    const out = win.clay.getHTML();
    li.remove();

    expect(out).to.contain('<li data-id="c" class="row">gamma</li>');   // printed
    expect(out).to.contain(`<li data-id='a' class="row">alpha</li>`);   // copied
  });

  it('copies a <noscript> block verbatim, which jsdom cannot check', () => {
    // parse5 parses <noscript> content as raw text because its scriptingEnabled
    // default is true, and a browser running clayjs is by definition scripting
    // enabled, so the two should agree. jsdom is the engine that disagrees: with
    // scripting off it parses the content as real elements, so the block goes
    // unpaired there and reprints as class="n". Chrome is the only oracle for which
    // behaviour ships, and no file in the 198 document sweep contains a <noscript>
    // at all, so without this the case is entirely unexercised.
    const out = win.clay.getHTML();
    expect(out).to.contain(`<noscript><p class='n'>needs javascript</p></noscript>`);
  });

  it("keeps a <pre>'s leading newline, which today's serializer cannot", () => {
    // The one place where "equal to today's bytes" is the WEAKER oracle. The HTML
    // serializer adds a newline after <pre> precisely because the parser eats one, so
    // today's bytes and the file disagree here every time. Copying the source is exact,
    // and this is the case that shows the difference is real rather than theoretical.
    const out = win.clay.getHTML();
    const today = '<!DOCTYPE html>' + win.document.documentElement.outerHTML;
    expect(out).to.contain('<pre>\nfirst line');
    expect(today).to.not.contain('<pre>\nfirst line');
  });

  // locate() is keyed by the nodes the BROWSER's parser produced, and it hands back offsets into
  // the served bytes. jsdom cannot test that pairing honestly, for the same reason it cannot test
  // the rest of this file: it is parse5 on both sides.
  it('locate gives a range that slices out of the served bytes as exactly that element', () => {
    const loc = win.clay.source.locate(win.document.querySelector("[data-id='a']"));
    expect(served.slice(loc.from, loc.to)).to.equal(`<li data-id='a' class="row">alpha</li>`);
  });

  it('and its line and column point at the same place in the same bytes', () => {
    // Derived from the served text rather than asserted as numbers, because the test runner injects
    // its own reload script and moves every line after it.
    const loc = win.clay.source.locate(win.document.querySelector("[data-id='a']"));
    const line = served.split('\n')[loc.line - 1];
    expect(line.slice(loc.column - 1)).to.equal(`<li data-id='a' class="row">alpha</li>`);
  });

  it('including inside foreign content and inside a <template>, where the two parsers differ most', () => {
    const svg = win.clay.source.locate(win.document.querySelector('linearGradient'));
    expect(served.slice(svg.from, svg.to)).to.equal('<linearGradient id="g"/>');
    const tpl = win.clay.source.locate(win.document.querySelector('#tpl').content.querySelector('li'));
    expect(served.slice(tpl.from, tpl.to)).to.equal(`<li data-id='x' class="row">from a template</li>`);
  });

  it('and answers null for an element that is not in the file', () => {
    const fresh = win.document.createElement('li');
    win.document.querySelector('#list').appendChild(fresh);
    const loc = win.clay.source.locate(fresh);
    fresh.remove();
    expect(loc).to.equal(null);
  });
});
