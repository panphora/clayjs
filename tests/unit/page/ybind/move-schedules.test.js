globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { state as pmState, view as pmView, model as pmModel, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, reduceRecovery, createOriginIndex, blocksFromYValue, authorKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const SEED_CLIENT = 1;
const A = 100, B = 200, C = 300;
const RECEIVER = 500;
const RELOAD = 900;
const TOKEN = { [SEED_CLIENT]: "seed", [A]: "token-100", [B]: "token-200", [C]: "token-300" };
const ORDERS = [[A, B, C], [A, C, B], [B, A, C], [B, C, A], [C, A, B], [C, B, A]];

const seedDoc = (blocks = [
  { id: "p", text: "ALPHA" },
  { id: "q", text: "bravo" },
  { id: "r", text: "OMEGA" },
]) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = SEED_CLIENT;
  seedFrom(pd, blocks);
  pd.ydoc.transact(() => {
    for (const client of [SEED_CLIENT, A, B, C]) pd.origins.set(authorKey(client), TOKEN[client]);
  }, NET);
  return pd;
};

const clone = (source, client) => {
  const ydoc = new Y.Doc();
  ydoc.clientID = client;
  Y.applyUpdateV2(ydoc, Y.encodeStateAsUpdateV2(source.ydoc));
  return createPageDoc(ydoc);
};

const localClock = (ydoc, client) => Y.decodeStateVector(Y.encodeStateVector(ydoc)).get(client) ?? 0;

const opened = [];
const close = (tab) => {
  const at = opened.indexOf(tab);
  if (at >= 0) opened.splice(at, 1);
  tab.view.destroy();
  tab.bridge.dispose();
  tab.bridge.pd.ydoc.destroy();
  tab.mount.remove();
};
afterEach(() => { for (const tab of opened.splice(0)) close(tab); });

function open(pd, extra = {}) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0, ...extra });
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
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const deliver = (tab, update) => {
  const before = localClock(tab.pd.ydoc, tab.pd.ydoc.clientID);
  Y.applyUpdateV2(tab.pd.ydoc, update, NET);
  return localClock(tab.pd.ydoc, tab.pd.ydoc.clientID) === before;
};

const replaceRange = (tab, id, from, to, text) => {
  let start = null;
  tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === id) start = at; });
  if (start === null) throw new Error(`Missing block ${id}`);
  tab.view.dispatch(tab.view.state.tr.insertText(text, start + 1 + from, start + 1 + to));
};
const deleteBlock = (tab, id) => {
  let start = null, size = null;
  tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === id) { start = at; size = node.nodeSize; } });
  if (start === null) throw new Error(`Missing block ${id}`);
  tab.view.dispatch(tab.view.state.tr.delete(start, start + size));
};

const flowUnits = (pd) => {
  const out = [];
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    const content = it.content;
    if (content instanceof Y.ContentString) {
      for (let i = 0; i < it.length; i++) out.push({ key: `${it.id.client}.${it.id.clock + i}`, client: it.id.client, kind: "text", ch: content.str[i], blockId: null });
    } else if (content instanceof Y.ContentEmbed) {
      const blockId = content.embed?.b !== undefined ? content.embed.b : null;
      out.push({ key: `${it.id.client}.${it.id.clock}`, client: it.id.client, kind: blockId === null ? "br" : "marker", ch: null, blockId });
    }
  }
  return out;
};
const unitKeys = (pd) => new Set(flowUnits(pd).map((unit) => unit.key));
const freshMarker = (pd, priorKeys, client, blockId) => {
  const fresh = flowUnits(pd).filter((unit) => !priorKeys.has(unit.key) && unit.kind === "marker" && unit.blockId === blockId && unit.client === client);
  expect(fresh.map((unit) => unit.blockId)).toEqual([blockId]);
  return fresh[0].key;
};
const freshText = (pd, priorKeys, text) => {
  const fresh = flowUnits(pd).filter((unit) => !priorKeys.has(unit.key) && unit.kind === "text" && unit.ch === text);
  expect(fresh.map((unit) => unit.ch)).toEqual([text]);
  return fresh[0].key;
};

const visibleSources = (pd) => {
  const index = createOriginIndex(pd.origins);
  try { return walk(pd, index).visible.filter((seg) => !seg.implicit).map((seg) => [seg.id, `${seg.brk.client}.${seg.brk.clock}`]); }
  finally { index.dispose(); }
};
const resolvedSource = (pd, key) => {
  const index = createOriginIndex(pd.origins);
  try {
    const [client, clock] = key.split(".").map(Number);
    const source = index.resolve({ client, clock });
    return `${source.client}.${source.clock}`;
  } finally { index.dispose(); }
};
const stableWinner = (pd, blockId) => {
  const found = visibleSources(pd).find(([id]) => id === blockId);
  return resolvedSource(pd, found[1]);
};
const joinedPeerSources = (pd, manifest) => {
  const units = flowUnits(pd).filter((unit) => unit.key === manifest.X_B || unit.key === manifest.Z_C);
  expect(units.sort((left, right) => left.client - right.client).map((unit) => [unit.key, unit.client, unit.ch])).toEqual([[manifest.X_B, B, "X"], [manifest.Z_C, C, "Z"]]);
  expect(resolvedSource(pd, manifest.X_B)).toBe(manifest.X_B);
  expect(resolvedSource(pd, manifest.Z_C)).toBe(manifest.Z_C);
};
const sharedRecovery = (pd) => {
  const index = createOriginIndex(pd.origins);
  try { return reduceRecovery(pd, { index }).list.filter((record) => record.recoverable); }
  finally { index.dispose(); }
};
const recoverySources = (pd) => sharedRecovery(pd).map((record) => record.source);
const displacedRuns = (record) => record.blocks.flatMap((block) => block.runs).filter((run) => run.displaced === true);
const strictReload = (pd) => {
  const fresh = clone(pd, RELOAD);
  expect(localClock(fresh.ydoc, RELOAD)).toBe(0);
  const value = blocksFromYValue(yValueOf(fresh.ydoc));
  fresh.ydoc.destroy();
  return Object.entries(value).map(([id, block]) => [id, block.t, block.c]);
};
const strictReloadParents = (pd) => {
  const fresh = clone(pd, RELOAD);
  expect(localClock(fresh.ydoc, RELOAD)).toBe(0);
  blocksFromYValue(yValueOf(fresh.ydoc));
  const parents = [];
  docOf(fresh, walk(fresh)).forEach((node) => parents.push([node.attrs.id, node.attrs.parent ?? null]));
  fresh.ydoc.destroy();
  return parents;
};

