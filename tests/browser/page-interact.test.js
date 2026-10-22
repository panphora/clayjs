import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';
import { createPageEditor } from '../../src/page/editor.js';
import { BlockSelection } from '../../src/page/blocks.js';
import { blockMap } from '../../src/page/model.js';
import { state as pmState, history as pmHistory } from '../../src/vendor/prosemirror.vendor.js';

/**
 * Phase 4 in real browsers. The jsdom suites (tests/unit/page) prove the
 * commands, the menus, the upload state and the drag arithmetic; these cases
 * need layout, real focus and selection normalisation, real keys, real pointers
 * or real scrolling: a block selection must survive the browser moving its DOM
 * selection, a drag must follow the pointer, the menus must flip at the viewport
 * edge, and nothing may scroll sideways on a phone.
 * Run: npx web-test-runner --config tests/browser/page-interact.wtr.config.mjs
 */

const { TextSelection } = pmState;
const MOD = 'ControlOrMeta';

const FOLD = () => ({
  p: { t: 'paragraph', pos: 'V', c: 'Para' },
  t: { t: 'toggle', pos: 'W', c: 'Summary' },
  b1: { t: 'paragraph', pos: 'X', parent: 't', c: 'hidden one' },
  b2: { t: 'paragraph', pos: 'Y', parent: 't', c: 'hidden two' },
  z: { t: 'paragraph', pos: 'Z', c: 'Zed' },
});

const LIST = () => ({
  p: { t: 'paragraph', pos: 'V', c: 'Title' },
  a: { t: 'list_item', pos: 'W', c: 'Alpha' },
  a1: { t: 'list_item', pos: 'X', indent: 1, c: 'Beta' },
  z: { t: 'paragraph', pos: 'Y', c: 'Zed' },
  m: { t: 'list_item', pos: 'Z', c: 'Move me' },
});

const LONG = (n = 70) => {
  const out = {};
  for (let i = 0; i < n; i++) out[`l${i}`] = { t: 'paragraph', pos: String.fromCharCode(65 + Math.floor(i / 20)) + String.fromCharCode(65 + (i % 20)), c: `Line ${i}` };
  out.end = { t: 'paragraph', pos: 'ZZ', c: '' };
  return out;
};

let view;
let mount;

function setup(blocks = FOLD(), options = {}) {
  mount = document.body.appendChild(document.createElement('div'));
  view = createPageEditor(mount, { blocks, ...options });
  view.focus();
}

afterEach(async () => {
  await resetMouse();
  view?.destroy();
  mount?.remove();
  view = mount = null;
  await setViewport({ width: 800, height: 600 });
});

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const press = async (key) => { await sendKeys({ press: key }); await settle(); };
const type = async (text) => { await sendKeys({ type: text }); await settle(); };
const startOf = (id, off = 0) => { let p = null; view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + 1 + off; }); return p; };
const endOf = (id) => { let p = null; view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + n.nodeSize - 1; }); return p; };
const put = (a, h = a) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, a, h)));
const ids = () => { const r = []; view.state.doc.forEach((n) => r.push(n.attrs.id)); return r; };
const el = (id) => mount.querySelector(`[data-id="${id}"]`);
const box = (node) => node.getBoundingClientRect();
const center = (node) => { const r = box(node); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const spanIds = () => {
  const { lo, hi } = view.state.selection.span(view.state.doc);
  return ids().slice(lo, hi + 1);
};
const move = (x, y) => sendMouse({ type: 'move', position: [Math.round(x), Math.round(y)] });
const isBlockSelection = () => view.state.selection instanceof BlockSelection;
const grip = () => mount.querySelector('.page-grip');
const dropLine = () => mount.querySelector('.page-drop');
const menu = () => mount.querySelector('.page-menu');
const indentPx = () => {
  const probe = mount.querySelector('.page-shell').appendChild(document.createElement('div'));
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--page-indent)';
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return w;
};

async function hover(id) {
  const r = box(el(id));
  await move(r.left + 60, r.top + 6);
  await settle(80);
}

