import { expect } from '@esm-bundle/chai';
import { noscriptsAsText, serializeForSync } from '/src/core/snapshot.js';
import { serializeForSyncSteps } from '/src/core/serialize-steps.js';
import { drain } from '/src/lib/slice.js';

/**
 * A <noscript> in a live sync frame, in a real browser.
 *
 * The capture clone lives in a document with no window, where Chrome's serializer escapes
 * a <noscript>'s text. The receiver parses the frame with scripting off, so a head
 * <noscript> holding `&lt;style&gt;` read as text: it closed the head, the fallback CSS
 * landed at the top of <body>, and the receiving tab saved that into the file.
 */

const FALLBACK = '<style>#entries { display: flex !important; }</style>';

function captureLike() {
  const away = document.implementation.createHTMLDocument('');
  away.head.innerHTML = '<title>t</title>';
  const noscript = away.createElement('noscript');
  noscript.textContent = FALLBACK;
  away.head.appendChild(noscript);
  away.body.innerHTML = '<p>body</p>';
  return away.documentElement.cloneNode(true);
}

describe('a <noscript> in a sync frame', () => {
  it('is written raw, one call and sliced, and leaves the clone as it was', () => {
    const clone = captureLike();
    const html = serializeForSync(clone);
    expect(html).to.contain(`<noscript>${FALLBACK}</noscript>`);
    expect(drain(serializeForSyncSteps(captureLike()))).to.equal(html);
    expect(clone.querySelector('noscript').textContent).to.equal(FALLBACK);
  });

  it('so the receiver keeps the fallback in the head and nothing in the body', () => {
    const parsed = new DOMParser().parseFromString(serializeForSync(captureLike()), 'text/html');
    expect(parsed.body.textContent).to.equal('body');
    expect(parsed.head.querySelector('noscript style')).to.not.equal(null);
  });
});

// What a receiver does with a frame: parse it with scripting off, then put each <noscript>
// back to the text the sender's page holds.
function received(source) {
  const away = document.implementation.createHTMLDocument('');
  away.body.innerHTML = '<template><noscript></noscript></template>';
  const top = away.createElement('noscript');
  top.textContent = source;
  away.body.appendChild(top);
  away.body.querySelector('template').content.firstChild.textContent = source;
  const parsed = new DOMParser().parseFromString(serializeForSync(away.documentElement.cloneNode(true)), 'text/html');
  noscriptsAsText(parsed);
  return [parsed.body.querySelector(':scope > noscript'), parsed.body.querySelector('template').content.querySelector('noscript')];
}

describe('a received <noscript> holds the text its sender holds', () => {
  for (const source of [FALLBACK, '&lt;b&gt;Read offline&lt;/b&gt; &amp; more', '<p class="n">needs <b>JavaScript</b> &amp; a reload</p>']) {
    it(`round-trips ${JSON.stringify(source.slice(0, 24))}, at the top level and inside a <template>`, () => {
      for (const el of received(source)) {
        expect(el.childNodes.length).to.equal(1);
        expect(el.firstChild.nodeType).to.equal(3);
        expect(el.textContent).to.equal(source);
      }
    });
  }

  it('turns an already-text block back into the source, not a second escape', () => {
    const parsed = new DOMParser().parseFromString('<body><noscript>a &lt; b</noscript>', 'text/html');
    noscriptsAsText(parsed);
    expect(parsed.querySelector('noscript').textContent).to.equal('a &lt; b');
  });
});

