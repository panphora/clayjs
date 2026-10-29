globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createPageEditor } from "../../../../src/page/editor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, createYPageBinding, keepViewPos, seedFrom, docOf, walk, authorKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { tableKey } from "../../../../src/page/ybind/table.js";
import { buildLongDocument } from "../helpers/long-document.js";

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

const freshStats = () => ({ groups: 0, mismatch: 0, renders: 0, first: null, proveWalks: true });

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount, binding } of opened.splice(0)) {
    view.destroy();
    if (binding) binding.dispose();
    else bridge.dispose();
    (binding ? binding.ydoc : bridge.pd.ydoc).destroy();
    mount.remove();
  }
});

function open(pd) {
  const stats = freshStats();
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

function openLong(value) {
  const stats = freshStats();
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0, stats });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
  });
  binding.attach(view);
  const tab = { pd: binding.pd, bridge: binding.bridge, stats, view, mount, binding };
  opened.push(tab);
  return tab;
}

const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const blockAt = (tab, id) => {
  let out = null;
  tab.view.state.doc.forEach((node, start) => { if (node.attrs.id === id) out = { node, start }; });
  if (!out) throw new Error(`no block ${id}`);
  return out;
};

const typeAt = (tab, id, offset, text) => {
  const { node, start } = blockAt(tab, id);
  tab.view.dispatch(tab.view.state.tr.insertText(text, start + 1 + Math.min(offset, node.content.size)));
};

const backspaceAt = (tab, id, offset) => {
  const { node, start } = blockAt(tab, id);
  const pos = start + 1 + Math.min(offset, node.content.size);
  tab.view.dispatch(tab.view.state.tr.delete(pos, pos + 1));
};

const removeBlock = (tab, id) => {
  const { node, start } = blockAt(tab, id);
  tab.view.dispatch(tab.view.state.tr.delete(start, start + node.nodeSize));
};

const counts = (tab) => ({ incremental: tab.stats.incrementalWalks ?? 0, proved: tab.stats.provedWalks ?? 0 });

test("a peer's table cell edit keeps the walk and derives that table alone again", () => {
  const cols = { c1: { pos: "a0", name: "Name" } };
  const rows = { r1: { pos: "a0", cells: { c1: "Alpha" } } };
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "tab", t: "table", attrs: { cols, rows, sort: null, parent: null } }, { id: "q", text: "bravo" }]));
  const b = open(clone(a.pd, 500));
  const walked = a.bridge.walk;
  const before = counts(a);
  b.pd.tableFields.set(tableKey("tab", "cell", "r1", "c1"), "Gamma");
  merge(a.pd, b.pd);
  expect(a.bridge.walk).toBe(walked);
  expect(counts(a)).toEqual({ incremental: before.incremental + 1, proved: before.proved + 1 });
  expect(a.view.state.doc.child(1).textContent).toContain("Gamma");
  settled(a);
});

test("an attribute that names a block's parent is not a field-only change", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  const b = open(clone(a.pd, 500));
  const walked = a.bridge.walk;
  b.pd.attrs.get("q").set("parent", "p");
  merge(a.pd, b.pd);
  expect(a.bridge.walk).not.toBe(walked);
  settled(a);
});

test("a full walk with the bridge's kept origin index equals one with a fresh index, across moves and their undo", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  const b = open(clone(a.pd, 500));
  expect(b.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toMatchObject({ status: "moved" });
  merge(a.pd, b.pd);
  expect(a.bridge.moveBlocks({ ids: ["p"], afterId: "q" })).toMatchObject({ status: "moved" });
  a.bridge.undo();
  typeAt(a, "r", 2, "x");
  expect(a.stats.provedIndexWalks ?? 0).toBeGreaterThan(0);
  expect(a.stats.walkMismatch ?? 0).toBe(0);
  settled(a);
});

test("an update the tab already has walks nothing and renders nothing", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  const b = open(clone(a.pd, 500));
  typeAt(b, "q", 5, "z");
  b.pd.flow.format(1, 2, { bold: true });
  merge(a.pd, b.pd);
  const walked = a.bridge.walk;
  const before = { ...counts(a), renders: a.stats.renders };
  merge(a.pd, b.pd);
  expect(a.bridge.walk).toBe(walked);
  expect({ ...counts(a), renders: a.stats.renders }).toEqual(before);
  const reused = a.stats.reusedWalks ?? 0;
  typeAt(a, "q", 1, "w");
  expect(a.stats.reusedWalks ?? 0).toBe(reused + 1);
  settled(a);
});

test("typing three characters is three incremental walks, each proven against the full walk", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  typeAt(a, "q", 1, "x");
  typeAt(a, "q", 2, "y");
  typeAt(a, "q", 3, "z");
  expect(counts(a)).toEqual({ incremental: 3, proved: 3 });
  expect(a.stats.walkMismatch ?? 0).toBe(0);
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bxyzravo"]]);
});

test("a backspace adds one incremental walk", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  typeAt(a, "q", 1, "x");
  const before = counts(a);
  backspaceAt(a, "q", 1);
  expect(counts(a)).toEqual({ incremental: before.incremental + 1, proved: before.proved + 1 });
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravo"]]);
});

