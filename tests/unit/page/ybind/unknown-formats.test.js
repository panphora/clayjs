globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, createPageDoc, docOf, walk, bareShape, seedValue } from "../../../../src/page/ybind/index.js";
import { docFromValue } from "../../../../src/page/ybind/provider.js";
import { NET } from "../../../../src/page/ybind/layout.js";

const opened = [];
afterEach(() => {
  for (const { view, binding, mount } of opened.splice(0)) {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});

function open(value, { captureTimeout = 0 } = {}) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  const tab = { store, binding, view, mount };
  opened.push(tab);
  return tab;
}

const relay = (from, to) => Y.applyUpdateV2(to.binding.ydoc, Y.encodeStateAsUpdateV2(from.ydoc ?? from.binding.ydoc), NET);
const find = (doc, id) => {
  let found = null;
  doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; });
  return found;
};
const types = (doc) => { const out = []; doc.forEach((node) => out.push(node.type.name)); return out; };
const ids = (doc) => { const out = []; doc.forEach((node) => out.push(node.attrs.id)); return out; };
const updates = (tab) => {
  const counter = { n: 0 };
  tab.binding.ydoc.on("update", () => { counter.n++; });
  return counter;
};

// The flow's own records for one block, its marker included: the text, the live
// keys and the raw attributes exactly as they stand in the document.
const runsOf = (pd, id) => {
  const out = [];
  let inside = false;
  for (const part of pd.flow.toDelta()) {
    if (typeof part.insert !== "string") {
      inside = part.insert?.b === id;
      if (inside) out.push({ b: part.insert.b, attributes: part.attributes ?? null });
      continue;
    }
    if (inside) out.push({ text: part.insert, attributes: part.attributes ?? null });
  }
  return out;
};
const attrsOf = (pd, id) => {
  const map = pd.attrs.get(id);
  return map ? JSON.parse(JSON.stringify(Object.fromEntries(map))) : null;
};
const textOf = (tab, id) => find(tab.view.state.doc, id)?.node.textContent ?? null;
const known = (key) => schema.marks[key.split("!")[0].split("~")[0]] !== undefined;
const unknownOf = (attributes) => Object.fromEntries(Object.entries(attributes ?? {}).filter(([key]) => !known(key)));
const unknownRuns = (pd, id) => runsOf(pd, id).map((part) => [part.text ?? part.b, unknownOf(part.attributes)]);
const nodeOf = (tab, id) => find(tab.view.state.doc, id)?.node ?? null;
const segments = (pd) => walk(pd).visible;

const NEWER = {
  marks: [{ key: "underline~p1", value: true }, { key: "clay_opaque_code~p2", value: { tokens: ["u"] } }],
  block: { id: "q", t: "quote", text: "Read this too", record: { unknown: { keep: true }, indent: 2 } },
};

// The newer peer's own document: a known paragraph carrying two marks this
// runtime has no schema for and an unfamiliar attribute, then a block of an
// unfamiliar type holding text and an unfamiliar record.
function newerPeer(value) {
  const pd = createPageDoc(docFromValue(value));
  pd.ydoc.clientID = 707;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(7, { b: NEWER.block.id });
    pd.flow.insert(8, NEWER.block.text);
    pd.flow.format(1, 4, { [NEWER.marks[0].key]: NEWER.marks[0].value });
    pd.flow.format(5, 2, { [NEWER.marks[1].key]: NEWER.marks[1].value });
    pd.attrs.get("a").set("future", { keep: true });
    pd.attrs.get("a").set("level", 4);
    pd.attrs.set(NEWER.block.id, new Y.Map([["t", NEWER.block.t], ...Object.entries(NEWER.block.record).map(([key, value]) => [key, value])]));
  }, NET);
  return pd;
}

const page = () => seedValue([{ id: "a", text: "before" }, { id: "b", text: "after" }]);

function room(value = page()) {
  const peer = newerPeer(value);
  const tab = open(value);
  relay(peer, tab);
  return { tab, peer };
}