async function startDrag(id) {
  await hover(id);
  const [gx, gy] = center(grip());
  await move(gx, gy);
  await sendMouse({ type: 'down' });
  await move(gx, gy + 14);
  await settle();
}

const paste = (files) => {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  const cd = event.clipboardData;
  if (cd && !cd.files.length) for (const f of files) cd.items.add(f);
  if (!cd || !cd.files.length) return null;
  view.dom.dispatchEvent(event);
  return cd;
};
const PNG = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'door.png', { type: 'image/png' });

describe('block selection in a browser', () => {
  it('a block selection survives focus, a selectionchange and a real Shift+click', async () => {
    setup();
    put(endOf('p'));
    await press('Escape');
    expect(isBlockSelection()).to.equal(true);
    expect(view.dom.classList.contains('ProseMirror-hideselection')).to.equal(true);
    view.dom.blur();
    await settle();
    view.focus();
    await settle();
    expect(isBlockSelection()).to.equal(true);
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
    expect(isBlockSelection()).to.equal(true);
    const [x, y] = center(el('z'));
    await move(x, y);
    await sendKeys({ down: 'Shift' });
    await sendMouse({ type: 'click', position: [x, y] });
    await sendKeys({ up: 'Shift' });
    await settle();
    expect(isBlockSelection()).to.equal(true);
    expect(spanIds()).to.deep.equal(['p', 't', 'b1', 'b2', 'z']);
  });

  it('Cmd+C then Cmd+V of a selected closed toggle pastes the toggle with its body', async () => {
    setup();
    put(endOf('t'));
    await press('Escape');
    expect(spanIds()).to.deep.equal(['t', 'b1', 'b2']);
    await press(`${MOD}+c`);
    put(endOf('z'));
    await press('Enter');
    await press(`${MOD}+v`);
    const record = blockMap(view.state.doc);
    const toggles = Object.entries(record).filter(([, b]) => b.t === 'toggle' && b.c === 'Summary');
    expect(toggles.length).to.equal(2);
    const copy = toggles.find(([id]) => id !== 't')[0];
    const body = Object.values(record).filter((b) => b.parent === copy).map((b) => b.c);
    expect(body).to.deep.equal(['hidden one', 'hidden two']);
    expect(Object.values(record).filter((b) => b.parent === 't').length).to.equal(2);
  });

  it('Cmd+X of selected blocks removes them, one undo restores them', async () => {
    setup();
    put(endOf('t'));
    await press('Escape');
    await press(`${MOD}+x`);
    let record = blockMap(view.state.doc);
    expect(['t', 'b1', 'b2'].filter((id) => id in record)).to.deep.equal([]);
    await press(`${MOD}+z`);
    record = blockMap(view.state.doc);
    expect(record.t.c).to.equal('Summary');
    expect(record.b1.parent).to.equal('t');
    expect(record.b2.parent).to.equal('t');
  });

  it('Shift+Down at the end of a closed summary selects the toggle and the next block as blocks; Backspace deletes both and one undo restores them', async () => {
    setup();
    put(endOf('t'));
    await press('Shift+ArrowDown');
    expect(isBlockSelection()).to.equal(true);
    expect(spanIds()).to.deep.equal(['t', 'b1', 'b2', 'z']);
    await press('Backspace');
    const record = blockMap(view.state.doc);
    expect(['t', 'b1', 'b2', 'z'].filter((id) => id in record)).to.deep.equal([]);
    await press(`${MOD}+z`);
    const back = blockMap(view.state.doc);
    expect(back.t.c).to.equal('Summary');
    expect(back.b1.parent).to.equal('t');
    expect(back.z.c).to.equal('Zed');
  });
});

