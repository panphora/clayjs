import { DEFAULT, genPlan, runPlan } from "./harness/fuzz.js";
import { PRESETS } from "./harness/presets.js";

const cfg = { ...DEFAULT, ...PRESETS.delundo0 };
const CASES = [
  { seed: 5101, at: [8904, 10344, 10355, 11772] },
  { seed: 5106, at: [1415, 2747, 2756, 11678] },
  { seed: 5139, at: [1397, 1422, 13456] },
];

const insertedAt = (out, tab, t) => [...out.ev].filter(([, es]) => es.some((e) => e.kind === "ins" && e.tab === tab && e.t === t)).map(([c]) => c);

for (const { seed, at } of CASES) {
  test(`delundo0 seed ${seed}: local Undo of hidden typing is not silent loss`, async () => {
    const plan = genPlan(seed * 7919, cfg).filter((a) => at.includes(a.at));
    const types = plan.filter((a) => a.kind === "type");
    const undos = plan.filter((a) => a.kind === "undo");
    expect(types).toHaveLength(1);
    expect(undos).toHaveLength(1);
    expect(undos[0].at).toBeGreaterThan(types[0].at);
    expect(undos[0].tab).toBe(types[0].tab);
    const out = await runPlan(plan, cfg, { seed });
    const chars = insertedAt(out, types[0].tab, types[0].at);
    expect(chars.length).toBeGreaterThan(0);
    const final = out.final.join("\n");
    for (const c of chars) expect(final).not.toContain(c);
    expect(out.findings.filter((f) => f.cls === "silent-loss")).toEqual([]);
  });
}

test("delundo0 seed 5101 without Undo keeps the normal recovery oracle", async () => {
  const { seed, at } = CASES[0];
  const plan = genPlan(seed * 7919, cfg).filter((a) => at.includes(a.at) && a.kind !== "undo" && a.kind !== "redo");
  const types = plan.filter((a) => a.kind === "type");
  expect(types).toHaveLength(1);
  expect(plan.some((a) => a.kind === "undo" || a.kind === "redo")).toBe(false);
  const out = await runPlan(plan, cfg, { seed });
  const chars = insertedAt(out, types[0].tab, types[0].at);
  expect(chars.length).toBeGreaterThan(0);
  const final = out.final.join("\n");
  const notices = JSON.stringify(out.notices);
  expect(out.findings.filter((f) => f.cls === "silent-loss")).toEqual([]);
  for (const c of chars) {
    if (final.includes(c)) continue;
    expect(notices).toContain(c);
  }
});

test("busy seed 5167: Undo skips a spent item and accounts for the paste it removes", async () => {
  const seed = 5167;
  const at = [2347, 2425, 2589, 5657, 5786, 6661, 7591, 7710, 7925, 8226, 9283, 10047];
  const plan = genPlan(seed * 7919, { ...DEFAULT, ...PRESETS.busy }).filter((a) => at.includes(a.at));
  expect(plan).toHaveLength(at.length);
  const stacks = [];
  const out = await runPlan(plan, {
    ...DEFAULT,
    ...PRESETS.busy,
    trace(action, { tabs }) {
      if (action.at === 9283 || action.at === 10047) stacks.push(tabs.get("b").bridge.um.undoStack.length);
    },
  }, { seed });
  expect(stacks[0] - stacks[1]).toBe(2);
  const chars = insertedAt(out, "b", 7925);
  expect(chars.length).toBe(4);
  for (const c of chars) expect(out.final.join("\n")).not.toContain(c);
  expect(out.findings.filter((f) => f.cls === "silent-loss")).toEqual([]);
});
