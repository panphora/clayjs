/**
 * @jest-environment node
 */
// The D13 invariants over real host-mode rooms: seeded runs with several tabs,
// restarts, resets and legacy file writes. Each run throws with the seed and the
// invariant it broke; this test also proves the fuzz reaches every branch, since
// a run that admits nothing and compacts nothing would pass vacuously.
import { run } from "../../../scripts/probes/page-compaction-fuzz.mjs";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test("seeds 1 to 10 keep every invariant and reach every branch", () => {
  const results = SEEDS.map((seed) => run({ seed, steps: 300, tabs: 3 }));
  expect(results.map((result) => result.seed)).toEqual(SEEDS);
  const sum = (pick) => results.reduce((total, result) => total + pick(result), 0);
  const branches = {
    admitted: sum((result) => result.admitted),
    tail: sum((result) => result.commits.tail),
    full: sum((result) => result.commits.full),
    restarts: sum((result) => result.restarts),
    legacyMerged: sum((result) => result.legacyMerged),
    refusedRetry: sum((result) => result.refusedRetry),
  };
  expect(Object.entries(branches).filter(([, count]) => count < 1)).toEqual([]);
}, 60_000);