describe('dragging a block in a browser', () => {
  it('a mouse drag of the grip moves a block and its child below another block, one undo step', async () => {
    setup(LIST());
    const depth = pmHistory.undoDepth(view.state);
    await startDrag('a');
    const z = box(el('z')), m = box(el('m'));
    await move(box(view.dom).left + 3, (z.bottom + m.top) / 2);
    await settle();
    await sendMouse({ type: 'up' });
    await settle();
    expect(ids()).to.deep.equal(['p', 'z', 'a', 'a1', 'm']);
    expect(pmHistory.undoDepth(view.state)).to.equal(depth + 1);
    await press(`${MOD}+z`);
    expect(ids()).to.deep.equal(['p', 'a', 'a1', 'z', 'm']);
  });

  it('the drop line sits at the gap and indents with the pointer\'s x', async () => {
    setup(LIST());
    await startDrag('m');
    const z = box(el('z')), a1 = box(el('a1'));
    const left = box(view.dom).left, px = indentPx();
    await move(left + 2, (a1.bottom + z.top) / 2);
    await settle();
    const first = box(dropLine());
    expect(dropLine().hidden).to.equal(false);
    expect(first.top).to.be.within(a1.bottom - 4, z.top + 4);
    await move(left + px * 2 + 4, (a1.bottom + z.top) / 2);
    await settle();
    const deeper = box(dropLine());
    expect(deeper.left - first.left).to.be.within(px * 1.5, px * 2.5);
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
  });

  it('dragging near the bottom edge scrolls the page', async () => {
    await setViewport({ width: 800, height: 600 });
    setup(LONG());
    await startDrag('l0');
    const start = document.scrollingElement.scrollTop;
    await move(box(view.dom).left + 20, 590);
    await settle(500);
    expect(document.scrollingElement.scrollTop).to.be.greaterThan(start);
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
  });

  it('Esc during a drag cancels it', async () => {
    setup(LIST());
    const before = ids();
    await startDrag('a');
    const z = box(el('z')), m = box(el('m'));
    await move(box(view.dom).left + 3, (z.bottom + m.top) / 2);
    await settle();
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
    await settle();
    expect(ids()).to.deep.equal(before);
    expect(dropLine().hidden).to.equal(true);
    expect(mount.querySelector('.page-shell').classList.contains('is-dragging')).to.equal(false);
  });
});

describe('menus, links and uploads in a browser', () => {
  it('pasting an image file shows the upload widget, then the image', async function () {
    let finish;
    setup({ p: { t: 'paragraph', pos: 'V', c: '' } }, { upload: () => new Promise((r) => { finish = r; }) });
    put(startOf('p'));
    expect(paste([PNG()])).to.not.equal(null);
    await settle();
    expect(mount.querySelector('.page-upload')).to.not.equal(null);
    finish({ ok: true, uploads: [{ url: '/uploads/door.png' }] });
    await settle(100);
    expect(mount.querySelector('.page-upload')).to.equal(null);
    expect(mount.querySelector('figure.page-image img').getAttribute('src')).to.equal('/uploads/door.png');
  });

  it('Mod+K focuses the link field; Esc returns focus with the selection intact', async () => {
    setup();
    put(startOf('p'), endOf('p'));
    const { from, to } = view.state.selection;
    await press(`${MOD}+k`);
    const input = mount.querySelector('.page-link-input');
    expect(document.activeElement).to.equal(input);
    await press('Escape');
    expect(view.hasFocus()).to.equal(true);
    expect([view.state.selection.from, view.state.selection.to]).to.deep.equal([from, to]);
  });

  it('the slash menu opens under the caret and flips above near the viewport bottom', async () => {
    await setViewport({ width: 800, height: 500 });
    setup(LONG(40));
    put(startOf('end'));
    view.dispatch(view.state.tr.scrollIntoView());
    await settle();
    await type('/');
    const caret = view.coordsAtPos(view.state.selection.head - 1);
    const open = box(menu());
    expect(menu().hidden).to.equal(false);
    expect(open.bottom).to.be.at.most(caret.top + 2);
    await press('Escape');
    put(startOf('l0', 2));
    window.scrollTo(0, 0);
    await settle();
    await press('End');
    await type('x /');
    const c2 = view.coordsAtPos(view.state.selection.head - 1);
    expect(box(menu()).top).to.be.at.least(c2.bottom - 2);
  });

  it('aria-activedescendant survives a keystroke while the slash menu is open', async () => {
    setup({ p: { t: 'paragraph', pos: 'V', c: '' } });
    put(startOf('p'));
    await type('/');
    let id = view.dom.getAttribute('aria-activedescendant');
    expect(id).to.be.a('string');
    await type('h');
    id = view.dom.getAttribute('aria-activedescendant');
    expect(id).to.be.a('string');
    const row = document.getElementById(id);
    expect(menu().contains(row)).to.equal(true);
    expect(row.getAttribute('aria-selected')).to.equal('true');
    await press('ArrowDown');
    const next = document.getElementById(view.dom.getAttribute('aria-activedescendant'));
    expect(next.getAttribute('aria-selected')).to.equal('true');
    expect(next).to.not.equal(row);
  });

  it('at 390 px nothing scrolls sideways with the grip, a link popover and an upload widget open', async () => {
    await setViewport({ width: 390, height: 800 });
    setup(FOLD(), { upload: () => new Promise(() => {}) });
    await hover('p');
    put(startOf('p'), endOf('p'));
    await press(`${MOD}+k`);
    expect(mount.querySelector('.page-link').hidden).to.equal(false);
    put(endOf('z'));
    if (paste([PNG()]) !== null) await settle();
    const root = document.scrollingElement;
    expect(root.scrollWidth).to.be.at.most(root.clientWidth);
    expect(box(grip()).width).to.be.greaterThan(0);
  });
});

