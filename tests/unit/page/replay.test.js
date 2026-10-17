import { ROWS, runRow } from "./collab/text/rows.js";
import { SUITES, scenario } from "./collab/text/fuzz.js";

const SEEDS = 10;

describe("S1 text rows", () => {
  for (const row of ROWS) {
    test(`${row.id}: ${row.source}`, async () => {
      const out = await runRow(row);
      expect(out.problems).toEqual([]);
    });
  }
});

describe(`S1 text fuzz, ${SEEDS} seeds`, () => {
  for (const [suite, scenarios] of Object.entries(SUITES)) {
    for (const [label, options] of Object.entries(scenarios)) {
      test(`${suite}: ${label}`, async () => {
        for (let s = 1; s <= SEEDS; s++) {
          const seed = s * 7919;
          const out = await scenario({ ...options, seed });
          const lostAllowed = options.chaos === "loss" ? out.lost : 0;
          expect({ seed, converged: out.converged, lost: out.lost, silentLost: out.silentLost, garbled: out.garbled, dup: out.dup, misordered: out.misordered })
            .toEqual({ seed, converged: true, lost: lostAllowed, silentLost: 0, garbled: 0, dup: 0, misordered: 0 });
          for (const seconds of Object.values(out.lostSeconds)) expect(seconds).toBeLessThan(2);
        }
      });
    }
  }
});