test("unfamiliar marks, attributes and a block type reach the tolerant editor intact", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  const block = nodeOf(tab, "q");
  expect(block.attrs.raw).toEqual({ t: "quote", unknown: { keep: true }, indent: 2 });
  expect(block.textContent).toBe("Read this too");
  expect(textOf(tab, "a")).toBe("before");
  expect(textOf(tab, "b")).toBe("after");
  expect(walk(pd).orphans).toEqual([]);
  expect(segments(pd).map((seg) => [seg.id, seg.t, seg.opaque === true, seg.atom, seg.runs.map((run) => run.text ?? "").join("")]))
    .toEqual([["a", "paragraph", false, false, "before"], ["q", "quote", true, false, "Read this too"], ["b", "paragraph", false, false, "after"]]);
  const shown = tab.mount.querySelector('[data-type="newer-format"]');
  expect(shown.getAttribute("data-format")).toBe("quote");
  expect(shown.getAttribute("contenteditable")).toBe("false");
  expect(shown.textContent).toContain("Read this too");
  const a = nodeOf(tab, "a");
  expect(a.textContent).toBe("before");
  expect(attrsOf(pd, "a")).toMatchObject({ t: "paragraph", future: { keep: true }, level: 4 });
});

test("a neighbouring edit, a known mark, undo and redo never rewrite the unknown span", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), a: runsOf(pd, "a"), qAttrs: attrsOf(pd, "q"), aAttrs: attrsOf(pd, "a") };
  const counter = updates(tab);

  const b = find(tab.view.state.doc, "b");
  expect(tab.view.dispatch(tab.view.state.tr.insertText("X", b.pos + 1))).toBeUndefined();
  expect(textOf(tab, "b")).toBe("Xafter");
  expect(counter.n).toBeGreaterThan(0);

  const marked = find(tab.view.state.doc, "b");
  tab.view.dispatch(tab.view.state.tr.addMark(marked.pos + 1, marked.pos + 3, schema.marks.strong.create()));
  expect(nodeOf(tab, "b").firstChild.marks.map((mark) => mark.type.name)).toEqual(["strong"]);

  expect(tab.binding.undo()).toBe(true);
  expect(tab.binding.undo()).toBe(true);
  expect(textOf(tab, "b")).toBe("after");
  expect(tab.binding.redo()).toBe(true);
  expect(tab.binding.redo()).toBe(true);
  expect(textOf(tab, "b")).toBe("Xafter");
  expect(nodeOf(tab, "b").firstChild.marks.map((mark) => mark.type.name)).toEqual(["strong"]);

  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(runsOf(pd, "a")).toEqual(before.a);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
  expect(attrsOf(pd, "a")).toEqual(before.aAttrs);
  expect(walk(pd).orphans).toEqual([]);
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(bareShape(docOf(pd, walk(pd)))).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("a known mark over an unknown-marked span and typing beside it never rewrite the unknown keys", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = unknownRuns(pd, "a");
  expect(before).toEqual([
    ["a", {}],
    ["befo", { "underline~p1": true }],
    ["re", { "clay_opaque_code~p2": { tokens: ["u"] } }],
  ]);

  const a = find(tab.view.state.doc, "a");
  tab.view.dispatch(tab.view.state.tr.addMark(a.pos + 1, a.pos + 7, schema.marks.strong.create()));
  expect(nodeOf(tab, "a").firstChild.marks.map((mark) => mark.type.name)).toEqual(["strong", "opaque_marks"]);
  expect(unknownRuns(pd, "a")).toEqual(before);
  expect(tab.binding.undo()).toBe(true);
  expect(unknownRuns(pd, "a")).toEqual(before);

  // Typing inside the unknown-marked text keeps its formatting.
  const inside = find(tab.view.state.doc, "a");
  tab.view.dispatch(tab.view.state.tr.insertText("Z", inside.pos + 1 + 5));
  const kept = runsOf(pd, "a").find((part) => part.text?.includes("Z"));
  expect(kept.text).toBe("rZe");
  expect(unknownOf(kept.attributes)).toEqual({ "clay_opaque_code~p2": { tokens: ["u"] } });

  // Typing at the span's end does not take on a format nobody can read.
  const end = find(tab.view.state.doc, "a");
  tab.view.dispatch(tab.view.state.tr.insertText("W", end.pos + 1 + end.node.content.size));
  const last = runsOf(pd, "a").at(-1);
  expect(last.text.endsWith("W")).toBe(true);
  expect(unknownOf(last.attributes)).toEqual({});
  expect(nodeOf(tab, "q").textContent).toBe("Read this too");
  expect(walk(pd).orphans).toEqual([]);
});

