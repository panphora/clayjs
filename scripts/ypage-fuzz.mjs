// The page engine's fuzz battery, run outside jest.
//
//   node --import ./tests/unit/page/collab/env-dom.js scripts/ypage-fuzz.mjs <group|preset|all-gated> [seeds=100] [from=1]
//
// Prints one JSON line per preset, then the seeds with findings. Exits 1 when a
// gated preset has a finding class its ALLOWED list does not name.
import { runPreset } from '../tests/unit/page/ybind/harness/fuzz.js';
import { GROUPS, ALLOWED, PRESETS } from '../tests/unit/page/ybind/harness/presets.js';

const [target = 'all-gated', seeds = '100', from = '1'] = process.argv.slice(2);
const gatedGroups = Object.keys(GROUPS).filter((g) => g !== 'known');
const presets = target === 'all-gated' ? gatedGroups.flatMap((g) => GROUPS[g])
  : GROUPS[target] ? GROUPS[target]
  : PRESETS[target] ? [target]
  : null;
if (!presets) {
  console.error(`unknown group or preset: ${target}`);
  process.exit(2);
}
const gated = new Set(gatedGroups.flatMap((g) => GROUPS[g]));

let failed = false;
for (const preset of presets) {
  const out = await runPreset({ preset, seeds: Number(seeds), from: Number(from) });
  const bad = Object.keys(out.summary).filter((c) => !(ALLOWED[preset] ?? []).includes(c));
  console.log(JSON.stringify({ preset, seeds: out.seeds, from: out.from, seedsWith: out.seedsWith, summary: out.summary }));
  for (const line of out.lines) console.log(`  ${line}`);
  if (gated.has(preset) && bad.length) failed = true;
}
process.exit(failed ? 1 : 0);
