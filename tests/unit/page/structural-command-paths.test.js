globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk } from "../../../src/page/ybind/index.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";
import { moveBlock, indentBlocks, outdentBlocks, outline, MOVE } from "../../../src/page/blocks.js";
import { moveSpanTo, gapTargets, pickTarget, summaryTarget } from "../../../src/page/drop.js";
import { selectBlocks, asStep } from "../../../src/page/blocksel.js";
import { ACTION_ITEMS } from "../../../src/page/chrome.js";

/**
 * Every structural page move - the pointer's drag, the menu's Move/Tab entries, the
 * keyboard's own keys - has to reach the one validated move port, which then writes
 * Yjs. A gesture that applied its own ProseMirror transaction instead would bump the
 * generic local-group counter, so that counter is the fixture's witness: it stays put
 * across a ported move and the transaction that changed the document carries MOVE.
 */

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});

function open(spec) {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, spec);
  pd.ydoc.clientID = 300;
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const seen = [];
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => { seen.push(tr); bridge.dispatch(tr); },
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount, seen };
  opened.push(tab);
  return tab;
}

const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const field = (tab, name) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.attrs[name]])); return out; };
const ids = (tab) => blocks(tab).map(([id]) => id);
const caretIn = (tab, id, offset) => {
  let at = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1 + offset; });
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
};
const selectAt = (tab, index) => tab.view.dispatch(tab.view.state.tr.setSelection(selectBlocks(tab.view.state.doc, index)));
const menu = (key) => ACTION_ITEMS.find((item) => item.key === key).run;

// One ported gesture: exactly one document-changing transaction, carrying the
// intent; the generic local path never runs; ProseMirror and Yjs still agree.
const ported = (tab, gesture) => {
  const groups = tab.stats.groups;
  const start = tab.seen.length;
  gesture();
  const changed = tab.seen.slice(start).filter((tr) => tr.docChanged && !tr.getMeta(REMOTE_META));
  expect(changed.length).toBe(1);
  const move = changed[0].getMeta(MOVE);
  expect(move).toBeTruthy();
  expect(tab.stats.groups).toBe(groups);
  expect(tab.stats.moveRefusals).toBeUndefined();
  expect(tab.stats.mismatch).toBe(0);
  expect(projected(tab)).toEqual(blocks(tab));
  const seenIds = ids(tab);
  expect(new Set(seenIds).size).toBe(seenIds.length);
  return move;
};

const PQR = () => [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }];
const LISTS = () => [
  { id: "l1", t: "list_item", text: "one" },
  { id: "l2", t: "list_item", text: "two" },
  { id: "l3", t: "list_item", text: "three" },
];

test("the keyboard's Move down goes through the port and undoes in one step", () => {
  const tab = open(PQR());
  caretIn(tab, "q", 2);
  const move = ported(tab, () => moveBlock(1)(tab.view.state, tab.view.dispatch));
  expect(move.ids).toEqual(["q"]);
  expect(ids(tab)).toEqual(["p", "r", "q"]);
  expect(tab.bridge.um.undoStack.length).toBe(1);
  expect(tab.bridge.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "q", "r"]);
  expect(projected(tab)).toEqual(blocks(tab));
});

test("the keyboard's Move up goes through the port", () => {
  const tab = open(PQR());
  caretIn(tab, "q", 2);
  const move = ported(tab, () => moveBlock(-1)(tab.view.state, tab.view.dispatch));
  expect(move.ids).toEqual(["q"]);
  expect(ids(tab)).toEqual(["q", "p", "r"]);
  expect(tab.bridge.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "q", "r"]);
});

test("a toggle's descendants move once, with it, and come back in one undo", () => {
  const tab = open([
    { id: "p", text: "ALPHA" },
    { id: "t", t: "toggle", text: "Group", attrs: { open: true } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "c2", text: "two", attrs: { parent: "t" } },
    { id: "r", text: "OMEGA" },
  ]);
  caretIn(tab, "t", 0);
  const move = ported(tab, () => moveBlock(1)(tab.view.state, tab.view.dispatch));
  expect(move.ids).toEqual(["t", "c1", "c2"]);
  expect(ids(tab)).toEqual(["p", "r", "t", "c1", "c2"]);
  expect(field(tab, "parent")).toEqual([["p", null], ["r", null], ["t", null], ["c1", "t"], ["c2", "t"]]);
  expect(tab.bridge.um.undoStack.length).toBe(1);
  expect(tab.bridge.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "t", "c1", "c2", "r"]);
  expect(projected(tab)).toEqual(blocks(tab));
});

