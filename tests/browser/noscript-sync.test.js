import { expect } from '@esm-bundle/chai';
import { serializeForSync } from '/src/core/snapshot.js';
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
