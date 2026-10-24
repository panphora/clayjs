globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { jest } from "@jest/globals";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, createPageDoc, docOf, walk, bareShape } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { historyIntentPlugin } from "../../../../src/page/history-intent.js";

const opened = [];
afterEach(() => {
  for (const { view, binding, mount } of opened.splice(0)) {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});

let clock = 0;
beforeEach(() => {
  clock = 1000000;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => { jest.restoreAllMocks(); });

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
const textOf = (tab, id) => {
  let found = null;
  tab.view.state.doc.forEach((node) => { if (node.attrs.id === id) found = node.textContent; });
  return found;
};
const ids = (tab) => {
  const out = [];
  tab.view.state.doc.forEach((node) => out.push(node.attrs.id));
  return out;
};
const relay = (from, to) => Y.applyUpdateV2(to.binding.ydoc, Y.encodeStateAsUpdateV2(from.binding.ydoc), NET);
const reload = (tab) => {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(tab.binding.ydoc), NET);
  const pd = createPageDoc(doc);
  const result = docOf(pd, walk(pd));
  doc.destroy();
  return result;
};
const agree = (tab) => {
  expect(bareShape(reload(tab))).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
};

const typing = { plugins: [historyIntentPlugin()] };
const caret = (tab, pos) => tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, pos)));

const type = (tab, chars) => {
  for (const ch of chars) {
    const { from, to } = tab.view.state.selection;
    tab.view.someProp("handleTextInput", (f) => f(tab.view, from, to, ch, () => tab.view.state.tr.insertText(ch, from, to)));
  }
};

test("typing a sentence undoes by word", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "hello world");
  expect(text(tab)).toBe("abchello world");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abchello ");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a pause starts a new undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  clock += 600;
  type(tab, "cd");
  expect(text(tab)).toBe("abcabcd");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a caret jump starts a new undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  caret(tab, 2);
  type(tab, "cd");
  expect(text(tab)).toBe("acdbcab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a command between typing is its own undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  tab.view.dispatch(tab.view.state.tr.addMark(1, 3, schema.marks.strong.create()));
  caret(tab, 6);
  type(tab, "cd");
  expect(text(tab)).toBe("abcabcd");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.view.state.doc.child(0).rangeHasMark(0, 3, schema.marks.strong)).toBe(true);
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.view.state.doc.child(0).rangeHasMark(0, 3, schema.marks.strong)).toBe(false);
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("new marks start a new undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  tab.view.dispatch(tab.view.state.tr.setStoredMarks([schema.marks.strong.create()]));
  type(tab, "cd");
  expect(text(tab)).toBe("abcabcd");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a move right after typing is its own undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }, { id: "q", text: "Quinn" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  expect(tab.binding.moveBlocks({ ids: ["q"], afterId: null })).toMatchObject({ status: "moved" });
  expect(ids(tab)).toEqual(["q", "p"]);
  expect(tab.binding.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "q"]);
  expect(textOf(tab, "p")).toBe("abcab");
  expect(tab.binding.undo()).toBe(true);
  expect(textOf(tab, "p")).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a peer insert inside the typed word survives both undos", () => {
  const value = seedValue([{ id: "p", text: "abc" }]);
  const a = open(value, typing), b = open(value, typing);
  caret(a, 4);
  type(a, "hel");
  expect(text(a)).toBe("abchel");
  relay(a, b);
  expect(text(b)).toBe("abchel");
  caret(b, 4);
  b.view.dispatch(b.view.state.tr.insertText("X", 4));
  expect(text(b)).toBe("abcXhel");
  relay(b, a);
  expect(text(a)).toBe("abcXhel");
  caret(a, 8);
  type(a, "lo");
  expect(text(a)).toBe("abcXhello");
  expect(a.binding.undo()).toBe(true);
  expect(text(a)).toBe("abcXhel");
  expect(a.binding.undo()).toBe(true);
  expect(text(a)).toBe("abcX");
  relay(a, b);
  relay(b, a);
  expect(bareShape(b.view.state.doc)).toBe(bareShape(a.view.state.doc));
  agree(a);
  agree(b);
});

test("a composition is one undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  const compose = (ch, id) => tab.view.dispatch(tab.view.state.tr.insertText(ch).setMeta("composition", id));
  compose("x", 7);
  compose("y", 7);
  compose("z", 7);
  compose("w", 8);
  expect(text(tab)).toBe("abcxyzw");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcxyz");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});
