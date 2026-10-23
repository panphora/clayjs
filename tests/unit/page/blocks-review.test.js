import { createPageEditor as makePageEditor, pageState } from "../../../src/page/editor.js";
import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { blockMap } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";

import { trackView } from "./view-helpers.js";
const createPageEditor = (...args) => trackView(makePageEditor(...args));
const { TextSelection } = pmState;
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

/**
 * Regressions from the S3 code review: each case was reproduced by running it
 * against the full plugin stack before the fix.
 */

const blocks = (spec) => {
  const out = {};
  spec.forEach(([id, t, c, attrs = {}], i) => { out[id] = { t, pos: String.fromCharCode(66 + i), c, ...attrs }; });
  return out;
};
const editor = (spec) => createPageEditor(document.body.appendChild(document.createElement("div")), { blocks: blocks(spec) });
const posOf = (view, id, end = false) => {
  let p = null;
  view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = end ? o + n.nodeSize - 1 : o + 1; });
  return p;
};
const select = (view, from, to = from) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
const key = (view, k, opts = {}) => view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: k, ...opts })));
const shape = (view) => { const r = []; view.state.doc.forEach((n) => r.push(`${n.textContent}${n.attrs.parent ? "<" + n.attrs.parent : ""}`)); return r.join(" | "); };
const ids = (view) => { const r = []; view.state.doc.forEach((n) => r.push(n.attrs.id)); return r; };

test("Delete at the end of a closed summary with nothing visible after it keeps the hidden body", () => {
  const view = editor([["t", "toggle", "Title", { open: false }], ["h", "paragraph", "hidden", { parent: "t" }]]);
  select(view, posOf(view, "t", true));
  key(view, "Delete");
  expect(shape(view)).toBe("Title | hidden<t");
});

test("Shift+Right from an empty closed summary, then Backspace, keeps the toggle and its body", () => {
  const view = editor([["t", "toggle", "", { open: false }], ["h", "paragraph", "hidden", { parent: "t" }], ["z", "paragraph", "Zed"]]);
  select(view, posOf(view, "t", true), posOf(view, "z") + 1);
  expect(view.state.selection.from).toBe(posOf(view, "z"));
  key(view, "Backspace");
  expect(ids(view).slice(0, 2)).toEqual(["t", "h"]);
});

test("a partial selection after text typed at the summary start still cannot delete the hidden body alone", () => {
  const view = editor([["t", "toggle", "Summary", { open: false }], ["h", "paragraph", "hidden", { parent: "t" }], ["z", "paragraph", "Zed"]]);
  view.dispatch(view.state.tr.insertText("XXX", posOf(view, "t")));
  select(view, posOf(view, "t") + 1, posOf(view, "z") + 1);
  expect(view.state.selection.from).toBe(posOf(view, "t"));
});

test("copying a toggle with its body and pasting it keeps the body inside the new toggle", () => {
  const src = editor([["t", "toggle", "Title", { open: false }], ["h", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "after"]]);
  select(src, posOf(src, "t"), posOf(src, "z"));
  const copied = src.serializeForClipboard(src.state.selection.content());
  const dst = editor([["e", "paragraph", ""]]);
  select(dst, posOf(dst, "e"));
  dst.pasteHTML(copied.dom.innerHTML);
  const toggle = [];
  dst.state.doc.forEach((n) => toggle.push(n));
  const t = toggle.find((n) => n.type.name === "toggle");
  const body = toggle.find((n) => n.textContent === "body");
  expect(t.attrs.id).not.toBe("t");
  expect(body.attrs.parent).toBe(t.attrs.id);
});

test("a <details> pasted mid-paragraph keeps the paragraph's tail outside the toggle", () => {
  const view = editor([["p", "paragraph", "Intro"]]);
  select(view, posOf(view, "p") + 2);
  view.pasteHTML("<details><summary>New toggle</summary><p>First</p><p>Last</p></details>");
  const texts = [];
  view.state.doc.forEach((n) => texts.push([n.textContent, n.attrs.parent === null]));
  expect(texts.map((t) => t[0])).toEqual(["In", "New toggle", "First", "Last", "tro"]);
  expect(texts[4][1]).toBe(true);
});

test("Tab between two runs of typing is its own undo step", () => {
  const view = editor([["a", "list_item", "A"], ["b", "list_item", "B"]]);
  select(view, posOf(view, "b", true));
  view.dispatch(view.state.tr.insertText("x").setTime(10000));
  key(view, "Tab");
  view.dispatch(view.state.tr.insertText("y").setTime(10020));
  expect(history.undoDepth(view.state)).toBe(3);
  history.undo(view.state, view.dispatch);
  expect(view.state.doc.child(1).textContent).toBe("Bx");
  expect(view.state.doc.child(1).attrs.indent).toBe(1);
});

test("Enter at the end of the last body paragraph makes a new paragraph in the same body", () => {
  const view = editor([["o", "toggle", "outer", { open: true }], ["b", "paragraph", "body", { parent: "o" }], ["z", "paragraph", "after"]]);
  select(view, posOf(view, "b", true));
  key(view, "Enter");
  expect(shape(view)).toBe("outer | body<o | <o | after");
  key(view, "Enter");
  expect(shape(view)).toBe("outer | body<o |  | after");
});

