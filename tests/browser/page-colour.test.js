import { expect } from '@esm-bundle/chai';
import { pageColour, uiLook, paintLook } from '../../src/ui/page-colour.js';

/**
 * The colour behind a rectangle needs layout and hit-testing, which jsdom has
 * neither of. Each case paints the page, asks about the top-right corner where
 * ClayJS UI sits, and checks the answer or the honest null.
 */

const corner = () => ({ x: innerWidth - 240, y: 8, width: 220, height: 48 });
let extra = [];

function page(bodyCss, html = '') {
  document.documentElement.removeAttribute('style');
  document.body.setAttribute('style', `margin:0;min-height:100vh;${bodyCss}`);
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const nodes = [...holder.children];
  document.body.append(...nodes);
  extra.push(...nodes);
}

afterEach(() => {
  for (const el of extra) el.remove();
  extra = [];
});

describe('pageColour', () => {
  it('reads a dark page that declares no scheme as dark', () => {
    page('background:#1e2a3a');
    const found = pageColour(corner());
    expect(found.scheme).to.equal('dark');
    expect(found.confidence).to.be.at.least(0.75);
    found.colour.forEach((v, k) => expect(Math.abs(v - [0x1e, 0x2a, 0x3a][k])).to.be.at.most(3));
  });

  it('reads a white page as light', () => {
    page('background:#ffffff');
    expect(pageColour(corner()).scheme).to.equal('light');
  });

  it('composites a translucent header over the page', () => {
    page('background:#ffffff', '<header style="position:fixed;inset:0 0 auto 0;height:80px;background:rgb(0 0 0 / .85)"></header>');
    expect(pageColour(corner()).scheme).to.equal('dark');
  });

  // Hit-testing skips it, the census finds it; where it sits in paint order is
  // unknown, so the honest answer is null rather than the white page under it.
  it('never answers light under a pointer-events:none dark overlay', async () => {
    page('background:#ffffff', '<div style="position:fixed;inset:0;pointer-events:none;background:#101010"></div>');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(pageColour(corner())).to.equal(null);
  });

  it('says null over a multi-colour gradient', () => {
    page('background:linear-gradient(90deg, #000, #fff)');
    expect(pageColour(corner())).to.equal(null);
  });

  it('says null when the corner is split between dark and light', () => {
    page('background:#ffffff', '<div style="position:fixed;top:0;right:0;width:110px;height:80px;background:#000"></div>');
    expect(pageColour({ x: innerWidth - 220, y: 8, width: 220, height: 48 })).to.equal(null);
  });

  it('looks through ClayJS UI to the page under it', () => {
    page('background:#ffffff', '<div clay="editor-ui" style="position:fixed;top:0;right:0;width:300px;height:80px;background:#000"></div>');
    expect(pageColour(corner()).scheme).to.equal('light');
  });
});

describe('uiLook and paintLook', () => {
  it('tints the surface toward a dark page and keeps it readable', () => {
    page('background:#1e2a3a');
    const look = uiLook(corner());
    expect(look.scheme).to.equal('dark');
    expect(look.surface).to.match(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('falls back to the page scheme and Bevel fill when it cannot tell', () => {
    page('background:linear-gradient(90deg, #000, #fff)');
    const el = document.createElement('div');
    el.setAttribute('style', 'position:fixed;top:8px;right:20px;width:220px;height:48px');
    el.setAttribute('clay', 'no-save no-watch no-snapshot');
    document.body.append(el);
    extra.push(el);
    const look = paintLook(el, { background: 'rgb(1 2 3)' });
    expect(look.surface).to.equal(null);
    expect(el.style.getPropertyValue('color-scheme')).to.equal('light dark');
    expect(el.style.getPropertyValue('background-color')).to.equal('rgb(1, 2, 3)');
  });
});
