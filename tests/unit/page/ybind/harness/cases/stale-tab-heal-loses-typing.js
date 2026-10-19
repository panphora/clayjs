import { tabs } from './_drv.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const { sim, room, list: [a, b], result, done } = await tabs('alpha bravo charlie delta echo', ['a', 'b']);
  await sim.run(3500);
  room.close('a');
  b.replace(6, 6, 'NEW ');
  await sim.run(sim.now() + 1200);
  const file = JSON.parse(JSON.stringify(room.stores.get('page').value));
  room.land('page', room.seq);
  room.restart({ page: file });
  await sim.run(sim.now() + 10000);
  room.open('a');
  await sim.run(sim.now() + 15000);
  await sim.idle(5000);
  const r = result();
  done();
  const expected = 'alpha NEW bravo charlie delta echo';
  log('expected:', JSON.stringify({ room: expected, views: [expected, expected], notices: [] }));
  log('actual:  ', JSON.stringify({ room: r.room, views: r.views, notices: r.notices.map((n) => n.kind + ':' + JSON.stringify(n.lost)) }));
  return { pass: Boolean(r.room === expected && r.views.every((v) => v === expected)), out: lines };
}