test("deleting a block whole is a full walk, and typing at the end of the block before it walks that block up to the hidden run", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }, { id: "s", text: "delta" }]));
  removeBlock(a, "r");
  expect(counts(a)).toEqual({ incremental: 0, proved: 0 });
  typeAt(a, "q", blockAt(a, "q").node.content.size, "x");
  expect(counts(a)).toEqual({ incremental: 1, proved: 1 });
  typeAt(a, "p", blockAt(a, "p").node.content.size, "y");
  expect(counts(a)).toEqual({ incremental: 2, proved: 2 });
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHAy"], ["q", "bravox"], ["s", "delta"]]);
});

test("a peer's merged edit renders incrementally, and the local keystrokes after it reuse that walk", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  const b = open(clone(a.pd, 500));
  typeAt(b, "q", 5, "z");
  merge(a.pd, b.pd);
  expect(counts(a)).toEqual({ incremental: 1, proved: 1 });
  expect(a.stats.mismatch).toBe(0);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "bravoz"], ["r", "charlie"]]);
  const reused = a.stats.reusedWalks ?? 0;
  typeAt(a, "q", 3, "w");
  expect(a.stats.reusedWalks ?? 0).toBe(reused + 1);
  expect(counts(a)).toEqual({ incremental: 2, proved: 2 });
  typeAt(a, "q", 4, "v");
  expect(a.stats.reusedWalks ?? 0).toBe(reused + 2);
  expect(counts(a)).toEqual({ incremental: 3, proved: 3 });
  expect(a.stats.walkMismatch ?? 0).toBe(0);
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["q", "brawvvoz"], ["r", "charlie"]]);
});

test("undo of typing is incremental, undo of a block delete is not", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  typeAt(a, "q", 1, "x");
  expect(counts(a)).toEqual({ incremental: 1, proved: 1 });
  expect(a.bridge.undo()).toBe(true);
  expect(counts(a)).toEqual({ incremental: 2, proved: 2 });
  settled(a);
  removeBlock(a, "q");
  const afterDelete = counts(a);
  expect(a.bridge.undo()).toBe(true);
  expect(counts(a)).toEqual(afterDelete);
  settled(a);
});

test("moving a block is not incremental", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toMatchObject({ status: "moved" });
  expect(counts(a)).toEqual({ incremental: 0, proved: 0 });
  settled(a);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["r", "charlie"], ["q", "bravo"]]);
});

test("two tabs typing into the same block concurrently converge without a walk mismatch", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]));
  const b = open(clone(a.pd, 500));
  typeAt(a, "q", 1, "x");
  typeAt(b, "q", 1, "y");
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  settled(a);
  settled(b);
  expect(a.stats.walkMismatch ?? 0).toBe(0);
  expect(b.stats.walkMismatch ?? 0).toBe(0);
  expect(blocks(a)).toEqual(blocks(b));
});

test("fifty keystrokes into three paragraphs of the 2,000-block document are fifty proved incremental walks", () => {
  const fixture = buildLongDocument();
  const a = openLong(fixture.value);
  const TEXT_BLOCKS = new Set(["paragraph", "heading", "list_item", "callout", "quote", "toggle"]);
  const anchors = () => {
    const found = [];
    a.view.state.doc.forEach((block, start) => {
      if (TEXT_BLOCKS.has(block.type.name) && block.content.size > 2) found.push(start + 1);
    });
    return found;
  };
  const at = (which) => {
    const found = anchors();
    return which === 0 ? found[0] : which === 1 ? found[Math.floor(found.length / 2)] : found[found.length - 1];
  };
  for (let i = 0; i < 3; i++) a.view.dispatch(a.view.state.tr.insertText("a", at(i % 3)));
  const before = counts(a);
  for (let i = 0; i < 50; i++) a.view.dispatch(a.view.state.tr.insertText("a", at(i % 3)));
  expect(counts(a)).toEqual({ incremental: before.incremental + 50, proved: before.proved + 50 });
  expect(a.stats.mismatch).toBe(0);
  expect(a.stats.walkMismatch ?? 0).toBe(0);
  expect(a.view.state.doc.childCount).toBe(fixture.total);
}, 300000);

test("typing in one block reuses the view's node objects for every other block", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  typeAt(a, "q", 1, "w");
  const before = a.view.state.doc;
  const create = schema.nodes.paragraph.create;
  let built = 0;
  schema.nodes.paragraph.create = function (...args) { built += 1; return create.apply(this, args); };
  try {
    typeAt(a, "q", 1, "x");
  } finally {
    schema.nodes.paragraph.create = create;
  }
  expect(built).toBe(1);
  const after = a.view.state.doc;
  expect(after.child(0)).toBe(before.child(0));
  expect(after.child(2)).toBe(before.child(2));
  expect(after.child(1)).not.toBe(before.child(1));
  expect(a.stats.mismatch).toBe(0);
});

test("a wrong Yjs write is caught by the mismatch detector through the node cache", () => {
  const a = open(page([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "charlie" }]));
  const flow = a.pd.flow;
  const insert = flow.insert;
  let once = true;
  flow.insert = function (index, content, ...rest) {
    const at = once ? index + 1 : index;
    once = false;
    return insert.call(this, at, content, ...rest);
  };
  try {
    typeAt(a, "q", 1, "x");
  } finally {
    flow.insert = insert;
  }
  expect(once).toBe(false);
  expect(a.stats.mismatch).toBe(1);
  expect(a.stats.first).not.toBeNull();
});
