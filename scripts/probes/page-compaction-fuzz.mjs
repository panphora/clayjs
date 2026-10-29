import { readFileSync } from 'node:fs';
import { createRoomsAdapter, runPageRoomConformance } from '../../src/server/rooms/page-room-conformance.js';

const TEMPLATE = readFileSync(new URL('../../tests/fixtures/ypage-template.html', import.meta.url), 'utf8');

export function run({ seed = 1, steps = 400, tabs = 3, activeBytes = 160 * 1024, tailFloor = 8 * 1024, restarts = true, paste = 6000, log = false } = {}) {
  const adapter = createRoomsAdapter({ compaction: { activeBytes, loose: 32, soft: 16, leaseMs: 5000, tailFloor } });
  return runPageRoomConformance({ adapter, template: TEMPLATE, seed, steps, tabs, activeBytes, tailFloor, restarts, paste, log });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 1, count = 20, steps = 400, tabs = 3, restarts = 1, activeKiB = 160, paste = 6000] = process.argv.slice(2).map(Number);
  const results = [];
  for (let seed = from; seed < from + count; seed++) results.push(run({ seed, steps, tabs, restarts: Boolean(restarts), activeBytes: activeKiB * 1024, paste }));
  const sum = (k) => results.reduce((a, x) => a + x[k], 0);
  console.log(JSON.stringify({ seeds: results.length, admitted: sum('admitted'), refusedRetry: sum('refusedRetry'), capacity: sum('capacity'), stale: sum('stale'), restarts: sum('restarts'), resets: sum('resets'), unchangedRefusals: sum('unchangedRefusals'), reserve: sum('reserve'), tail: results.reduce((a, x) => a + x.commits.tail, 0), full: results.reduce((a, x) => a + x.commits.full, 0), maxLoose: Math.max(...results.map((x) => x.maxLoose)), maxBytes: Math.max(...results.map((x) => x.maxBytes)), blockedRuns: results.filter((x) => x.blocked).length, legacyWrites: sum('legacyWrites'), legacyMerged: sum('legacyMerged'), landed: sum('landed') }));
}
