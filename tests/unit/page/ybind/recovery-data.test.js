import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, NET, walk, reduceRecovery, removeKey, restoreKey, attrKey, copyActiveKey, canonicalRevision, parseGoneIntents, blocksFromYValue, textDeleteKey } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";
import { createOriginIndex, unitIds } from "../../../../src/page/ybind/origins.js";

const page = (client, blocks) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = client;
  pd.ydoc.transact(() => {
    for (const block of blocks) {
      pd.flow.insertEmbed(pd.flow.length, { b: block.id });
      if (block.text) pd.flow.insert(pd.flow.length, block.text);
    }
  }, NET);
  return pd;
};

const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};

const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc));
const vectorOf = (ydoc) => [...Y.decodeStateVector(Y.encodeStateVector(ydoc)).entries()].sort((a, b) => a[0] - b[0]);

const markerAt = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return { at, key: `${it.id.client}.${it.id.clock}` };
    at += it.length;
  }
  throw new Error(`Missing marker ${id}`);
};

const hide = (pd, sourceKey, blockId, end, sv, operationId) => {
  pd.ydoc.transact(() => pd.gone.set(removeKey(sourceKey, operationId), { blockId, end, sv }), NET);
};

const runsOf = (record, index = 0) => record.blocks[index].runs;
const displaced = (record) => record.blocks.flatMap((block) => block.runs).filter((run) => !run.baseline);

test("a removal captures an unseen peer insertion with its original client and exact source", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  expect(sv).toEqual([[1, 6]]);

  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(3, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");

  const q = markerAt(hider, "q");
  hide(hider, q.key, "q", null, sv, "move-1");
  const record = reduceRecovery(hider).sources.get(q.key);

  expect(runsOf(record).map((run) => [run.text, run.baseline])).toEqual([["br", true], ["X", false], ["avo", true]]);
  const x = displaced(record)[0];
  expect(x.source).toBe("100.0");
  expect(x.id).toBe("100.0");
  expect(x.length).toBe(1);
  expect(x.author).toBe("token-100");
  expect(record.author).toBe(null);
  expect(record.recoverable).toBe(true);
  expect(record.removals).toEqual([{ key: removeKey(q.key, "move-1"), operationId: "move-1", end: null, sv }]);
});

test("an equal insertion the hider already observed is baseline", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }]);
  const first = clone(seed, 100);
  first.ydoc.transact(() => first.flow.insert(3, "X"), NET);
  const second = clone(seed, 101);
  second.ydoc.transact(() => second.flow.insert(3, "X"), NET);

  const hider = clone(seed, 2);
  merge(hider, first);
  const sv = vectorOf(hider.ydoc);
  expect(sv).toContainEqual([100, 1]);
  merge(hider, second);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");
  hider.origins.set(JSON.stringify(["author", 101]), "token-101");

  const q = markerAt(hider, "q");
  hide(hider, q.key, "q", null, sv, "move-1");
  const record = reduceRecovery(hider).sources.get(q.key);
  const observed = runsOf(record).filter((run) => run.text === "X");

  expect(observed.map((run) => [run.source, run.baseline])).toEqual([["100.0", true], ["101.0", false]]);
  expect(displaced(record).map((run) => run.source)).toEqual(["101.0"]);
});

test("a merged Yjs item crosses the hider's state-vector boundary", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }]);
  const hider = clone(seed, 2);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(3, "X"), NET);
  merge(hider, peer);
  const sv = vectorOf(hider.ydoc);
  peer.ydoc.transact(() => peer.flow.insert(4, "Y"), NET);
  merge(hider, peer);
  const merged = [...function* () { for (let item = hider.flow._start; item; item = item.right) yield item; }()].find((item) => !item.deleted && item.id.client === 100);
  expect(merged.length).toBe(2);

  const q = markerAt(hider, "q");
  hide(hider, q.key, "q", null, sv, "move-1");
  const record = reduceRecovery(hider).sources.get(q.key);
  expect(runsOf(record).map((run) => [run.text, run.baseline, run.source])).toEqual([
    ["br", true, "1.1"],
    ["X", true, "100.0"],
    ["Y", false, "100.1"],
    ["avo", true, "1.3"],
  ]);
  expect(displaced(record).map((run) => run.text)).toEqual(["Y"]);
});

