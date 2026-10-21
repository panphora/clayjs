import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, createOriginIndex, installUndoOrigins, walk, reduceRecovery, removeKey, restoreKey, boundaryKey, aliasKey, blocksFromYValue, copyActiveKey } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";
import { LOCAL } from "../../../../src/page/ybind/layout.js";

const page = (client, blocks) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = client;
  pd.ydoc.transact(() => {
    for (const block of blocks) {
      pd.flow.insertEmbed(pd.flow.length, { b: block.id });
      if (block.text) pd.flow.insert(pd.flow.length, block.text);
    }
  }, LOCAL);
  return pd;
};

const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc));

const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return `${it.id.client}.${it.id.clock}`;
  }
  throw new Error(`Missing marker ${id}`);
};
const indexAt = (pd, sourceKey) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (`${it.id.client}.${it.id.clock}` === sourceKey) return it.deleted ? at : at + it.length;
    if (!it.deleted && it.countable) at += it.length;
  }
  throw new Error(`Missing source ${sourceKey}`);
};
const atOf = (pd, sourceKey) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (`${it.id.client}.${it.id.clock}` === sourceKey) return at;
    if (!it.deleted && it.countable) at += it.length;
  }
  throw new Error(`Missing source ${sourceKey}`);
};
const newestMarker = (pd, id) => {
  let found = null;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.id.client !== pd.ydoc.clientID || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== id) continue;
    if (!found || it.id.clock > found.clock) found = it.id;
  }
  return found;
};
const hide = (pd, sourceKey, blockId, end, operationId) => {
  pd.ydoc.transact(() => pd.gone.set(removeKey(sourceKey, operationId), { blockId, end, sv: [] }), LOCAL);
};
const restore = (pd, sourceKey, operationId, covers) => {
  const at = indexAt(pd, sourceKey);
  const id = `recovered:${sourceKey}`;
  let marker = null;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(at, { b: id });
    marker = newestMarker(pd, id);
    pd.origins.set(boundaryKey(marker.client, marker.clock), { blockId: id, kind: "restore", recoveryOf: sourceKey });
    pd.gone.set(restoreKey(sourceKey, operationId), { covers, baseline: { type: "paragraph", attrs: {} } });
  }, LOCAL);
  return marker;
};
const flowIds = (pd) => {
  const out = [];
  for (let it = pd.flow._start; it; it = it.right) {
    const c = it.content;
    if (c instanceof Y.ContentFormat) continue;
    out.push(`${it.id.client}.${it.id.clock}${it.deleted ? "!" : ""}:${c.str ?? (c.embed.b !== undefined ? `[${c.embed.b}]` : "[br]")}`);
  }
  return out;
};
const liveRecovered = (pd, sourceKey) => {
  let n = 0;
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === `recovered:${sourceKey}`) n++;
  return n;
};
const segText = (s) => s.runs.map((r) => (r.br ? "\n" : r.hole ? "" : r.text)).join("");
const visible = (w) => w.visible.map((s) => [s.id, segText(s)]);
const holeTotal = (w) => w.holes.reduce((n, h) => n + h.len, 0);
const physical = (pd, w) => {
  expect(w.tokens + holeTotal(w)).toBe(pd.flow.length);
};

test("a registered Restore marker projects its source as one physical unit", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  const marker = restore(pd, q, "restore-1", [removeKey(q, "move-1")]);
  const id = `recovered:${q}`;

  expect(pd.origins.get(boundaryKey(marker.client, marker.clock))).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  const index = createOriginIndex(pd.origins);
  expect(index.boundaryOf(marker)).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  expect(index.boundaryOf({ client: marker.client, clock: marker.clock })).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  expect(index.boundaryOf({ client: marker.client, clock: marker.clock + 1 })).toBeNull();

  const flow = flowIds(pd);
  expect(flow.filter((unit) => unit.endsWith(`[${id}]`))).toHaveLength(1);
  expect(flow).toHaveLength(7);
  index.recordBoundary({ client: 1, clock: 40 }, { blockId: "p", kind: "copy" });
  expect(flowIds(pd)).toEqual(flow);
  expect(index.boundaryOf({ client: 1, clock: 40 })).toEqual({ blockId: "p", kind: "copy" });

  const w = walk(pd);
  expect(visible(w)).toEqual([["p", "ALPHA"], [id, "bravo"], ["r", "OMEGA"]]);
  expect(w.visible.some((s) => s.id === "q")).toBe(false);
  expect(liveRecovered(pd, q)).toBe(1);
  physical(pd, w);

  const reloaded = clone(pd, 55);
  expect(visible(walk(reloaded))).toEqual(visible(w));
  expect(blocksFromYValue(yValueOf(reloaded.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "ALPHA" },
    [id]: { t: "paragraph", pos: "00000002", c: "bravo" },
    r: { t: "paragraph", pos: "00000003", c: "OMEGA" },
  });
  index.dispose();
});

