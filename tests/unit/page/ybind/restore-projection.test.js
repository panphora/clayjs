globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, walk, docOf, reduceRecovery, removeKey, restoreKey, attrKey, boundaryKey, copyActiveKey, physicalKeyOf, unitIds, createOriginIndex, canonicalRevision, blocksFromYValue, authorKey } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";
import { createProjectionMap } from "../../../../src/page/ybind/projection-map.js";
import { LOCAL, NET } from "../../../../src/page/ybind/layout.js";

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
const registerBoundary = (pd, id, sourceKey) => {
  let marker = null;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.id.client !== pd.ydoc.clientID || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== id) continue;
    if (!marker || it.id.clock > marker.clock) marker = it.id;
  }
  if (!marker) throw new Error(`Missing recovered marker ${id}`);
  pd.origins.set(boundaryKey(marker.client, marker.clock), { blockId: id, kind: "restore", recoveryOf: sourceKey });
};
const addRestore = (pd, sourceKey, operationId, covers, baseline) => {
  const at = indexAt(pd, sourceKey);
  const id = `recovered:${sourceKey}`;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(at, { b: id });
    registerBoundary(pd, id, sourceKey);
    pd.gone.set(restoreKey(sourceKey, operationId), { covers, baseline });
  }, LOCAL);
};
const recoverMarkerCount = (pd, sourceKey) => {
  let n = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === `recovered:${sourceKey}`) n++;
  }
  return n;
};

const segText = (s) => s.runs.map((r) => (r.br ? "\n" : r.hole ? "" : r.text)).join("");
const visible = (w) => w.visible.map((s) => [s.id, segText(s)]);
const holeTotal = (w) => w.holes.reduce((n, h) => n + h.len, 0);
const physical = (pd, w) => {
  expect(w.tokens + holeTotal(w)).toBe(pd.flow.length);
};