test("Backspace at the start of a body block after a nested closed toggle joins it to that summary, like a root paragraph", () => {
  const view = editor([
    ["o", "toggle", "outer", { open: true }],
    ["t", "toggle", "inner", { open: false, parent: "o" }],
    ["h", "paragraph", "hidden", { parent: "t" }],
    ["b", "paragraph", "body", { parent: "o" }],
    ["z", "paragraph", "after"],
  ]);
  select(view, posOf(view, "b"));
  key(view, "Backspace");
  expect(shape(view)).toBe("outer | innerbody<o | hidden<t | after");
});

test("Backspace at the start of a root paragraph after a closed toggle still joins it to the summary", () => {
  const view = editor([["t", "toggle", "inner", { open: false }], ["h", "paragraph", "hidden", { parent: "t" }], ["z", "paragraph", "after"]]);
  select(view, posOf(view, "z"));
  key(view, "Backspace");
  expect(shape(view)).toBe("innerafter | hidden<t");
});

test("the record round-trips through blockMap after the fixes", () => {
  const view = editor([["o", "toggle", "outer", { open: true }], ["b", "paragraph", "body", { parent: "o" }]]);
  expect(Object.keys(blockMap(view.state.doc)).sort()).toEqual(["b", "o"]);
  expect(schema.nodes.toggle).toBeDefined();
  expect(pageState(null).doc.childCount).toBe(1);
});

test("Shift+Left from below a closed toggle extends the selection over the whole toggle", () => {
  const view = editor([["p", "paragraph", "Para"], ["t", "toggle", "Summary", { open: false }], ["b", "paragraph", "hidden", { parent: "t" }], ["z", "paragraph", "Visible"]]);
  select(view, posOf(view, "z") + 3, posOf(view, "z"));
  view.endOfTextblock = () => true;
  key(view, "ArrowLeft", { shiftKey: true });
  expect([view.state.selection.anchor, view.state.selection.head]).toEqual([posOf(view, "z") + 3, posOf(view, "t")]);
});

test("Shift, Mod and Alt+Backspace below a closed toggle join into the summary, never the hidden body", () => {
  for (const mods of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }]) {
    const view = editor([["t", "toggle", "Summary", { open: false }], ["b", "paragraph", "hidden", { parent: "t" }], ["z", "paragraph", "Visible"]]);
    select(view, posOf(view, "z"));
    key(view, "Backspace", mods);
    expect(shape(view)).toBe("SummaryVisible | hidden<t");
  }
});

test("Enter over a selection in a closed summary leaves the hidden body whole", () => {
  const view = editor([["t", "toggle", "Notes", { open: false }], ["b1", "paragraph", "body one", { parent: "t" }], ["b2", "paragraph", "body two", { parent: "t" }], ["z", "paragraph", "Z"]]);
  select(view, posOf(view, "t") + 1, posOf(view, "t") + 3);
  key(view, "Enter");
  expect(shape(view)).toBe("N | body one<t | body two<t | es | Z");
});

test("three paragraphs pasted at the end of an open summary join the body, and the body stays in the toggle", () => {
  const view = editor([["t", "toggle", "Notes", { open: true }], ["b1", "paragraph", "body1", { parent: "t" }], ["b2", "paragraph", "body2", { parent: "t" }], ["z", "paragraph", "Z"]]);
  select(view, posOf(view, "t", true));
  view.pasteHTML("<p>one</p><p>two</p><p>three</p>");
  const r = [];
  view.state.doc.forEach((n) => r.push([n.textContent, n.attrs.parent === "t"]));
  expect(r.filter(([t]) => t === "body1" || t === "body2").every(([, inT]) => inT)).toBe(true);
  expect(r[r.length - 1]).toEqual(["Z", false]);
});

test("several blocks pasted into a closed summary open the toggle", () => {
  const view = editor([["t", "toggle", "Notes", { open: false }], ["b1", "paragraph", "body1", { parent: "t" }], ["z", "paragraph", "Z"]]);
  select(view, posOf(view, "t", true));
  view.pasteHTML("<p>one</p><p>two</p>");
  expect(view.state.doc.child(0).attrs.open).toBe(true);
});

test("a sentence with a link pasted into a paragraph stays one line", () => {
  const view = editor([["p", "paragraph", "Intro: "]]);
  select(view, posOf(view, "p", true));
  view.pasteHTML('Read the <a href="https://example.com">docs</a> first.');
  expect(view.state.doc.childCount).toBe(1);
  expect(view.state.doc.child(0).textContent).toBe("Intro: Read the docs first.");
});

test("Tab stops at indent 8", () => {
  const spec = [...Array(10)].map((_, i) => [`l${i}`, "list_item", `L${i}`, { indent: Math.min(i, 8) }]);
  const view = editor(spec);
  select(view, posOf(view, "l9"));
  key(view, "Tab");
  expect(view.state.doc.child(9).attrs.indent).toBe(8);
});

test("two empty pages get different first block ids", () => {
  expect(pageState(null).doc.child(0).attrs.id).not.toBe(pageState(null).doc.child(0).attrs.id);
});