test("an unregistered recovered-prefixed block stays ordinary beside a real removal and Restore intention", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]);
  const q = keyOf(pd, "q");
  const collision = `recovered:${q}`;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(pd.flow.length, { b: collision });
    pd.flow.insert(pd.flow.length, "ok");
  }, LOCAL);
  hide(pd, q, "q", null, "move-1");
  pd.ydoc.transact(() => pd.gone.set(restoreKey(q, "restore-1"), { covers: [removeKey(q, "move-1")], baseline: { type: "paragraph", attrs: {} } }), LOCAL);

  const marker = newestMarker(pd, collision);
  expect(pd.origins.get(boundaryKey(marker.client, marker.clock))).toBeUndefined();
  expect(reduceRecovery(pd).sources.get(q).restores).toHaveLength(1);
  expect(flowIds(pd).filter((unit) => unit.endsWith(`[${collision}]`))).toHaveLength(1);

  const w = walk(pd);
  expect(visible(w)).toEqual([["p", "ALPHA"], [collision, "ok"]]);
  expect(w.visible.some((s) => s.id === "q")).toBe(false);
  expect(holeTotal(w)).toBe(6);
  physical(pd, w);
});

test("a boundary record that does not match the marker stays ordinary", () => {
  const records = [
    (source) => ({ blockId: "other", kind: "restore", recoveryOf: source }),
    (source) => ({ blockId: `recovered:${source}`, kind: "restore", recoveryOf: "1.0" }),
    (source) => ({ blockId: `recovered:${source}`, kind: "copy" }),
  ];
  for (const record of records) {
    const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]);
    const q = keyOf(pd, "q");
    const collision = `recovered:${q}`;
    hide(pd, q, "q", null, "move-1");
    pd.ydoc.transact(() => {
      pd.flow.insertEmbed(pd.flow.length, { b: collision });
      pd.flow.insert(pd.flow.length, "ok");
      const marker = newestMarker(pd, collision);
      pd.origins.set(boundaryKey(marker.client, marker.clock), record(q));
      if (record(q).kind === "copy") pd.gone.set(copyActiveKey(`${marker.client}.${marker.clock}`), true);
    }, LOCAL);

    const w = walk(pd);
    expect(visible(w)).toEqual([["p", "ALPHA"], [collision, "ok"]]);
    expect(w.visible.find((s) => s.id === collision).recovered).toBeUndefined();
    expect(holeTotal(w)).toBe(6);
    physical(pd, w);
  }
});

test("a conflicting boundary value for one physical marker refuses", () => {
  const pd = page(1, [{ id: "p", text: "ok" }]);
  const index = createOriginIndex(pd.origins);
  const dest = { client: 1, clock: 40 };
  index.recordBoundary(dest, { blockId: "recovered:1.0", kind: "restore", recoveryOf: "1.0" });
  index.recordBoundary(dest, { blockId: "recovered:1.0", kind: "restore", recoveryOf: "1.0" });
  expect(pd.origins.get(boundaryKey(1, 40))).toEqual({ blockId: "recovered:1.0", kind: "restore", recoveryOf: "1.0" });
  expect(() => index.recordBoundary(dest, { blockId: "recovered:1.0", kind: "copy", recoveryOf: "1.0" })).toThrow(/Conflicting immutable origin record/);
  expect(() => index.recordBoundary(dest, { blockId: "other", kind: "restore", recoveryOf: "1.0" })).toThrow(/Conflicting immutable origin record/);
  expect(() => index.recordBoundary(dest, { blockId: "recovered:1.0", kind: "restore" })).toThrow(/Conflicting immutable origin record/);
  expect(() => index.recordBoundary({ client: -1, clock: 0 }, { blockId: "p", kind: "copy" })).toThrow(/Invalid origin destination/);
  for (const value of [{ blockId: "", kind: "copy" }, { blockId: "p", kind: "moved" }, { blockId: "p", kind: "copy", recoveryOf: "1" }, { blockId: "p", kind: "copy", extra: 1 }, null, ["boundary"]]) {
    expect(() => index.recordBoundary({ client: 1, clock: 41 }, value)).toThrow(/Invalid boundary record/);
  }
  expect(pd.origins.get(boundaryKey(1, 41))).toBeUndefined();
  index.dispose();
});

