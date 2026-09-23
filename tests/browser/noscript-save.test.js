import { expect } from '@esm-bundle/chai';

/**
 * A <noscript> through the full serialization, in a real browser.
 *
 * The page parsed with scripting on, so a <noscript> holds its markup as one raw text
 * node. The save clone is built in a document with no window, where scripting is off,
 * and Chrome's serializer escaped that text there: `<p>` went to disk as `&lt;p&gt;`, a
 * reload read it as literal text, and every later save escaped it again. jsdom's
 * serializer does the opposite, so only a browser can show it. The source plugin is
 * excluded here because it copies an untouched block from the file and would hide this.
 */

const FIXTURE = '/tests/browser/fixtures/noscript-save.html';

let win;
const bodies = [];

describe('a <noscript> survives the full serialization', () => {
  before(async () => {
    const iframe = document.createElement('iframe');
    iframe.src = FIXTURE;
    await new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = reject;
      document.body.appendChild(iframe);
    });
    win = iframe.contentWindow;
    await win.clay.ready;
    win.fetch = async (url, init) => {
      if (init && init.method === 'POST') {
        bodies.push(String(init.body));
        return new win.Response(JSON.stringify({ msg: 'Saved' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return fetch(url, init);
    };
  });

  it('the source plugin is off, so a save is the full serialization', () => {
    const stats = win.clay.source && win.clay.source.stats ? win.clay.source.stats() : null;
    expect(!!(stats && stats.installed)).to.equal(false);
  });

  it('writes its markup raw, as the page holds it, including inside a <template>', async () => {
    await win.clay.save.force();
    const body = bodies.at(-1);
    expect(body).to.contain(`<noscript><p class='n'>needs javascript</p></noscript>`);
    expect(body).to.contain(`<noscript><img src="data:," alt=x></noscript>`);
  });

  it('so a reload with scripting on holds the same block', async () => {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = bodies.at(-1).replace(/<script src="[^"]*"><\/script>/g, '');
    await new Promise((resolve) => { iframe.onload = resolve; document.body.appendChild(iframe); });
    expect(iframe.contentDocument.querySelector('noscript').textContent)
      .to.equal(win.document.querySelector('noscript').textContent);
  });

  it('and the live page is untouched', () => {
    expect(win.document.querySelector('noscript').textContent).to.equal(`<p class='n'>needs javascript</p>`);
  });
});
