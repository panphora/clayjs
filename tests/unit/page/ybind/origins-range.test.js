import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createOriginIndex, spanKey, aliasKey } from "../../../../src/page/ybind/origins.js";
import { rng } from "./harness/rng.js";

const expand = (pieces) => pieces.flatMap((piece) => Array.from({ length: piece.length }, (_, k) => `${piece.client}.${piece.clock + k}`));

test("a range resolves to exactly what each of its units resolves to, through overlapping spans, aliases and deletions", () => {
  const r = rng(20261029);
  let ranges = 0;
  for (let round = 0; round < 200; round++) {
    const doc = new Y.Doc();
    const origins = doc.getMap("origins");
    const index = createOriginIndex(origins);
    doc.transact(() => {
      for (let i = 0, n = 1 + r.int(12); i < n; i++) origins.set(spanKey(r.int(3), r.int(60)), { length: 1 + r.int(15), sourceClient: r.int(4), sourceClock: r.int(200) });
      for (let i = 0, n = r.int(10); i < n; i++) origins.set(aliasKey(r.int(3), r.int(80)), { sourceClient: r.int(4), sourceClock: r.int(200) });
      for (let i = 0, n = r.int(3); i < n; i++) origins.set(aliasKey(r.int(3), r.int(80)), { invalid: true });
    });
    if (round % 3 === 0) doc.transact(() => { for (const key of [...origins.keys()]) if (r.int(4) === 0) origins.delete(key); });
    for (let q = 0; q < 30; q++) {
      const client = r.int(3), clock = r.int(90), length = 1 + r.int(30);
      const direct = Array.from({ length }, (_, k) => { const s = index.resolve({ client, clock: clock + k }); return `${s.client}.${s.clock}`; });
      expect(expand(index.resolveRange(client, clock, length))).toEqual(direct);
      ranges++;
    }
    index.dispose();
  }
  expect(ranges).toBe(6000);
});