test("Tab on a list item goes through the port with the indent in the intent", () => {
  const tab = open(LISTS());
  caretIn(tab, "l2", 1);
  const move = ported(tab, () => indentBlocks(tab.view.state, tab.view.dispatch));
  expect(move).toEqual({ ids: ["l2"], afterId: "l1", parent: null, attrs: { l2: { indent: 1 } } });
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 1], ["l3", 0]]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 0]]);
});

test("Shift-Tab on a list item goes through the port with the lowered indent", () => {
  const tab = open([
    { id: "l1", t: "list_item", text: "one" },
    { id: "l2", t: "list_item", text: "two", attrs: { indent: 1 } },
    { id: "l3", t: "list_item", text: "three" },
  ]);
  caretIn(tab, "l2", 1);
  const move = ported(tab, () => outdentBlocks(tab.view.state, tab.view.dispatch));
  expect(move.attrs).toEqual({ l2: { indent: 0 } });
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 0]]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 1], ["l3", 0]]);
});

test("Tab after a closed toggle adopts the block through the port and opens the toggle", () => {
  const tab = open([
    { id: "t", t: "toggle", text: "Group", attrs: { open: false } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "z", text: "Z" },
  ]);
  caretIn(tab, "z", 1);
  const move = ported(tab, () => indentBlocks(tab.view.state, tab.view.dispatch));
  expect(move.parent).toBe("t");
  expect(move.attrs.t).toEqual({ open: true });
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", "t"], ["z", "t"]]);
  expect(field(tab, "open")[0]).toEqual(["t", true]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", "t"], ["z", null]]);
});

test("Shift-Tab on a toggle's last child goes through the port in place", () => {
  const tab = open([
    { id: "t", t: "toggle", text: "Group", attrs: { open: true } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
  ]);
  caretIn(tab, "c1", 1);
  const move = ported(tab, () => outdentBlocks(tab.view.state, tab.view.dispatch));
  expect(move.parent).toBe(null);
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", null]]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", "t"]]);
});

test("the pointer's reorder drop goes through the port", () => {
  const tab = open(PQR());
  const st = tab.view.state;
  const ents = outline(st.doc);
  const target = pickTarget(gapTargets(st, ents, 0, 0, 2), 0);
  const move = ported(tab, () => tab.view.dispatch(asStep(moveSpanTo(st, ents, 0, 0, target)).scrollIntoView()));
  expect(move.ids).toEqual(["p"]);
  expect(ids(tab)).toEqual(["q", "p", "r"]);
  expect(tab.bridge.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "q", "r"]);
});

test("the pointer's in-place indent drop goes through the port", () => {
  const tab = open(LISTS());
  const st = tab.view.state;
  const ents = outline(st.doc);
  const target = pickTarget(gapTargets(st, ents, 2, 2, 2), 1);
  const move = ported(tab, () => tab.view.dispatch(asStep(moveSpanTo(st, ents, 2, 2, target)).scrollIntoView()));
  expect(move.ids).toEqual(["l3"]);
  expect(move.attrs).toEqual({ l3: { indent: 1 } });
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 1]]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 0]]);
});

test("the pointer's drop onto a closed toggle's summary goes through the port", () => {
  const tab = open([
    { id: "t", t: "toggle", text: "Group", attrs: { open: false } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "z", text: "Z" },
  ]);
  const st = tab.view.state;
  const ents = outline(st.doc);
  const move = ported(tab, () => tab.view.dispatch(asStep(moveSpanTo(st, ents, 2, 2, summaryTarget(st, ents, 2, 2, 0))).scrollIntoView()));
  expect(move.parent).toBe("t");
  expect(move.attrs.t).toEqual({ open: true });
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", "t"], ["z", "t"]]);
  expect(tab.bridge.undo()).toBe(true);
  expect(field(tab, "parent")).toEqual([["t", null], ["c1", "t"], ["z", null]]);
});

test("the menu's Move entries go through the port", () => {
  const tab = open(PQR());
  selectAt(tab, 1);
  const move = ported(tab, () => menu("down")(tab.view));
  expect(move.ids).toEqual(["q"]);
  expect(ids(tab)).toEqual(["p", "r", "q"]);
  ported(tab, () => menu("up")(tab.view));
  expect(ids(tab)).toEqual(["p", "q", "r"]);
});

test("the menu's Indent and Outdent entries go through the port", () => {
  const tab = open(LISTS());
  selectAt(tab, 1);
  const move = ported(tab, () => menu("indent")(tab.view));
  expect(move.attrs).toEqual({ l2: { indent: 1 } });
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 1], ["l3", 0]]);
  ported(tab, () => menu("outdent")(tab.view));
  expect(field(tab, "indent")).toEqual([["l1", 0], ["l2", 0], ["l3", 0]]);
  expect(tab.bridge.um.undoStack.length).toBe(2);
});