test("the record of an opaque block copies as a whole and never becomes a paragraph", () => {
  const { tab } = room();
  const block = find(tab.view.state.doc, "q");
  const slice = tab.view.state.doc.slice(block.pos, block.pos + block.node.nodeSize);
  const copy = slice.content.child(0);
  expect(copy.type.name).toBe("opaque_block");
  expect(copy.attrs.raw).toEqual(block.node.attrs.raw);
  expect(copy.textContent).toBe("Read this too");
  expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(copy.toJSON()))).attrs.raw).toEqual(block.node.attrs.raw);
  expect(segments(tab.binding.pd).find((seg) => seg.id === "q").t).toBe("quote");
});

test("splitting and merging a known neighbour leave the opaque block and its span untouched", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);

  const b = find(tab.view.state.doc, "b");
  tab.view.dispatch(tab.view.state.tr.split(b.pos + 1 + 2));
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph", "paragraph"]);
  expect(ids(tab.view.state.doc).slice(0, 2)).toEqual(["a", "q"]);
  expect(counter.n).toBeGreaterThan(0);
  const second = find(tab.view.state.doc, ids(tab.view.state.doc)[3]);
  expect(nodeOf(tab, "b").textContent + second.node.textContent).toBe("after");

  tab.view.dispatch(tab.view.state.tr.join(second.pos));
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(textOf(tab, "b")).toBe("after");
  expect(find(tab.view.state.doc, "q").node.textContent).toBe("Read this too");
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
  expect(walk(pd).orphans).toEqual([]);
  expect(bareShape(docOf(pd, walk(pd)))).toBe(bareShape(tab.view.state.doc));
});

test("a move that would carry the opaque block is refused with no Yjs update", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  expect(tab.binding.moveBlocks({ ids: ["q"], afterId: "b" })).toEqual({ status: "refused", code: "unsupported-format" });
  expect(tab.binding.moveBlocks({ ids: ["a", "q"], afterId: "b" })).toEqual({ status: "refused", code: "unsupported-format" });
  expect(counter.n).toBe(0);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
  expect(ids(tab.view.state.doc)).toEqual(["a", "q", "b"]);
});

test("a selection crossing the opaque block, deleting it or retyping it is refused with no Yjs update", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), a: runsOf(pd, "a"), b: runsOf(pd, "b"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  const doc = tab.view.state.doc;
  const a = find(doc, "a"), b = find(doc, "b");

  const crossing = tab.view.state.tr
    .setSelection(pmState.TextSelection.create(doc, a.pos + 1, b.pos + 3))
    .insertText("X");
  expect(tab.binding.dispatch(crossing)).toEqual({ status: "refused", code: "unsupported-format" });
  expect(counter.n).toBe(0);

  const selected = pmState.NodeSelection.create(doc, find(doc, "q").pos);
  expect(tab.binding.dispatch(tab.view.state.tr.setSelection(selected).deleteSelection()))
    .toEqual({ status: "refused", code: "unsupported-format" });
  expect(counter.n).toBe(0);

  const retype = tab.view.state.tr.setNodeMarkup(find(doc, "q").pos, schema.nodes.paragraph, { id: "q", pos: null });
  expect(tab.binding.dispatch(retype)).toEqual({ status: "refused", code: "unsupported-format" });
  expect(counter.n).toBe(0);

  expect(ids(tab.view.state.doc)).toEqual(["a", "q", "b"]);
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(runsOf(pd, "a")).toEqual(before.a);
  expect(runsOf(pd, "b")).toEqual(before.b);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
});

test("a known neighbouring edit still produces an update", () => {
  const { tab } = room();
  const counter = updates(tab);
  const a = find(tab.view.state.doc, "a");
  tab.view.dispatch(tab.view.state.tr.insertText("Y", a.pos + 1 + 6));
  expect(counter.n).toBeGreaterThan(0);
  expect(textOf(tab, "a")).toBe("beforeY");
  expect(textOf(tab, "q")).toBe("Read this too");
});