const seedManifest = (seed) => {
  const markers = flowUnits(seed).filter((unit) => unit.kind === "marker");
  const key = (id) => markers.find((marker) => marker.blockId === id).key;
  const manifest = { S_p: key("p"), S_q: key("q"), S_r: key("r") };
  expect(manifest).toEqual({ S_p: "1.0", S_q: "1.8", S_r: "1.16" });
  return manifest;
};

const openRow = (seed) => {
  const a = open(clone(seed, A));
  const b = open(clone(seed, B));
  const c = open(clone(seed, C));
  for (const tab of [a, b, c]) {
    tab.bridge.um.clear();
    expect(tab.bridge.um.undoStack).toHaveLength(0);
  }
  return { a, b, c };
};

const mergeAll = (seed, tabs, order) => {
  const baseline = Y.encodeStateVector(seed.ydoc);
  const updates = new Map(tabs.map((tab) => [tab.pd.ydoc.clientID, Y.encodeStateAsUpdateV2(tab.pd.ydoc, baseline)]));
  const merged = clone(seed, RECEIVER);
  for (const client of order) {
    Y.applyUpdateV2(merged.ydoc, updates.get(client));
    Y.applyUpdateV2(merged.ydoc, updates.get(client));
  }
  expect(localClock(merged.ydoc, RECEIVER)).toBe(0);
  return merged;
};

const settleActors = (tabs, mergedUpdate) => {
  for (const tab of tabs) expect(deliver(tab, mergedUpdate)).toBe(true);
  for (const tab of tabs) settled(tab);
};

