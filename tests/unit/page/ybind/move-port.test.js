globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, authorKey, parseGoneIntents } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { moveBlock, outdentBlocks, outline, MOVE } from "../../../../src/page/blocks.js";
import { moveSpanTo } from "../../../../src/page/drop.js";

const page = (blocks, client = 300) => {
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
const field = (tab, name) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.attrs[name]])); return out; };
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };
const removals = (tab) => parseGoneIntents(tab.pd.gone).removals.length;
const copies = (tab) => parseGoneIntents(tab.pd.gone).copyActive.size;

const caretIn = (tab, id, offset) => {
  let at = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1 + offset; });
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
};
const caret = (tab) => {
  const { $head } = tab.view.state.selection;
  return { id: $head.node(1).attrs.id, offset: $head.parentOffset };
};

const PQR = [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }];

test("Move down is a delete-and-copy move, keeps the caret, and undoes in one step", () => {
  const a = open(page(PQR));
  caretIn(a, "q", 2);
  expect(moveBlock(1)(a.view.state, a.view.dispatch)).toBe(true);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(removals(a)).toBe(1);
  expect(copies(a)).toBe(1);
  expect(a.stats.moveFallbacks).toBeUndefined();
  expect(caret(a)).toEqual({ id: "q", offset: 2 });
  settled(a);
  expect(a.bridge.undo()).toBe(true);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravo"], ["r", "OMEGA"]]);
  settled(a);
});

test("a peer's concurrent typing in a moved block never joins the block above", () => {
  const a = open(page(PQR));
  const b = open(clone(a.pd, 200));
  b.pd.origins.set(authorKey(200), "B");
  caretIn(b, "q", 5);
  b.view.dispatch(b.view.state.tr.insertText("!"));
  caretIn(a, "q", 0);
  moveBlock(1)(a.view.state, a.view.dispatch);
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  expect(blocks(a)).toEqual(blocks(b));
  expect(blocks(a).find(([id]) => id === "p")).toEqual(["p", "ALPHA"]);
  expect(blocks(a).map(([id]) => id)).toEqual(["p", "r", "q"]);
  let snapshot = null;
  a.bridge.subscribeRecovery((next) => { snapshot = next; });
  expect(snapshot.recoverable.length).toBe(1);
  settled(a);
  settled(b);
});

test("Move up out of a toggle's first child lands above the toggle at its level", () => {
  const a = open(page([
    { id: "t", t: "toggle", text: "Group", attrs: { open: true } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "c2", text: "two", attrs: { parent: "t" } },
    { id: "r", text: "OMEGA" },
  ]));
  caretIn(a, "c1", 1);
  moveBlock(-1)(a.view.state, a.view.dispatch);
  expect(blocks(a).map(([id]) => id)).toEqual(["c1", "t", "c2", "r"]);
  expect(field(a, "parent")).toEqual([["c1", null], ["t", null], ["c2", "t"], ["r", null]]);
  expect(removals(a)).toBe(1);
  expect(copies(a)).toBe(1);
  settled(a);
  a.bridge.undo();
  expect(field(a, "parent")).toEqual([["t", null], ["c1", "t"], ["c2", "t"], ["r", null]]);
  settled(a);
});

test("Shift-Tab on a toggle's first child moves it below the toggle through the port", () => {
  const a = open(page([
    { id: "t", t: "toggle", text: "Group", attrs: { open: true } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "c2", text: "two", attrs: { parent: "t" } },
    { id: "r", text: "OMEGA" },
  ]));
  caretIn(a, "c1", 1);
  outdentBlocks(a.view.state, a.view.dispatch);
  expect(field(a, "parent")).toEqual([["t", null], ["c2", "t"], ["c1", null], ["r", null]]);
  expect(removals(a)).toBe(1);
  expect(copies(a)).toBe(1);
  expect(a.stats.moveFallbacks).toBeUndefined();
  settled(a);
});

