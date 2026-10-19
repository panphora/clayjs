import { runPlan, DEFAULT } from '../fuzz.js';
import { PRESETS } from '../presets.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  const plan = [{"at": 8052, "tab": "a", "kind": "paste", "f": [0.8319613991770893, 0.7840332174673676, 0.12737284298054874], "n": 2}, {"at": 11805, "tab": "b", "kind": "paste", "f": [0.9719001860357821, 0.39322918304242194, 0.0419716602191329], "n": 1}, {"at": 11906, "tab": "c", "kind": "type", "f": [0.6118353174533695, 0.4178520427085459, 0.40745741524733603], "n": 1}, {"at": 12052, "tab": null, "kind": "loss", "f": [0.2938520102761686, 0, 0], "n": 1, "gap": null, "fresh": false}, {"at": 12287, "tab": "b", "kind": "paste", "f": [0.969628871884197, 0.7340410158503801, 0.8579763267189264], "n": 1}, {"at": 13024, "tab": "b", "kind": "undo", "f": [0.9146912277210504, 0.651890354231, 0.02794432803057134], "n": 1}];
  const cfg = { ...DEFAULT, ...PRESETS.lossx };
  const out = await runPlan(plan, cfg, { seed: 72 });
  const heals = out.notices.filter((n) => n.kind === 'heal');
  log('expected: no heal notice (the word is in the agreed text on every tab at the end)');
  log('actual:  ', JSON.stringify(heals.map((n) => ({ tab: n.tab, lost: n.lost }))), 'findings:', JSON.stringify(out.findings.map((f) => f.cls)));
  return { pass: !(heals.length), out: lines };
}
