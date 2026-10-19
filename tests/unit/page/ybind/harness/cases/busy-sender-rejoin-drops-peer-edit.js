import { Sim, createRoom, legacy } from '../compat.js';
import { makeTab } from '../compat.js';
import { state as pmState, commands } from '../../../../../../src/vendor/prosemirror.vendor.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { TextSelection } = pmState;
  const sim = new Sim(1);
  const initial = { blocks: { p: { t: 'paragraph', pos: 'B', c: 'alpha bravo charlie delta echo foxtrot golf hotel' } }, deleted: {} };
  const room = createRoom(sim, { page: initial }, {
    latency: () => 60, answerLatency: () => 60,
    refuse: (id) => (id === 'b' && sim.now() > 4087 && sim.now() < 6739 ? { status: 503, body: { code: 'busy' }, retryAfter: 2 } : null),
  });
  const tabs = new Map(['a', 'b', 'c'].map((id) => [id, makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)), { quiet: 500 })]));
  for (const t of tabs.values()) t.start();
  const b = tabs.get('b'), c = tabs.get('c');
  const at = (t, pos, to = pos) => t.editor.dispatch(t.editor.state.tr.setSelection(TextSelection.create(t.editor.state.doc, pos, to)));
  const del = (t, text) => { const i = t.view.indexOf(text); at(t, 1 + i, 1 + i + text.length); commands.deleteSelection(t.editor.state, t.editor.dispatch); };
  sim.at(4167, () => del(b, 'alpha '));
  sim.at(6126, () => del(c, 'arlie d'));
  sim.at(6354, () => b.save({ answer: 80 }));
  await sim.run(30000);
  await sim.run(sim.now() + 8000);
  const value = legacy(room).blocks.p.c;
  const views = [...tabs.values()].map((t) => t.blocks().map((x) => x[1]).join('|'));
  const expected = 'bravo chelta echo foxtrot golf hotel';
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => t.id + ':' + n.kind + ':' + JSON.stringify(n.lost)));
  for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
  log('expected:', JSON.stringify(expected), '(b deleted "alpha ", c deleted "arlie d")');
  log('actual:  ', JSON.stringify(value), views.every((x) => x === value) ? '(all tabs agree)' : 'VIEWS ' + JSON.stringify(views), 'notices', JSON.stringify(notices));
  return { pass: Boolean(value === expected && views.every((x) => x === value)), out: lines };
}
