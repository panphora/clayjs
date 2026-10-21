globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, reduceRecovery, createOriginIndex, blocksFromYValue, authorKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const SEED_CLIENT = 1;
const A = 100, B = 200, C = 300;
const RECEIVER = 500;
const RELOAD = 900;
const TOKEN = { [SEED_CLIENT]: "seed", [A]: "token-100", [B]: "token-200", [C]: "token-300" };

const seedDoc = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = SEED_CLIENT;
  seedFrom(pd, [
    { id: "p", text: "ALPHA" },
    { id: "q", t: "heading", attrs: { level: 2 }, text: "bravo" },
    { id: "r", text: "OMEGA" },
  ]);
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

const viewRows = (tab) => {
  const out = [];
  tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.type.name, node.textContent, node.attrs.level ?? null, node.attrs.parent ?? null]));
  return out;
};
const modelRows = (pd) => {
  const out = [];
  docOf(pd, walk(pd)).forEach((node) => out.push([node.attrs.id, node.type.name, node.textContent, node.attrs.level ?? null, node.attrs.parent ?? null]));
  return out;
};
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(modelRows(tab.pd)).toEqual(viewRows(tab)); };

const deliver = (tab, update) => {
  const before = localClock(tab.pd.ydoc, tab.pd.ydoc.clientID);
  Y.applyUpdateV2(tab.pd.ydoc, update, NET);
  return localClock(tab.pd.ydoc, tab.pd.ydoc.clientID) === before;
};
const syncAll = (tabs) => {
  for (const x of tabs) for (const y of tabs) if (x !== y) Y.applyUpdateV2(y.pd.ydoc, Y.encodeStateAsUpdateV2(x.pd.ydoc), NET);
};

const replaceRange = (tab, id, from, to, text) => {
  let start = null;
  tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === id) start = at; });
  if (start === null) throw new Error(`Missing block ${id}`);
  tab.view.dispatch(tab.view.state.tr.insertText(text, start + 1 + from, start + 1 + to));
};
const posOf = (tab, id, offset) => {
  let found = null;
  tab.view.state.doc.forEach((node, at) => { if (found === null && node.attrs.id === id) found = at + 1 + offset; });
  return found;
};

