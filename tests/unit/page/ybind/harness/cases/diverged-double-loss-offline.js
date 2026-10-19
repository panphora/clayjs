import { legacy } from '../compat.js';
import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const plan = [{"at":5800,"tab":"a","kind":"save","f":[0.40019317460246384,0,0],"n":1,"answer":3000},{"at":5844,"tab":"c","kind":"type","f":[0.46159413759596646,0.2179498989135027,0.2915569709148258],"n":1},{"at":6340,"tab":"a","kind":"del","f":[0.871347006643191,0.11230073031038046,0.6091878588777035],"n":2},{"at":6353,"tab":"b","kind":"type","f":[0.44080661493353546,0.8667902159504592,0.22027291101403534],"n":1},{"at":6534,"tab":"a","kind":"del","f":[0.40462773642502725,0.2190408413298428,0.19248252944089472],"n":1},{"at":6535,"tab":"a","kind":"type","f":[0.3846633497159928,0.998253985773772,0.9517380606848747],"n":1},{"at":6699,"tab":"a","kind":"undo","f":[0.4852147581987083,0.3314586777705699,0.49168403074145317],"n":2},{"at":6893,"tab":null,"kind":"loss","f":[0.19935862929560244,0,0],"n":1,"gap":400,"fresh":true},{"at":7126,"tab":"a","kind":"offline","len":6117,"f":[0.17903257883153856,0,0],"n":1},{"at":11529,"tab":"a","kind":"type","f":[0.6064173872582614,0.13759403047151864,0.939638577401638],"n":1},{"at":11871,"tab":"b","kind":"del","f":[0.6141607221215963,0.1120574229862541,0.6180641674436629],"n":2},{"at":13991,"tab":"a","kind":"del","f":[0.148816030472517,0.23919023922644556,0.3690163721330464],"n":1},{"at":14580,"tab":"b","kind":"del","f":[0.1203878449741751,0.8137236116454005,0.5307420331519097],"n":2}];
  let settled = null;
  const cfg = { ...DEFAULT, ...PRESETS.textallx, debug: (what, { room, tabs }) => { if (what === 'end') settled = { room: legacy(room).blocks.p.c, views: [...tabs.values()].map((t) => t.blocks().map((b) => b[1]).join('|')) }; } };
  const out = await runPlan(plan, cfg, { seed: 257 });
  const agree = settled.views.every((v) => v === settled.room);
  log('expected: the room text and all three tab views identical once settled');
  log('actual:   room', JSON.stringify(settled.room));
  settled.views.forEach((v, i) => log('          tab', 'abc'[i], v === settled.room ? '(same as room)' : JSON.stringify(v)));
  log('          notices:', JSON.stringify(out.notices.map((n) => ({ kind: n.kind, tab: n.tab, lost: (n.lost ?? '').slice(0, 24) }))), 'findings:', JSON.stringify(out.findings.map((f) => f.cls + ': ' + f.detail.slice(0, 60))));
  return { pass: Boolean(agree), out: lines };
}
