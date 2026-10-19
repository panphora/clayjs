import { Sim, createRoom, legacy } from '../compat.js';
import { makeTab } from '../compat.js';
import { state as pmState, commands } from '../../../../../../src/vendor/prosemirror.vendor.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { TextSelection } = pmState;
  const run = async (edit) => {
    const sim = new Sim(1);
    const initial = { blocks: { p: { t: 'paragraph', pos: 'B', c: 'alpha bravo charlie delta echo foxtrot' } }, deleted: {} };
    const refuse = { until: -1 };
    const room = createRoom(sim, { page: initial }, { latency: () => 60, answerLatency: () => 60, refuse: (id) => (id === 'a' && sim.now() < refuse.until ? { status: 503, body: { code: 'busy' }, retryAfter: 2 } : null) });
    const tabs = new Map(['a', 'b'].map((id) => [id, makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)), { quiet: 500 })]));
    for (const t of tabs.values()) t.start();
    const a = tabs.get('a'), b = tabs.get('b');
    const at = (t, pos, to = pos) => t.editor.dispatch(t.editor.state.tr.setSelection(TextSelection.create(t.editor.state.doc, pos, to)));
    sim.at(6384, () => { refuse.until = sim.now() + 3795; });
    sim.at(7288, () => { at(b, 30); b.input('PEER'); });
    sim.at(7317, () => { at(a, 7); a.input('XYZ'); });
    sim.at(7403, () => a.save({ answer: 80 }));
    sim.at(9130, () => {
      if (edit === 'undo') return a.undo();
      if (edit === 'backspace') { at(a, 9, 10); return commands.deleteSelection(a.editor.state, a.editor.dispatch); }
      at(a, 9); a.input('Q');
    });
    await sim.run(30000); await sim.idle(8000);
    const room_ = legacy(room).blocks.p.c;
    const views = [...tabs.values()].map((t) => t.blocks().map((x) => x[1]).join('|'));
    const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => t.id + ':' + n.kind + ':' + n.lost));
    for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
    return { room: room_, views, notices };
  };
  const expected = {
    undo: 'alpha bravo charlie delta echPEERo foxtrot',
    backspace: 'alpha XYbravo charlie delta echPEERo foxtrot',
    inside: 'alpha XYQZbravo charlie delta echPEERo foxtrot',
  };
  let bad = 0;
  for (const edit of ['undo', 'backspace', 'inside']) {
    const r = await run(edit);
    const ok = r.room === expected[edit] && r.views.every((v) => v === expected[edit]);
    if (!ok) bad++;
    log(`${edit}:`.padEnd(11), ok ? 'ok' : 'WRONG');
    log('  expected:', JSON.stringify(expected[edit]));
    log('  actual:  ', JSON.stringify(r.room), 'notices', JSON.stringify(r.notices));
  }
  return { pass: !(bad), out: lines };
}