const flowUnits = (pd) => {
  const out = [];
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    const content = it.content;
    if (content instanceof Y.ContentString) {
      for (let i = 0; i < it.length; i++) out.push({ key: `${it.id.client}.${it.id.clock + i}`, client: it.id.client, kind: "text", ch: content.str[i], kindBlock: null });
    } else if (content instanceof Y.ContentEmbed) {
      const blockId = content.embed?.b !== undefined ? content.embed.b : null;
      out.push({ key: `${it.id.client}.${it.id.clock}`, client: it.id.client, kind: blockId === null ? "br" : "marker", ch: null, blockId });
    }
  }
  return out;
};
const unitKeys = (pd) => new Set(flowUnits(pd).map((unit) => unit.key));
const markerKeys = (pd, id) => flowUnits(pd).filter((unit) => unit.kind === "marker" && unit.blockId === id).map((unit) => unit.key);
const freshMarker = (pd, prior, client, blockId) => {
  const fresh = flowUnits(pd).filter((unit) => !prior.has(unit.key) && unit.kind === "marker" && unit.blockId === blockId && unit.client === client);
  expect(fresh.map((unit) => unit.blockId)).toEqual([blockId]);
  return fresh[0].key;
};
const freshText = (pd, prior, text) => {
  const fresh = flowUnits(pd).filter((unit) => !prior.has(unit.key) && unit.kind === "text" && unit.ch === text);
  expect(fresh.map((unit) => unit.ch)).toEqual([text]);
  return fresh[0].key;
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

test("a moved recovered block keeps its identity, retires its old region, and round-trips through Undo", () => {
  const seed = seedDoc();
  const a = open(clone(seed, A));
  const b = open(clone(seed, B));
  const c = open(clone(seed, C));
  const tabs = [a, b, c];
  for (const tab of tabs) tab.bridge.um.clear();

  const S_q = markerKeys(seed, "q")[0];
  const target = `recovered:${S_q}`;

  const priorA = unitKeys(a.pd);
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  const M_A_q = freshMarker(a.pd, priorA, A, "q");

  const priorB = unitKeys(b.pd);
  replaceRange(b, "q", 2, 4, "X");
  const X_B = freshText(b.pd, priorB, "X");

  syncAll(tabs);

  const beforeRestore = markerKeys(b.pd, target);
  expect(b.bridge.restore(S_q, b.bridge.recoverable.find((record) => record.source === S_q).revision)).toEqual({ status: "restored", id: target });
  const R = markerKeys(b.pd, target).filter((key) => !beforeRestore.includes(key))[0];

  syncAll(tabs);
  a.bridge.um.clear();
  c.bridge.um.clear();

  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual([
      ["p", "paragraph", "ALPHA", null, null],
      [target, "heading", "brXo", 2, null],
      ["r", "paragraph", "OMEGA", null, null],
      ["q", "heading", "bravo", 2, null],
    ]);
    expect(recoverySources(tab.pd)).toEqual([]);
  }

  const pre = Y.encodeStateAsUpdateV2(a.pd.ydoc);
  const sv = Y.encodeStateVector(a.pd.ydoc);
  a.view.dispatch(a.view.state.tr.setSelection(pmState.TextSelection.create(a.view.state.doc, posOf(a, target, 2))));

  const priorMove = unitKeys(a.pd);
  expect(a.bridge.moveBlocks({ ids: [target], afterId: "r" })).toEqual({ status: "moved", ids: [target] });
  const M = freshMarker(a.pd, priorMove, A, target);
  expect(M).not.toBe(R);

  const priorC = unitKeys(c.pd);
  c.view.dispatch(c.view.state.tr.insertText("Y", posOf(c, target, 1)));
  const Y_C = freshText(c.pd, priorC, "Y");

  const uA = Y.encodeStateAsUpdateV2(a.pd.ydoc, sv);
  const uC = Y.encodeStateAsUpdateV2(c.pd.ydoc, sv);

  const movedRows = [
    ["p", "paragraph", "ALPHA", null, null],
    ["r", "paragraph", "OMEGA", null, null],
    [target, "heading", "brXo", 2, null],
    ["q", "heading", "bravo", 2, null],
  ];
  const movedReload = [["p", "paragraph", "ALPHA"], ["r", "paragraph", "OMEGA"], [target, "heading", "brXo"], ["q", "heading", "bravo"]];

  for (const order of [[uA, uC], [uC, uA], [uA, uC, uA, uC], [uC, uC, uA]]) {
    const endpoint = createPageDoc(new Y.Doc());
    endpoint.ydoc.clientID = RECEIVER;
    Y.applyUpdateV2(endpoint.ydoc, pre);
    for (const update of order) Y.applyUpdateV2(endpoint.ydoc, update, NET);
    expect(localClock(endpoint.ydoc, RECEIVER)).toBe(0);
    expect(strictReload(endpoint)).toEqual(movedReload);
    expect(modelRows(endpoint)).toEqual(movedRows);
    endpoint.ydoc.destroy();
  }

  expect(deliver(b, uA)).toBe(true);
  expect(deliver(b, uC)).toBe(true);
  expect(deliver(a, uC)).toBe(true);
  expect(deliver(c, uA)).toBe(true);
  expect(deliver(b, uA)).toBe(true);
  expect(deliver(b, uC)).toBe(true);

  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual(movedRows);
  }
  expect(strictReload(a.pd)).toEqual(movedReload);
  expect(strictReload(c.pd)).toEqual(movedReload);

  const sel = a.view.state.selection;
  expect(sel.$head.node(1).attrs.id).toBe(target);
  expect(sel.$head.parentOffset).toBe(2);

  for (const tab of tabs) {
    const records = sharedRecovery(tab.pd);
    expect(records.map((record) => [record.source, record.blockId, record.type, record.attrs.level])).toEqual([[R, target, "heading", 2]]);
    expect(displacedRuns(records[0]).map((run) => [run.kind, run.text, run.id, run.length, run.source, run.author])).toEqual([["text", "Y", Y_C, 1, Y_C, TOKEN[C]]]);
  }

  expect(a.bridge.undo()).toBe(true);
  const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
  expect(deliver(b, undoUpdate)).toBe(true);
  expect(deliver(c, undoUpdate)).toBe(true);
  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual([
      ["p", "paragraph", "ALPHA", null, null],
      [target, "heading", "bYrXo", 2, null],
      ["r", "paragraph", "OMEGA", null, null],
      ["q", "heading", "bravo", 2, null],
    ]);
    expect(recoverySources(tab.pd)).toEqual([]);
  }

  expect(a.bridge.redo()).toBe(true);
  const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
  expect(deliver(b, redoUpdate)).toBe(true);
  expect(deliver(c, redoUpdate)).toBe(true);
  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual(movedRows);
    expect(recoverySources(tab.pd)).toEqual([R]);
  }

  expect(b.bridge.undo()).toBe(true);
  const unrestore = Y.encodeStateAsUpdateV2(b.pd.ydoc);
  expect(deliver(a, unrestore)).toBe(true);
  expect(deliver(c, unrestore)).toBe(true);
  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual(movedRows);
    expect(recoverySources(tab.pd)).toEqual([R]);
  }

  const RRecovery = c.bridge.recoverable.find((record) => record.source === R);
  expect(RRecovery).toBeTruthy();
  expect(c.bridge.restore(RRecovery.source, RRecovery.revision)).toEqual({ status: "restored", id: `recovered:${R}` });
  const restoredR = Y.encodeStateAsUpdateV2(c.pd.ydoc);
  expect(deliver(a, restoredR)).toBe(true);
  expect(deliver(b, restoredR)).toBe(true);

  const finalRows = [
    ["p", "paragraph", "ALPHA", null, null],
    [`recovered:${R}`, "heading", "bYrXo", 2, null],
    ["r", "paragraph", "OMEGA", null, null],
    [target, "heading", "brXo", 2, null],
    ["q", "heading", "bravo", 2, null],
  ];
  for (const tab of tabs) {
    settled(tab);
    expect(viewRows(tab)).toEqual(finalRows);
    expect(viewRows(tab).filter((row) => row[0] === target)).toHaveLength(1);
    expect(recoverySources(tab.pd)).toEqual([]);
  }
  expect(strictReload(c.pd)).toEqual([
    ["p", "paragraph", "ALPHA"],
    [`recovered:${R}`, "heading", "bYrXo"],
    ["r", "paragraph", "OMEGA"],
    [target, "heading", "brXo"],
    ["q", "heading", "bravo"],
  ]);
});
