import { Sim, createRoom, legacy } from '../compat.js';
import { makeTab, find } from '../compat.js';
import { commands, state as pmState } from '../../../../../../src/vendor/prosemirror.vendor.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { TextSelection } = pmState;
  const initial = { blocks: { p: { t: 'paragraph', pos: 'M', c: 'one two three' }, q: { t: 'paragraph', pos: 'V', c: 'four five six' } }, deleted: {} };
  const sim = new Sim(1);
  const room = createRoom(sim, { page: initial }, { latency: () => 40, answerLatency: () => 40 });
  const tabs = new Map(['a', 'b', 'c'].map((id) => [id, makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)))]));
  for (const t of tabs.values()) t.start();
  await sim.run(500);
  const join = (t) => {
    const f = find(t.editor.state.doc, 'q');
    t.editor.dispatch(t.editor.state.tr.setSelection(TextSelection.create(t.editor.state.doc, f.pos + 1)));
    commands.joinBackward(t.editor.state, t.editor.dispatch);
  };
  sim.at(1000, () => join(tabs.get('a')));
  sim.at(1000, () => join(tabs.get('b')));
  await sim.run(20000);
  await sim.idle(5000);
  const v = legacy(room);
  const live = Object.keys(v.blocks).filter((id) => !v.deleted?.[id]).sort((x, y) => (v.blocks[x].pos < v.blocks[y].pos ? -1 : 1)).map((id) => v.blocks[id].c);
  const views = [...tabs.values()].map((t) => t.blocks().map((x) => x[1]).join('|') === live.join('|'));
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => t.id + ':' + n.kind));
  for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
  const copies = live.join('').split('four five six').length - 1;
  log('expected: ["one two threefour five six"] ("four five six" once)');
  log('actual:  ', JSON.stringify(live), 'all tabs agree:', views.every(Boolean), 'notices:', JSON.stringify(notices));
  return { pass: Boolean(copies === 1), out: lines };
}
