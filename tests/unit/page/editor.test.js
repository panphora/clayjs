import { createPageEditor, pageState, PAGE_EDITOR_CSS } from "../../../src/page/editor.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;

/**
 * The page editor wired together: blocks.js's keymap runs before the base
 * keymap, the record reaches onChange, and the functional CSS is injected once.
 */

const mount = () => document.body.appendChild(document.createElement("div"));
const key = (view, k, opts = {}) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts });
  view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};
const caretIn = (view, id, off = 0) => {
  let p = null;
  view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + 1 + off; });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p)));
};

afterEach(() => { document.body.innerHTML = ""; document.head.innerHTML = ""; });

test("mounts with the page-editor class and injects the CSS once", () => {
  const a = createPageEditor(mount(), { blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } } });
  createPageEditor(mount());
  expect(a.dom.classList.contains("page-editor")).toBe(true);
  const styles = document.querySelectorAll("#page-editor-style");
  expect(styles.length).toBe(1);
  expect(styles[0].textContent).toBe(PAGE_EDITOR_CSS);
});

test("an empty record starts as one empty paragraph", () => {
  const s = pageState(null);
  expect(s.doc.childCount).toBe(1);
  expect(s.doc.child(0).type.name).toBe("paragraph");
});

test("onChange gets the block record after a document change, not after a selection change", () => {
  const seen = [];
  const view = createPageEditor(mount(), { blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } }, onChange: (r) => seen.push(r) });
  caretIn(view, "p", 2);
  expect(seen.length).toBe(0);
  view.dispatch(view.state.tr.insertText("!"));
  expect(seen.length).toBe(1);
  expect(seen[0].p.c).toBe("Hi!");
});

test("Tab goes to blocks.js before the base keymap", () => {
  const view = createPageEditor(mount(), { blocks: { a: { t: "list_item", pos: "V", c: "A" }, b: { t: "list_item", pos: "W", c: "B" } } });
  caretIn(view, "b");
  expect(key(view, "Tab")).toBe(true);
  expect(view.state.doc.child(1).attrs.indent).toBe(1);
  expect(key(view, "Tab", { shiftKey: true })).toBe(true);
  expect(view.state.doc.child(1).attrs.indent).toBe(0);
});

test("Shift-Enter inserts a hard break inside a list item", () => {
  const view = createPageEditor(mount(), { blocks: { a: { t: "list_item", pos: "V", c: "AB" } } });
  caretIn(view, "a", 1);
  key(view, "Enter", { shiftKey: true });
  expect(view.state.doc.childCount).toBe(1);
  expect(view.state.doc.child(0).child(1).type.name).toBe("hard_break");
});

test("Enter on an empty nested item outdents through the wired keymap", () => {
  const view = createPageEditor(mount(), { blocks: { a: { t: "list_item", pos: "V", c: "A" }, e: { t: "list_item", pos: "W", c: "", indent: 1 } } });
  caretIn(view, "e");
  key(view, "Enter");
  expect(view.state.doc.child(1).attrs.indent).toBe(0);
});
