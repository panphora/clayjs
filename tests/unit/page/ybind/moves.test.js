globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, reduceRecovery, createOriginIndex, unitIds, blocksFromYValue, removeKey, copyActiveKey, physicalKeyOf, authorKey, parseGoneIntents } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { createProjectionMap } from "../../../../src/page/ybind/projection-map.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const A = 300;

const page = (blocks, client = A) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, blocks);
  pd.ydoc.clientID = client;
  pd.origins.set(authorKey(1), "seed");
  pd.origins.set(authorKey(client), "A");
  return pd;
};

const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc), NET);

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});

function open(pd) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount };
  opened.push(tab);
  return tab;
}

const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const parents = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.attrs.parent])); return out; };
const types = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.type.name, node.attrs.open])); return out; };
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const markers = (pd) => {
  const out = [];
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed?.b !== undefined) out.push({ key: physicalKeyOf(it.id), id: it.content.embed.b, client: it.id.client, clock: it.id.clock, at });
    at += it.length;
  }
  return out;
};
const keysOf = (pd, id) => markers(pd).filter((marker) => marker.id === id).map((marker) => marker.key);
const visibleIds = (pd) => walk(pd).visible.map((seg) => seg.id);
const vectorOf = (ydoc) => [...Y.decodeStateVector(Y.encodeStateVector(ydoc)).entries()].sort((left, right) => left[0] - right[0]);
const undoDepth = (tab) => tab.bridge.um.undoStack.length;
const unitSources = (pd, id) => {
  const index = createOriginIndex(pd.origins);
  const found = walk(pd, index);
  const map = createProjectionMap(found, pd.flow.length);
  let cursor = 0;
  for (const seg of found.visible) {
    if (seg.id === id) {
      const out = [];
      for (const [from, to] of map.physicalRanges(cursor, cursor + seg.len)) for (const unit of unitIds(pd.flow, from, to)) out.push(physicalKeyOf(index.resolve(unit)));
      index.dispose();
      return out;
    }
    cursor += seg.len;
  }
  index.dispose();
  throw new Error(`Missing ${id}`);
};
const runsOf = (record) => record.blocks.flatMap((block) => block.runs);
const reloaded = (pd) => {
  const value = blocksFromYValue(yValueOf(clone(pd, 401).ydoc));
  return Object.entries(value).sort((left, right) => (left[1].pos < right[1].pos ? -1 : 1)).map(([id, block]) => [id, block.c]);
};

const trio = () => page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);

test("a block move copies only the selection, retires the old copy, and round-trips through one Undo", () => {
  const pd = trio();
  const tab = open(pd);
  const old = keysOf(pd, "q");

  expect(tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });

  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  settled(tab);
  expect(visibleIds(pd)).toEqual(["p", "r", "q"]);

  const fresh = keysOf(pd, "q").filter((key) => !old.includes(key));
  expect(old).toHaveLength(1);
  expect(fresh).toHaveLength(1);
  expect(markers(pd).filter((marker) => marker.id === "q")).toHaveLength(2);
  expect(markers(pd).find((marker) => marker.key === fresh[0]).client).toBe(A);

  const index = createOriginIndex(pd.origins);
  expect(index.boundaryOf({ client: A, clock: markers(pd).find((marker) => marker.key === fresh[0]).clock })).toEqual({ blockId: "q", kind: "copy" });
  expect(pd.gone.get(copyActiveKey(fresh[0]))).toBe(true);
  expect(walk(pd).hidden.map((entry) => entry.sourceKey)).toEqual([old[0]]);
  expect(reduceRecovery(pd, { index }).sources.get(old[0]).blockId).toBe("q");
  index.dispose();

  expect(tab.bridge.undo()).toBe(true);
  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["q", "bravo"], ["r", "OMEGA"]]);
  settled(tab);
  expect(tab.bridge.redo()).toBe(true);
  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  settled(tab);
});

