globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import { jest } from "@jest/globals";
import { createStore } from "../../../../src/live/store.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageEditor } from "../../../../src/page/editor.js";
import { createYPageBinding, seedValue } from "../../../../src/page/ybind/index.js";

let clock = 0;
beforeEach(() => { clock = 1000000; jest.spyOn(Date, "now").mockImplementation(() => clock); });
afterEach(() => { jest.restoreAllMocks(); });

function open(value) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board });
  binding.attach(view);
  return { store, binding, view, mount };
}
const caretIn = (tab, id, offset) => {
  let at = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1 + offset; });
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
};
const type = (tab, chars) => {
  for (const ch of chars) {
    const { from, to } = tab.view.state.selection;
    tab.view.someProp("handleTextInput", (f) => f(tab.view, from, to, ch, () => tab.view.state.tr.insertText(ch, from, to))) || tab.view.dispatch(tab.view.state.tr.insertText(ch, from, to));
  }
};
const keyOn = (tab, k, opts = {}) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts });
  tab.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};
const dump = (tab) => { const out = []; tab.view.state.doc.forEach((n) => out.push(`${n.attrs.id}:${n.attrs.indent ?? ""}:${n.attrs.parent ?? ""}:${n.textContent}`)); return out; };

test("type, Tab, keep typing in a list (full bound editor)", () => {
  const tab = open(seedValue([
    { id: "l1", t: "list_item", text: "one" },
    { id: "l2", t: "list_item", text: "tw" },
    { id: "l3", t: "list_item", text: "three" },
  ]));
  caretIn(tab, "l2", 2);
  type(tab, "o");
  keyOn(tab, "Tab");
  type(tab, " more");
  expect(dump(tab)).toEqual(["l1:0::one", "l2:1::two more", "l3:0::three"]);
});

test("Enter on an empty nested list item outdents and keeps the caret there", () => {
  const tab = open(seedValue([
    { id: "l1", t: "list_item", text: "one" },
    { id: "l2", t: "list_item", text: "", attrs: { indent: 1 } },
    { id: "l3", t: "list_item", text: "three" },
  ]));
  caretIn(tab, "l2", 0);
  keyOn(tab, "Enter");
  type(tab, "X");
  expect(dump(tab)).toEqual(["l1:0::one", "l2:0::X", "l3:0::three"]);
});

test("Tab on a paragraph after a toggle, then type (full bound editor)", () => {
  const tab = open(seedValue([
    { id: "t", t: "toggle", text: "T", attrs: { open: true } },
    { id: "p", text: "para" },
    { id: "z", text: "zed" },
  ]));
  caretIn(tab, "p", 2);
  keyOn(tab, "Tab");
  type(tab, "Q");
  expect(dump(tab)).toEqual(["t:::T", "p::t:paQra", "z:::zed"]);
});

test("Backspace at the start of a nested list item outdents and keeps the caret", () => {
  const tab = open(seedValue([
    { id: "l1", t: "list_item", text: "one" },
    { id: "l2", t: "list_item", text: "two", attrs: { indent: 1 } },
    { id: "l3", t: "list_item", text: "three" },
  ]));
  caretIn(tab, "l2", 0);
  keyOn(tab, "Backspace");
  type(tab, "X");
  expect(dump(tab)).toEqual(["l1:0::one", "l2:0::Xtwo", "l3:0::three"]);
});

test("Move down (Mod-Shift-ArrowDown) of a toggle's last child steps it out and keeps the caret", () => {
  const tab = open(seedValue([
    { id: "t", t: "toggle", text: "T", attrs: { open: true } },
    { id: "c1", text: "one", attrs: { parent: "t" } },
    { id: "c2", text: "two", attrs: { parent: "t" } },
    { id: "z", text: "zed" },
  ]));
  caretIn(tab, "c2", 1);
  keyOn(tab, "ArrowDown", { ctrlKey: true, shiftKey: true });
  type(tab, "Q");
  expect(dump(tab)).toEqual(["t:::T", "c1::t:one", "c2:::tQwo", "z:::zed"]);
});
