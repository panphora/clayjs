import { tabs } from './_drv.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const run = async (loss) => {
    const { sim, room, list, result, done } = await tabs('alpha bravo charlie delta echo foxtrot', ['a', 'b', 'c']);
    const t = Object.fromEntries(list.map((x) => [x.id, x]));
    await sim.run(1500);
    const file = JSON.parse(JSON.stringify(room.stores.get('page').value));
    room.land('page', room.seq);
    const T = sim.now() + 100;
    if (loss) sim.at(T, () => room.restart({ page: file }));
    sim.at(T + 77, () => t.b.format(6, 19, 'b'));
    sim.at(T + 164, () => { t.a.caret = 10; t.a.type('XX'); });
    await sim.run(T + 30000);
    await sim.run(sim.now() + 6000);
    const r = result();
    const show = (x) => {
      let out = '';
      for (let k = 0; k < x.view.length; k++) {
        const on = (i) => x.marks[i] && x.marks[i].includes('b');
        out += (on(k) && !on(k - 1) ? '[' : '') + x.view[k] + (on(k) && !on(k + 1) ? ']' : '');
      }
      return out;
    };
    const shown = list.map(show);
    done();
    return { shown, notices: r.notices.map((n) => `${n.kind}:${JSON.stringify(n.lost)}`) };
  };
  const control = await run(false);
  const lossy = await run(true);
  log('no loss: ', JSON.stringify(control.shown[0]), JSON.stringify(control.notices));
  log('expected (after a loss): the same as without one');
  log('actual:  ', JSON.stringify(lossy.shown), JSON.stringify(lossy.notices));
  return { pass: lossy.shown.every((s) => s === "alpha [bravXXo charlie] delta echo foxtrot") && lossy.notices.length === 0, out: lines };
}