test("UTF-16 emoji and hard break ids and marks survive the reduction", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => {
    peer.flow.insert(1, "\u{1F600}", { "strong~p-0": true });
    peer.flow.insertEmbed(3, { br: 1 });
  }, NET);
  merge(hider, peer);

  const q = markerAt(hider, "q");
  hide(hider, q.key, "q", null, sv, "move-1");
  const record = reduceRecovery(hider).sources.get(q.key);
  const runs = displaced(record);

  expect(runs.map((run) => [run.kind, run.length, run.text])).toEqual([["text", 2, "\u{1F600}"], ["br", 1, undefined]]);
  expect(runs[0].source).toBe(runs[0].id);
  expect(runs[0].marks).toEqual({ strong: true });
  expect(runs[0].raw).toEqual({ "strong~p-0": true });
  expect(runs[1].marks).toEqual({});
  expect(runs[1].id).not.toBe(runs[0].id);
  expect(runs[0].id.startsWith("100.")).toBe(true);
});

test("an inner split boundary is retained when the root block is empty", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  const q = markerAt(hider, "q");
  const splitter = clone(seed, 200);
  splitter.ydoc.transact(() => splitter.flow.insertEmbed(3, { b: "split-200" }), NET);
  const author = clone(splitter, 300);
  author.ydoc.transact(() => author.flow.insert(4, "X"), NET);

  hider.ydoc.transact(() => hider.flow.delete(0, 6), NET);
  merge(hider, author);
  hider.origins.set(JSON.stringify(["author", 300]), "token-300");

  const r = markerAt(hider, "r");
  expect(hider.flow.toString()).toBe("XOMEGA");
  hide(hider, q.key, "q", r.key, sv, "move-1");
  const record = reduceRecovery(hider).sources.get(q.key);

  expect(record.blocks.map((block) => block.id)).toEqual(["q", "split-200"]);
  expect(record.blocks[0].runs).toEqual([]);
  expect(runsOf(record, 1).map((run) => [run.text, run.baseline, run.author])).toEqual([["X", false, "token-300"]]);
  expect(record.recoverable).toBe(true);
});

test("a deleted end marker and a null end stop at the correct distinct boundary", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(3, "X"), NET);
  merge(hider, peer);

  const q = markerAt(hider, "q");
  const r = markerAt(hider, "r");
  hider.ydoc.transact(() => hider.flow.delete(r.at, 1), NET);
  expect(hider.flow.toString()).toBe("brXavoOMEGA");

  hide(hider, q.key, "q", r.key, sv, "move-deleted-end");
  const deleted = reduceRecovery(hider).sources.get(q.key);
  expect(runsOf(deleted).map((run) => run.text)).toEqual(["br", "X", "avo"]);
  expect(runsOf(deleted).some((run) => run.text.includes("OMEGA"))).toBe(false);

  const open = clone(seed, 2);
  const openSv = vectorOf(open.ydoc);
  const other = clone(seed, 100);
  other.ydoc.transact(() => other.flow.insert(3, "X"), NET);
  merge(open, other);
  const openQ = markerAt(open, "q");
  hide(open, openQ.key, "q", null, openSv, "move-null-end");
  const record = reduceRecovery(open).sources.get(openQ.key);
  expect(runsOf(record).map((run) => run.text)).toEqual(["br", "X", "avo"]);
  expect(record.removals[0].end).toBe(null);

  const joinedSeed = page(1, [{ id: "p", text: "A" }, { id: "q", text: "hidden" }, { id: "r", text: "B" }]);
  const joined = clone(joinedSeed, 2);
  const joinedSv = vectorOf(joined.ydoc);
  const joiner = clone(joinedSeed, 100);
  joiner.ydoc.transact(() => joiner.flow.insert(6, "Y"), NET);
  merge(joined, joiner);
  const joinedQ = markerAt(joined, "q");
  joined.ydoc.transact(() => joined.flow.delete(joinedQ.at, 1), NET);
  hide(joined, joinedQ.key, "q", null, joinedSv, "join-1");
  const joinedRecord = reduceRecovery(joined).sources.get(joinedQ.key);
  expect(runsOf(joinedRecord).map((run) => [run.text, run.baseline])).toEqual([["hid", true], ["Y", false], ["den", true]]);
  expect(runsOf(joinedRecord).some((run) => run.text === "B")).toBe(false);
  expect(displaced(joinedRecord).map((run) => run.text)).toEqual(["Y"]);
});

