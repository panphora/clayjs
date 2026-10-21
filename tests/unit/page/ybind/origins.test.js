import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, LOCAL, NET, createOriginIndex, installUndoOrigins, unitIds, spanKey, aliasKey } from "../../../../src/page/ybind/index.js";

const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const owners = (pd, index) => unitIds(pd.flow, 0, pd.flow.length).map((id) => index.resolve(id));
const partsOf = (flow, from, to) => {
  const out = [];
  let at = 0;
  for (const part of flow.toDelta()) {
    const length = typeof part.insert === "string" ? part.insert.length : 1;
    const start = at;
    at += length;
    const lo = Math.max(from, start), hi = Math.min(to, at);
    if (hi <= lo) continue;
    out.push(typeof part.insert === "string" ? { insert: part.insert.slice(lo - start, hi - start), attributes: part.attributes } : { insert: part.insert, attributes: part.attributes });
  }
  return out;
};
const copyRange = (pd, index, from, to) => {
  const sources = unitIds(pd.flow, from, to).map((id) => index.resolve(id));
  const parts = partsOf(pd.flow, from, to);
  const at = pd.flow.length;
  pd.ydoc.transact(() => {
    for (const part of parts) {
      const attributes = part.attributes ? { ...part.attributes } : undefined;
      if (typeof part.insert === "string") pd.flow.insert(pd.flow.length, part.insert, attributes);
      else pd.flow.insertEmbed(pd.flow.length, { ...part.insert }, attributes);
    }
  }, LOCAL);
  index.recordSpans(unitIds(pd.flow, at, pd.flow.length).map((dest, offset) => ({ dest, source: sources[offset] })));
  return { at, end: pd.flow.length };
};

test("a copied Z keeps the original author across two copies and an encoded reload", () => {
  const source = createPageDoc(new Y.Doc());
  source.ydoc.clientID = 300;
  source.flow.insert(0, "Z", { "strong~8c-0": true });
  const original = unitIds(source.flow, 0, 1)[0];
  expect(original).toEqual({ client: 300, clock: original.clock });

  const mover = clone(source, 200);
  const moverIndex = createOriginIndex(mover.origins);
  copyRange(mover, moverIndex, 0, 1);
  expect(mover.flow.toString()).toBe("ZZ");
  expect(partsOf(mover.flow, 1, 2)).toEqual(partsOf(source.flow, 0, 1));
  expect(moverIndex.resolve(unitIds(mover.flow, 1, 2)[0])).toEqual(original);

  const next = clone(mover, 400);
  const nextIndex = createOriginIndex(next.origins);
  copyRange(next, nextIndex, 1, 2);
  expect(next.flow.toString()).toBe("ZZZ");
  expect(partsOf(next.flow, 2, 3)).toEqual(partsOf(source.flow, 0, 1));
  const copied = unitIds(next.flow, 2, 3)[0];
  expect(nextIndex.resolve(copied)).toEqual(original);
  expect(next.origins.get(spanKey(copied.client, copied.clock))).toEqual({ length: 1, sourceClient: 300, sourceClock: original.clock });

  const reloaded = clone(next, 600);
  const reloadedIndex = createOriginIndex(reloaded.origins);
  expect(owners(reloaded, reloadedIndex)).toEqual(owners(next, nextIndex));
});

test("equal Z inserted by another client keeps its own identity", () => {
  const source = createPageDoc(new Y.Doc());
  source.ydoc.clientID = 300;
  source.flow.insert(0, "Z", { "strong~8c-0": true });
  const peer = clone(source, 500);
  const index = createOriginIndex(peer.origins);
  peer.ydoc.transact(() => peer.flow.insert(1, "Z"), LOCAL);
  const first = unitIds(peer.flow, 0, 1)[0];
  const second = unitIds(peer.flow, 1, 2)[0];
  expect(peer.flow.toString()).toBe("ZZ");
  expect(index.resolve(second)).toEqual(second);
  expect(index.resolve(second)).not.toEqual(index.resolve(first));
  expect(index.resolve(first)).toEqual({ client: 300, clock: first.clock });
});

test("a bold emoji and a hard break keep their UTF-16 original ids", () => {
  const source = createPageDoc(new Y.Doc());
  source.ydoc.clientID = 7;
  source.flow.insert(0, "A\u{1F600}", { "em~7-0": true });
  source.flow.insertEmbed(3, { br: 1 });
  const pd = clone(source, 8);
  const index = createOriginIndex(pd.origins);
  const before = unitIds(pd.flow, 0, 4);
  expect(before.length).toBe(4);
  expect(before.slice(0, 3).map((id) => id.clock)).toEqual([before[0].clock, before[0].clock + 1, before[0].clock + 2]);
  copyRange(pd, index, 0, 4);
  const after = unitIds(pd.flow, 4, 8);
  expect(after.length).toBe(4);
  expect(partsOf(pd.flow, 4, 8)).toEqual(partsOf(pd.flow, 0, 4));
  expect(after.map((id) => index.resolve(id))).toEqual(before.map((id) => index.resolve(id)));
  expect(after.map((id) => index.resolve(id))).toEqual(before);
});

