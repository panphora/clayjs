import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const plan = [{"at": 853, "tab": "a", "kind": "pastecross", "f": [0.1982734613120556, 0.369258422171697, 0.11123331682756543], "n": 3}, {"at": 910, "tab": "b", "kind": "del", "f": [0.01036248286254704, 0.8478547539561987, 0.6703969144728035], "n": 2}];
  const cfg = { ...DEFAULT, ...PRESETS.burstcross };
  const out = await runPlan(plan, cfg, { seed: 4 });
  log('expected: no character that b deleted is in the page (the oracle names them as `undead`)');
  log('actual:  ', JSON.stringify(out.final));
  for (const f of out.findings.slice(0, 6)) log('          ' + f.cls + ': ' + f.detail.slice(0, 120));
  log('          findings:', out.findings.length, 'notices:', JSON.stringify(out.notices.map((n) => n.kind)));
  return { pass: !(out.findings.length), out: lines };
}
