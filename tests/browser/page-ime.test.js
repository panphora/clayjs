import { expect } from '@esm-bundle/chai';
import { executeServerCommand } from '@web/test-runner-commands';
import { Sim, createRoom } from '../unit/page/collab/room-double.js';
import { makeTab } from '../unit/page/collab/blocks/editor-tab.js';

/**
 * S5: typing in real browsers while remote edits land. Two page tabs share a
 * simulated room through the real binding, store and fast lane (S1's harness):
 * tab b's edits reach tab a as real remote transactions. Tab a composes,
 * autocorrects or moves its selection the way a phone does. Pass: no text is
 * lost in either tab, both converge, and a's caret ends where the user put it.
 *
 * Composition: in Chromium through the real IME path (CDP, see
 * page-ime.wtr.config.mjs); in Firefox and WebKit by writing the composing
 * text into the DOM between composition events, as ProseMirror's own tests do.
 * Run with: npx web-test-runner --config tests/browser/page-ime.wtr.config.mjs
 */

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

let sim, room, a, b;

// The real editor sets this (editor.js .page-editor); the harness's bare view
// does not, and without it Chromium collapses a trailing space under the caret.
const style = document.head.appendChild(document.createElement('style'));
style.textContent = '.ProseMirror { white-space: pre-wrap; }';

async function setup(p, q = 'line two') {
  sim = new Sim();
  const init = () => ({ blocks: { p: { t: 'paragraph', pos: 'M', c: p }, q: { t: 'paragraph', pos: 'V', c: q } }, deleted: {} });
  room = createRoom(sim, { page: init() });
  a = makeTab(sim, room, 'a', init());
  b = makeTab(sim, room, 'b', init());
  a.start();
  b.start();
  await sim.run(500);
  a.editor.focus();
}

afterEach(() => {
  for (const t of [a, b]) { t?.binding.dispose(); t?.editor.dom.parentNode?.remove(); t?.editor.destroy(); t?.lane.stop(); }
  a = b = sim = room = null;
});

// Deliver frames both ways on the simulated clock, letting the browser run.
async function deliver(ms = 600) {
  const end = sim.now() + ms;
  while (sim.now() < end) {
    await sim.run(sim.now() + 50);
    await tick();
  }
}

const textOf = (tab, id) => tab.blocks().find(([bid]) => bid === id)?.[1];
const caretIn = (tab, id) => {
  const { head } = tab.editor.state.selection;
  let at = null;
  tab.editor.state.doc.forEach((node, pos) => { if (node.attrs.id === id && head > pos && head < pos + node.nodeSize) at = head - pos - 1; });
  return at;
};

function placeCaret(tab, id, offset) {
  let pos = null;
  tab.editor.state.doc.forEach((node, at) => { if (node.attrs.id === id) pos = at + 1 + offset; });
  const { node, offset: o } = tab.editor.domAtPos(pos);
  const sel = document.getSelection();
  sel.collapse(node, o);
  return tick(20);
}

function textNodeAtSelection() {
  const sel = document.getSelection();
  let { anchorNode: node, anchorOffset: off } = sel;
  if (node.nodeType !== 3) {
    const child = node.childNodes[off] ?? node.childNodes[off - 1];
    if (child?.nodeType === 3) { off = child === node.childNodes[off] ? 0 : child.data.length; node = child; }
  }
  return { node, off };
}

