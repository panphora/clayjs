import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, walk, removeKey, restoreKey, boundaryKey, LOCAL } from "../../../../src/page/ybind/index.js";
import { createProjectionMap } from "../../../../src/page/ybind/projection-map.js";

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
const hide = (pd, sourceKey, blockId, end, operationId, sv = []) => {
  pd.ydoc.transact(() => pd.gone.set(removeKey(sourceKey, operationId), { blockId, end, sv }), LOCAL);
};
const addRestore = (pd, sourceKey, operationId, covers, baseline) => {
  const at = indexAt(pd, sourceKey);
  const id = `recovered:${sourceKey}`;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(at, { b: id });
    let marker = null;
    for (let it = pd.flow._start; it; it = it.right) {
      if (it.id.client !== pd.ydoc.clientID || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== id) continue;
      if (!marker || it.id.clock > marker.clock) marker = it.id;
    }
    pd.origins.set(boundaryKey(marker.client, marker.clock), { blockId: id, kind: "restore", recoveryOf: sourceKey });
    pd.gone.set(restoreKey(sourceKey, operationId), { covers, baseline });
  }, LOCAL);
};

const unitsOf = (pd) => {
  const out = [];
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    const c = it.content;
    for (let i = 0; i < it.length; i++) out.push(c.str !== undefined ? c.str[i] : c.embed.b !== undefined ? `marker:${c.embed.b}` : "break");
  }
  return out;
};
const blockAt = (w, id) => {
  let at = 0;
  for (const s of w.visible) {
    if (s.id === id) return at;
    at += s.len;
  }
  throw new Error(`Missing visible block ${id}`);
};
const mapOf = (pd) => {
  const w = walk(pd);
  const map = createProjectionMap(w, pd.flow.length);
  const visible = map.segments.filter((s) => s.kind === "visible");
  const hidden = map.segments.filter((s) => s.kind === "hidden");
  expect(visible.reduce((n, s) => n + s.physicalLength, 0) + hidden.reduce((n, s) => n + s.physicalLength, 0)).toBe(pd.flow.length);
  expect(visible.reduce((n, s) => n + s.logicalLength, 0)).toBe(w.tokens);
  expect(map.logicalLength).toBe(w.tokens);
  expect(map.physicalLength).toBe(pd.flow.length);
  let logical = 0, physical = 0;
  for (const s of map.segments) {
    expect(s.kind === "visible" || s.kind === "hidden").toBe(true);
    for (const key of ["logicalStart", "logicalLength", "physicalStart", "physicalLength"]) expect(Number.isSafeInteger(s[key]) && s[key] >= 0).toBe(true);
    if (s.kind === "visible") expect(s.logicalLength).toBe(s.physicalLength);
    else expect(s.logicalLength).toBe(0);
    expect(s.logicalStart).toBe(logical);
    expect(s.physicalStart).toBe(physical);
    logical += s.logicalLength;
    physical += s.physicalLength;
  }
  expect(logical).toBe(w.tokens);
  expect(physical).toBe(pd.flow.length);
  return { w, map };
};
const roundTrip = ({ w, map }) => {
  const spans = new Map(map.segments.filter((s) => s.kind === "hidden").map((s) => [s.logicalStart, s]));
  let before = -1, after = -1;
  for (let k = 0; k <= w.tokens; k++) {
    const left = map.toPhysical(k, "before"), right = map.toPhysical(k, "after");
    expect(left).toBeGreaterThanOrEqual(before);
    expect(right).toBeGreaterThanOrEqual(after);
    before = left;
    after = right;
    expect(map.toLogical(left, "before")).toBe(k);
    expect(map.toLogical(right, "after")).toBe(k);
    if (k === w.tokens) break;
    const span = spans.get(k);
    if (span) {
      expect(left).toBe(span.physicalStart);
      expect(right).toBe(span.physicalStart + span.physicalLength);
    } else {
      expect(right).toBe(left);
      expect(map.physicalRanges(k, k + 1)).toEqual([[left, left + 1]]);
    }
  }
};

