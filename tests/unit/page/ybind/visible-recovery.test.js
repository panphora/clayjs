import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, LOCAL, NET, walk, reduceRecovery, removeKey, canonicalRevision, blocksFromYValue, createOriginIndex, installUndoOrigins, unitIds } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

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
  pd.ydoc.transact(() => pd.gone.set(removeKey(sourceKey, operationId), { blockId, end, sv }), LOCAL);
};

const copyText = (pd, index, at, text, source) => {
  pd.ydoc.transact(() => pd.flow.insert(at, text), LOCAL);
  index.recordSpans(unitIds(pd.flow, at, at + text.length).map((dest, offset) => ({ dest, source: { client: source.client, clock: source.clock + offset } })));
  return at;
};

const runsOf = (record) => record.blocks[0].runs;
const allRuns = (record) => record.blocks.flatMap((block) => block.runs);
const displaced = (record) => allRuns(record).filter((run) => run.displaced);
const recoverableSources = (reduced) => reduced.list.filter((record) => record.recoverable).map((record) => record.source);

test("an unseen X hidden under a deleted q boundary is recoverable with its client and token", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const sv = vectorOf(hider.ydoc);
  expect(sv).toEqual([[1, 18]]);

  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");

  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.flow.delete(q.at, 1), NET);
  hide(hider, q.key, "q", null, sv, "join-1");

  const reduced = reduceRecovery(hider);
  const record = reduced.sources.get(q.key);
  expect(recoverableSources(reduced)).toEqual([q.key]);
  expect(record.recoverable).toBe(true);
  expect(record.author).toBe(null);
  expect(displaced(record).map((run) => [run.id, run.source, run.length, run.text, run.author])).toEqual([["100.0", "100.0", 1, "X", "token-100"]]);
  expect(record.removals).toEqual([{ key: removeKey(q.key, "join-1"), operationId: "join-1", end: null, sv }]);
  expect(walk(hider).hidden.map((entry) => entry.sourceKey)).toEqual([q.key]);
});

test("a visible copy of the same original interval suppresses the duplicate candidate", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const index = createOriginIndex(hider.origins);
  const sv = vectorOf(hider.ydoc);

  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");

  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.flow.delete(q.at, 1), NET);
  hide(hider, q.key, "q", null, sv, "join-1");
  const r = markerAt(hider, "r");
  copyText(hider, index, r.at + 1, "X", { client: 100, clock: 0 });
  expect(index.resolve(unitIds(hider.flow, r.at + 1, r.at + 2)[0])).toEqual({ client: 100, clock: 0 });

  const reduced = reduceRecovery(hider, { index });
  const record = reduced.sources.get(q.key);
  expect(runsOf(record).map((run) => [run.text, run.source, run.baseline, run.displaced])).toEqual([["b", "1.7", true, false], ["X", "100.0", false, false], ["ravo", "1.8", true, false]]);
  expect(displaced(record)).toEqual([]);
  expect(record.recoverable).toBe(false);
  expect(recoverableSources(reduced)).toEqual([]);
  expect(walk(hider).hidden.map((entry) => entry.sourceKey)).toEqual([q.key]);
  index.dispose();
});

test("an equal X from another client remains a separate candidate", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const index = createOriginIndex(hider.origins);
  const sv = vectorOf(hider.ydoc);

  const first = clone(seed, 100);
  first.ydoc.transact(() => first.flow.insert(8, "X"), NET);
  const second = clone(seed, 101);
  second.ydoc.transact(() => second.flow.insert(10, "X"), NET);
  merge(hider, first);
  merge(hider, second);
  hider.origins.set(JSON.stringify(["author", 101]), "token-101");

  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.flow.delete(q.at, 1), NET);
  hide(hider, q.key, "q", null, sv, "join-1");
  const r = markerAt(hider, "r");
  copyText(hider, index, r.at + 1, "X", { client: 100, clock: 0 });

  const reduced = reduceRecovery(hider, { index });
  const record = reduced.sources.get(q.key);
  expect(runsOf(record).map((run) => [run.text, run.source, run.baseline, run.displaced])).toEqual([["b", "1.7", true, false], ["X", "100.0", false, false], ["ra", "1.8", true, false], ["X", "101.0", false, true], ["vo", "1.10", true, false]]);
  expect(displaced(record).map((run) => [run.id, run.source, run.text, run.author])).toEqual([["101.0", "101.0", "X", "token-101"]]);
  expect(displaced(record).length).toBe(1);
  expect(record.recoverable).toBe(true);
  expect(recoverableSources(reduced)).toEqual([q.key]);
  index.dispose();
});