describe('Backspace and Delete with a selection', () => {
  const THREE = () => ({
    a: { t: 'paragraph', pos: 'V', c: 'First line' },
    b: { t: 'paragraph', pos: 'W', c: 'Second line' },
    c: { t: 'paragraph', pos: 'X', c: 'Third line' },
  });
  const text = () => { const r = []; view.state.doc.forEach((n) => r.push(n.textContent)); return r; };

  for (const key of ['Backspace', 'Delete']) {
    it(`${key} deletes a text selection made with the mouse`, async () => {
      setup(THREE());
      const a = box(el('a')), b = box(el('b'));
      await move(a.left + 2, a.top + a.height / 2);
      await sendMouse({ type: 'down' });
      for (let k = 1; k <= 6; k++) await move(a.left + 2 + (b.left + 30 - a.left - 2) * k / 6, a.top + a.height / 2 + (b.top - a.top) * k / 6);
      await sendMouse({ type: 'up' });
      await settle();
      expect(view.state.selection.empty).to.equal(false);
      await press(key);
      expect(text().length).to.equal(2);
    });

    it(`${key} deletes the selection after a bubble button was clicked`, async () => {
      setup(THREE());
      mount.style.paddingLeft = '200px';
      const a = box(el('a'));
      await move(a.left + 1, a.top + a.height / 2);
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'up' });
      for (let i = 0; i < 5; i++) await sendKeys({ press: 'Shift+ArrowRight' });
      await settle();
      const bubble = mount.querySelector('.page-bubble');
      expect(bubble.hidden, 'bubble shown').to.equal(false);
      const picked = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);
      await move(...center(bubble.querySelector('[data-cmd="strong"]')));
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'up' });
      await settle();
      expect(view.state.doc.rangeHasMark(view.state.selection.from, view.state.selection.to, view.state.schema.marks.strong), 'bold applied').to.equal(true);
      await press(key);
      expect(text()[0]).to.equal('First line'.slice(picked.length));
    });

    it(`${key} deletes the blocks a grip click selected, with the actions menu open`, async () => {
      setup(THREE());
      await hover('b');
      await move(...center(grip()));
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'up' });
      await settle();
      expect(isBlockSelection()).to.equal(true);
      await press(key);
      expect(ids()).to.deep.equal(['a', 'c']);
    });

    it(`${key} after Mod+A deletes everything`, async () => {
      setup(THREE());
      put(startOf('b', 2));
      await press(`${MOD}+a`);
      await press(`${MOD}+a`);
      await press(key);
      expect(text().join('')).to.equal('');
    });

    it(`${key} deletes a selection that runs from a nested checklist item into a toggle`, async () => {
      setup({
        p: { t: 'paragraph', pos: 'V', c: 'Intro' },
        l1: { t: 'list_item', kind: 'check', pos: 'W', c: 'Parent task' },
        l2: { t: 'list_item', kind: 'check', indent: 1, checked: true, pos: 'X', c: 'Child task' },
        t: { t: 'toggle', pos: 'Y', open: true, c: 'Toggle title' },
        tb: { t: 'paragraph', pos: 'Z', parent: 't', c: 'Inside' },
      });
      const a = box(el('l2'));
      await move(a.left + 40, a.top + a.height / 2);
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'up' });
      for (let i = 0; i < 4; i++) await sendKeys({ press: 'Shift+ArrowDown' });
      await settle();
      const before = view.state.doc.textContent;
      await press(key);
      expect(view.state.doc.textContent).to.not.equal(before);
    });

    it(`${key} deletes a clicked image`, async () => {
      setup({ a: { t: 'paragraph', pos: 'V', c: 'Above' }, i: { t: 'image', pos: 'W', src: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', width: 200 }, c: { t: 'paragraph', pos: 'X', c: 'Below' } });
      await move(...center(mount.querySelector('.page-image-frame')));
      await sendMouse({ type: 'down' });
      await sendMouse({ type: 'up' });
      await settle();
      await press(key);
      expect(ids()).to.deep.equal(['a', 'c']);
    });
  }
});

