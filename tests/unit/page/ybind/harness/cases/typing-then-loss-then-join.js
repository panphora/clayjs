import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const cfg = { ...DEFAULT, ...PRESETS.loss, chaos: { ...PRESETS.loss.chaos, gap: null } };
  const type = { at: 10880, tab: 'c', kind: 'type', f: [0.8908030465245247, 0.1770842073019594, 0.3262272668071091], n: 3 };
  const loss = { at: 10939, tab: null, kind: 'loss', f: [0.9125161294359714, 0, 0], n: 1, gap: null, fresh: true };
  const join = { tab: 'c', kind: 'join', f: [0.8940451773814857, 0.7849488903302699, 0.2877449654042721], n: 3 };
  let bad = false;
  log('expected: the 3 typed characters are in the page after the join, or named in a notice');
  for (const after of [100, 400, 800, 1200, 2000, 3000, 4500, 8000]) {
    const out = await runPlan([type, loss, { ...join, at: loss.at + after }], cfg, { seed: 17 });
    const silent = out.findings.filter((f) => f.cls === 'silent-loss');
    bad ||= silent.length > 0;
    log('actual:   join', String(after).padStart(4), 'ms after the loss:', silent.length ? 'SILENT LOSS of ' + silent.length + ' characters, notices ' + JSON.stringify(out.notices.map((n) => n.kind)) : 'ok', silent.length ? '' : 'findings ' + JSON.stringify(out.findings.map((f) => f.cls)));
  }
  return { pass: !(bad), out: lines };
}