test("an observed baseline-only copy with a visible original creates no recoverable entry", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const index = createOriginIndex(hider.origins);

  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");
  const r = markerAt(hider, "r");
  copyText(hider, index, r.at + 1, "X", { client: 100, clock: 0 });
  const sv = vectorOf(hider.ydoc);
  expect(new Map(sv).get(2) ?? 0).toBeGreaterThan(unitIds(hider.flow, r.at + 1, r.at + 2)[0].clock);

  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.flow.delete(q.at, 1), NET);
  hide(hider, q.key, "q", null, sv, "join-1");

  const reduced = reduceRecovery(hider, { index });
  const record = reduced.sources.get(q.key);
  expect(displaced(record)).toEqual([]);
  expect(record.recoverable).toBe(false);
  expect(recoverableSources(reduced)).toEqual([]);
  expect(reduced.list.map((source) => source.source)).toEqual([q.key]);
  expect(record.revision).toBe(canonicalRevision(JSON.parse(record.revision)));
  expect(runsOf(record).map((run) => [run.text, run.source, run.baseline])).toEqual([["b", "1.7", true], ["X", "100.0", true], ["ravo", "1.8", true]]);
  index.dispose();
});

test("a split retains its empty source root plus the exact displaced inner block", () => {
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

  const reduced = reduceRecovery(hider);
  const record = reduced.sources.get(q.key);
  expect(record.blocks.map((block) => block.id)).toEqual(["q", "split-200"]);
  expect(runsOf(record)).toEqual([]);
  expect(record.blocks[1].runs.map((run) => [run.id, run.source, run.text, run.author, run.baseline])).toEqual([["300.0", "300.0", "X", "token-300", false]]);
  expect(displaced(record).map((run) => run.source)).toEqual(["300.0"]);
  expect(record.recoverable).toBe(true);
  expect(recoverableSources(reduced)).toEqual([q.key]);
});

test("a hidden hard break and emoji keep exact UTF-16 original ids and marks", () => {
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

  const reduced = reduceRecovery(hider);
  const record = reduced.sources.get(q.key);
  const runs = displaced(record);
  expect(runs.map((run) => [run.id, run.source, run.kind, run.length, run.text])).toEqual([
    ["100.1", "100.1", "text", 2, "\u{1F600}"],
    ["100.4", "100.4", "br", 1, undefined],
  ]);
  expect(runs[0].marks).toEqual({ strong: true });
  expect(runs[0].raw).toEqual({ "strong~p-0": true });
  expect(runs[1].marks).toEqual({});
  expect(runs[1].id).not.toBe(runs[0].id);
  expect(record.recoverable).toBe(true);
  expect(recoverableSources(reduced)).toEqual([q.key]);
});

test("one merged Yjs ContentString splits on the state-vector boundary and merges when it matches", () => {
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
  const observed = reduceRecovery(hider);
  const record = observed.sources.get(q.key);
  expect(runsOf(record).map((run) => [run.text, run.baseline, run.displaced, run.source])).toEqual([["br", true, false, "1.1"], ["X", true, false, "100.0"], ["Y", false, true, "100.1"], ["avo", true, false, "1.3"]]);
  expect(displaced(record).map((run) => [run.id, run.source, run.length, run.text])).toEqual([["100.1", "100.1", 1, "Y"]]);
  expect(recoverableSources(observed)).toEqual([q.key]);

  const both = clone(seed, 2);
  const bothSv = vectorOf(both.ydoc);
  const writer = clone(seed, 100);
  writer.ydoc.transact(() => { writer.flow.insert(3, "X"); writer.flow.insert(4, "Y"); }, NET);
  merge(both, writer);
  const bothQ = markerAt(both, "q");
  hide(both, bothQ.key, "q", null, bothSv, "move-1");
  const unseen = reduceRecovery(both);
  const bothRecord = unseen.sources.get(bothQ.key);
  expect(runsOf(bothRecord).map((run) => [run.text, run.baseline, run.source])).toEqual([["br", true, "1.1"], ["XY", false, "100.0"], ["avo", true, "1.3"]]);
  expect(displaced(bothRecord).map((run) => [run.id, run.source, run.length, run.text])).toEqual([["100.0", "100.0", 2, "XY"]]);
  expect(recoverableSources(unseen)).toEqual([bothQ.key]);
});