// A composition: `steps` are the composing strings, `commit` the final text.
// `between(i)` runs after step i, while the composition is still open.
async function compose(tab, steps, commit, between = async () => {}) {
  const probe = await executeServerCommand('ime', { op: 'probe' }).catch(() => ({ cdp: false }));
  if (probe?.cdp) {
    for (let i = 0; i < steps.length; i++) {
      await executeServerCommand('ime', { op: 'set', text: steps[i] });
      await tick(30);
      await between(i);
    }
    await executeServerCommand('ime', { op: 'commit', text: commit });
    await tick(30);
    return 'cdp';
  }
  const dom = tab.editor.dom;
  dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  await tick();
  const { node, off } = textNodeAtSelection();
  let prev = '';
  const write = (s) => {
    node.data = node.data.slice(0, off) + s + node.data.slice(off + prev.length);
    document.getSelection().collapse(node, off + s.length);
    prev = s;
  };
  for (let i = 0; i < steps.length; i++) {
    write(steps[i]);
    dom.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: steps[i] }));
    dom.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: steps[i], isComposing: true }));
    await tick(30);
    await between(i);
  }
  write(commit);
  dom.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: commit, isComposing: true }));
  dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: commit }));
  await tick(30);
  return 'dom';
}

describe('S5: typing in real browsers while remote edits land', () => {
  it('a remote edit to another block lands during a composition without disturbing it', async () => {
    await setup('Hello ');
    await placeCaret(a, 'p', 6);
    await compose(a, ['に', 'にほ', 'にほん'], '日本', async (i) => {
      if (i === 1) { b.editor.dispatch(b.editor.state.tr.insertText('REMOTE ', posIn(b, 'q', 0))); await deliver(); }
    });
    await deliver(2000);
    for (const t of [a, b]) {
      expect(textOf(t, 'p')).to.equal('Hello 日本');
      expect(textOf(t, 'q')).to.equal('REMOTE line two');
    }
    expect(caretIn(a, 'p')).to.equal(8);
  });

  it('a remote insert before the caret in the composing block waits for compositionend, then both texts are kept', async () => {
    await setup('Hello ');
    await placeCaret(a, 'p', 6);
    await compose(a, ['に', 'にほ', 'にほん'], '日本', async (i) => {
      if (i === 0) { b.replace(0, 0, 'R '); await deliver(); }
      if (i === 1) expect(textOf(a, 'p').startsWith('R ')).to.equal(false);
    });
    await deliver(2000);
    for (const t of [a, b]) expect(textOf(t, 'p')).to.equal('R Hello 日本');
    expect(caretIn(a, 'p')).to.equal(10);
  });

  it('an autocorrect replacement keeps a remote edit that landed in the same block', async () => {
    await setup('I saw teh cat');
    await placeCaret(a, 'p', 13);
    b.replace(13, 13, '!');
    await deliver();
    const { node } = textNodeAtSelection();
    const at = node.data.indexOf('teh');
    node.data = node.data.slice(0, at) + 'the' + node.data.slice(at + 3);
    document.getSelection().collapse(node, at + 3);
    a.editor.dom.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: 'the' }));
    await tick(30);
    await deliver(2000);
    for (const t of [a, b]) expect(textOf(t, 'p')).to.equal('I saw the cat!');
    expect(caretIn(a, 'p')).to.equal(9);
  });

  it('a phone-style selection move, then a remote insert before it: the caret stays on its word', async () => {
    await setup('alpha beta gamma');
    await placeCaret(a, 'p', 8);
    expect(caretIn(a, 'p')).to.equal(8);
    b.replace(0, 0, 'X ');
    await deliver();
    expect(textOf(a, 'p')).to.equal('X alpha beta gamma');
    expect(caretIn(a, 'p')).to.equal(10);
  });

  it('typing on, word by word, while the other tab types in the same paragraph loses nothing', async () => {
    await setup('Start.');
    await placeCaret(a, 'p', 6);
    const words = [' один', ' два', ' три'];
    for (const [i, w] of words.entries()) {
      await compose(a, [w.slice(0, 2), w], w);
      b.replace(0, 0, `${i}`);
      await deliver();
    }
    await deliver(2000);
    for (const t of [a, b]) expect(textOf(t, 'p')).to.equal('210Start. один два три');
    expect(caretIn(a, 'p')).to.equal(textOf(a, 'p').length);
  });
});

function posIn(tab, id, offset) {
  let pos = null;
  tab.editor.state.doc.forEach((node, at) => { if (node.attrs.id === id) pos = at + 1 + offset; });
  return pos;
}
