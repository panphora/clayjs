import { legacy } from '../compat.js';
import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const cfg = { ...DEFAULT, ...PRESETS.loss, chaos: { ...PRESETS.loss.chaos, gap: null } };
  const enter = { at: 8393, tab: 'a', kind: 'enter', f: [0.4414123287424445, 0.0925679903011769, 0.9701240393333137], n: 3 };
  let bad = false;
  log('expected: the tail appears once, no notice');
  for (const after of [null, 0, 30, 60, 104, 150, 250, 400, 800, 1500]) {
    const plan = after === null ? [enter] : [enter, { at: enter.at + after, tab: null, kind: 'loss', f: [0.4, 0, 0], n: 1, gap: null, fresh: true }];
    let final = null;
    const c2 = { ...cfg, debug: (what, { room }) => { if (what === 'end') final = Object.values(legacy(room).blocks).length; } };
    const out = await runPlan(plan, c2, { seed: 85 });
    const dup = out.findings.filter((f) => f.cls === 'duplicate').length;
    const fn = out.findings.filter((f) => f.cls === 'false-notice').length;
    if (dup || fn) bad = true;
    log('actual:  ', after === null ? 'no loss        ' : 'loss +' + String(after).padStart(4) + ' ms ', 'blocks', final, 'duplicated characters', dup, 'false notices', fn, 'notices', JSON.stringify(out.notices.map((n) => n.kind)));
  }
  return { pass: !(bad), out: lines };
}
