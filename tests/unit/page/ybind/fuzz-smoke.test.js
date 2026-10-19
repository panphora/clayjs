import { runPreset } from "./harness/fuzz.js";
import { GROUPS, ALLOWED } from "./harness/presets.js";

const SEEDS = Number(process.env.SEEDS || 20);

test.each(GROUPS.m1)(`preset %s, ${SEEDS} seeds, no findings`, async (preset) => {
  const out = await runPreset({ preset, seeds: SEEDS, from: 1 });
  const bad = Object.keys(out.summary).filter((c) => !(ALLOWED[preset] ?? []).includes(c));
  if (bad.length) throw new Error(out.lines.join("\n"));
}, 120000);
