import { createPageEditor, pageState } from "../../../src/page/editor.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;
const historyState = (state) => state.plugins.find((p) => String(p.key).startsWith("history$"))?.getState(state);

/**
 * The editor ports: absent options keep standalone editing exactly as before,
 * and when a `dispatch` is supplied it alone owns applying transactions.
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

test("standalone editing still applies transactions to the view itself", () => {
  const view = createPageEditor(mount(), { blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } } });
  caretIn(view, "p", 2);
  const before = view.state.doc;
  view.dispatch(view.state.tr.insertText("!"));
  expect(view.state.doc).not.toBe(before);
  expect(view.state.doc.textContent).toBe("Hi!");
});

test("the history plugin state is present by default and absent with history:false", () => {
  const blocks = { p: { t: "paragraph", pos: "V", c: "Hi" } };
  expect(historyState(pageState(blocks))).toBeTruthy();
  expect(historyState(pageState(blocks, { history: false }))).toBeFalsy();
});

test("pageState starts from options.doc when supplied", () => {
  const source = pageState({ p: { t: "paragraph", pos: "V", c: "Hi" } });
  const state = pageState(null, { doc: source.doc });
  expect(state.doc).toBe(source.doc);
});

test("a port dispatch receives exactly one transaction and leaves the view state alone until the owner applies it", () => {
  const trs = [];
  const view = createPageEditor(mount(), {
    blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } },
    dispatch: (tr) => trs.push(tr),
    history: false,
  });
  const before = view.state.doc;
  view.dispatch(view.state.tr.insertText("?"));
  expect(trs.length).toBe(1);
  expect(view.state.doc).toBe(before);
  expect(view.state.doc.textContent).toBe("Hi");
  expect(trs[0].doc.textContent).toBe("?Hi");
  view.updateState(view.state.apply(trs[0]));
  expect(view.state.doc.textContent).toBe("?Hi");
});

test("with history disabled the undo and redo shortcuts call their ports exactly once each", () => {
  const calls = { undo: 0, redo: 0 };
  const view = createPageEditor(mount(), {
    blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } },
    history: false,
    undo: () => calls.undo++,
    redo: () => calls.redo++,
  });
  expect(key(view, "z", { ctrlKey: true })).toBe(true);
  expect(calls).toEqual({ undo: 1, redo: 0 });
  expect(key(view, "z", { ctrlKey: true, shiftKey: true })).toBe(true);
  expect(calls).toEqual({ undo: 1, redo: 1 });
  expect(key(view, "y", { ctrlKey: true })).toBe(true);
  expect(calls).toEqual({ undo: 1, redo: 2 });
});