test("a plain three-block page maps every logical unit onto the same physical unit", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const built = mapOf(pd);
  expect(built.map.segments).toEqual([{ logicalStart: 0, logicalLength: 18, physicalStart: 0, physicalLength: 18, kind: "visible" }]);
  expect(built.map.toPhysical(0, "before")).toBe(0);
  expect(built.map.toPhysical(0, "after")).toBe(0);
  expect(built.map.toPhysical(6, "before")).toBe(6);
  expect(built.map.toPhysical(6, "after")).toBe(6);
  expect(built.map.toPhysical(11, "before")).toBe(11);
  expect(built.map.toPhysical(11, "after")).toBe(11);
  expect(built.map.toPhysical(18, "before")).toBe(18);
  expect(built.map.toPhysical(18, "after")).toBe(18);
  expect(built.map.toLogical(0, "before")).toBe(0);
  expect(built.map.toLogical(0, "after")).toBe(0);
  expect(built.map.toLogical(7, "before")).toBe(7);
  expect(built.map.toLogical(7, "after")).toBe(7);
  expect(built.map.toLogical(18, "before")).toBe(18);
  expect(built.map.toLogical(18, "after")).toBe(18);
  expect(built.map.physicalRanges(0, 18)).toEqual([[0, 18]]);
  expect(built.map.physicalRanges(1, 4)).toEqual([[1, 4]]);
  expect(built.map.physicalRanges(6, 6)).toEqual([]);
  expect(built.map.physicalRanges(0, 0)).toEqual([]);
  roundTrip(built);
});

test("a hidden source with a recovered marker and peer text keeps the marker's own unit", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const peer = clone(seed, 2);
  peer.ydoc.transact(() => {
    peer.flow.insertEmbed(peer.flow.length, { b: "s" });
    peer.flow.insert(peer.flow.length, "PEER");
  }, LOCAL);
  merge(seed, peer);
  const q = keyOf(seed, "q");
  const rr = keyOf(seed, "r");
  hide(seed, q, "q", rr, "move-1");
  addRestore(seed, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });

  const built = mapOf(seed);
  expect(built.map.segments).toEqual([
    { logicalStart: 0, logicalLength: 6, physicalStart: 0, physicalLength: 6, kind: "visible" },
    { logicalStart: 6, logicalLength: 0, physicalStart: 6, physicalLength: 1, kind: "hidden" },
    { logicalStart: 6, logicalLength: 17, physicalStart: 7, physicalLength: 17, kind: "visible" },
  ]);
  const at = blockAt(built.w, `recovered:${q}`);
  expect(at).toBe(6);
  expect(built.map.toPhysical(at, "before")).toBe(6);
  expect(built.map.toPhysical(at, "after")).toBe(7);
  expect(built.map.toPhysical(at + 1, "before")).toBe(8);
  expect(built.map.toPhysical(at + 1, "after")).toBe(8);
  expect(built.map.toLogical(6, "before")).toBe(6);
  expect(built.map.toLogical(6, "after")).toBe(6);
  expect(built.map.toLogical(7, "before")).toBe(6);
  expect(built.map.toLogical(7, "after")).toBe(6);
  expect(built.map.toLogical(8, "before")).toBe(7);
  expect(built.map.toLogical(8, "after")).toBe(7);

  const units = unitsOf(seed);
  expect(units[5]).toBe("A");
  expect(units[6]).toBe("marker:q");
  expect(units[7]).toBe(`marker:recovered:${q}`);
  const ranges = built.map.physicalRanges(at, at + 1);
  expect(ranges).toEqual([[7, 8]]);
  expect(units.slice(ranges[0][0], ranges[0][1])).toEqual([`marker:recovered:${q}`]);
  expect(units[ranges[0][0] - 1]).toBe("marker:q");
  expect(ranges).not.toContainEqual([6, 7]);
  expect(built.map.physicalRanges(at, at)).toEqual([]);
  expect(built.map.physicalRanges(0, built.w.tokens)).toEqual([[0, 6], [7, 24]]);
  expect(blockAt(built.w, "s")).toBe(18);
  expect(built.map.physicalRanges(18, built.w.tokens)).toEqual([[19, 24]]);
  roundTrip(built);
});

