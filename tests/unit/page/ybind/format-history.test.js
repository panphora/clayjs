globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, createPageDoc, docOf, walk, bareShape } from "../../../../src/page/ybind/index.js";
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

function open(value, { plugins = [], captureTimeout = 0 } = {}) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin(), ...plugins] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  const tab = { store, binding, view, mount };
  opened.push(tab);
  return tab;
}

const text = (tab) => tab.view.state.doc.child(0).textContent;
const relay = (from, to) => Y.applyUpdateV2(to.binding.ydoc, Y.encodeStateAsUpdateV2(from.binding.ydoc), NET);
const reload = (tab) => {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(tab.binding.ydoc), NET);
  const pd = createPageDoc(doc);
  const result = docOf(pd, walk(pd));
  doc.destroy();
  return result;
};

test.each([
  ["bold", schema.marks.strong.create()],
  ["italic", schema.marks.em.create()],
  ["link", schema.marks.link.create({ href: "https://example.com" })],
])("%s formatting and undo retain a concurrent insertion", (_name, mark) => {
  const value = seedValue([{ id: "p", text: "hello world" }]);
  const a = open(value), b = open(value);
  a.view.dispatch(a.view.state.tr.addMark(1, 6, mark));
  b.view.dispatch(b.view.state.tr.insertText("X", 3));
  relay(a, b);
  relay(b, a);
  expect(text(a)).toBe("heXllo world");
  expect(a.binding.undo()).toBe(true);
  expect(text(a)).toBe("heXllo world");
  expect(a.view.state.doc.child(0).rangeHasMark(0, 6, mark.type)).toBe(false);
  relay(a, b);
  expect(bareShape(reload(a))).toBe(bareShape(a.view.state.doc));
  expect(bareShape(b.view.state.doc)).toBe(bareShape(a.view.state.doc));
  expect(a.binding.stats.mismatch).toBe(0);
});

test.each([
  ["block type", [{ id: "p", text: "hello" }], (tab) => {
    const node = tab.view.state.doc.child(0);
    tab.view.dispatch(tab.view.state.tr.setNodeMarkup(0, schema.nodes.callout, node.attrs));
  }, "paragraph", "callout"],
  ["heading level", [{ id: "p", t: "heading", attrs: { level: 2 }, text: "hello" }], (tab) => {
    tab.view.dispatch(tab.view.state.tr.setNodeAttribute(0, "level", 3));
  }, 2, 3],
  ["checked state", [{ id: "p", t: "list_item", text: "hello" }], (tab) => {
    tab.view.dispatch(tab.view.state.tr.setNodeAttribute(0, "checked", true));
  }, false, true],
  ["parent", [{ id: "p", t: "list_item", text: "hello" }, { id: "q", t: "list_item", text: "parent" }], (tab) => {
    tab.view.dispatch(tab.view.state.tr.setNodeAttribute(0, "parent", "q"));
  }, null, "q"],
])("%s change and undo retain a concurrent text edit", (name, blocks, format, before, after) => {
  const value = seedValue(blocks);
  const a = open(value), b = open(value);
  format(a);
  b.view.dispatch(b.view.state.tr.insertText("X", 3));
  relay(a, b);
  relay(b, a);
  const changed = a.view.state.doc.child(0);
  expect(name === "block type" ? changed.type.name : changed.attrs[name === "heading level" ? "level" : name === "checked state" ? "checked" : "parent"]).toBe(after);
  expect(a.binding.undo()).toBe(true);
  const restored = a.view.state.doc.child(0);
  expect(name === "block type" ? restored.type.name : restored.attrs[name === "heading level" ? "level" : name === "checked state" ? "checked" : "parent"]).toBe(before);
  expect(restored.textContent).toBe("heXllo");
  relay(a, b);
  expect(bareShape(reload(a))).toBe(bareShape(a.view.state.doc));
  expect(bareShape(b.view.state.doc)).toBe(bareShape(a.view.state.doc));
  expect(a.binding.stats.mismatch).toBe(0);
});

test("each command is one undo step, including a chunked command", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]));
  tab.view.dispatch(tab.view.state.tr.insertText("A", 2));
  tab.view.dispatch(tab.view.state.tr.insertText("B", 3));
  tab.view.dispatch(tab.view.state.tr.insertText("z".repeat(5001), 4));
  expect(tab.binding.stats.lastGroup.chunked).toBe(true);
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("aABbc");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("aAbc");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  expect(bareShape(reload(tab))).toBe(bareShape(tab.view.state.doc));
});

test("addToHistory false excludes a command and its appended plugin step", () => {
  const appended = new pmState.Plugin({ appendTransaction(transactions, _old, next) {
    if (!transactions.some((tr) => tr.getMeta("append-test")) || transactions.some((tr) => tr.getMeta("appended"))) return null;
    return next.tr.insertText("!", next.doc.child(0).nodeSize - 1).setMeta("appended", true);
  } });
  const tab = open(seedValue([{ id: "p", text: "abc" }]), { plugins: [appended] });
  tab.view.dispatch(tab.view.state.tr.insertText("A", 2));
  tab.view.dispatch(tab.view.state.tr.insertText("B", 3).setMeta("append-test", true).setMeta("addToHistory", false));
  expect(text(tab)).toBe("aABbc!");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("aBbc!");
  expect(tab.binding.undo()).toBe(false);
  expect(bareShape(reload(tab))).toBe(bareShape(tab.view.state.doc));
});

test("addToHistory false excludes every Y transaction in a chunked command", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]));
  tab.view.dispatch(tab.view.state.tr.insertText("A", 2));
  tab.view.dispatch(tab.view.state.tr.insertText("z".repeat(5001), 3).setMeta("addToHistory", false));
  expect(tab.binding.stats.lastGroup.chunked).toBe(true);
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe(`a${"z".repeat(5001)}bc`);
  expect(tab.binding.undo()).toBe(false);
  expect(bareShape(reload(tab))).toBe(bareShape(tab.view.state.doc));
});
