import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createOriginIndex, spanKey, aliasKey } from "../../../../src/page/ybind/origins.js";
import { createPageDoc, seedFrom, reduceRecovery, removeKey, authorKey } from "../../../../src/page/ybind/index.js";
import { LOCAL } from "../../../../src/page/ybind/layout.js";
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

const seeded = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  pd.origins.set(authorKey(1), "seed");
  return pd;
};
const markerAt = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return { at, key: `${it.id.client}.${it.id.clock}` };
    at += it.length;
  }
  throw new Error(`Missing marker ${id}`);
};

// Reading a hidden region's visible origins is one range per run of items, not one lookup
// per unit: a five-character run costs one range whose length is five.
test("the reduction resolves a hidden run's visible origins a range at a time", () => {
  const pd = seeded();
  const q = markerAt(pd, "q"), r = markerAt(pd, "r");
  pd.ydoc.transact(() => {
    pd.gone.set(removeKey(q.key, "op-q"), { blockId: "q", end: r.key, sv: [] });
    pd.flow.delete(q.at, 5);
  }, LOCAL);
  const index = createOriginIndex(pd.origins);
  const lengths = [];
  const counting = Object.create(index);
  counting.resolveRange = (client, clock, length) => {
    lengths.push(length);
    return index.resolveRange(client, clock, length);
  };
  try {
    const record = reduceRecovery(pd, { index: counting }).sources.get(q.key);
    expect(record.blocks[0].id).toBe("q");
    expect(lengths).toContain(5);
  } finally {
    index.dispose();
  }
});