test("a merged item splits per UTF-16 unit when one visible copy covers only its first", () => {
  const seed = page(1, [{ id: "q", text: "bravo" }]);
  const hider = clone(seed, 2);
  const index = createOriginIndex(hider.origins);
  const sv = vectorOf(hider.ydoc);

  const writer = clone(seed, 100);
  writer.ydoc.transact(() => { writer.flow.insert(3, "X"); writer.flow.insert(4, "Y"); }, NET);
  merge(hider, writer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");
  const merged = [...function* () { for (let item = hider.flow._start; item; item = item.right) yield item; }()].find((item) => !item.deleted && item.id.client === 100);
  expect(merged.length).toBe(2);

  const at = hider.flow.length;
  hider.ydoc.transact(() => { hider.flow.insertEmbed(at, { b: "copy" }); hider.flow.insert(at + 1, "X"); }, NET);
  index.recordSpans([{ dest: unitIds(hider.flow, at + 1, at + 2)[0], source: { client: 100, clock: 0 } }]);
  expect(index.resolve(unitIds(hider.flow, at + 1, at + 2)[0])).toEqual({ client: 100, clock: 0 });

  const q = markerAt(hider, "q");
  hide(hider, q.key, "q", null, sv, "move-1");

  const reduced = reduceRecovery(hider, { index });
  const record = reduced.sources.get(q.key);
  expect(runsOf(record).map((run) => [run.text, run.baseline, run.displaced, run.source])).toEqual([["br", true, false, "1.1"], ["X", false, false, "100.0"], ["Y", false, true, "100.1"], ["avo", true, false, "1.3"]]);
  expect(displaced(record).map((run) => [run.id, run.source, run.length, run.text, run.author])).toEqual([["100.1", "100.1", 1, "Y", "token-100"]]);
  expect(record.recoverable).toBe(true);
  expect(recoverableSources(reduced)).toEqual([q.key]);
  index.dispose();
});

test("Undo, Redo and a strict encoded reload hold the classification while the visible interval holds", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const hider = clone(seed, 2);
  const index = createOriginIndex(hider.origins);
  const sv = vectorOf(hider.ydoc);

  const peer = clone(seed, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(hider, peer);
  hider.origins.set(JSON.stringify(["author", 100]), "token-100");

  const um = new Y.UndoManager([hider.flow, hider.attrs, hider.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const stop = installUndoOrigins(hider, um, index);

  const q = markerAt(hider, "q");
  hider.ydoc.transact(() => hider.flow.delete(q.at, 1), LOCAL);
  um.stopCapturing();
  hide(hider, q.key, "q", null, sv, "join-1");
  um.stopCapturing();
  const r = markerAt(hider, "r");
  const copy = copyText(hider, index, r.at + 1, "X", { client: 100, clock: 0 });
  um.stopCapturing();

  const hidden = reduceRecovery(hider, { index });
  expect(hidden.sources.get(q.key).recoverable).toBe(false);
  expect(displaced(hidden.sources.get(q.key))).toEqual([]);
  expect(recoverableSources(hidden)).toEqual([]);

  expect(um.undo()).not.toBeNull();
  const shown = reduceRecovery(hider, { index });
  expect(shown.sources.get(q.key).recoverable).toBe(true);
  expect(displaced(shown.sources.get(q.key)).map((run) => [run.id, run.source, run.text, run.author])).toEqual([["100.0", "100.0", "X", "token-100"]]);
  expect(recoverableSources(shown)).toEqual([q.key]);

  expect(um.redo()).not.toBeNull();
  const redone = reduceRecovery(hider, { index });
  expect(redone.sources.get(q.key).recoverable).toBe(false);
  expect(redone.sources.get(q.key).revision).toBe(hidden.sources.get(q.key).revision);
  expect(index.resolve(unitIds(hider.flow, copy, copy + 1)[0])).toEqual({ client: 100, clock: 0 });

  const reloaded = clone(hider, 77);
  expect(() => blocksFromYValue(yValueOf(reloaded.ydoc))).not.toThrow();
  const after = reduceRecovery(reloaded);
  expect(after.list.map((record) => record.revision)).toEqual(redone.list.map((record) => record.revision));
  expect(recoverableSources(after)).toEqual([]);
  stop();
  um.destroy();
  index.dispose();
});