test("two independent overlapping removals reduce as a union and keep their own keys", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(hider, peer);

  const p = markerAt(hider, "p");
  const q = markerAt(hider, "q");
  const r = markerAt(hider, "r");
  hide(hider, p.key, "p", r.key, sv, "op-a");
  hide(hider, q.key, "q", r.key, sv, "op-b");
  hide(hider, q.key, "q", null, sv, "op-c");

  const reduced = reduceRecovery(hider);
  expect(walk(hider).holes.reduce((length, hole) => length + hole.len, 0)).toBe(13);
  expect(reduced.list.map((record) => record.source)).toEqual([p.key, q.key]);
  expect(reduced.sources.get(p.key).removals.map((removal) => removal.operationId)).toEqual(["op-a"]);
  expect(reduced.sources.get(q.key).removals.map((removal) => removal.operationId)).toEqual(["op-b", "op-c"]);
  expect(reduced.sources.get(q.key).removals.map((removal) => removal.end)).toEqual([r.key, null]);

  const ids = runsOf(reduced.sources.get(q.key)).map((run) => run.id);
  expect(ids.length).toBe(new Set(ids).size);
  expect(runsOf(reduced.sources.get(q.key)).map((run) => run.text)).toEqual(["b", "X", "ravo"]);
  expect(reduced.sources.get(p.key).blocks[0].runs.some((run) => run.text === "ALPHA")).toBe(true);
});

test("a strict encoded reload has the same detached records", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(3, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");
  hider.origins.set(JSON.stringify(["author", 1]), "token-seed");
  const q = markerAt(hider, "q");
  const r = markerAt(hider, "r");
  hide(hider, q.key, "q", r.key, sv, "move-1");
  const removal = removeKey(q.key, "move-1");
  hider.ydoc.transact(() => {
    hider.gone.set(JSON.stringify(["copy-active", q.key]), true);
    hider.gone.set(attrKey(q.key, "parent"), "p");
    hider.gone.set(attrKey(q.key, "level"), 3);
    hider.gone.set(restoreKey(q.key, "restore-1"), { covers: [removal], baseline: { type: "paragraph", attrs: { parent: null } } });
  }, NET);

  const before = reduceRecovery(hider).list;
  const reloaded = clone(hider, 77);
  expect(() => blocksFromYValue(yValueOf(reloaded.ydoc))).not.toThrow();
  const after = reduceRecovery(reloaded).list;

  expect(after.map((record) => record.revision)).toEqual(before.map((record) => record.revision));
  expect(after).toEqual(before);
  expect(before[0].copyActive).toBe(true);
  expect(before[0].overrides).toEqual({ level: 3, parent: "p" });
  expect(before[0].attrs.parent).toBe("p");
  expect(before[0].attrs.level).toBeUndefined();
  expect(before[0].restores).toEqual([{ key: restoreKey(q.key, "restore-1"), covers: [removal] }]);
  expect(before[0].type).toBe("paragraph");
  expect(before[0].author).toBe("token-seed");
  expect(before[0].revision).toBe(canonicalRevision(JSON.parse(before[0].revision)));
  expect(before[0].revision.indexOf('"br"')).toBeLessThan(before[0].revision.indexOf('"X"'));
  expect(before[0].revision.indexOf('"X"')).toBeLessThan(before[0].revision.indexOf('"avo"'));

  const snapshot = JSON.parse(JSON.stringify(before[0]));
  before[0].removals[0].sv.push([9, 9]);
  before[0].blocks[0].runs[0].raw.injected = true;
  expect(reduceRecovery(hider).list[0]).toEqual(snapshot);
  expect(Y.decodeStateVector(Y.encodeStateVector(hider.ydoc)).size).toBeGreaterThan(0);
});