test("a malformed or unsupported origin record fails a strict encoded reload", () => {
  const bad = [
    { blockId: "", kind: "copy" },
    { blockId: "p", kind: "moved" },
    { blockId: "p", kind: "copy", recoveryOf: "1" },
    { blockId: "p", kind: "copy", recoveryOf: "1.2.3" },
    { blockId: "p", kind: "copy", boundary: true },
    "p",
    ["boundary"],
  ];
  for (const value of bad) {
    const pd = page(1, [{ id: "p", text: "ok" }]);
    pd.ydoc.transact(() => pd.origins.set(boundaryKey(1, 0), value), LOCAL);
    expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));
  }
  for (const key of ["boundary-1-0", JSON.stringify(["span", 1]), JSON.stringify(["boundary", 1, -1]), JSON.stringify(["boundary", "1", 0])]) {
    const pd = page(1, [{ id: "p", text: "ok" }]);
    pd.ydoc.transact(() => pd.origins.set(key, { blockId: "p", kind: "copy" }), LOCAL);
    expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));
  }
  const pd = page(1, [{ id: "p", text: "ok" }]);
  pd.ydoc.transact(() => pd.origins.set(JSON.stringify(["future", 1, 0]), { blockId: "p", kind: "copy" }), LOCAL);
  expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "unsupported-content" }));

  const good = page(1, [{ id: "p", text: "ok" }]);
  good.ydoc.transact(() => {
    good.origins.set(boundaryKey(1, 0), { blockId: "p", kind: "copy" });
    good.gone.set(copyActiveKey("1.0"), true);
    good.origins.set(JSON.stringify(["author", 1]), "token-1");
  }, LOCAL);
  expect(blocksFromYValue(yValueOf(clone(good, 9).ydoc))).toEqual({ p: { t: "paragraph", pos: "00000001", c: "ok" } });
});

test("conflicting boundary values across an alias chain fail a strict encoded reload", () => {
  const pd = page(1, [{ id: "p", text: "ok" }]);
  pd.ydoc.transact(() => {
    pd.origins.set(boundaryKey(1, 20), { blockId: "recovered:1.0", kind: "restore", recoveryOf: "1.0" });
    pd.origins.set(aliasKey(1, 21), { sourceClient: 1, sourceClock: 20 });
    pd.origins.set(boundaryKey(1, 21), { blockId: "other", kind: "copy" });
  }, LOCAL);
  expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));

  const index = createOriginIndex(pd.origins);
  expect(index.boundaryOf({ client: 1, clock: 21 })).toEqual({ blockId: "recovered:1.0", kind: "restore", recoveryOf: "1.0" });
  index.dispose();
});

