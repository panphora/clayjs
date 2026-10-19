import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const plan = [{"at": 708, "tab": "b", "kind": "pastecross", "f": [0.623217104235664, 0.6864958414807916, 0.7266087874304503], "n": 3}, {"at": 774, "tab": "a", "kind": "delcross", "f": [0.4458328732289374, 0.19937936984933913, 0.18166644405573606], "n": 2}];
  const cfg = { ...DEFAULT, ...PRESETS.burstcross };
  const out = await runPlan(plan, cfg, { seed: 17 });
  log('expected: no character that a deleted is in the page (the oracle names them as `undead`)');
  log('actual:  ', JSON.stringify(out.final));
  for (const f of out.findings.slice(0, 6)) log('          ' + f.cls + ': ' + f.detail.slice(0, 120));
  log('          findings:', out.findings.length, 'notices:', JSON.stringify(out.notices.map((n) => n.kind)));
  return { pass: !(out.findings.length), out: lines };
}
