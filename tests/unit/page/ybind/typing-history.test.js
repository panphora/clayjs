globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { jest } from "@jest/globals";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, createPageDoc, docOf, walk, bareShape, migrateHybridValues } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { historyIntentPlugin } from "../../../../src/page/history-intent.js";
import { asStep } from "../../../../src/page/blocksel.js";
import { tablePlugin } from "../../../../src/page/table.js";
import { chromePlugin } from "../../../../src/page/chrome.js";

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

const announce = (tab, inputType) => {
  const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
  if (event.inputType !== inputType) Object.defineProperty(event, "inputType", { value: inputType });
  tab.view.dom.dispatchEvent(event);
};

const backspace = (tab) => {
  announce(tab, "deleteContentBackward");
  const at = tab.view.state.selection.from;
  tab.view.dispatch(tab.view.state.tr.delete(at - 1, at));
};

const forwardDelete = (tab) => {
  announce(tab, "deleteContentForward");
  const at = tab.view.state.selection.from;
  tab.view.dispatch(tab.view.state.tr.delete(at, at + 1));
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
  caret(b, 5);
  b.view.dispatch(b.view.state.tr.insertText("X", 5));
  expect(text(b)).toBe("abchXel");
  relay(b, a);
  expect(text(a)).toBe("abchXel");
  caret(a, 8);
  type(a, "lo");
  expect(text(a)).toBe("abchXello");
  expect(a.binding.undo()).toBe(true);
  expect(text(a)).toBe("abchXel");
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

test("a run of Backspace undoes as one item", () => {
  const tab = open(seedValue([{ id: "p", text: "abcdef" }]), typing);
  caret(tab, 7);
  for (let i = 0; i < 5; i++) backspace(tab);
  expect(text(tab)).toBe("a");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcdef");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("Backspace then forward Delete are two undo items", () => {
  const tab = open(seedValue([{ id: "p", text: "abcdef" }]), typing);
  caret(tab, 4);
  backspace(tab);
  forwardDelete(tab);
  expect(text(tab)).toBe("abef");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abdef");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcdef");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a deletion dispatched in a later task is its own undo item", async () => {
  const tab = open(seedValue([{ id: "p", text: "abcd" }]), typing);
  caret(tab, 5);
  backspace(tab);
  announce(tab, "deleteContentBackward");
  await new Promise((r) => setTimeout(r, 0));
  const at = tab.view.state.selection.from;
  tab.view.dispatch(asStep(tab.view.state.tr.delete(at - 1, at)));
  expect(text(tab)).toBe("ab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcd");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a Backspace that joins two blocks is its own undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abcd" }, { id: "q", text: "ef" }]), typing);
  caret(tab, 5);
  backspace(tab);
  backspace(tab);
  expect(textOf(tab, "p")).toBe("ab");
  caret(tab, tab.view.state.doc.child(0).nodeSize + 1);
  announce(tab, "deleteContentBackward");
  commands.joinBackward(tab.view.state, tab.view.dispatch);
  expect(ids(tab)).toEqual(["p"]);
  expect(textOf(tab, "p")).toBe("abef");
  expect(tab.binding.undo()).toBe(true);
  expect(ids(tab)).toEqual(["p", "q"]);
  expect(textOf(tab, "p")).toBe("ab");
  expect(textOf(tab, "q")).toBe("ef");
  expect(tab.binding.undo()).toBe(true);
  expect(textOf(tab, "p")).toBe("abcd");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a composition through the real input path is one undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  const compose = (from, to, ch) => {
    const deflt = () => tab.view.state.tr.insertText(ch, from, to).setMeta("composition", 7);
    tab.view.someProp("handleTextInput", (f) => f(tab.view, from, to, ch, deflt));
  };
  compose(4, 4, "n");
  expect(text(tab)).toBe("abcn");
  compose(4, 5, "に");
  expect(text(tab)).toBe("abcに");
  compose(4, 5, "日本");
  expect(text(tab)).toBe("abc日本");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("two compositions are two undo items", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  const compose = (ch, id) => {
    const { from, to } = tab.view.state.selection;
    const deflt = () => tab.view.state.tr.insertText(ch, from, to).setMeta("composition", id);
    tab.view.someProp("handleTextInput", (f) => f(tab.view, from, to, ch, deflt));
  };
  compose("x", 7);
  compose("y", 7);
  compose("z", 8);
  expect(text(tab)).toBe("abcxyz");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcxy");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("typing over a selection never joins the run before it", () => {
  const tab = open(seedValue([{ id: "p", text: "abcd" }]), typing);
  caret(tab, 4);
  type(tab, "xy");
  expect(text(tab)).toBe("abcxyd");
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, 6, 7)));
  type(tab, "Z");
  expect(text(tab)).toBe("abcxyZ");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcxyd");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcd");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a caret move away and back ends a run", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  type(tab, "ab");
  caret(tab, 1);
  caret(tab, 6);
  type(tab, "cd");
  expect(text(tab)).toBe("abcabcd");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcab");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("typing under a different link is a new undo item", () => {
  const tab = open(seedValue([{ id: "p", text: "abc" }]), typing);
  caret(tab, 4);
  tab.view.dispatch(tab.view.state.tr.setStoredMarks([schema.marks.link.create({ href: "https://one.example" })]));
  type(tab, "x");
  tab.view.dispatch(tab.view.state.tr.setStoredMarks([schema.marks.link.create({ href: "https://two.example" })]));
  type(tab, "y");
  expect(text(tab)).toBe("abcxy");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcx");
  agree(tab);
});