test("a list item dragged one level deeper writes its indent in the same undo step", () => {
  const a = open(page([
    { id: "l1", t: "list_item", text: "one" },
    { id: "l2", t: "list_item", text: "two" },
    { id: "l3", t: "list_item", text: "three" },
  ]));
  const st = a.view.state;
  const ents = outline(st.doc);
  a.view.dispatch(moveSpanTo(st, ents, 2, 2, { at: ents[1].at, parent: null, indent: 1 }));
  expect(field(a, "indent")).toEqual([["l1", 0], ["l3", 1], ["l2", 0]]);
  expect(removals(a)).toBe(1);
  expect(copies(a)).toBe(1);
  settled(a);
  a.bridge.undo();
  expect(field(a, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 0]]);
  settled(a);
});

test("a drop into a closed toggle opens it in the same undo step", () => {
  const a = open(page([
    { id: "p", text: "ALPHA" },
    { id: "t", t: "toggle", text: "Group", attrs: { open: false } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
  ]));
  const st = a.view.state;
  const ents = outline(st.doc);
  a.view.dispatch(moveSpanTo(st, ents, 0, 0, { at: ents[2].at, parent: "t", indent: 0, open: "t" }));
  expect(field(a, "parent")).toEqual([["t", null], ["p", "t"], ["c1", "t"]]);
  expect(field(a, "open")).toEqual([["t", true], ["p", undefined], ["c1", undefined]]);
  expect(copies(a)).toBe(1);
  settled(a);
  a.bridge.undo();
  expect(field(a, "parent")).toEqual([["p", null], ["t", null], ["c1", "t"]]);
  expect(field(a, "open")[1]).toEqual(["t", false]);
  settled(a);
});

test("a move the binding refuses falls back to the editor transaction", () => {
  const a = open(page(PQR));
  a.view.dispatch(a.view.state.tr.setMeta(MOVE, { ids: ["nope"], afterId: null, parent: null }));
  expect(a.stats.moveFallbacks).toBe(1);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravo"], ["r", "OMEGA"]]);
  settled(a);
});

test("moveBlocks refuses attribute changes it does not own", () => {
  const a = open(page([...PQR, { id: "l1", t: "list_item", text: "x" }]));
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r", attrs: { q: { indent: 2 } } })).toEqual({ status: "refused", code: "invalid-attrs" });
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r", attrs: { r: { color: "red" } } })).toEqual({ status: "refused", code: "invalid-attrs" });
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r", attrs: { l1: { indent: 9 } } })).toEqual({ status: "refused", code: "invalid-attrs" });
  expect(blocks(a).map(([id]) => id)).toEqual(["p", "q", "r", "l1"]);
  expect(a.bridge.moveBlocks({ ids: ["l1"], afterId: "p", attrs: { l1: { indent: 1 } } })).toEqual({ status: "moved", ids: ["l1"] });
  expect(field(a, "indent")[1]).toEqual(["l1", 1]);
  settled(a);
});

test("Undo of a dragged block keeps a peer's text in the moved copy recoverable, and Redo puts it back", () => {
  const a = open(page(PQR));
  const b = open(clone(a.pd, 200));
  b.pd.origins.set(authorKey(200), "B");
  caretIn(a, "q", 0);
  moveBlock(1)(a.view.state, a.view.dispatch);
  merge(b.pd, a.pd);
  expect(blocks(b).map(([id]) => id)).toEqual(["p", "r", "q"]);
  caretIn(b, "q", 2);
  b.view.dispatch(b.view.state.tr.insertText("Z"));
  merge(a.pd, b.pd);
  expect(a.bridge.undo()).toBe(true);
  merge(b.pd, a.pd);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravo"], ["r", "OMEGA"]]);
  expect(blocks(b)).toEqual(blocks(a));
  let snapshot = null;
  a.bridge.subscribeRecovery((next) => { snapshot = next; });
  expect(snapshot.recoverable.length).toBe(1);
  expect(a.bridge.redo()).toBe(true);
  merge(b.pd, a.pd);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "brZavo"]]);
  expect(blocks(b)).toEqual(blocks(a));
  settled(a);
  settled(b);
});