describe('code block colours in a browser', () => {
  const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await settle(50); } return false; };
  const keywordSpans = (id) => [...el(id).querySelectorAll('code span[style]')].filter((s) => s.getAttribute('style').includes('--page-code-token-keyword'));

  it('a block on screen is coloured; one far below waits until it is scrolled into view', async () => {
    const blocks = LONG(80);
    blocks.top = { t: 'code_block', pos: 'A', lang: 'javascript', c: 'const a = 1' };
    blocks.far = { t: 'code_block', pos: 'ZZZ', lang: 'python', c: 'def f():\n  return 1' };
    setup(blocks);
    expect(await until(() => keywordSpans('top').length > 0)).to.equal(true);
    const span = keywordSpans('top')[0];
    expect(span.textContent).to.equal('const');
    expect(getComputedStyle(span).color).to.not.equal(getComputedStyle(el('top').querySelector('code')).color);
    await settle(400);
    expect(keywordSpans('far').length).to.equal(0);
    el('far').scrollIntoView();
    expect(await until(() => keywordSpans('far').length > 0)).to.equal(true);
  });

  it('a long plain line wraps inside its block; a long line of code scrolls inside the block instead', async () => {
    const long = 'Every gesture below is listed under What to try. Nothing here is saved anywhere but this file. '.repeat(3);
    setup({ p: { t: 'code_block', pos: 'V', c: long }, j: { t: 'code_block', pos: 'W', lang: 'javascript', c: `const s = "${long}"` } });
    await settle();
    const plain = el('p'), code = el('j');
    expect(plain.scrollWidth).to.be.at.most(plain.clientWidth);
    expect(box(plain).width).to.be.at.most(box(view.dom).width + 1);
    expect(code.scrollWidth).to.be.at.most(code.clientWidth);
    const inner = code.querySelector('code');
    expect(inner.scrollWidth).to.be.greaterThan(inner.clientWidth);
    expect(getComputedStyle(inner).overflowX).to.equal('auto');
  });

  it('the language picker colours a plain block', async () => {
    setup({ c: { t: 'code_block', pos: 'V', c: 'SELECT 1 FROM t' } });
    const picker = el('c').querySelector('select.page-code-lang');
    picker.value = 'sql';
    picker.dispatchEvent(new Event('change'));
    expect(view.state.doc.child(0).attrs.lang).to.equal('sql');
    expect(await until(() => keywordSpans('c').length > 0)).to.equal(true);
  });
});