test("a Backspace whose DOM change flushes 20 ms late still groups", () => {
  const tab = open(seedValue([{ id: "p", text: "abcdef" }]), typing);
  caret(tab, 7);
  for (let i = 0; i < 3; i++) {
    announce(tab, "deleteContentBackward");
    clock += 20;
    const at = tab.view.state.selection.from;
    tab.view.dispatch(tab.view.state.tr.delete(at - 1, at));
  }
  expect(text(tab)).toBe("abc");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcdef");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a stale Backspace announcement does not reach a command", () => {
  const tab = open(seedValue([{ id: "p", text: "abcdef" }]), typing);
  caret(tab, 4);
  announce(tab, "deleteContentBackward");
  tab.view.dispatch(asStep(tab.view.state.tr.delete(5, 6)));
  expect(text(tab)).toBe("abcdf");
  backspace(tab);
  expect(text(tab)).toBe("abdf");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcdf");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("abcdef");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("typing in a sorted table column groups normally", () => {
  const value = migrateHybridValues([{
    blocks: {
      tbl: {
        t: "table", pos: "A", sort: { col: "c1", dir: "asc" },
        cols: { c1: { pos: "1", name: "Name" } },
        rows: { r1: { pos: "1", cells: { c1: "" } }, r2: { pos: "2", cells: { c1: "" } } },
      },
    },
  }]);
  const tab = open(value, { plugins: [historyIntentPlugin(), tablePlugin()] });
  let cell = null;
  tab.view.state.doc.descendants((node, pos) => { if (cell === null && node.type.name === "table_cell") cell = pos + 1; });
  caret(tab, cell);
  type(tab, "abc");
  expect(tab.view.state.doc.firstChild.attrs.sort).toBe(null);
  expect(tab.view.state.doc.textBetween(cell, cell + 3)).toBe("abc");
  expect(tab.binding.undo()).toBe(true);
  expect(tab.view.state.doc.textBetween(cell, cell + 3)).toBe("");
  expect(tab.binding.undo()).toBe(false);
  agree(tab);
});

test("a / joins the query typed after it, so one undo removes both", () => {
  const tab = open(seedValue([{ id: "p", text: "see " }]), { plugins: [chromePlugin(), historyIntentPlugin()] });
  tab.view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  caret(tab, 5);
  type(tab, "/docs");
  expect(text(tab)).toBe("see /docs");
  expect(tab.binding.undo()).toBe(true);
  expect(text(tab)).toBe("see ");
  agree(tab);
});
