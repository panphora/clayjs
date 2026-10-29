globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, reduceRecovery, reduceRecoverable, removeKey, authorKey, physicalKeyOf } from "../../../../src/page/ybind/index.js";
import { LOCAL, NET } from "../../../../src/page/ybind/layout.js";

const seed = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  pd.origins.set(authorKey(1), "seed");
  return pd;
};
const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc), NET);
const vectorOf = (ydoc) => [...Y.decodeStateVector(Y.encodeStateVector(ydoc)).entries()].sort((a, b) => a[0] - b[0]);
const markerOf = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return { at, key: physicalKeyOf(it.id) };
    at += it.length;
  }
  throw new Error(`Missing marker ${id}`);
};
const recoverableOf = (pd) => reduceRecovery(pd).list.filter((record) => record.recoverable);

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});
function open(pd, options = {}) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null, proveWalks: true };
  const notices = [];
  const bridge = createBridge({ pd, stats, captureTimeout: 0, onNotice: (notice) => notices.push(notice), ...options });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount, notices };
  opened.push(tab);
  return tab;
}
const typeAtEnd = (tab, id, text) => {
  let end = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) end = pos + node.nodeSize - 1; });
  tab.view.dispatch(tab.view.state.tr.insertText(text, end));
};

test("only a source whose hidden text a removal had not seen is reduced, and the list equals the full reduction's", () => {
  const hider = clone(seed(), 2);
  const sv = vectorOf(hider.ydoc);
  const peer = clone(hider, 100);
  const q = markerOf(peer, "q");
  peer.ydoc.transact(() => peer.flow.insert(q.at + 2, "X"), NET);
  merge(hider, peer);
  const p = markerOf(hider, "p");
  hider.ydoc.transact(() => {
    hider.gone.set(removeKey(q.key, "op-q"), { blockId: "q", end: markerOf(hider, "r").key, sv });
    hider.gone.set(removeKey(p.key, "op-p"), { blockId: "p", end: q.key, sv: vectorOf(hider.ydoc) });
  }, LOCAL);
  const full = reduceRecovery(hider);
  expect([...full.sources.keys()].sort()).toEqual([p.key, q.key].sort());
  expect(full.sources.get(p.key).recoverable).toBe(false);
  const filtered = reduceRecoverable(hider);
  expect(filtered.list.map((record) => record.source)).toEqual([q.key]);
  expect(filtered.list).toEqual(recoverableOf(hider));
});

test("a legacy removal with no vector keeps every hidden unit a candidate", () => {
  const pd = clone(seed(), 3);
  const q = markerOf(pd, "q");
  pd.ydoc.transact(() => pd.gone.set(q.key, { b: "q", e: markerOf(pd, "r").key }), NET);
  expect(reduceRecoverable(pd).list).toEqual(recoverableOf(pd));
});

test("a bridge proves every recovery snapshot it builds against the full reduction while a peer keeps typing", () => {
  const base = seed();
  const a = open(clone(base, 100), { authorToken: "tok-a" });
  const b = open(clone(base, 200), { authorToken: "tok-b" });
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  expect(b.bridge.moveBlocks({ ids: ["q"], afterId: null })).toEqual({ status: "moved", ids: ["q"] });
  typeAtEnd(b, "q", "!Z");
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  for (let i = 0; i < 5; i++) {
    typeAtEnd(a, "p", String(i));
    merge(b.pd, a.pd);
  }
  expect(b.bridge.recoverable.length).toBe(1);
  expect(b.notices.filter((notice) => notice.kind === "recovered-change")).toHaveLength(1);
  for (const tab of [a, b]) {
    expect(tab.stats.provedRecoveries).toBeGreaterThan(0);
    expect(tab.stats.walkMismatch ?? 0).toBe(0);
  }
});
