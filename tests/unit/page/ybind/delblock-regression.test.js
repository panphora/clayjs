import { DEFAULT, genPlan, runPlan } from "./harness/fuzz.js";
import { PRESETS } from "./harness/presets.js";

const AT = [749, 1070, 1815, 1843, 2392];

test("editing after four whole-block deletes hide every marker", async () => {
  const cfg = { ...DEFAULT, ...PRESETS.delblockonly };
  let tabs = null;
  const debug = (mark, ctx) => { if (mark === "end") tabs = ctx.tabs; };
  const plan = genPlan(5128 * 7919, cfg).filter((a) => AT.includes(a.at));
  const out = await runPlan(plan, { ...cfg, debug }, { seed: 5128 });
  expect(out.findings.filter((f) => f.cls === "exception")).toEqual([]);
  expect(out.findings.filter((f) => f.cls === "diverged")).toEqual([]);
  const typed = [...out.ev].filter(([, es]) => es.some((e) => e.kind === "ins")).map(([c]) => c);
  expect(typed.length).toBeGreaterThan(0);
  const room = out.final.join("\n");
  for (const c of typed) expect(room).toContain(c);
  const views = [...tabs.values()].map((t) => t.blocks().map(([, c]) => c).join("\n"));
  expect(views).toHaveLength(cfg.tabs.length);
  for (const view of views) for (const c of typed) expect(view).toContain(c);
});
