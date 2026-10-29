globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { commands, state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, blocksFromYValue, authorKey, removeKey } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const page = (blocks) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, blocks);
  pd.ydoc.clientID = 300;
  pd.origins.set(authorKey(1), "seed");
  return pd;
};

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
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
const projected = (pd) => { const out = []; docOf(pd, walk(pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const reloaded = (pd) => {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  const value = blocksFromYValue(yValueOf(createPageDoc(doc).ydoc));
  return Object.entries(value).sort((left, right) => (left[1].pos < right[1].pos ? -1 : 1)).map(([id, block]) => [id, block.c]);
};
const caretAt = (tab, id) => {
  let at = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1; });
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
};

const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc), "net");
const decoded = (pd) => projected(clone(pd, 999));
const select = (tab, [fromId, fromOffset], [toId, toOffset]) => {
  const at = (id, offset) => { let found = null; tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = pos + 1 + offset; }); return found; };
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at(fromId, fromOffset), at(toId, toOffset))));
};

test("a removal whose source and end merge into one deleted item still ends there, live and after a reload", () => {
  const pd = page([{ id: "p", text: "PP" }, { id: "s", text: "SS" }]);
  const peer = clone(pd, 500);
  peer.ydoc.transact(() => {
    peer.flow.insertEmbed(3, { b: "x" });
    peer.flow.insert(4, "XX");
    peer.flow.insertEmbed(6, { b: "y" });
    peer.flow.insert(7, "YY");
  });
  merge(pd, peer);
  const sv = [...Y.decodeStateVector(Y.encodeStateVector(pd.ydoc)).entries()].sort((left, right) => left[0] - right[0]);
  pd.ydoc.transact(() => pd.gone.set(removeKey("500.0", "op"), { blockId: "x", end: "500.3", sv }));
  merge(peer, pd);
  peer.ydoc.transact(() => peer.flow.delete(3, 4));
  merge(pd, peer);

  expect(projected(pd)).toEqual([["p", "PPYY"], ["s", "SS"]]);
  expect(decoded(pd)).toEqual(projected(pd));
});

// A merged deleted item holds a removal's source and the items after it. An end that does not
// lie past that source (a record naming the item's own start) is not this removal's end, so
// the region keeps hiding, live and after a reload.
test("a removal whose end does not lie past its own source is not ended by it", () => {
  const pd = page([{ id: "p", text: "PP" }, { id: "s", text: "SS" }]);
  const peer = clone(pd, 500);
  peer.ydoc.transact(() => {
    peer.flow.insertEmbed(3, { b: "x" });
    peer.flow.insert(4, "XX");
  });
  merge(pd, peer);
  const sv = [...Y.decodeStateVector(Y.encodeStateVector(pd.ydoc)).entries()].sort((left, right) => left[0] - right[0]);
  pd.ydoc.transact(() => pd.gone.set(removeKey("500.0", "op"), { blockId: "x", end: "500.0", sv }));
  merge(peer, pd);
  peer.ydoc.transact(() => peer.flow.delete(3, 3));
  merge(pd, peer);

  expect(projected(pd)).toEqual([["p", "PP"]]);
  expect(decoded(pd)).toEqual(projected(pd));
});

test("moving a block next to a joined block whose join lost to a move does not bring the joined text back", () => {
  const pd = page([{ id: "p", text: "PP" }, { id: "q", text: "QQ" }, { id: "r", text: "RR" }, { id: "s", text: "SS" }]);
  const peer = clone(pd, 400);
  const a = open(pd);
  const b = open(peer);

  caretAt(b, "s");
  expect(commands.joinBackward(b.view.state, b.view.dispatch)).toBe(true);
  expect(a.bridge.moveBlocks({ ids: ["s"], afterId: "p" }).status).toBe("moved");
  merge(pd, peer);
  merge(peer, pd);
  expect(blocks(a)).toEqual([["p", "PP"], ["s", "SS"], ["q", "QQ"], ["r", "RR"]]);

  expect(a.bridge.moveBlocks({ ids: ["p"], afterId: "r" }).status).toBe("moved");
  expect(blocks(a)).toEqual([["s", "SS"], ["q", "QQ"], ["r", "RR"], ["p", "PP"]]);
  merge(peer, pd);
  expect(blocks(b)).toEqual(blocks(a));
  expect(decoded(pd)).toEqual(blocks(a));
});

