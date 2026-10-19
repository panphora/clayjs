import { runBig } from './_big-debug.js';

export async function run() {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  let bad = 0;
  log('expected: every tab view equals the room text once settled');
  for (const seed of [9, 10]) {
    const out = await runBig(seed, { n: 24000, offline: 1, loss: 1 });
    const d = out.findings.filter((f) => f.cls === 'diverged');
    log('actual:  ', 'seed', seed, JSON.stringify(out.findings.map((f) => f.cls + ' ' + f.detail)), 'notices', JSON.stringify(out.noticeKinds));
    if (d.length) bad++;
  }
  return { pass: !(bad), out: lines };
}