test("two overlapping removals beginning at one source hide the peer text in one span", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const peer = clone(seed, 2);
  peer.ydoc.transact(() => peer.flow.insert(7, "ZZ"), LOCAL);
  merge(seed, peer);
  const q = keyOf(seed, "q");
  const rr = keyOf(seed, "r");
  hide(seed, q, "q", rr, "op-b");
  hide(seed, q, "q", null, "op-c");

  const built = mapOf(seed);
  expect(built.map.segments).toEqual([
    { logicalStart: 0, logicalLength: 6, physicalStart: 0, physicalLength: 6, kind: "visible" },
    { logicalStart: 6, logicalLength: 0, physicalStart: 6, physicalLength: 8, kind: "hidden" },
    { logicalStart: 6, logicalLength: 6, physicalStart: 14, physicalLength: 6, kind: "visible" },
  ]);
  expect(unitsOf(seed).slice(6, 14).join("")).toBe("marker:qZZbravo");
  expect(built.map.toPhysical(6, "before")).toBe(6);
  expect(built.map.toPhysical(6, "after")).toBe(14);
  expect(built.map.toPhysical(7, "before")).toBe(15);
  expect(built.map.toPhysical(7, "after")).toBe(15);
  expect(built.map.toLogical(6, "before")).toBe(6);
  expect(built.map.toLogical(6, "after")).toBe(6);
  expect(built.map.toLogical(13, "before")).toBe(6);
  expect(built.map.toLogical(13, "after")).toBe(6);
  expect(built.map.toLogical(14, "before")).toBe(6);
  expect(built.map.toLogical(14, "after")).toBe(6);
  expect(built.map.toLogical(15, "after")).toBe(7);
  expect(built.map.physicalRanges(0, 12)).toEqual([[0, 6], [14, 20]]);
  expect(built.map.physicalRanges(6, 12)).toEqual([[14, 20]]);
  expect(built.map.physicalRanges(5, 7)).toEqual([[5, 6], [14, 15]]);
  expect(built.map.physicalRanges(6, 6)).toEqual([]);
  roundTrip(built);
});

test("a deleted source marker is replaced by the recovered root without a hidden span", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const at = (() => {
    let n = 0;
    for (let it = pd.flow._start; it; it = it.right) {
      if (it.content instanceof Y.ContentEmbed && it.content.embed.b === "q") return n;
      if (!it.deleted && it.countable) n += it.length;
    }
  })();
  pd.ydoc.transact(() => pd.flow.delete(at, 1), LOCAL);
  hide(pd, q, "q", null, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });

  const built = mapOf(pd);
  expect(built.map.segments).toEqual([{ logicalStart: 0, logicalLength: 18, physicalStart: 0, physicalLength: 18, kind: "visible" }]);
  const root = blockAt(built.w, `recovered:${q}`);
  expect(root).toBe(6);
  expect(built.map.toPhysical(root, "before")).toBe(6);
  expect(built.map.toPhysical(root, "after")).toBe(6);
  const units = unitsOf(pd);
  expect(units[5]).toBe("A");
  expect(units[6]).toBe(`marker:recovered:${q}`);
  expect(built.map.physicalRanges(root, root + 1)).toEqual([[6, 7]]);
  expect(units.slice(6, 7)).toEqual([`marker:recovered:${q}`]);
  roundTrip(built);
});