test("malformed records are rejected by the strict reader and skipped by the walk", () => {
  const pd = page(1, [{ id: "q", text: "bravo" }]);
  const q = markerAt(pd, "q");
  const cases = [
    [JSON.stringify(["remove", "1.0"]), { blockId: "q", end: null, sv: [] }],
    [JSON.stringify(["remove", q.key, "op"]), { blockId: "q", end: null, sv: [[1, 1], [1, 2]] }],
    [JSON.stringify(["remove", q.key, "op"]), { blockId: "q", end: null, sv: [[1, -1]] }],
    [JSON.stringify(["remove", q.key, "op"]), { blockId: "q", end: null, sv: [[1, 1.5]] }],
    [JSON.stringify(["remove", q.key, "op"]), { blockId: "q", end: null, sv: [[1, 1]], extra: true }],
    [JSON.stringify(["copy-active", q.key]), "yes"],
    [JSON.stringify(["unknown", q.key]), true],
    [JSON.stringify(["text-delete", 1, 3]), { length: 2, actor: 2, sv: [[1, 6]] }],
    [textDeleteKey(1, 3, "op"), { length: 0, actor: 2, sv: [[1, 6]] }],
    [textDeleteKey(1, 3, "op"), { length: 2, actor: -1, sv: [[1, 6]] }],
    [textDeleteKey(1, 3, "op"), { length: 2, actor: 2, sv: [[2, 1], [1, 1]] }],
    [textDeleteKey(1, Number.MAX_SAFE_INTEGER, "op"), { length: 3, actor: 2, sv: [] }],
    ["1.0", { b: "q", e: "x" }],
  ];
  for (const [key, value] of cases) {
    pd.ydoc.transact(() => pd.gone.set(key, value), NET);
    expect(() => parseGoneIntents(pd.gone, { strict: true })).toThrow(/gone|record|vector/i);
    expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError" }));
    expect(() => walk(pd)).not.toThrow();
    expect(() => reduceRecovery(pd)).not.toThrow();
    pd.ydoc.transact(() => pd.gone.delete(key), NET);
  }
  expect(parseGoneIntents(pd.gone, { strict: true }).removals).toEqual([]);
  expect(parseGoneIntents(pd.gone).removals).toEqual([]);
});

test("a text-delete record must name a flow interval, and a merged deleted item still counts", () => {
  const pd = page(1, [{ id: "q", text: "bravo" }]);
  const good = textDeleteKey(1, 3, "op-1");
  pd.ydoc.transact(() => pd.gone.set(good, { length: 2, actor: 2, sv: [[1, 6]] }), NET);
  expect(parseGoneIntents(pd.gone, { strict: true }).textDeletes).toEqual([{ key: good, client: 1, clock: 3, length: 2, actor: 2, sv: [[1, 6]] }]);
  expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).not.toThrow();

  const bad = [
    [textDeleteKey(1, 5, "op-2"), { length: 2, actor: 2, sv: [[1, 6]] }],
    [textDeleteKey(1, 99, "op-3"), { length: 1, actor: 2, sv: [[1, 6]] }],
    [textDeleteKey(2, 0, "op-4"), { length: 1, actor: 2, sv: [[1, 6]] }],
  ];
  for (const [key, value] of bad) {
    pd.ydoc.transact(() => pd.gone.set(key, value), NET);
    expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));
    pd.ydoc.transact(() => pd.gone.delete(key), NET);
  }

  pd.ydoc.transact(() => { pd.flow.insert(6, "X"); pd.flow.delete(1, 6); }, NET);
  expect(() => blocksFromYValue(yValueOf(clone(pd, 9).ydoc))).not.toThrow();
});

