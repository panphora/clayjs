globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, authorKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";

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
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const typeAt = (tab, id, offset, text) => {
  let pos = null;
  tab.view.state.doc.forEach((node, start) => { if (node.attrs.id === id) pos = start + 1 + offset; });
  tab.view.dispatch(tab.view.state.tr.insertText(text, pos));
};

test("a keystroke reuses the walk the previous write left, and a peer's edit forces a fresh walk", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  const b = open(clone(a.pd, 500));
  typeAt(a, "q", 1, "x");
  typeAt(a, "q", 2, "y");
  expect(a.stats.reusedWalks).toBe(2);
  typeAt(b, "q", 5, "z");
  merge(a.pd, b.pd);
  typeAt(a, "q", 3, "w");
  expect(a.stats.reusedWalks).toBe(2);
  typeAt(a, "q", 4, "v");
  expect(a.stats.reusedWalks).toBe(3);
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bxywvravoz"]]);
});
