import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';
import { createPageEditor } from '../../src/page/editor.js';
import { blockMap } from '../../src/page/model.js';
import { BlockSelection } from '../../src/page/blocks.js';
import { state as pmState, history as pmHistory } from '../../src/vendor/prosemirror.vendor.js';

/**
 * The page editor's lists and toggles in a real browser. The jsdom suites
 * (tests/unit/page/blocks-*.test.js) prove the commands on the model; these
 * cases need layout, real key events or the real clipboard path: a closed body
 * is not rendered, arrows and Shift+arrows cross a closed toggle the way the
 * selection guard says, the disclosure button works, and a Docs paste lands as
 * flat items.
 */

const { TextSelection } = pmState;

const FOLD = () => ({
  p: { t: 'paragraph', pos: 'V', c: 'Para' },
  t: { t: 'toggle', pos: 'W', c: 'Summary' },
  b1: { t: 'paragraph', pos: 'X', parent: 't', c: 'hidden one' },
  b2: { t: 'paragraph', pos: 'Y', parent: 't', c: 'hidden two' },
  z: { t: 'paragraph', pos: 'Z', c: 'Zed' },
});

let view;
let mount;

function setup(blocks = FOLD()) {
  mount = document.body.appendChild(document.createElement('div'));
  view = createPageEditor(mount, { blocks });
  view.focus();
}

afterEach(() => {
  view?.destroy();
  mount?.remove();
  view = mount = null;
});

const settle = () => new Promise((r) => setTimeout(r, 50));
const press = async (key) => { await sendKeys({ press: key }); await settle(); };
const startOf = (id, off = 0) => { let p = null; view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + 1 + off; }); return p; };
const endOf = (id) => { let p = null; view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + n.nodeSize - 1; }); return p; };
const put = (a, h = a) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, a, h)));
const blockAt = (pos) => view.state.doc.resolve(pos).node(1).attrs.id;

describe('page blocks in a browser', () => {
  it('a closed body is not rendered and the summary says collapsed', () => {
    setup();
    const body = [...mount.querySelectorAll('[data-id="b1"], [data-id="b2"]')];
    expect(body.length).to.equal(2);
    for (const el of body) expect(getComputedStyle(el).display).to.equal('none');
    expect(mount.querySelector('[data-id="t"]').getAttribute('aria-expanded')).to.equal('false');
  });

  it('ArrowDown and ArrowUp skip a closed body', async () => {
    setup();
    put(endOf('t'));
    await press('ArrowDown');
    expect(blockAt(view.state.selection.head)).to.equal('z');
    await press('ArrowUp');
    expect(blockAt(view.state.selection.head)).to.equal('t');
  });

  it('Shift+ArrowDown from above across a closed toggle, then Backspace, removes the toggle and its body', async () => {
    setup();
    put(endOf('p'));
    await press('Shift+ArrowDown');
    await press('Shift+ArrowDown');
    await press('Backspace');
    const record = blockMap(view.state.doc);
    expect(Object.keys(record).filter((id) => ['t', 'b1', 'b2'].includes(id))).to.deep.equal([]);
    expect(Object.values(record).some((b) => b.parent === 't')).to.equal(false);
  });

  it('Shift+ArrowDown from the end of a closed summary selects the toggle and the next block, and Backspace removes both', async () => {
    setup();
    put(endOf('t'));
    await press('Shift+ArrowDown');
    expect(view.state.selection instanceof BlockSelection).to.equal(true);
    await press('Backspace');
    const record = blockMap(view.state.doc);
    expect(['t', 'b1', 'b2', 'z'].filter((id) => id in record)).to.deep.equal([]);
    expect(Object.values(record).some((blk) => blk.parent === 't')).to.equal(false);
  });

  it('the disclosure button opens a toggle without moving the caret or adding history', async () => {
    setup();
    put(startOf('p', 2));
    const depth = pmHistory.undoDepth(view.state);
    mount.querySelector('.page-toggle-button').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await settle();
    expect(view.state.doc.child(1).attrs.open).to.equal(true);
    expect(pmHistory.undoDepth(view.state)).to.equal(depth);
    expect(view.state.selection.head).to.equal(startOf('p', 2));
    expect(getComputedStyle(mount.querySelector('[data-id="b1"]')).display).to.not.equal('none');
  });

  it('Tab, Enter and Enter again work through real key events', async () => {
    setup({ a: { t: 'list_item', pos: 'V', c: 'Alpha' }, b: { t: 'list_item', pos: 'W', c: 'Beta' } });
    put(startOf('b'));
    await press('Tab');
    expect(view.state.doc.child(1).attrs.indent).to.equal(1);
    put(endOf('b'));
    await press('Enter');
    expect(view.state.doc.childCount).to.equal(3);
    expect(view.state.doc.child(2).type.name).to.equal('list_item');
    expect(view.state.doc.child(2).attrs.indent).to.equal(1);
    await press('Enter');
    expect(view.state.doc.child(2).attrs.indent).to.equal(0);
  });

  it('a Google Docs nested list pasted into an empty paragraph lands as flat items with fresh ids', async () => {
    setup({ p: { t: 'paragraph', pos: 'V', c: '' } });
    put(startOf('p'));
    const html = await (await fetch('/tests/unit/page/fixtures/paste/gdocs-nested.html')).text();
    view.pasteHTML(html);
    const items = [];
    view.state.doc.forEach((n) => { if (n.type.name === 'list_item') items.push([n.attrs.kind, n.attrs.indent, n.textContent, n.attrs.id]); });
    expect(items.map((i) => i.slice(0, 3))).to.deep.equal([
      ['bullet', 0, 'Alpha'], ['bullet', 1, 'Beta'], ['bullet', 2, 'Gamma'], ['bullet', 1, 'Delta'], ['bullet', 0, 'Epsilon'],
      ['ordered', 0, 'First'], ['ordered', 1, 'First a'], ['ordered', 0, 'Second'],
      ['check', 0, 'Done'], ['check', 0, 'Open'],
    ]);
    const ids = items.map((i) => i[3]);
    expect(ids.every(Boolean)).to.equal(true);
    expect(new Set(ids).size).to.equal(ids.length);
  });
});