test("row 1: a concurrent move and peer replacement agree on the move winner and one recoverable X", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    const priorA = unitKeys(a.pd);
    const priorB = unitKeys(b.pd);

    expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_A_q = freshMarker(a.pd, priorA, A, "q");

    replaceRange(b, "q", 2, 4, "X");
    manifest.X_B = freshText(b.pd, priorB, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);

    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_A_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    counters.mainReloads++;

    expect(flowUnits(merged).filter((unit) => unit.kind === "marker" && unit.blockId === "q").map((unit) => unit.key).sort()).toEqual([manifest.S_q, manifest.M_A_q].sort());
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.kind, run.text, run.length, run.source, run.author, run.marks, run.raw])).toEqual([["text", "X", 1, manifest.X_B, TOKEN[B], {}, {}]]);
    expect(sharedRecovery(merged)[0].type).toBe("paragraph");
    expect(walk(merged).visible.find((seg) => seg.id === "q").t).toBe("paragraph");

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_A_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(displacedRuns(sharedRecovery(tab.pd)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_B, TOKEN[B]]]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    counters.undoReloads++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["q", manifest.S_q], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "brXo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) {
      settled(tab);
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["q", manifest.S_q], ["r", manifest.S_r]]);
      expect(recoverySources(tab.pd)).toEqual([]);
    }
    expect(strictReload(b.pd)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "brXo"], ["r", "paragraph", "OMEGA"]]);

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    counters.redoReloads++;
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_A_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => run.source)).toEqual([manifest.X_B]);
    expect(strictReload(b.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);

    console.log(`row 1 order ${order.join(",")}: winner q ${manifest.M_A_q}; S(q) ${manifest.S_q} displaced ${manifest.X_B} owned by ${TOKEN[B]}`);

    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 1 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 1: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 2: two concurrent moves converge on the lower-client copy with the peer replacement preserved", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    const priorA = unitKeys(a.pd);
    const priorB = unitKeys(b.pd);
    const priorC = unitKeys(c.pd);

    expect(a.bridge.moveBlocks({ ids: ["q"], afterId: null, parent: null })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_A_q = freshMarker(a.pd, priorA, A, "q");
    expect(b.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_B_q = freshMarker(b.pd, priorB, B, "q");

    replaceRange(c, "q", 2, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);

    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["q", manifest.M_A_q], ["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["q", "paragraph", "bravo"], ["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    counters.mainReloads++;

    expect(flowUnits(merged).filter((unit) => unit.kind === "marker" && unit.blockId === "q").map((unit) => unit.key).sort()).toEqual([manifest.S_q, manifest.M_A_q, manifest.M_B_q].sort());
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.kind, run.text, run.length, run.source, run.author, run.marks, run.raw])).toEqual([["text", "X", 1, manifest.X_C, TOKEN[C], {}, {}]]);
    expect(sharedRecovery(merged)[0].type).toBe("paragraph");
    expect(walk(merged).visible.find((seg) => seg.id === "q").t).toBe("paragraph");

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["q", manifest.M_A_q], ["p", manifest.S_p], ["r", manifest.S_r]]);
      expect(walk(tab.pd).visible.filter((seg) => seg.id === "q")).toHaveLength(1);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(displacedRuns(sharedRecovery(tab.pd)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
      const personal = tab.bridge.notices.filter((notice) => notice.authors?.includes(TOKEN[C]));
      expect(personal).toHaveLength(tab === c ? 1 : 0);
      expect(tab.bridge.notices).toHaveLength(tab === c ? 1 : 0);
      expect(strictReload(tab.pd)).toEqual([["q", "paragraph", "bravo"], ["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    counters.undoReloads++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_B_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => run.source)).toEqual([manifest.X_C]);
    for (const tab of [a, b, c]) {
      settled(tab);
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_B_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
    }
    expect(strictReload(b.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    counters.redoReloads++;
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["q", "p", "r"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_A_q);
    expect(strictReload(merged)).toEqual([["q", "paragraph", "bravo"], ["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => run.source)).toEqual([manifest.X_C]);
    expect(strictReload(b.pd)).toEqual([["q", "paragraph", "bravo"], ["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);

    console.log(`row 2 order ${order.join(",")}: winner q ${manifest.M_A_q}; hidden ${manifest.M_B_q}; S(q) ${manifest.S_q} displaced ${manifest.X_C} owned by ${TOKEN[C]}`);

    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 2 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 2: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

const joinedRow = (row) => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    const priorA = unitKeys(a.pd);
    expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_A_q = freshMarker(a.pd, priorA, A, "q");
    const movedUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, movedUpdate)).toBe(true);
    expect(deliver(c, movedUpdate)).toBe(true);
    for (const tab of [a, b, c]) settled(tab);
    const prefix = clone(a.pd, 700);
    a.bridge.um.stopCapturing();

    let joinAt = null;
    a.view.state.doc.forEach((node, at) => {
      if (node.attrs.id === (row === 3 ? "q" : "r")) joinAt = at + (row === 3 ? 1 : node.nodeSize - 1);
    });
    expect(joinAt).not.toBeNull();
    a.view.dispatch(a.view.state.tr.setSelection(pmState.TextSelection.create(a.view.state.doc, joinAt)));
    expect((row === 3 ? commands.joinBackward : commands.joinForward)(a.view.state, a.view.dispatch)).toBe(true);

    const priorB = unitKeys(b.pd);
    const priorC = unitKeys(c.pd);
    replaceRange(b, "q", 2, 4, "X");
    replaceRange(c, "r", 0, 0, "Z");
    manifest.X_B = freshText(b.pd, priorB, "X");
    manifest.Z_C = freshText(c.pd, priorC, "Z");
    manifests.push(manifest);

    const merged = mergeAll(prefix, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "ZOMEGAbrXo"]]);
    expect(recoverySources(merged)).toEqual([]);
    joinedPeerSources(merged, manifest);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
      expect(recoverySources(tab.pd)).toEqual([]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "ZOMEGAbrXo"]]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_A_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "ZOMEGA"], ["q", "paragraph", "brXo"]]);
    expect(recoverySources(merged)).toEqual([]);
    joinedPeerSources(merged, manifest);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "ZOMEGAbrXo"]]);
    expect(recoverySources(merged)).toEqual([]);
    joinedPeerSources(merged, manifest);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row ${row} order ${order.join(",")}: joined ${manifest.M_A_q}; X ${manifest.X_B}; Z ${manifest.Z_C}`);
    for (const tab of [a, b, c]) close(tab);
    prefix.ydoc.destroy();
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row ${row} manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row ${row}: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
};

test("row 3: joinBackward after a delivered move keeps both peer insertions through Undo and Redo", () => joinedRow(3));
test("row 4: joinForward after a delivered move keeps both peer insertions through Undo and Redo", () => joinedRow(4));

const splitRow = (row) => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);
    const mover = row === 6 ? b : a;
    const splitter = row === 6 ? a : b;
    const splitId = `split-${splitter.pd.ydoc.clientID}`;

    const priorMove = unitKeys(mover.pd);
    expect(mover.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_q = freshMarker(mover.pd, priorMove, mover.pd.ydoc.clientID, "q");

    const priorSplit = unitKeys(splitter.pd);
    let q = null, qStart = null;
    splitter.view.state.doc.forEach((node, at) => { if (node.attrs.id === "q") { q = node; qStart = at; } });
    expect(qStart).not.toBeNull();
    splitter.view.dispatch(splitter.view.state.tr.split(qStart + 3, 1, [{ type: q.type, attrs: { ...q.attrs, id: splitId, pos: null } }]));
    manifest.B_split = freshMarker(splitter.pd, priorSplit, splitter.pd.ydoc.clientID, splitId);

    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", row === 18 ? 2 : 3, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(sharedRecovery(merged)[0].blocks.map((block) => [block.id, displacedRuns({ blocks: [block] }).map((run) => run.text).join("")])).toEqual([["q", ""], [splitId, "X"]]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    }

    expect(mover.bridge.undo()).toBe(true);
    settled(mover);
    const undoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", splitId, "r"]);
    expect(stableWinner(merged, "q")).toBe(manifest.S_q);
    expect(stableWinner(merged, splitId)).toBe(manifest.B_split);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "br"], [splitId, "paragraph", row === 18 ? "Xo" : "aXo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(mover.bridge.redo()).toBe(true);
    settled(mover);
    const redoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row ${row} order ${order.join(",")}: winner ${manifest.M_q}; split ${manifest.B_split}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row ${row} manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row ${row}: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
};

test("row 5: move before peer split retains the split's displaced X", () => splitRow(5));
test("row 6: peer split before concurrent move retains the split's displaced X", () => splitRow(6));
test("row 18: concurrent split and two-character replacement retain X under the split", () => splitRow(18));

const joinedOriginalRow = (row) => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);
    const mover = row === 7 ? a : b;
    const joiner = row === 7 ? b : a;

    const priorMove = unitKeys(mover.pd);
    expect(mover.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_q = freshMarker(mover.pd, priorMove, mover.pd.ydoc.clientID, "q");

    let qStart = null;
    joiner.view.state.doc.forEach((node, at) => { if (node.attrs.id === "q") qStart = at; });
    expect(qStart).not.toBeNull();
    joiner.view.dispatch(joiner.view.state.tr.setSelection(pmState.TextSelection.create(joiner.view.state.doc, qStart + 1)));
    expect(commands.joinBackward(joiner.view.state, joiner.view.dispatch)).toBe(true);

    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", 2, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    }

    expect(mover.bridge.undo()).toBe(true);
    settled(mover);
    const undoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r"]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHAbrXo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    expect(flowUnits(merged).filter((unit) => unit.key === manifest.X_C).map((unit) => unit.ch)).toEqual(["X"]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(mover.bridge.redo()).toBe(true);
    settled(mover);
    const redoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row ${row} order ${order.join(",")}: winner ${manifest.M_q}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row ${row} manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row ${row}: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
};

test("row 7: A moves while B joins the original q into p", () => joinedOriginalRow(7));
test("row 8: B moves while A joins the original q into p", () => joinedOriginalRow(8));

test("row 9: unseen deletion leaves the concurrent moved q and one recoverable X", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    const priorA = unitKeys(a.pd);
    expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_A_q = freshMarker(a.pd, priorA, A, "q");
    deleteBlock(b, "q");
    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", 2, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_A_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_A_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_A_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 9 order ${order.join(",")}: winner ${manifest.M_A_q}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 9 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 9: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 10: deletion and join keep the peer X under its original source", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    deleteBlock(a, "q");
    let qStart = null;
    b.view.state.doc.forEach((node, at) => { if (node.attrs.id === "q") qStart = at; });
    expect(qStart).not.toBeNull();
    b.view.dispatch(b.view.state.tr.setSelection(pmState.TextSelection.create(b.view.state.doc, qStart + 1)));
    expect(commands.joinBackward(b.view.state, b.view.dispatch)).toBe(true);
    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", 2, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r"]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHAbrXo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    expect(flowUnits(merged).filter((unit) => unit.key === manifest.X_C).map((unit) => unit.ch)).toEqual(["X"]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 10 order ${order.join(",")}: S(q) ${manifest.S_q}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 10 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 10: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

const pasteRow = (row) => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);
    const mover = row === 11 ? a : b;
    const paster = row === 11 ? b : a;

    const priorMove = unitKeys(mover.pd);
    expect(mover.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_q = freshMarker(mover.pd, priorMove, mover.pd.ydoc.clientID, "q");

    let pStart = null, rStart = null;
    paster.view.state.doc.forEach((node, at) => {
      if (node.attrs.id === "p") pStart = at;
      if (node.attrs.id === "r") rStart = at;
    });
    expect(pStart).not.toBeNull();
    expect(rStart).not.toBeNull();
    const priorPaste = unitKeys(paster.pd);
    const nodes = ["UU", "VV"].map((text, i) => schema.nodes.paragraph.create({ id: `paste-${i}`, pos: null }, schema.text(text)));
    paster.view.dispatch(paster.view.state.tr.replace(pStart + 3, rStart + 3, new pmModel.Slice(pmModel.Fragment.fromArray(nodes), 1, 1)));
    manifest.P_paste = freshMarker(paster.pd, priorPaste, paster.pd.ydoc.clientID, "paste-1");

    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", 2, 4, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["paste-1", manifest.P_paste], ["q", manifest.M_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALUU"], ["paste-1", "paragraph", "VVEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["paste-1", manifest.P_paste], ["q", manifest.M_q]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALUU"], ["paste-1", "paragraph", "VVEGA"], ["q", "paragraph", "bravo"]]);
    }

    expect(mover.bridge.undo()).toBe(true);
    settled(mover);
    const undoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "paste-1"]);
    expect(stableWinner(merged, "paste-1")).toBe(manifest.P_paste);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALUU"], ["paste-1", "paragraph", "VVEGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(mover.bridge.redo()).toBe(true);
    settled(mover);
    const redoUpdate = Y.encodeStateAsUpdateV2(mover.pd.ydoc);
    for (const tab of [a, b, c]) if (tab !== mover) expect(deliver(tab, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "paste-1", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALUU"], ["paste-1", "paragraph", "VVEGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row ${row} order ${order.join(",")}: winner ${manifest.M_q}; paste ${manifest.P_paste}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row ${row} manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row ${row}: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
};

test("row 11: A moves q while B pastes across its seed", () => pasteRow(11));
test("row 12: B moves q while A pastes across its seed", () => pasteRow(12));

test("row 17: concurrent splits retain both boundaries and the peer X", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    for (const tab of [a, b]) {
      const client = tab.pd.ydoc.clientID;
      const id = `split-${client}`;
      const prior = unitKeys(tab.pd);
      let q = null, qStart = null;
      tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === "q") { q = node; qStart = at; } });
      expect(qStart).not.toBeNull();
      tab.view.dispatch(tab.view.state.tr.split(qStart + 3, 1, [{ type: q.type, attrs: { ...q.attrs, id, pos: null } }]));
      manifest[id] = freshMarker(tab.pd, prior, client, id);
    }
    const priorC = unitKeys(c.pd);
    replaceRange(c, "q", 2, 2, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["q", manifest.S_q], ["split-100", manifest["split-100"]], ["split-200", manifest["split-200"]], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "br"], ["split-100", "paragraph", ""], ["split-200", "paragraph", "Xavo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    expect(flowUnits(merged).filter((unit) => unit.key === manifest.X_C).map((unit) => unit.ch)).toEqual(["X"]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd).map(([id]) => id)).toEqual(["p", "q", "split-100", "split-200", "r"]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "br"], ["split-100", "paragraph", ""], ["split-200", "paragraph", "Xavo"], ["r", "paragraph", "OMEGA"]]);
      expect(recoverySources(tab.pd)).toEqual([]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", "split-200", "r"]);
    expect(stableWinner(merged, "split-200")).toBe(manifest["split-200"]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "br"], ["split-200", "paragraph", "Xavo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", "split-100", "split-200", "r"]);
    expect(stableWinner(merged, "split-100")).toBe(manifest["split-100"]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "ALPHA"], ["q", "paragraph", "br"], ["split-100", "paragraph", ""], ["split-200", "paragraph", "Xavo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 17 order ${order.join(",")}: splits ${manifest["split-100"]}, ${manifest["split-200"]}; X ${manifest.X_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 17 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 17: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 20: joining into an empty predecessor preserves a concurrent insertion", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc([{ id: "p", text: "" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
    const marker = (id) => flowUnits(seed).find((unit) => unit.kind === "marker" && unit.blockId === id).key;
    const manifest = { S_p: marker("p"), S_q: marker("q"), S_r: marker("r") };
    expect(manifest).toEqual({ S_p: "1.0", S_q: "1.3", S_r: "1.11" });
    const { a, b, c } = openRow(seed);

    let qStart = null;
    a.view.state.doc.forEach((node, at) => { if (node.attrs.id === "q") qStart = at; });
    expect(qStart).not.toBeNull();
    a.view.dispatch(a.view.state.tr.setSelection(pmState.TextSelection.create(a.view.state.doc, qStart + 1)));
    expect(commands.joinTextblockBackward(a.view.state, a.view.dispatch)).toBe(true);
    const priorB = unitKeys(b.pd);
    replaceRange(b, "p", 0, 0, "X");
    manifest.X_B = freshText(b.pd, priorB, "X");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "Xbravo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    expect(flowUnits(merged).filter((unit) => unit.key === manifest.X_B).map((unit) => unit.ch)).toEqual(["X"]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "Xbravo"], ["r", "paragraph", "OMEGA"]]);
      expect(recoverySources(tab.pd)).toEqual([]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", "r"]);
    expect(stableWinner(merged, "q")).toBe(manifest.S_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "X"], ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "Xbravo"], ["r", "paragraph", "OMEGA"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 20 order ${order.join(",")}: q ${manifest.S_q}; X ${manifest.X_B}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 20 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 20: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 19: one empty cross-block paste retains peer X under the deleted q", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];

  for (const order of ORDERS) {
    const seed = seedDoc();
    const manifest = seedManifest(seed);
    const { a, b, c } = openRow(seed);

    let pStart = null, rStart = null;
    a.view.state.doc.forEach((node, at) => {
      if (node.attrs.id === "p") pStart = at;
      if (node.attrs.id === "r") rStart = at;
    });
    expect(pStart).not.toBeNull();
    expect(rStart).not.toBeNull();
    const empty = schema.nodes.paragraph.create({ id: "paste-0", pos: null });
    a.view.dispatch(a.view.state.tr.replace(pStart + 1, rStart + 3, new pmModel.Slice(pmModel.Fragment.fromArray([empty]), 1, 1)));

    const priorB = unitKeys(b.pd);
    replaceRange(b, "q", 1, 1, "X");
    manifest.X_B = freshText(b.pd, priorB, "X");
    const priorC = unitKeys(c.pd);
    expect(c.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    manifest.M_C_q = freshMarker(c.pd, priorC, C, "q");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["q", manifest.M_C_q]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "EGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_B, TOKEN[B]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd)).toEqual([["p", manifest.S_p], ["q", manifest.M_C_q]]);
      expect(strictReload(tab.pd)).toEqual([["p", "paragraph", "EGA"], ["q", "paragraph", "bravo"]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_q]);
    }

    expect(c.bridge.undo()).toBe(true);
    settled(c);
    const undoUpdate = Y.encodeStateAsUpdateV2(c.pd.ydoc);
    expect(deliver(a, undoUpdate)).toBe(true);
    expect(deliver(b, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p]]);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "EGA"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_B, TOKEN[B]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(c.bridge.redo()).toBe(true);
    settled(c);
    const redoUpdate = Y.encodeStateAsUpdateV2(c.pd.ydoc);
    expect(deliver(a, redoUpdate)).toBe(true);
    expect(deliver(b, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_C_q);
    expect(strictReload(merged)).toEqual([["p", "paragraph", "EGA"], ["q", "paragraph", "bravo"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_q]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_B, TOKEN[B]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 19 order ${order.join(",")}: winner ${manifest.M_C_q}; X ${manifest.X_B}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 19 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 19: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 13: moving a toggle subtree preserves independent child edits", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];
  const seedBlocks = [
    { id: "p", t: "toggle", attrs: { open: true }, text: "P" },
    { id: "child", t: "toggle", attrs: { open: true, parent: "p" }, text: "C" },
    { id: "grandchild", text: "G", attrs: { parent: "child" } },
    { id: "r", text: "R" },
  ];
  const parents = [["p", null], ["child", "p"], ["grandchild", "child"], ["r", null]];

  for (const order of ORDERS) {
    const seed = seedDoc(seedBlocks);
    const marker = (pd, id) => flowUnits(pd).find((unit) => unit.kind === "marker" && unit.blockId === id).key;
    const manifest = { S_p: marker(seed, "p"), S_child: marker(seed, "child"), S_grandchild: marker(seed, "grandchild"), S_r: marker(seed, "r") };
    expect(manifest).toEqual({ S_p: "1.0", S_child: "1.5", S_grandchild: "1.11", S_r: "1.16" });
    const { a, b, c } = openRow(seed);

    const priorA = unitKeys(a.pd);
    expect(a.bridge.moveBlocks({ ids: ["p"], afterId: "r" })).toEqual({ status: "moved", ids: ["p", "child", "grandchild"] });
    manifest.M_A_p = freshMarker(a.pd, priorA, A, "p");
    manifest.M_A_child = freshMarker(a.pd, priorA, A, "child");
    manifest.M_A_grandchild = freshMarker(a.pd, priorA, A, "grandchild");

    const priorB = unitKeys(b.pd);
    replaceRange(b, "child", 1, 1, "X");
    manifest.X_B = freshText(b.pd, priorB, "X");
    const priorC = unitKeys(c.pd);
    replaceRange(c, "grandchild", 1, 1, "Y");
    manifest.Y_C = freshText(c.pd, priorC, "Y");
    manifests.push(manifest);

    const merged = mergeAll(seed, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["r", manifest.S_r], ["p", manifest.M_A_p], ["child", manifest.M_A_child], ["grandchild", manifest.M_A_grandchild]]);
    expect(strictReload(merged)).toEqual([["r", "paragraph", "R"], ["p", "toggle", "P"], ["child", "toggle", "C"], ["grandchild", "paragraph", "G"]]);
    expect(strictReloadParents(merged)).toEqual([["r", null], ["p", null], ["child", "p"], ["grandchild", "child"]]);
    expect(recoverySources(merged)).toEqual([manifest.S_child, manifest.S_grandchild]);
    expect(sharedRecovery(merged).map((record) => [record.source, displacedRuns(record).map((run) => [run.text, run.source, run.author])])).toEqual([[manifest.S_child, [["X", manifest.X_B, TOKEN[B]]]], [manifest.S_grandchild, [["Y", manifest.Y_C, TOKEN[C]]]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd).map(([id]) => id)).toEqual(["r", "p", "child", "grandchild"]);
      expect(strictReload(tab.pd)).toEqual([["r", "paragraph", "R"], ["p", "toggle", "P"], ["child", "toggle", "C"], ["grandchild", "paragraph", "G"]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_child, manifest.S_grandchild]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "child", "grandchild", "r"]);
    expect(stableWinner(merged, "p")).toBe(manifest.S_p);
    expect(stableWinner(merged, "child")).toBe(manifest.S_child);
    expect(stableWinner(merged, "grandchild")).toBe(manifest.S_grandchild);
    expect(strictReload(merged)).toEqual([["p", "toggle", "P"], ["child", "toggle", "CX"], ["grandchild", "paragraph", "GY"], ["r", "paragraph", "R"]]);
    expect(strictReloadParents(merged)).toEqual(parents);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["r", "p", "child", "grandchild"]);
    expect(stableWinner(merged, "p")).toBe(manifest.M_A_p);
    expect(stableWinner(merged, "child")).toBe(manifest.M_A_child);
    expect(stableWinner(merged, "grandchild")).toBe(manifest.M_A_grandchild);
    expect(strictReload(merged)).toEqual([["r", "paragraph", "R"], ["p", "toggle", "P"], ["child", "toggle", "C"], ["grandchild", "paragraph", "G"]]);
    expect(strictReloadParents(merged)).toEqual([["r", null], ...parents.slice(0, 3)]);
    expect(recoverySources(merged)).toEqual([manifest.S_child, manifest.S_grandchild]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 13 order ${order.join(",")}: moved ${manifest.M_A_p}, ${manifest.M_A_child}, ${manifest.M_A_grandchild}; X ${manifest.X_B}; Y ${manifest.Y_C}`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 13 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 13: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 14: a parent-only change precedes the observed subtree move", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];
  const seedBlocks = [
    { id: "p", t: "toggle", attrs: { open: true }, text: "P" },
    { id: "q", t: "toggle", attrs: { open: true }, text: "Q" },
    { id: "child", text: "C", attrs: { parent: "q" } },
    { id: "r", text: "R" },
  ];

  for (const order of ORDERS) {
    const seed = seedDoc(seedBlocks);
    const marker = (pd, id) => flowUnits(pd).find((unit) => unit.kind === "marker" && unit.blockId === id).key;
    const manifest = { S_p: marker(seed, "p"), S_q: marker(seed, "q"), S_child: marker(seed, "child"), S_r: marker(seed, "r") };
    expect(manifest).toEqual({ S_p: "1.0", S_q: "1.5", S_child: "1.10", S_r: "1.15" });
    const { a, b, c } = openRow(seed);
    const baseline = Y.encodeStateVector(seed.ydoc);

    const beforeA = unitKeys(a.pd);
    expect(a.bridge.moveBlocks({ ids: ["q"], parent: "p", afterId: null })).toEqual({ status: "moved", ids: ["q", "child"] });
    expect(unitKeys(a.pd)).toEqual(beforeA);
    const updateA = Y.encodeStateAsUpdateV2(a.pd.ydoc, baseline);
    const priorB = unitKeys(b.pd);
    replaceRange(b, "child", 1, 1, "X");
    manifest.X_B = freshText(b.pd, priorB, "X");
    const updateB = Y.encodeStateAsUpdateV2(b.pd.ydoc, baseline);

    const prefix = mergeAll(seed, [a, b, c], [A, B, C]);
    const prefixUpdate = Y.encodeStateAsUpdateV2(prefix.ydoc);
    settleActors([a, b, c], prefixUpdate);
    expect(strictReload(prefix)).toEqual([["p", "toggle", "P"], ["q", "toggle", "Q"], ["child", "paragraph", "CX"], ["r", "paragraph", "R"]]);
    expect(strictReloadParents(prefix)).toEqual([["p", null], ["q", "p"], ["child", "q"], ["r", null]]);

    const priorC = unitKeys(c.pd);
    expect(c.bridge.moveBlocks({ ids: ["q"], afterId: "r", parent: null })).toEqual({ status: "moved", ids: ["q", "child"] });
    manifest.M_C_q = freshMarker(c.pd, priorC, C, "q");
    manifest.M_C_child = freshMarker(c.pd, priorC, C, "child");
    const updateC = Y.encodeStateAsUpdateV2(c.pd.ydoc, Y.encodeStateVector(prefix.ydoc));
    manifests.push(manifest);

    const updates = new Map([[A, updateA], [B, updateB], [C, updateC]]);
    const merged = clone(seed, RECEIVER);
    for (const client of order) {
      Y.applyUpdateV2(merged.ydoc, updates.get(client));
      Y.applyUpdateV2(merged.ydoc, updates.get(client));
    }
    expect(localClock(merged.ydoc, RECEIVER)).toBe(0);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(visibleSources(merged)).toEqual([["p", manifest.S_p], ["r", manifest.S_r], ["q", manifest.M_C_q], ["child", manifest.M_C_child]]);
    expect(strictReload(merged)).toEqual([["p", "toggle", "P"], ["r", "paragraph", "R"], ["q", "toggle", "Q"], ["child", "paragraph", "CX"]]);
    expect(strictReloadParents(merged)).toEqual([["p", null], ["r", null], ["q", null], ["child", "q"]]);
    expect(recoverySources(merged)).toEqual([]);
    const copiedX = flowUnits(merged).filter((unit) => unit.client === C && unit.ch === "X");
    expect(copiedX).toHaveLength(1);
    expect(resolvedSource(merged, copiedX[0].key)).toBe(manifest.X_B);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(visibleSources(tab.pd).map(([id]) => id)).toEqual(["p", "r", "q", "child"]);
      expect(strictReload(tab.pd)).toEqual([["p", "toggle", "P"], ["r", "paragraph", "R"], ["q", "toggle", "Q"], ["child", "paragraph", "CX"]]);
      expect(recoverySources(tab.pd)).toEqual([]);
    }

    expect(c.bridge.undo()).toBe(true);
    settled(c);
    const undoUpdate = Y.encodeStateAsUpdateV2(c.pd.ydoc);
    expect(deliver(a, undoUpdate)).toBe(true);
    expect(deliver(b, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", "child", "r"]);
    expect(stableWinner(merged, "q")).toBe(manifest.S_q);
    expect(stableWinner(merged, "child")).toBe(manifest.S_child);
    expect(strictReload(merged)).toEqual([["p", "toggle", "P"], ["q", "toggle", "Q"], ["child", "paragraph", "CX"], ["r", "paragraph", "R"]]);
    expect(strictReloadParents(merged)).toEqual([["p", null], ["q", "p"], ["child", "q"], ["r", null]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(c.bridge.redo()).toBe(true);
    settled(c);
    const redoUpdate = Y.encodeStateAsUpdateV2(c.pd.ydoc);
    expect(deliver(a, redoUpdate)).toBe(true);
    expect(deliver(b, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "r", "q", "child"]);
    expect(stableWinner(merged, "q")).toBe(manifest.M_C_q);
    expect(stableWinner(merged, "child")).toBe(manifest.M_C_child);
    expect(strictReload(merged)).toEqual([["p", "toggle", "P"], ["r", "paragraph", "R"], ["q", "toggle", "Q"], ["child", "paragraph", "CX"]]);
    expect(strictReloadParents(merged)).toEqual([["p", null], ["r", null], ["q", null], ["child", "q"]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 14 order ${order.join(",")}: moved ${manifest.M_C_q}, ${manifest.M_C_child}; X ${manifest.X_B}`);
    for (const tab of [a, b, c]) close(tab);
    prefix.ydoc.destroy();
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 14 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 14: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("row 15: concurrent parent cycle projects the lower-ranked edge without repair", () => {
  const counters = { permutations: 0, mainReloads: 0, undoReloads: 0, redoReloads: 0 };
  const manifests = [];
  const seedBlocks = [
    { id: "p", t: "toggle", attrs: { open: true }, text: "ALPHA" },
    { id: "q", t: "toggle", attrs: { open: true }, text: "bravo" },
    { id: "r", text: "OMEGA" },
  ];

  for (const order of ORDERS) {
    const seed = seedDoc(seedBlocks);
    const marker = (pd, id) => flowUnits(pd).find((unit) => unit.kind === "marker" && unit.blockId === id).key;
    const manifest = { S_p: marker(seed, "p"), S_q: marker(seed, "q"), S_r: marker(seed, "r") };
    expect(manifest).toEqual({ S_p: "1.0", S_q: "1.9", S_r: "1.18" });
    const { a, b, c } = openRow(seed);

    replaceRange(a, "r", 5, 5, "~".repeat(64));
    replaceRange(a, "r", 5, 69, "");
    expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravo"], ["r", "OMEGA"]]);
    const preludeUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, preludeUpdate)).toBe(true);
    expect(deliver(c, preludeUpdate)).toBe(true);
    const prefix = clone(a.pd, 700);
    for (const tab of [a, b, c]) {
      settled(tab);
      tab.bridge.um.clear();
      expect(tab.bridge.um.undoStack).toHaveLength(0);
    }

    const priorA = unitKeys(a.pd);
    expect(a.bridge.moveBlocks({ ids: ["p"], afterId: null, parent: "q" })).toEqual({ status: "moved", ids: ["p"] });
    manifest.M_A_p = freshMarker(a.pd, priorA, A, "p");
    const beforeB = unitKeys(b.pd);
    expect(b.bridge.moveBlocks({ ids: ["q"], afterId: null, parent: "p" })).toEqual({ status: "moved", ids: ["q"] });
    expect(unitKeys(b.pd)).toEqual(beforeB);
    const aRank = a.pd.attrs.get("p")._map.get("parent").id;
    const bRank = b.pd.attrs.get("q")._map.get("parent").id;
    expect(aRank.clock).toBeGreaterThan(bRank.clock);

    const priorC = unitKeys(c.pd);
    replaceRange(c, "p", 1, 1, "X");
    manifest.X_C = freshText(c.pd, priorC, "X");
    manifests.push(manifest);

    const merged = mergeAll(prefix, [a, b, c], order);
    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    counters.permutations++;
    expect(merged.attrs.get("p").get("parent")).toBe("q");
    expect(merged.attrs.get("q").get("parent")).toBe("p");
    expect(visibleSources(merged)).toEqual([["q", manifest.S_q], ["p", manifest.M_A_p], ["r", manifest.S_r]]);
    expect(strictReload(merged)).toEqual([["q", "toggle", "bravo"], ["p", "toggle", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(strictReloadParents(merged)).toEqual([["q", null], ["p", "q"], ["r", null]]);
    expect(recoverySources(merged)).toEqual([manifest.S_p]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.text, run.source, run.author])).toEqual([["X", manifest.X_C, TOKEN[C]]]);
    counters.mainReloads++;

    settleActors([a, b, c], mergedUpdate);
    for (const tab of [a, b, c]) {
      expect(tab.pd.attrs.get("p").get("parent")).toBe("q");
      expect(tab.pd.attrs.get("q").get("parent")).toBe("p");
      expect(strictReload(tab.pd)).toEqual([["q", "toggle", "bravo"], ["p", "toggle", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
      expect(strictReloadParents(tab.pd)).toEqual([["q", null], ["p", "q"], ["r", null]]);
      expect(recoverySources(tab.pd)).toEqual([manifest.S_p]);
    }

    expect(a.bridge.undo()).toBe(true);
    settled(a);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["p", "q", "r"]);
    expect(stableWinner(merged, "p")).toBe(manifest.S_p);
    expect(strictReload(merged)).toEqual([["p", "toggle", "AXLPHA"], ["q", "toggle", "bravo"], ["r", "paragraph", "OMEGA"]]);
    expect(strictReloadParents(merged)).toEqual([["p", null], ["q", "p"], ["r", null]]);
    expect(recoverySources(merged)).toEqual([]);
    for (const tab of [a, b, c]) settled(tab);
    counters.undoReloads++;

    expect(a.bridge.redo()).toBe(true);
    settled(a);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    expect(merged.attrs.get("p").get("parent")).toBe("q");
    expect(merged.attrs.get("q").get("parent")).toBe("p");
    expect(visibleSources(merged).map(([id]) => id)).toEqual(["q", "p", "r"]);
    expect(stableWinner(merged, "p")).toBe(manifest.M_A_p);
    expect(strictReload(merged)).toEqual([["q", "toggle", "bravo"], ["p", "toggle", "ALPHA"], ["r", "paragraph", "OMEGA"]]);
    expect(strictReloadParents(merged)).toEqual([["q", null], ["p", "q"], ["r", null]]);
    expect(recoverySources(merged)).toEqual([manifest.S_p]);
    expect(displacedRuns(sharedRecovery(merged)[0]).map((run) => [run.source, run.author])).toEqual([[manifest.X_C, TOKEN[C]]]);
    for (const tab of [a, b, c]) settled(tab);
    counters.redoReloads++;

    console.log(`row 15 order ${order.join(",")}: winner ${manifest.M_A_p}; X ${manifest.X_C}; ranks ${aRank.clock}>${bRank.clock}`);
    for (const tab of [a, b, c]) close(tab);
    prefix.ydoc.destroy();
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`row 15 manifest ${JSON.stringify(manifests[0])}`);
  console.log(`row 15: ${counters.permutations} permutations, ${counters.mainReloads} strict main reloads, ${counters.undoReloads} Undo reloads, ${counters.redoReloads} Redo reloads`);
  expect(counters).toEqual({ permutations: 6, mainReloads: 6, undoReloads: 6, redoReloads: 6 });
});

test("the displaced peer insertion raises a personal notice only for its author token", () => {
  const seed = seedDoc();
  const { a, b } = openRow(seed);
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  replaceRange(b, "q", 2, 4, "X");
  const merged = mergeAll(seed, [a, b], [A, B]);
  const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
  settleActors([a, b], mergedUpdate);

  const noticesFor = (tab, token) => tab.bridge.notices.filter((notice) => notice.token === token || notice.author === token || notice.authors?.includes(token));
  expect(noticesFor(b, TOKEN[B])).toHaveLength(1);
  expect(noticesFor(a, TOKEN[B])).toEqual([]);

  close(a);
  close(b);
  merged.ydoc.destroy();
  seed.ydoc.destroy();
});

test("personal notices follow the owned token, fire once, and dismiss locally", () => {
  const seed = seedDoc();
  const manifest = seedManifest(seed);
  const aNotices = [];
  const bNotices = [];
  const a = open(clone(seed, A), { onNotice: (notice) => aNotices.push(notice) });
  const b = open(clone(seed, B), { onNotice: (notice) => bNotices.push(notice) });
  for (const tab of [a, b]) {
    tab.bridge.um.clear();
    expect(tab.bridge.um.undoStack).toHaveLength(0);
  }

  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  replaceRange(b, "q", 2, 4, "X");
  const merged = mergeAll(seed, [a, b], [A, B]);
  const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
  settleActors([a, b], mergedUpdate);

  const personal = (tab) => tab.bridge.notices.filter((notice) => notice.authors?.includes(TOKEN[B]));
  expect(personal(b)).toHaveLength(1);
  expect(b.bridge.notices).toHaveLength(1);
  expect(bNotices).toHaveLength(1);
  expect(bNotices[0].kind).toBe("recovered-change");
  expect(bNotices[0].authors).toEqual([TOKEN[B]]);
  expect(bNotices[0].source).toBe(manifest.S_q);
  expect(a.bridge.notices).toEqual([]);
  expect(aNotices).toEqual([]);

  expect(b.bridge.recoverable.map((record) => record.source)).toEqual([manifest.S_q]);
  b.bridge.dismiss(bNotices[0].source, bNotices[0].revision);
  expect(b.bridge.notices).toEqual([]);
  expect(b.bridge.recoverable.map((record) => record.source)).toEqual([manifest.S_q]);

  b.pd.origins.delete(authorKey(B));
  const unknownBridge = createBridge({ pd: b.pd, captureTimeout: 0 });
  expect(unknownBridge.notices).toHaveLength(1);
  expect(unknownBridge.notices[0].author).toBe(null);
  expect(unknownBridge.notices[0].authors).toEqual([]);
  unknownBridge.dispose();

  close(a);
  close(b);
  merged.ydoc.destroy();
  seed.ydoc.destroy();
});
