import { tabs } from './_drv.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const gaps = [-100, -50, 0, 50, 100, 200];
  let bad = 0;
  const rows = [];
  for (const gap of gaps) {
    const { sim, room, list: [a, b], result, done } = await tabs('alpha bravo charlie delta echo', ['a', 'b']);
    await sim.run(1000);
    const file = JSON.parse(JSON.stringify(room.stores.get('page').value));
    room.land('page', room.seq);
    const t0 = sim.now() + 100;
    sim.at(t0, () => { b.caret = 5; b.type(' ONE'); });
    sim.at(t0 + 3000 + gap, () => b.replace(5, 9, ''));
    sim.at(t0 + 3000, () => room.restart({ page: file }));
    await sim.run(25000); await sim.idle(5000);
    const r = result();
    done();
    const ok = r.room === 'alpha bravo charlie delta echo' && r.views.every((v) => v === r.room);
    rows.push({ deleteMsFromLoss: gap, room: r.room, notices: r.notices.map((n) => n.kind), ok });
    if (!ok) bad++;
  }
  log('expected: room "alpha bravo charlie delta echo" in every row');
  for (const row of rows) log('actual:  ', JSON.stringify(row));
  return { pass: !(bad), out: lines };
}