describe('page chrome in a browser', () => {
  it('the plus floats left of the caret line, and pointer movement darkens the chrome then lets it fade back', async () => {
    setup();
    put(endOf('z'));
    await settle();
    const plus = mount.querySelector('.page-plus');
    const line = mount.querySelector('[data-id="z"]').getBoundingClientRect();
    const box = plus.getBoundingClientRect();
    expect(box.right).to.be.at.most(line.left);
    expect(Math.abs((box.top + box.bottom) / 2 - (line.top + Math.min(line.height, 30) / 2))).to.be.below(12);
    const shell = mount.querySelector('.page-shell');
    const rest = getComputedStyle(plus).color;
    shell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(shell.classList.contains('is-moved')).to.equal(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(getComputedStyle(plus).color).to.not.equal(rest);
    await new Promise((r) => setTimeout(r, 1500));
    expect(shell.classList.contains('is-moved')).to.equal(false);
  });

  it('typing "/" in an empty line opens the block menu, typing filters it, Enter turns the line', async () => {
    setup({ p: { t: 'paragraph', pos: 'V', c: 'Para' }, e: { t: 'paragraph', pos: 'W', c: '' } });
    put(startOf('e'));
    await sendKeys({ type: '/' });
    await settle();
    const menu = mount.querySelector('.page-menu');
    expect(menu.hidden).to.equal(false);
    expect(menu.querySelectorAll('.page-menu-item').length).to.be.above(7);
    await sendKeys({ type: 'chec' });
    await settle();
    expect([...menu.querySelectorAll('.page-menu-label')].map((l) => l.textContent)).to.deep.equal(['Checklist']);
    await press('Enter');
    const n = view.state.doc.child(1);
    expect([n.type.name, n.attrs.kind, n.textContent, n.attrs.id]).to.deep.equal(['list_item', 'check', '', 'e']);
    expect(menu.hidden).to.equal(true);
  });

  it('Escape closes the menu and leaves the typed slash', async () => {
    setup({ e: { t: 'paragraph', pos: 'V', c: '' } });
    put(startOf('e'));
    await sendKeys({ type: '/' });
    await settle();
    await press('Escape');
    expect(mount.querySelector('.page-menu').hidden).to.equal(true);
    expect(view.state.doc.child(0).textContent).to.equal('/');
  });

  it('a text selection shows the selection toolbar above it, and its Bold button bolds the selection', async () => {
    setup();
    put(startOf('p', 0), startOf('p', 4));
    await settle();
    const bubble = mount.querySelector('.page-bubble');
    expect(bubble.hidden).to.equal(false);
    const line = mount.querySelector('[data-id="p"]').getBoundingClientRect();
    expect(bubble.getBoundingClientRect().bottom).to.be.at.most(line.top + 2);
    bubble.querySelector('[data-cmd="strong"]').click();
    expect(view.state.doc.child(0).firstChild.marks.map((m) => m.type.name)).to.deep.equal(['strong']);
    put(startOf('p', 1));
    await settle();
    expect(bubble.hidden).to.equal(true);
  });

  it('clicking a checklist box toggles it', async () => {
    setup({ c: { t: 'list_item', pos: 'V', c: 'Task', kind: 'check' } });
    const li = mount.querySelector('[data-id="c"]');
    const r = li.getBoundingClientRect();
    const start = parseFloat(getComputedStyle(li).paddingInlineStart);
    li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: r.left + start / 2, clientY: r.top + 8 }));
    expect(view.state.doc.child(0).attrs.checked).to.equal(true);
  });

  it('at a 390px viewport nothing scrolls sideways, and the plus opens the menu as a popover above the toolbar with 44px rows', async () => {
    await setViewport({ width: 390, height: 800 });
    try {
      setup();
      put(endOf('z'));
      await settle();
      expect(document.documentElement.scrollWidth).to.be.at.most(390);
      mount.querySelector('.page-plus').click();
      await settle();
      const menu = mount.querySelector('.page-menu');
      expect(menu.hidden).to.equal(false);
      const r = menu.getBoundingClientRect();
      const bar = mount.querySelector('.page-dock').getBoundingClientRect();
      expect(r.top).to.be.at.least(0);
      expect(r.left).to.be.at.least(0);
      expect(r.right).to.be.at.most(390);
      expect(r.bottom).to.be.at.most(800);
      expect(r.bottom).to.be.at.most(bar.top);
      expect(document.documentElement.scrollWidth).to.be.at.most(390);
      for (const row of menu.querySelectorAll('.page-menu-item')) expect(row.getBoundingClientRect().height).to.be.at.least(44);
    } finally {
      await setViewport({ width: 800, height: 600 });
    }
  });
});
