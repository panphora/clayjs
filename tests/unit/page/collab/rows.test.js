// The page's collaboration rows and fuzz, on the engines ENGINES names: "blocks"
// (the default: real EditorViews under jsdom, bound by src/page/binding.js) and
// "text" (the simulated tab the replay was built against).
//   ENGINES=blocks npm test -- tests/unit/page/collab/rows.test.js
//   ENGINES=blocks,text SEEDS=40 npm test -- tests/unit/page/collab/rows.test.js
import { ROWS, runRow } from "./text/rows.js";
import { BLOCK_ROWS, runBlockRow } from "./blocks/rows.js";
import { SUITES, scenario } from "./text/fuzz.js";
import { engines } from "./engines.js";

const list = await engines();
const SEEDS = Number(process.env.SEEDS || 10);
const scenarios = Object.entries(SUITES).flatMap(([suite, all]) => Object.entries(all).map(([label, o]) => [`${suite}: ${label}`, o]));

// The rows that test the replay alone run once, not once per engine.
test.each(ROWS.filter((r) => r.kind === "core").map((r) => [r.id, r]))("replay row %s", async (_id, row) => {
  expect((await runRow(row)).problems).toEqual([]);
});

describe.each(list.map((e) => [e.name, e]))("%s engine", (_name, engine) => {
  test.each(ROWS.filter((r) => r.kind !== "core").map((r) => [r.id, r]))("row %s", async (_id, row) => {
    expect((await runRow(row, engine)).problems).toEqual([]);
  }, 60_000);

  if (engine.name === "blocks") {
    test.each(BLOCK_ROWS.map((r) => [r.id, r]))("block row %s", async (_id, row) => {
      expect((await runBlockRow(row)).problems).toEqual([]);
    }, 60_000);
  }

  // Lost words are allowed only after a room loss, and only in a notice.
  test.each(scenarios)(`fuzz %s, ${SEEDS} seeds`, async (_label, o) => {
    const bad = [];
    for (let s = 1; s <= SEEDS; s++) {
      const out = await scenario({ ...o, seed: s * 7919, engine });
      const lostOk = o.chaos === "loss" ? out.inNotice : 0;
      const slow = Object.values(out.lostSeconds).some((x) => x >= 2);
      if (!out.converged || out.lost > lostOk || out.silentLost || out.garbled || out.dup || out.misordered || slow || out.problems.length) {
        bad.push({ seed: s * 7919, converged: out.converged, lost: out.lost, garbled: out.garbled, dup: out.dup, misordered: out.misordered, problems: out.problems });
      }
    }
    expect(bad).toEqual([]);
  }, 300_000);
});
