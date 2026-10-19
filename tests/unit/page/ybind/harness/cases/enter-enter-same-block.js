import { Sim, createRoom, legacy } from '../compat.js';
import { makeTab, find } from '../compat.js';
import { commands, state as pmState } from '../../../../../../src/vendor/prosemirror.vendor.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { TextSelection } = pmState;
  const initial = { blocks: { p: { t: 'paragraph', pos: 'M', c: 'one two three four five' }, q: { t: 'paragraph', pos: 'V', c: '' } }, deleted: {} };
  const sim = new Sim(1);
  const room = createRoom(sim, { page: initial }, { latency: () => 40, answerLatency: () => 40 });
  const tabs = new Map(['a', 'b'].map((id) => [id, makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)))]));
  for (const t of tabs.values()) t.start();
  await sim.run(500);
  const enterAt = (t, at) => {
    const f = find(t.editor.state.doc, 'p');
    t.editor.dispatch(t.editor.state.tr.setSelection(TextSelection.create(t.editor.state.doc, f.pos + 1 + at)));
    commands.splitBlock(t.editor.state, t.editor.dispatch);
  };
  sim.at(1000, () => enterAt(tabs.get('a'), 7));
  sim.at(1000, () => enterAt(tabs.get('b'), 14));
  await sim.run(20000);
  await sim.idle(5000);
  const v = legacy(room);
  const live = Object.keys(v.blocks).filter((id) => !v.deleted?.[id]).sort((x, y) => (v.blocks[x].pos < v.blocks[y].pos ? -1 : 1)).map((id) => v.blocks[id].c);
  const views = [...tabs.values()].map((t) => t.blocks().map((b) => b[1]));
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => n.kind));
  for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
  const count = live.join('').split('four five').length - 1;
  log('expected: "four five" appears once in the page');
  log('actual:  ', JSON.stringify({ room: live, views: views.map((x) => x.join('|') === live.join('|')), notices }), 'copies of "four five":', count);
  return { pass: Boolean(count === 1), out: lines };
}