test("undo recreates a block marker as an alias, never a text span", () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 40;
  const index = createOriginIndex(pd.origins);
  const um = new Y.UndoManager([pd.flow], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const stop = installUndoOrigins(pd, um, index);
  pd.ydoc.transact(() => { pd.flow.insertEmbed(0, { b: "p" }); pd.flow.insert(1, "X"); }, NET);
  const marker = unitIds(pd.flow, 0, 1)[0];
  const before = index.resolve(marker);
  pd.ydoc.transact(() => pd.flow.delete(0, 1), LOCAL);
  expect(pd.flow.toString()).toBe("X");
  expect(um.undo()).not.toBeNull();
  const recreated = unitIds(pd.flow, 0, 1)[0];
  expect(recreated).not.toEqual(before);
  expect(index.resolve(recreated)).toEqual(before);
  expect(pd.origins.get(aliasKey(recreated.client, recreated.clock))).toEqual({ sourceClient: before.client, sourceClock: before.clock });
  expect(pd.origins.get(spanKey(recreated.client, recreated.clock))).toBeUndefined();
  stop();
  um.destroy();
});

test("the first redo update already carries the recreated origin on a fresh peer", () => {
  const author = createPageDoc(new Y.Doc());
  author.ydoc.clientID = 30;
  author.flow.insert(0, "X", { "strong~u-0": true });
  const pd = clone(author, 40);
  const index = createOriginIndex(pd.origins);
  const original = unitIds(pd.flow, 0, 1)[0];
  const um = new Y.UndoManager([pd.flow, pd.attrs, pd.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const stop = installUndoOrigins(pd, um, index);
  copyRange(pd, index, 0, 1);
  expect(pd.flow.toString()).toBe("XX");
  expect(index.resolve(unitIds(pd.flow, 1, 2)[0])).toEqual(original);

  const peer = clone(pd, 50);
  const peerIndex = createOriginIndex(peer.origins);
  const updates = [];
  pd.ydoc.on("updateV2", (update, origin) => {
    Y.applyUpdateV2(peer.ydoc, update);
    updates.push({ origin: origin === um ? "um" : origin, values: peer.flow.toString(), owners: owners(peer, peerIndex), records: peer.origins.size });
  });

  expect(um.undo()).not.toBeNull();
  expect(pd.flow.toString()).toBe("X");

  let start = updates.length;
  expect(um.redo()).not.toBeNull();
  expect(pd.flow.toString()).toBe("XX");
  expect(updates[start].values).toBe("XX");
  expect(updates[start].owners.at(-1)).toEqual(original);
  expect(updates[start].records).toBeGreaterThan(0);
  expect(index.resolve(unitIds(pd.flow, 1, 2)[0])).toEqual(original);

  expect(um.undo()).not.toBeNull();
  expect(um.redo()).not.toBeNull();
  expect(pd.flow.toString()).toBe("XX");
  expect(index.resolve(unitIds(pd.flow, 1, 2)[0])).toEqual(original);

  const reloaded = clone(pd, 60);
  const reloadedIndex = createOriginIndex(reloaded.origins);
  expect(owners(reloaded, reloadedIndex)).toEqual(owners(pd, index));
  expect(partsOf(reloaded.flow, 1, 2)).toEqual(partsOf(author.flow, 0, 1));

  pd.ydoc.transact(() => pd.flow.delete(0, 1), LOCAL);
  start = updates.length;
  expect(um.undo()).not.toBeNull();
  expect(updates[start].owners[0]).toEqual(original);
  expect(index.resolve(unitIds(pd.flow, 0, 1)[0])).toEqual(original);
  stop();
  um.destroy();
});

test("a conflicting immutable fact is an error", () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 9;
  const index = createOriginIndex(pd.origins);
  index.recordSpans([{ dest: { client: 9, clock: 0 }, source: { client: 300, clock: 5 } }]);
  index.recordSpans([{ dest: { client: 9, clock: 0 }, source: { client: 300, clock: 5 } }]);
  expect(() => index.recordSpans([{ dest: { client: 9, clock: 0 }, source: { client: 301, clock: 5 } }])).toThrow(/Conflicting immutable origin record/);
  index.recordAlias({ client: 9, clock: 4 }, { client: 300, clock: 7 });
  expect(() => index.recordAlias({ client: 9, clock: 4 }, { client: 301, clock: 7 })).toThrow(/Conflicting immutable origin record/);
});