test("one Restore exposes the hidden source once under a recovered root", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  hide(pd, q, "q", rr, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });

  const w = walk(pd);
  expect(visible(w)).toEqual([["p", "ALPHA"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  expect(w.visible.some((s) => s.id === "q")).toBe(false);
  expect(recoverMarkerCount(pd, q)).toBe(1);
  expect(w.hidden).toEqual([]);
  physical(pd, w);

  const doc = docOf(pd, w);
  expect(doc.childCount).toBe(3);
  expect(doc.child(1).attrs.id).toBe(`recovered:${q}`);
  expect(doc.child(1).textContent).toBe("bravo");

  const record = reduceRecovery(pd).sources.get(q);
  expect(record.source).toBe(q);
  expect(record.removals.map((r) => r.operationId)).toEqual(["move-1"]);
  expect(record.revision).toBe(canonicalRevision(JSON.parse(record.revision)));
  expect(reduceRecovery(pd).sources.get(q).revision).toBe(record.revision);
});

test("a public ID with a recovered prefix remains an ordinary block", () => {
  const pd = page(1, [{ id: "recovered:1.0", text: "ok" }]);
  expect(visible(walk(pd))).toEqual([["recovered:1.0", "ok"]]);
});

test("two disconnected Restores make one root and Undo leaves the other visible", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(seed, "q");
  hide(seed, q, "q", null, "move-1");
  const a = clone(seed, 100);
  const b = clone(seed, 200);
  const umA = new Y.UndoManager([a.flow, a.attrs, a.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const umB = new Y.UndoManager([b.flow, b.attrs, b.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  const removal = removeKey(q, "move-1");
  addRestore(a, q, "restore-1", [removal], { type: "paragraph", attrs: {} });
  addRestore(b, q, "restore-2", [removal], { type: "paragraph", attrs: {} });
  merge(a, b);
  merge(b, a);

  const both = walk(a);
  expect(both.visible.filter((s) => s.id === `recovered:${q}`).length).toBe(1);
  expect(visible(both)).toEqual([["p", "ALPHA"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  expect(visible(walk(b))).toEqual(visible(both));
  expect(recoverMarkerCount(a, q)).toBe(2);
  physical(a, both);

  umA.undo();
  merge(b, a);
  const one = walk(a);
  expect(recoverMarkerCount(a, q)).toBe(1);
  expect(visible(one)).toEqual([["p", "ALPHA"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  expect(visible(walk(b))).toEqual(visible(one));
  physical(a, one);

  umB.undo();
  merge(a, b);
  const none = walk(a);
  expect(recoverMarkerCount(a, q)).toBe(0);
  expect(none.visible.some((s) => s.id === `recovered:${q}`)).toBe(false);
  expect(visible(none)).toEqual([["p", "ALPHA"], ["r", "OMEGA"]]);
  physical(a, none);
  umA.destroy();
  umB.destroy();
});

test("an uncovered later removal hides the source again and a fresh covering Restore shows it", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  const before = reduceRecovery(pd).sources.get(q).revision;
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });
  expect(walk(pd).visible.some((s) => s.id === `recovered:${q}`)).toBe(true);
  const after = reduceRecovery(pd).sources.get(q).revision;
  expect(after).not.toBe(before);
  expect(reduceRecovery(pd).sources.get(q).revision).toBe(after);

  hide(pd, q, "q", null, "move-2");
  const hidden = walk(pd);
  expect(hidden.visible.some((s) => s.id === `recovered:${q}`)).toBe(false);
  expect(visible(hidden)).toEqual([["p", "ALPHA"], ["r", "OMEGA"]]);
  expect(hidden.hidden.some((h) => h.key === removeKey(q, "move-2"))).toBe(true);
  expect(reduceRecovery(pd).sources.get(q).blocks.map((block) => block.id)).toEqual(["q"]);
  expect(holeTotal(hidden)).toBe(7);
  physical(pd, hidden);

  addRestore(pd, q, "restore-2", [removeKey(q, "move-1"), removeKey(q, "move-2")], { type: "paragraph", attrs: {} });
  const shown = walk(pd);
  expect(shown.visible.filter((s) => s.id === `recovered:${q}`).length).toBe(1);
  expect(visible(shown)).toEqual([["p", "ALPHA"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  physical(pd, shown);
});

test("an inner split is projected under an empty recovered root", () => {
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

  const w = walk(pd);
  const root = w.visible.find((s) => s.id === `recovered:${q}`);
  expect(root).toBeTruthy();
  expect(segText(root)).toBe("");
  expect(visible(w)).toEqual([[`recovered:${q}`, ""], ["split-200", "X"], ["r", "OMEGA"]]);
  expect(recoverMarkerCount(pd, q)).toBe(1);
  physical(pd, w);
});

test("raw marks and baseline type and attrs survive strict encoded reload", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  const formatAt = (() => { let at = 0; for (let it = pd.flow._start; it; it = it.right) { if (it.content instanceof Y.ContentEmbed && it.content.embed.b === "q") return at + 1; if (!it.deleted && it.countable) at += it.length; } })();
  pd.ydoc.transact(() => pd.flow.format(formatAt, 3, { "strong~1-1": true }), LOCAL);
  hide(pd, q, "q", rr, "move-1");
  pd.ydoc.transact(() => pd.gone.set(attrKey(q, "parent"), "p"), LOCAL);
  pd.ydoc.transact(() => pd.gone.set(attrKey(q, "src"), "x.png"), LOCAL);
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "heading", attrs: { level: 3, parent: null } });

  const w = walk(pd);
  const root = w.visible.find((s) => s.id === `recovered:${q}`);
  expect(root.t).toBe("heading");
  expect(root.fields).toEqual({ parent: "p", level: 3 });
  expect(root.runs[0].marks.map((m) => m.type.name)).toEqual(["strong"]);

  const reloaded = clone(pd, 77);
  const value = blocksFromYValue(yValueOf(reloaded.ydoc));
  expect(value[`recovered:${q}`].t).toBe("heading");
  expect(value[`recovered:${q}`].level).toBe(3);
  expect(value[`recovered:${q}`].parent).toBe("p");
  expect(value[`recovered:${q}`].c).toBe("bravo");
  const marks = reduceRecovery(pd).sources.get(q).overrides;
  expect(marks.src).toBe("x.png");
  expect(w.visible.some((s) => s.id === "q")).toBe(false);
});

test("the baseline comes from the active Restore with the most active covers and a key tie break", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  hide(pd, q, "q", rr, "move-1");
  const removal = removeKey(q, "move-1");
  const um = new Y.UndoManager([pd.flow, pd.attrs, pd.gone], { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 });
  pd.ydoc.transact(() => pd.gone.set(attrKey(q, "parent"), "p"), LOCAL);
  pd.ydoc.transact(() => pd.gone.set(attrKey(q, "src"), "x.png"), LOCAL);
  um.stopCapturing();

  addRestore(pd, q, "restore-zzz", [removeKey(q, "dead-1"), removeKey(q, "dead-2"), removal], { type: "heading", attrs: { level: 1, parent: null } });
  um.stopCapturing();
  addRestore(pd, q, "restore-aaa", [removal], { type: "heading", attrs: { level: 2, parent: null } });

  const root = walk(pd).visible.find((s) => s.id === `recovered:${q}`);
  expect(root.t).toBe("heading");
  expect(root.fields.level).toBe(2);
  expect(root.fields.parent).toBe("p");
  expect(reduceRecovery(pd).sources.get(q).restores.length).toBe(2);
  expect(reduceRecovery(pd).sources.get(q).overrides.src).toBe("x.png");

  um.undo();
  const older = walk(pd).visible.find((s) => s.id === `recovered:${q}`);
  expect(older.t).toBe("heading");
  expect(older.fields.level).toBe(1);
  expect(older.fields.parent).toBe("p");
  expect(reduceRecovery(pd).sources.get(q).overrides.src).toBe("x.png");
  physical(pd, walk(pd));
  um.destroy();
});

test("the baseline supplies a field and the flat override changes type", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  hide(pd, q, "q", rr, "move-1");
  pd.ydoc.transact(() => {
    pd.gone.set(attrKey(q, "t"), "heading");
    pd.gone.set(attrKey(q, "level"), 3);
    pd.gone.set(attrKey(q, "parent"), "p");
    pd.gone.set(attrKey(q, "src"), "x.png");
  }, LOCAL);
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: { parent: null } });

  const root = walk(pd).visible.find((s) => s.id === `recovered:${q}`);
  expect(root.t).toBe("heading");
  expect(root.fields).toEqual({ parent: "p", level: 3 });
  const record = reduceRecovery(pd).sources.get(q);
  expect(record.overrides).toEqual({ level: 3, parent: "p", src: "x.png", t: "heading" });
  expect(record.type).toBe("heading");

  const value = blocksFromYValue(yValueOf(clone(pd, 55).ydoc));
  expect(value[`recovered:${q}`].t).toBe("heading");
  expect(value[`recovered:${q}`].level).toBe(3);
  expect(value[`recovered:${q}`].parent).toBe("p");
});

test("a deleted source marker is replaced by the recovered root", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  const at = (() => { let n = 0; for (let it = pd.flow._start; it; it = it.right) { if (it.content instanceof Y.ContentEmbed && it.content.embed.b === "q") return n; if (!it.deleted && it.countable) n += it.length; } })();
  pd.ydoc.transact(() => pd.flow.delete(at, 1), LOCAL);
  hide(pd, q, "q", null, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });

  const w = walk(pd);
  expect(visible(w)).toEqual([["p", "ALPHA"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  expect(w.visible.some((s) => s.id === "q")).toBe(false);
  expect(recoverMarkerCount(pd, q)).toBe(1);
  physical(pd, w);
});

test("overlapping removals keep the physical hole lengths correct", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const p = keyOf(pd, "p");
  const q = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  hide(pd, p, "p", rr, "op-a");
  hide(pd, q, "q", rr, "op-b");
  hide(pd, q, "q", null, "op-c");
  const w = walk(pd);
  const before = holeTotal(w);
  expect(before).toBeGreaterThan(0);
  physical(pd, w);

  addRestore(pd, q, "restore-1", [removeKey(q, "op-b"), removeKey(q, "op-c")], { type: "paragraph", attrs: {} });
  const restored = walk(pd);
  expect(restored.visible.some((s) => s.id === `recovered:${q}`)).toBe(false);
  expect(recoverMarkerCount(pd, q)).toBe(1);
  physical(pd, restored);
  expect(holeTotal(restored)).toBe(before + 1);
});

test("a deleted recovered block keeps a concurrent peer insertion recoverable under the retired marker", () => {
  const SEED = 1, TAB_A = 100, TAB_B = 200, RELOAD = 900;
  const seed = page(SEED, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  seed.ydoc.transact(() => {
    seed.origins.set(authorKey(SEED), "seed");
    seed.origins.set(authorKey(TAB_A), "token-100");
    seed.origins.set(authorKey(TAB_B), "token-200");
  }, NET);
  const q = keyOf(seed, "q");
  const rr = keyOf(seed, "r");
  const openTab = (pd) => {
    const bridge = createBridge({ pd, captureTimeout: 0 });
    const mount = document.body.appendChild(document.createElement("div"));
    const view = new pmView.EditorView(mount, { state: pmState.EditorState.create({ doc: docOf(pd, walk(pd)), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => bridge.dispatch(tr) });
    bridge.attach(view);
    return { pd, bridge, view, mount };
  };
  const blockNode = (tab, id) => {
    let pos = null;
    tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === id) pos = at; });
    if (pos === null) throw new Error(`Missing block ${id}`);
    return { pos, node: tab.view.state.doc.nodeAt(pos) };
  };

  const a = openTab(clone(seed, TAB_A));
  const b = openTab(clone(seed, TAB_B));
  hide(a.pd, q, "q", rr, "move-1");
  merge(b.pd, a.pd);
  const record = a.bridge.recoverable[0];
  expect(a.bridge.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  merge(b.pd, a.pd);

  const R = keyOf(a.pd, `recovered:${q}`);
  const bTarget = blockNode(b, `recovered:${q}`);
  b.view.dispatch(b.view.state.tr.insertText("Z", bTarget.pos + 1 + bTarget.node.textContent.length));
  const aTarget = blockNode(a, `recovered:${q}`);
  a.view.dispatch(a.view.state.tr.delete(aTarget.pos, aTarget.pos + aTarget.node.nodeSize));

  const ua = Y.encodeStateAsUpdateV2(a.pd.ydoc);
  const ub = Y.encodeStateAsUpdateV2(b.pd.ydoc);
  for (const order of [[ua, ub], [ub, ua]]) {
    const reloaded = clone(seed, RELOAD);
    for (const update of order) { Y.applyUpdateV2(reloaded.ydoc, update); Y.applyUpdateV2(reloaded.ydoc, update); }

    const w = walk(reloaded);
    expect(visible(w)).toEqual([["p", "ALPHA"], ["r", "OMEGA"]]);
    expect(w.visible.some((s) => segText(s).includes("Z"))).toBe(false);
    physical(reloaded, w);
    expect(createProjectionMap(w, reloaded.flow.length).physicalLength).toBe(reloaded.flow.length);

    let zKey = null;
    for (let it = reloaded.flow._start; it; it = it.right) {
      if (!it.deleted && it.content instanceof Y.ContentString && it.content.str === "Z" && it.id.client === TAB_B) zKey = `${it.id.client}.${it.id.clock}`;
    }
    expect(zKey).not.toBeNull();
    const retired = reduceRecovery(reloaded).sources.get(R);
    expect(retired.recoverable).toBe(true);
    expect(retired.blocks.flatMap((block) => block.runs).filter((run) => run.displaced).map((run) => [run.id, run.source, run.text, run.author])).toEqual([[zKey, zKey, "Z", "token-200"]]);
    expect(() => blocksFromYValue(yValueOf(clone(reloaded, RELOAD).ydoc))).not.toThrow();
  }
});

test("a moved recovered copy carries the recovered block while the retired Restore marker stays independently recoverable", () => {
  const SEED = 1, PEER = 200, SNAPSHOT = 500, RELOAD = 900;
  const pd = page(SEED, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  pd.ydoc.transact(() => {
    pd.origins.set(authorKey(SEED), "seed");
    pd.origins.set(authorKey(PEER), "token-200");
  }, NET);
  const S = keyOf(pd, "q");
  const rr = keyOf(pd, "r");
  const blockId = `recovered:${S}`;
  hide(pd, S, "q", rr, "move-1");
  addRestore(pd, S, "restore-1", [removeKey(S, "move-1")], { type: "heading", attrs: { level: 2 } });
  const R = keyOf(pd, blockId);
  const base = clone(pd, SNAPSHOT);

  const only = walk(base);
  expect(visible(only)).toEqual([["p", "ALPHA"], [blockId, "bravo"], ["r", "OMEGA"]]);
  expect(only.visible.filter((s) => s.id === blockId).length).toBe(1);
  expect(recoverMarkerCount(base, S)).toBe(1);
  physical(base, only);

  const positionBefore = (doc, sourceKey) => {
    let at = 0;
    for (let it = doc.flow._start; it; it = it.right) {
      if (`${it.id.client}.${it.id.clock}` === sourceKey) return at;
      if (!it.deleted && it.countable) at += it.length;
    }
    throw new Error(`Missing source ${sourceKey}`);
  };
  const peer = clone(base, PEER);
  peer.ydoc.transact(() => peer.flow.insert(positionBefore(peer, rr), "Y"), NET);

  const source = [];
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.content instanceof Y.ContentString && it.content.str === "bravo")
      for (let i = 0; i < it.length; i++) source.push({ client: it.id.client, clock: it.id.clock + i });
  }
  expect(source.length).toBe(5);

  let M = null;
  pd.ydoc.transact(() => {
    pd.flow.delete(positionBefore(pd, rr) - 5, 5);
    pd.gone.set(removeKey(R, "move-2"), { blockId, end: rr, sv: [] });
    const at = pd.flow.length;
    pd.flow.insertEmbed(at, { b: blockId });
    let marker = null;
    for (let it = pd.flow._start; it; it = it.right) {
      if (it.id.client !== pd.ydoc.clientID || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== blockId) continue;
      if (!marker || it.id.clock > marker.clock) marker = it.id;
    }
    M = `${marker.client}.${marker.clock}`;
    pd.origins.set(boundaryKey(marker.client, marker.clock), { blockId, kind: "copy", recoveryOf: S });
    pd.gone.set(copyActiveKey(M), true);
    pd.flow.insert(at + 1, "bravo");
    const dest = unitIds(pd.flow, at + 1, at + 6);
    const spans = [];
    for (let i = 0; i < dest.length; i++) spans.push({ dest: dest[i], source: source[i] });
    const origins = createOriginIndex(pd.origins);
    try { origins.recordSpans(spans); } finally { origins.dispose(); }
    pd.gone.set(restoreKey(S, "restore-2"), { covers: [removeKey(S, "move-1")], baseline: { type: "heading", attrs: { level: 2 } } });
  }, LOCAL);

  const ua = Y.encodeStateAsUpdateV2(pd.ydoc);
  const ub = Y.encodeStateAsUpdateV2(peer.ydoc);
  for (const order of [[ua, ub], [ub, ua]]) {
    const reloaded = clone(base, RELOAD);
    for (const update of order) { Y.applyUpdateV2(reloaded.ydoc, update); Y.applyUpdateV2(reloaded.ydoc, update); }

    const w = walk(reloaded);
    const roots = w.visible.filter((s) => s.id === blockId);
    expect(roots.length).toBe(1);
    expect(physicalKeyOf(roots[0].brk)).toBe(M);
    expect(segText(roots[0])).toBe("bravo");
    expect(roots[0].t).toBe("heading");
    expect(roots[0].fields).toEqual({ parent: null, level: 2 });
    expect(visible(w)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], [blockId, "bravo"]]);
    expect(w.visible.some((s) => segText(s).includes("Y"))).toBe(false);
    physical(reloaded, w);
    expect(createProjectionMap(w, reloaded.flow.length).physicalLength).toBe(reloaded.flow.length);

    const retired = w.hidden.find((h) => h.key === removeKey(R, "move-2"));
    expect(retired).toBeTruthy();
    expect(retired.live).toBe(true);
    expect(retired.items.map((item) => [item.text, item.client])).toEqual([["Y", PEER]]);

    const recovery = reduceRecovery(reloaded, { strict: true });
    expect([...recovery.sources.keys()].sort()).toEqual([S, R].sort());
    const record = recovery.sources.get(R);
    expect(record.source).toBe(R);
    expect(record.blockId).toBe(blockId);
    expect(record.type).toBe("heading");
    expect(record.attrs).toEqual({ parent: null, level: 2 });
    expect(record.recoverable).toBe(true);
    expect(record.removals.map((removal) => [removal.operationId, removal.end ?? null])).toEqual([["move-2", rr]]);
    expect(record.blocks.flatMap((block) => block.runs).filter((run) => run.displaced).map((run) => [run.text, run.author])).toEqual([["Y", "token-200"]]);

    const value = blocksFromYValue(yValueOf(clone(reloaded, RELOAD).ydoc));
    expect(value[blockId].t).toBe("heading");
    expect(value[blockId].c).toBe("bravo");
    expect(Object.keys(value)).toEqual(["p", "r", blockId]);
  }
});
