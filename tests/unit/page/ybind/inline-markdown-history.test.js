globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { jest } from "@jest/globals";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageEditor } from "../../../../src/page/editor.js";
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

let clock = 0;
beforeEach(() => {
  clock = 1000000;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => { jest.restoreAllMocks(); });

function open(value, from = value) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
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
  const tab = { store, binding, view, mount };
  opened.push(tab);
  return tab;
}

const text = (tab) => tab.view.state.doc.child(0).textContent;
const caret = (tab, pos) => tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, pos)));
const type = (tab, chars) => {
  for (const ch of chars) {
    const { from, to } = tab.view.state.selection;
    tab.view.someProp("handleTextInput", (f) => f(tab.view, from, to, ch, () => tab.view.state.tr.insertText(ch, from, to)));
  }
};
const keyOn = (tab, k, opts = {}) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts });
  tab.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};
const has = (tab, markName, length) => tab.view.state.doc.child(0).rangeHasMark(0, length, schema.marks[markName]);
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

test.each([
  ["**bold**", "bold", "strong"],
  ["__bold__", "bold", "strong"],
  ["*italic*", "italic", "em"],
  ["_italic_", "italic", "em"],
  ["`code`", "code", "code"],
  ["~~strike~~", "strike", "strike"],
])("%j typed through the binding leaves %j carrying %s", (input, body, markName) => {
  const tab = open(seedValue([{ id: "p", text: "" }]));
  caret(tab, 1);
  type(tab, input);
  expect(text(tab)).toBe(body);
  expect(has(tab, markName, body.length)).toBe(true);
  agree(tab);
});

test("a link typed through the binding keeps its address and agrees", () => {
  const tab = open(seedValue([{ id: "p", text: "" }]));
  caret(tab, 1);
  type(tab, "[label](https://example.test/x)");
  expect(text(tab)).toBe("label");
  const link = schema.marks.link.isInSet(tab.view.state.doc.child(0).child(0).marks);
  expect(link.attrs.href).toBe("https://example.test/x");
  agree(tab);
});

test("Backspace right after the shortcut restores every literal character and the caret", () => {
  const tab = open(seedValue([{ id: "p", text: "" }]));
  caret(tab, 1);
  type(tab, "**bold**");
  expect(text(tab)).toBe("bold");
  expect(keyOn(tab, "Backspace")).toBe(true);
  expect(text(tab)).toBe("**bold**");
  expect(tab.view.state.selection.from).toBe(1 + "**bold**".length);
  expect(has(tab, "strong", "**bold**".length)).toBe(false);
  agree(tab);
});

test("typing after the restoration undoes separately", () => {
  const tab = open(seedValue([{ id: "p", text: "" }]));
  caret(tab, 1);
  type(tab, "**bold**");
  keyOn(tab, "Backspace");
  type(tab, "!");
  expect(text(tab)).toBe("**bold**!");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("**bold**");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("bold");
  expect(has(tab, "strong", 4)).toBe(true);
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("**bold*");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("Mod-Z on the canvas goes back to before the last typed character", () => {
  const tab = open(seedValue([{ id: "p", text: "" }]));
  caret(tab, 1);
  type(tab, "**bold**");
  expect(keyOn(tab, "z", { ctrlKey: true })).toBe(true);
  expect(text(tab)).toBe("**bold*");
  expect(has(tab, "strong", text(tab).length)).toBe(false);
  agree(tab);
});

test("a peer's text survives when one peer undoes the shortcut", () => {
  const value = seedValue([{ id: "p", text: "abc" }]);
  const a = open(value), b = open(value);
  caret(a, 4);
  type(a, " **bold**");
  expect(text(a)).toBe("abc bold");
  relay(a, b);
  let end = b.view.state.doc.child(0).nodeSize - 1;
  caret(b, end);
  type(b, " plus");
  expect(text(b)).toBe("abc bold plus");
  relay(b, a);
  expect(text(a)).toBe("abc bold plus");
  expect(a.binding.undo()).toBe(true);
  expect(text(a)).toBe("abc **bold* plus");
  expect(has(a, "strong", text(a).length)).toBe(false);
  relay(a, b);
  relay(b, a);
  expect(bareShape(b.view.state.doc)).toBe(bareShape(a.view.state.doc));
  agree(a);
  agree(b);
});