test("a delivered move needs no peer repair and survives a strict encoded reload", () => {
  const pd = trio();
  const tab = open(pd);
  tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" });

  const peer = open(clone(pd, 400));
  settled(peer);
  expect(blocks(peer)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(vectorOf(peer.pd.ydoc)).toEqual(vectorOf(pd.ydoc));
  expect(markers(peer.pd)).toEqual(markers(pd));
  expect(undoDepth(peer)).toBe(0);

  expect(reloaded(pd)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(visibleIds(pd)).toEqual(["p", "r", "q"]);
});

test("a peer edit inside the retired copy stays in its recovery record with its original source", () => {
  const pd = trio();
  const tab = open(pd);
  const peer = clone(pd, 100);
  const old = keysOf(pd, "q");

  tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" });
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(pd, peer);
  merge(peer, pd);

  const index = createOriginIndex(pd.origins);
  const record = reduceRecovery(pd, { index }).sources.get(old[0]);
  expect(runsOf(record).map((run) => run.text)).toEqual(["b", "X", "ravo"]);
  const edited = runsOf(record).find((run) => run.text === "X");
  expect(edited.source).toBe("100.0");
  expect(edited.id).toBe("100.0");
  expect(record.author).toBe("seed");
  expect(record.recoverable).toBe(true);
  index.dispose();

  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(visibleIds(pd)).toEqual(["p", "r", "q"]);
  settled(tab);
  expect(reloaded(pd)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
});

test("the moved copy keeps its author token and the original text unit identity", () => {
  const pd = trio();
  const tab = open(pd);
  const old = keysOf(pd, "q");
  const sources = unitSources(pd, "q");
  tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" });
  const copy = keysOf(pd, "q").find((key) => !old.includes(key));
  const after = unitSources(pd, "q");
  expect(after.slice(1)).toEqual(sources.slice(1));
  expect(after[0]).not.toBe(sources[0]);
  expect(after[0].startsWith(`${A}.`)).toBe(true);

  const probe = clone(pd, 500);
  probe.ydoc.transact(() => probe.gone.set(removeKey(copy, "probe-1"), { blockId: "q", end: null, sv: [] }), NET);
  const record = reduceRecovery(probe).sources.get(copy);

  expect(record.author).toBe("A");
  expect(runsOf(record).map((run) => [run.text, run.source, run.length, run.author])).toEqual([["bravo", sources[1], 5, "seed"]]);
});

test("a move preserves raw formatting and cancellation keys", () => {
  const pd = page([{ id: "p", text: "P" }, { id: "q", text: "ab" }, { id: "r", text: "R" }]);
  pd.flow.format(3, 2, { "strong~original": true });
  pd.flow.format(4, 1, { "strong~original!cancel": true });
  const source = unitSources(pd, "q").slice(1);
  const raw = () => pd.flow.toDelta().filter((part) => part.insert === "a" || part.insert === "b").map((part) => part.attributes);
  const before = raw();
  const tab = open(pd);

  expect(tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  expect(raw()).toEqual([...before, ...before]);
  expect(before[1]).toEqual({ "strong~original": true, "strong~original!cancel": true });
  expect(unitSources(pd, "q").slice(1)).toEqual(source);
  expect(clone(pd, 500).flow.toDelta().filter((part) => part.insert === "a" || part.insert === "b").map((part) => part.attributes)).toEqual([...before, ...before]);
  settled(tab);
});

test("an open toggle and its child move as one subtree without touching unrelated markers", () => {
  const pd = page([
    { id: "p", text: "ALPHA" },
    { id: "t", t: "toggle", attrs: { open: true }, text: "HEAD" },
    { id: "c", text: "kid", attrs: { parent: "t" } },
    { id: "r", text: "OMEGA" },
  ]);
  const tab = open(pd);
  const before = markers(pd);
  const untouched = new Map(["p", "r"].map((id) => [id, keysOf(pd, id)]));

  expect(tab.bridge.moveBlocks({ ids: ["t"], afterId: "r" })).toEqual({ status: "moved", ids: ["t", "c"] });

  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["t", "HEAD"], ["c", "kid"]]);
  settled(tab);
  expect(types(tab)).toContainEqual(["t", "toggle", true]);
  expect(parents(tab)).toEqual([["p", null], ["r", null], ["t", null], ["c", "t"]]);
  expect(visibleIds(pd)).toEqual(["p", "r", "t", "c"]);

  for (const id of ["p", "r"]) {
    expect(keysOf(pd, id)).toEqual(untouched.get(id));
    expect(keysOf(pd, id)).toHaveLength(1);
  }
  expect(keysOf(pd, "t")).toHaveLength(2);
  expect(keysOf(pd, "c")).toHaveLength(2);
  const fresh = markers(pd).filter((marker) => !before.some((old) => old.key === marker.key)).map((marker) => marker.id);
  expect(fresh).toEqual(["t", "c"]);
  expect(tab.bridge.um.undoStack).toHaveLength(1);
});

test("a recovered projection moves with its text and keeps its recovery identity", () => {
  const pd = trio();
  const tab = open(pd);
  const q = keysOf(pd, "q")[0];
  const recovered = `recovered:${q}`;
  pd.ydoc.transact(() => pd.gone.set(removeKey(q, "hide-1"), { blockId: "q", end: keysOf(pd, "r")[0], sv: [] }), NET);
  expect(tab.bridge.recoverable.map((record) => record.source)).toEqual([q]);
  expect(tab.bridge.restore(q, tab.bridge.recoverable[0].revision)).toEqual({ status: "restored", id: recovered });
  expect(visibleIds(pd)).toEqual(["p", recovered, "r"]);
  settled(tab);

  expect(tab.bridge.moveBlocks({ ids: [recovered], afterId: "r" })).toEqual({ status: "moved", ids: [recovered] });
  settled(tab);
  expect(visibleIds(pd)).toEqual(["p", "r", recovered]);
  expect(tab.bridge.recoverable).toEqual([]);

  expect(tab.bridge.undo()).toBe(true);
  settled(tab);
  expect(visibleIds(pd)).toEqual(["p", recovered, "r"]);
  expect(tab.bridge.redo()).toBe(true);
  settled(tab);
  expect(visibleIds(pd)).toEqual(["p", "r", recovered]);
  expect(tab.bridge.recoverable).toEqual([]);
});

test("a parent-only change writes no marker, an unchanged move writes nothing, and refusals keep the document still", () => {
  const parentsOf = () => page([
    { id: "p", t: "toggle", attrs: { open: false }, text: "HEAD" },
    { id: "c", text: "kid" },
    { id: "r", text: "OMEGA" },
  ]);

  const only = parentsOf();
  const tab = open(only);
  const before = markers(only);
  const length = only.flow.length;
  expect(tab.bridge.moveBlocks({ ids: ["c"], parent: "p", afterId: null })).toEqual({ status: "moved", ids: ["c"] });
  expect(parents(tab)).toEqual([["p", null], ["c", "p"], ["r", null]]);
  expect(blocks(tab)).toEqual([["p", "HEAD"], ["c", "kid"], ["r", "OMEGA"]]);
  expect(markers(only)).toEqual(before);
  expect(only.flow.length).toBe(length);
  settled(tab);
  expect(tab.bridge.um.undoStack).toHaveLength(1);
  expect(tab.bridge.undo()).toBe(true);
  expect(parents(tab)).toEqual([["p", null], ["c", null], ["r", null]]);

  const still = parentsOf();
  const idle = open(still);
  const idleVector = vectorOf(still.ydoc);
  expect(idle.bridge.moveBlocks({ ids: ["c"], afterId: "p" })).toEqual({ status: "unchanged" });
  expect(vectorOf(still.ydoc)).toEqual(idleVector);
  expect(undoDepth(idle)).toBe(0);

  const cases = [
    [[], "missing-source"],
    [["nope"], "missing-source"],
    [["r"], "missing-destination"],
    [["r"], "invalid-parent"],
    [["c"], "invalid-parent"],
    [["c", "r"], "invalid-parent"],
    [["r"], "missing-destination"],
    [["p"], "cycle"],
    [["p"], "cycle"],
  ];
  const refusals = [
    { ids: [] },
    { ids: ["nope"], afterId: "r" },
    { ids: ["r"], afterId: "nope" },
    { ids: ["r"], parent: "nope" },
    { ids: ["c"], parent: "r" },
    { ids: ["c", "r"] },
    { ids: ["r"], afterId: "c", parent: null },
    { ids: ["p"], afterId: "c", parent: null },
    { ids: ["p"], parent: "c" },
  ];
  const nested = () => page([
    { id: "p", t: "toggle", attrs: { open: false }, text: "HEAD" },
    { id: "c", t: "toggle", attrs: { open: false, parent: "p" }, text: "kid" },
    { id: "r", text: "OMEGA" },
  ]);
  refusals.forEach((args, index) => {
    const pd = nested();
    const tab2 = open(pd);
    const vector = vectorOf(pd.ydoc);
    const markersBefore = markers(pd);
    const result = tab2.bridge.moveBlocks(args);
    expect([args.ids, result]).toEqual([cases[index][0], { status: "refused", code: cases[index][1] }]);
    expect(vectorOf(pd.ydoc)).toEqual(vector);
    expect(markers(pd)).toEqual(markersBefore);
    expect(undoDepth(tab2)).toBe(0);
    settled(tab2);
  });
});

test("a second move retires only the observed copy and leaves a restored hidden original alone", () => {
  const pd = trio();
  const tab = open(pd);
  const source = keysOf(pd, "q")[0];

  expect(tab.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  settled(tab);
  const copy = keysOf(pd, "q").find((key) => key !== source);
  const recovered = `recovered:${source}`;
  expect(copy).not.toBeUndefined();
  expect(visibleIds(pd)).toEqual(["p", "r", "q"]);
  expect(markers(pd).find((marker) => marker.key === copy).id).toBe("q");

  const peer = clone(pd, 100);
  peer.ydoc.transact(() => peer.flow.insert(8, "X"), NET);
  merge(pd, peer);

  const record = tab.bridge.recoverable.find((entry) => entry.source === source);
  expect(record).toBeTruthy();
  expect(runsOf(record).map((run) => run.text)).toEqual(["b", "X", "ravo"]);
  expect(tab.bridge.restore(source, record.revision)).toEqual({ status: "restored", id: recovered });
  settled(tab);
  expect(blocks(tab)).toEqual([["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(visibleIds(pd)).toEqual(["p", recovered, "r", "q"]);

  const removalsFor = (key) => parseGoneIntents(pd.gone).removals.filter((removal) => removal.sourceKey === key);
  const retiredOriginal = removalsFor(source);
  expect(retiredOriginal).toHaveLength(1);
  expect(retiredOriginal[0].blockId).toBe("q");
  expect(retiredOriginal[0].end).toBe(keysOf(pd, "r")[0]);
  const retiredOriginalKeys = retiredOriginal.map((removal) => removal.key);

  expect(tab.bridge.moveBlocks({ ids: ["q"], afterId: null })).toEqual({ status: "moved", ids: ["q"] });
  settled(tab);
  expect(blocks(tab)).toEqual([["q", "bravo"], ["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"]]);
  expect(visibleIds(pd)).toEqual(["q", "p", recovered, "r"]);
  expect(blocks(tab).filter((block) => block[0] === "q")).toHaveLength(1);
  expect(reloaded(pd)).toEqual([["q", "bravo"], ["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"]]);

  expect(removalsFor(copy)).toHaveLength(1);
  expect(removalsFor(copy)[0].blockId).toBe("q");
  expect(removalsFor(source).map((removal) => removal.key)).toEqual(retiredOriginalKeys);

  const fresh = walk(pd);
  const projection = createProjectionMap(fresh, pd.flow.length);
  expect(projection.segments.reduce((total, segment) => total + segment.physicalLength, 0)).toBe(pd.flow.length);

  expect(tab.bridge.undo()).toBe(true);
  settled(tab);
  expect(blocks(tab)).toEqual([["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(visibleIds(pd)).toEqual(["p", recovered, "r", "q"]);
  expect(tab.bridge.redo()).toBe(true);
  settled(tab);
  expect(blocks(tab)).toEqual([["q", "bravo"], ["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"]]);
  expect(visibleIds(pd)).toEqual(["q", "p", recovered, "r"]);
  expect(reloaded(pd)).toEqual([["q", "bravo"], ["p", "ALPHA"], [recovered, "bXravo"], ["r", "OMEGA"]]);
});
