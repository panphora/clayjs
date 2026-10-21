import { DEFAULT, genPlan, runPlan } from "./harness/fuzz.js";
import { PRESETS } from "./harness/presets.js";

const AT = [4922, 6429, 6655, 9249, 9462];
const BAD = ["diverged", "mismatch", "exception", "silent-loss"];

test("a deleted undo-recreated boundary stops a null-ended removal", async () => {
  const cfg = { ...DEFAULT, ...PRESETS.delundo0 };
  const plan = genPlan(5104 * 7919, cfg).filter((a) => AT.includes(a.at));
  expect(plan.map((a) => a.kind)).toEqual(["join", "delblock", "undo", "type", "join"]);
  const out = await runPlan(plan, cfg, { seed: 5104 });
  expect(out.findings.filter((f) => BAD.includes(f.cls))).toEqual([]);
  const typed = [...out.ev].filter(([, es]) => es.some((e) => e.kind === "ins" && e.t === 9249)).map(([c]) => c);
  expect(typed.length).toBeGreaterThan(0);
  const room = out.final.join("\n");
  for (const c of typed) expect(room).toContain(c);
});

const AT2 = [5324, 7572, 7802, 8261, 8496, 12575, 12964, 13263, 13824];

test("a replicated removed boundary stops a null-ended removal after reload", async () => {
  const cfg = { ...DEFAULT, ...PRESETS.delundo0 };
  const plan = genPlan(5112 * 7919, cfg).filter((a) => AT2.includes(a.at));
  expect(plan.map((a) => a.kind)).toEqual(["delblock", "enter", "delblock", "delblock", "undo", "redo", "enter", "undo", "type"]);
  const out = await runPlan(plan, cfg, { seed: 5112 });
  expect(out.findings.filter((f) => BAD.includes(f.cls))).toEqual([]);
});

test("a boundary merged into a deleted item keeps text on every replica after offline reload", async () => {
  const cfg = { ...DEFAULT, ...PRESETS.offline };
  const plan = genPlan(5161 * 7919, cfg);
  const out = await runPlan(plan, cfg, { seed: 5161 });
  expect(out.findings).toEqual([]);
});