test("an inner split under an empty recovered root stays one visible span", () => {
  const pd = page(1, [{ id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  pd.ydoc.transact(() => {
    pd.flow.delete(0, 6);
    pd.flow.insertEmbed(0, { b: "split-200" });
    pd.flow.insert(1, "X");
  }, LOCAL);
  hide(pd, q, "q", rr, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });

  const built = mapOf(pd);
  expect(built.map.segments).toEqual([{ logicalStart: 0, logicalLength: 9, physicalStart: 0, physicalLength: 9, kind: "visible" }]);
  expect(unitsOf(pd).join("")).toBe(`marker:recovered:${q}marker:split-200Xmarker:rOMEGA`);
  expect(blockAt(built.w, `recovered:${q}`)).toBe(0);
  expect(blockAt(built.w, "split-200")).toBe(1);
  expect(blockAt(built.w, "r")).toBe(3);
  expect(built.map.physicalRanges(0, 1)).toEqual([[0, 1]]);
  expect(built.map.physicalRanges(1, 3)).toEqual([[1, 3]]);
  expect(built.map.physicalRanges(3, 9)).toEqual([[3, 9]]);
  expect(built.map.toPhysical(1, "before")).toBe(1);
  expect(built.map.toPhysical(1, "after")).toBe(1);
  expect(built.map.toLogical(2, "after")).toBe(2);
  roundTrip(built);
});

test("a hard break and a surrogate-pair emoji keep their exact units", () => {
  const pd = page(1, [{ id: "p", text: "ab" }, { id: "q", text: "cd" }]);
  pd.flow.insertEmbed(3, { br: 1 });
  pd.flow.insert(pd.flow.length, " \u{1F600}");

  const built = mapOf(pd);
  expect(pd.flow.length).toBe(10);
  expect(built.map.segments).toEqual([{ logicalStart: 0, logicalLength: 10, physicalStart: 0, physicalLength: 10, kind: "visible" }]);
  const units = unitsOf(pd);
  expect(units[3]).toBe("break");
  expect(units[7]).toBe(" ");
  expect([units[8], units[9]]).toEqual(["\ud83d", "\ude00"]);
  expect(built.map.toPhysical(3, "before")).toBe(3);
  expect(built.map.toPhysical(3, "after")).toBe(3);
  expect(built.map.toPhysical(4, "before")).toBe(4);
  expect(built.map.toLogical(3, "after")).toBe(3);
  expect(built.map.toLogical(4, "before")).toBe(4);
  expect(built.map.physicalRanges(3, 4)).toEqual([[3, 4]]);
  expect(built.map.physicalRanges(8, 10)).toEqual([[8, 10]]);
  expect(built.map.physicalRanges(7, 10)).toEqual([[7, 10]]);
  expect(built.map.physicalRanges(4, 4)).toEqual([]);
  roundTrip(built);
});

test("a malformed walk or an out-of-range position throws instead of shifting", () => {
  expect(() => createProjectionMap(null, 0)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: null }, 3)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3.5, holes: [] }, 4)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [] }, -1)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [] }, 4)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [{ at: 4, len: 1 }] }, 4)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [{ at: -1, len: 1 }] }, 3)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [{ at: 1, len: -1 }] }, 3)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [{ at: 2, len: 1 }, { at: 1, len: 1 }] }, 5)).toThrow(RangeError);
  expect(() => createProjectionMap({ tokens: 3, holes: [null] }, 3)).toThrow(RangeError);

  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]);
  const map = createProjectionMap(walk(pd), pd.flow.length);
  expect(() => map.toPhysical(13, "before")).toThrow(RangeError);
  expect(() => map.toPhysical(-1, "after")).toThrow(RangeError);
  expect(() => map.toPhysical(1, "middle")).toThrow(RangeError);
  expect(() => map.toLogical(13, "before")).toThrow(RangeError);
  expect(() => map.toLogical(1.5, "after")).toThrow(RangeError);
  expect(() => map.toLogical(1, "middle")).toThrow(RangeError);
  expect(() => map.physicalRanges(0, 13)).toThrow(RangeError);
  expect(() => map.physicalRanges(-1, 2)).toThrow(RangeError);
  expect(map.toPhysical(12, "after")).toBe(12);
  expect(map.toLogical(12, "before")).toBe(12);
});