test("a deleted recovered marker stays a recovery boundary between two disconnected Restores", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(seed, "q");
  const id = `recovered:${q}`;
  hide(seed, q, "q", null, "move-1");
  const a = clone(seed, 100);
  const b = clone(seed, 200);
  const umA = new Y.UndoManager([a.flow, a.attrs, a.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const umB = new Y.UndoManager([b.flow, b.attrs, b.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const removal = removeKey(q, "move-1");
  restore(a, q, "restore-1", [removal]);
  restore(b, q, "restore-2", [removal]);
  merge(a, b);
  merge(b, a);

  expect(liveRecovered(a, q)).toBe(2);
  expect(visible(walk(a))).toEqual([["p", "ALPHA"], [id, "bravo"], ["r", "OMEGA"]]);
  physical(a, walk(a));

  expect(umA.undo()).not.toBeNull();
  merge(b, a);
  const w = walk(a);
  expect(liveRecovered(a, q)).toBe(1);
  expect(visible(w)).toEqual([["p", "ALPHA"], [id, "bravo"], ["r", "OMEGA"]]);
  expect(visible(walk(b))).toEqual(visible(w));
  physical(a, w);

  const reloaded = clone(a, 300);
  expect(blocksFromYValue(yValueOf(reloaded.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "ALPHA" },
    [id]: { t: "paragraph", pos: "00000002", c: "bravo" },
    r: { t: "paragraph", pos: "00000003", c: "OMEGA" },
  });

  expect(umB.undo()).not.toBeNull();
  merge(a, b);
  const none = walk(a);
  expect(liveRecovered(a, q)).toBe(0);
  expect(visible(none)).toEqual([["p", "ALPHA"], ["r", "OMEGA"]]);
  physical(a, none);
  umA.destroy();
  umB.destroy();
});

test("a recreated recovered marker resolves its boundary through repeated Undo and Redo aliases", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const id = `recovered:${q}`;
  hide(pd, q, "q", null, "move-1");
  const marker = restore(pd, q, "restore-1", [removeKey(q, "move-1")]);
  const index = createOriginIndex(pd.origins);
  const um = new Y.UndoManager([pd.flow, pd.attrs, pd.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const stop = installUndoOrigins(pd, um, index);
  const at = atOf(pd, `${marker.client}.${marker.clock}`);

  pd.ydoc.transact(() => pd.flow.delete(at, 1), LOCAL);
  expect(liveRecovered(pd, q)).toBe(0);
  expect(um.undo()).not.toBeNull();
  const first = newestMarker(pd, id);
  expect(first).not.toBeNull();
  expect(`${first.client}.${first.clock}`).not.toBe(`${marker.client}.${marker.clock}`);
  expect(pd.origins.get(aliasKey(first.client, first.clock))).toEqual({ sourceClient: marker.client, sourceClock: marker.clock });
  expect(index.boundaryOf(first)).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  expect(visible(walk(pd, index))).toEqual([["p", "ALPHA"], [id, "bravo"], ["r", "OMEGA"]]);
  physical(pd, walk(pd, index));

  expect(um.redo()).not.toBeNull();
  expect(liveRecovered(pd, q)).toBe(0);
  expect(um.undo()).not.toBeNull();
  const second = newestMarker(pd, id);
  expect(`${second.client}.${second.clock}`).not.toBe(`${first.client}.${first.clock}`);
  expect(pd.origins.get(aliasKey(second.client, second.clock))).toEqual({ sourceClient: marker.client, sourceClock: marker.clock });
  expect(index.boundaryOf(second)).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  expect(index.boundaryOf({ client: marker.client, clock: marker.clock })).toEqual({ blockId: id, kind: "restore", recoveryOf: q });
  expect(visible(walk(pd, index))).toEqual([["p", "ALPHA"], [id, "bravo"], ["r", "OMEGA"]]);

  const reloaded = clone(pd, 60);
  expect(visible(walk(reloaded))).toEqual(visible(walk(pd, index)));
  expect(blocksFromYValue(yValueOf(reloaded.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "ALPHA" },
    [id]: { t: "paragraph", pos: "00000002", c: "bravo" },
    r: { t: "paragraph", pos: "00000003", c: "OMEGA" },
  });
  stop();
  index.dispose();
  um.destroy();
});

test("boundary aliases have no fixed Undo depth and reject a cycle", () => {
  const pd = page(1, [{ id: "p", text: "ok" }]);
  pd.ydoc.transact(() => {
    pd.origins.set(boundaryKey(1, 0), { blockId: "p", kind: "copy" });
    pd.gone.set(copyActiveKey("1.0"), true);
    for (let clock = 1; clock <= 24; clock++) pd.origins.set(aliasKey(1, clock), { sourceClient: 1, sourceClock: clock - 1 });
  }, LOCAL);
  const index = createOriginIndex(pd.origins);
  expect(index.boundaryOf({ client: 1, clock: 24 })).toEqual({ blockId: "p", kind: "copy" });
  expect(blocksFromYValue(yValueOf(pd.ydoc))).toEqual({ p: { t: "paragraph", pos: "00000001", c: "ok" } });
  index.dispose();

  pd.ydoc.transact(() => pd.origins.set(aliasKey(1, 0), { sourceClient: 1, sourceClock: 24 }), LOCAL);
  const cyclic = createOriginIndex(pd.origins);
  expect(cyclic.boundaryOf({ client: 1, clock: 24 })).toBeNull();
  expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));
  cyclic.dispose();
});
