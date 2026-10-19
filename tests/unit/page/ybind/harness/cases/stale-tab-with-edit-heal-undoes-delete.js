import { tabs } from './_drv.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  let bad = false;
  for (const returnAfter of [1500, 5000, 20000]) {
    const { sim, room, list: [a, b], result, done } = await tabs('alpha bravo charlie delta echo', ['a', 'b']);
    await sim.run(3500);
    room.close('a');
    a.replace(0, 0, 'ZZ ');
    b.replace(5, 11, '');
    await sim.run(sim.now() + 1200);
    const file = JSON.parse(JSON.stringify(room.stores.get('page').value));
    room.land('page', room.seq);
    room.restart({ page: file });
    await sim.run(sim.now() + returnAfter);
    room.open('a');
    await sim.run(sim.now() + 15000);
    await sim.idle(5000);
    const r = result();
    done();
    const expected = 'ZZ alpha charlie delta echo';
    const ok = r.room === expected && r.views.every((v) => v === expected);
    bad ||= !ok;
    log('returnAfter', returnAfter, 'expected:', JSON.stringify(expected), 'actual:', JSON.stringify({ room: r.room, views: r.views, notices: r.notices.map((n) => n.kind + ':' + JSON.stringify(n.lost)) }));
  }
  return { pass: !(bad), out: lines };
}