test("removal, restore, copy-active and override records must name flow items, including inside a merged deleted item", () => {
  const pd = page(1, [{ id: "p", text: "alpha" }, { id: "q", text: "bravo" }]);
  const strict = () => blocksFromYValue(yValueOf(clone(pd, 9).ydoc));
  const rejects = () => expect(strict).toThrow(expect.objectContaining({ name: "YDecodeError", code: "invalid-content" }));
  const removal = removeKey("1.6", "op-1");
  hide(pd, "1.6", "q", "1.11", [[1, 12]], "op-1");
  pd.ydoc.transact(() => pd.gone.set(restoreKey("1.6", "op-2"), { covers: [removal], baseline: { type: "paragraph", attrs: {} } }), NET);
  pd.ydoc.transact(() => pd.gone.set(attrKey("1.6", "type"), "heading"), NET);
  expect(strict).not.toThrow();

  const bad = [
    [removeKey("1.99", "op-3"), { blockId: "q", end: null, sv: [[1, 12]] }],
    [removeKey("1.6", "op-4"), { blockId: "q", end: "7.0", sv: [[1, 12]] }],
    [restoreKey("1.99", "op-5"), { covers: [removal], baseline: { type: "paragraph", attrs: {} } }],
    [restoreKey("1.6", "op-6"), { covers: [removeKey("1.99", "op-x")], baseline: { type: "paragraph", attrs: {} } }],
    [attrKey("1.99", "type"), "heading"],
  ];
  for (const [key, value] of bad) {
    pd.ydoc.transact(() => pd.gone.set(key, value), NET);
    rejects();
    pd.ydoc.transact(() => pd.gone.delete(key), NET);
  }

  pd.ydoc.transact(() => pd.flow.delete(0, pd.flow.length), NET);
  expect(strict).not.toThrow();
});

test("the reducer resolves recovered text through the origin index and never lends the mover's token", () => {
  const source = page(1, [{ id: "q", text: "bravo" }]);
  source.origins.set(JSON.stringify(["author", 1]), "token-seed");
  const mover = clone(source, 200);
  mover.origins.set(JSON.stringify(["author", 200]), "token-mover");
  const sv = vectorOf(mover.ydoc);
  const index = createOriginIndex(mover.origins);
  const from = mover.flow.length;
  mover.ydoc.transact(() => {
    mover.flow.insertEmbed(mover.flow.length, { b: "copy" });
    mover.flow.insert(mover.flow.length, "bravo");
  }, NET);
  index.recordSpans(unitIds(mover.flow, from + 1, mover.flow.length).map((dest, offset) => ({ dest, source: { client: 1, clock: 1 + offset } })));

  const copy = markerAt(mover, "copy");
  hide(mover, copy.key, "copy", null, sv, "move-1");
  const record = reduceRecovery(mover, { index }).sources.get(copy.key);

  expect(runsOf(record).map((run) => [run.text, run.source, run.author])).toEqual([["bravo", "1.1", "token-seed"]]);
  expect(record.author).toBe("token-mover");
  expect(runsOf(record)[0].id.startsWith("200.")).toBe(true);

  mover.ydoc.transact(() => mover.origins.delete(JSON.stringify(["author", 1])), NET);
  const untagged = reduceRecovery(mover, { index }).sources.get(copy.key);
  expect(runsOf(untagged)[0].author).toBe(null);
  expect(untagged.revision).not.toBe(record.revision);
  index.dispose();
});

test("a legacy physical-key removal still reduces into a recovery source", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(3, "X"), NET);
  merge(hider, peer);
  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.gone.set(q.key, { b: "q", e: null }), NET);

  const record = reduceRecovery(hider).sources.get(q.key);
  expect(runsOf(record).map((run) => run.text)).toEqual(["br", "X", "avo"]);
  expect(record.removals).toEqual([{ key: q.key, operationId: null, end: null, sv: [] }]);
  expect(displaced(record).length).toBe(3);
  expect(runsOf(record).every((run) => !run.baseline)).toBe(true);
  expect(walk(hider).hidden[0].key).toBe(q.key);
});
