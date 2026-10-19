import { Sim, createRoom, legacy } from '../compat.js';
import { makeYTab, seedValue, docOfValue } from '../tab.js';
import { state as pmState } from '../../../../../../src/vendor/prosemirror.vendor.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { TextSelection } = pmState;
  const value = seedValue([{ id: 'x1', text: 'ALPHA' }, { id: 'x2', text: 'bravo' }, { id: 'x3', text: 'OMEGA' }]);
  const sim = new Sim(1);
  const room = createRoom(sim, { page: value }, { latency: () => 40, answerLatency: () => 40 });
  const a = makeYTab(sim, room, 'a', JSON.parse(JSON.stringify(value)));
  const b = makeYTab(sim, room, 'b', JSON.parse(JSON.stringify(value)));
  a.start(); b.start();
  await sim.run(500);
  const find = (t, id) => { let f = null; t.editor.state.doc.forEach((n, pos) => { if (!f && n.attrs.id === id) f = { n, pos }; }); return f; };
  sim.at(1000, () => {
    const f = find(a, 'x2');
    const tr = a.editor.state.tr.delete(f.pos, f.pos + f.n.nodeSize);
    let end = 0; tr.doc.forEach((n, pos) => { if (n.attrs.id === 'x3') end = pos + n.nodeSize; });
    tr.insert(end, f.n);
    a.editor.dispatch(tr);
  });
  sim.at(1000, () => {
    const f = find(b, 'x2');
    const tr = b.editor.state.tr.replaceWith(f.pos + 1 + 2, f.pos + 1 + 4, b.editor.state.schema.text('X'));
    b.editor.dispatch(tr);
  });
  await sim.run(20000);
  await sim.idle(5000);
  const show = (t) => { const o = []; t.editor.state.doc.forEach((n) => o.push(n.textContent)); return o.join(' / '); };
  const doc = docOfValue(room.stores.get('page').value);
  const o = []; doc.forEach((n) => o.push(n.textContent));
  log('room    :', o.join(' / '));
  log('tab a   :', show(a), '| tab b:', show(b));
  log('notices :', JSON.stringify([a, b].flatMap((t) => t.bridge.notices)));
  const notices = [a, b].flatMap((t) => t.bridge.notices);
  const same = show(a) === show(b) && show(a) === o.join(' / ');
  log('expected: ALPHA / OMEGA / bravo in every tab and the room, plus a notice whose text holds the typed X');
  return { pass: same && o.join(' / ') === 'ALPHA / OMEGA / bravo' && notices.some((n) => JSON.stringify(n).includes('X')), out: lines };
}
