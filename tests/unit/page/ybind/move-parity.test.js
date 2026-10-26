globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import { jest } from "@jest/globals";
import { editor, posOf, select, shape } from "../view-helpers.js";
import { createStore } from "../../../../src/live/store.js";
import { createYPageBinding, seedValue } from "../../../../src/page/ybind/index.js";
import { createPageEditor } from "../../../../src/page/editor.js";
import { indentBlocks, MOVE } from "../../../../src/page/blocks.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";

beforeEach(() => { jest.spyOn(Date, "now").mockImplementation(() => 1000000); });
afterEach(() => { jest.restoreAllMocks(); });

const bound = (value) => {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board });
  binding.attach(view);
  return { binding, view, done: () => { view.destroy(); binding.dispose(); binding.ydoc.destroy(); mount.remove(); } };
};

test("indent across a toggle boundary gives the standalone blocks and parents", () => {
  const specs = [
    { id: "t", t: "toggle", text: "T", attrs: { open: true } },
    { id: "u", t: "toggle", text: "U", attrs: { parent: "t", open: true } },
    { id: "a", text: "A", attrs: { parent: "u" } },
    { id: "b", text: "B", attrs: { parent: "t" } },
    { id: "z", text: "Z" },
  ];
  const page = bound(seedValue(specs));
  const standalone = editor([], { doc: page.binding.doc() });
  try {
    for (const v of [page.view, standalone]) select(v, posOf(v, "b"), posOf(v, "z") + 1);
    indentBlocks(page.view.state, page.view.dispatch);
    indentBlocks(standalone.state, standalone.dispatch);
    expect(shape(page.view)).toBe(shape(standalone));
    expect(shape(page.view)).toBe("T | U<t | A<u | B<u | Z");
  } finally { page.done(); }
});

test("Enter in an empty last paragraph of a toggle body exits through the move port", () => {
  const page = bound(seedValue([
    { id: "t", t: "toggle", text: "T", attrs: { open: true } },
    { id: "c", text: "child", attrs: { parent: "t" } },
    { id: "e", text: "", attrs: { parent: "t" } },
  ]));
  const seen = [];
  const view = page.view;
  view.dispatch = ((dispatch) => (tr) => { seen.push(tr); dispatch(tr); })(view.dispatch);
  try {
    view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, posOf(view, "e"))));
    const start = seen.length;
    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const changed = seen.slice(start).filter((tr) => tr.docChanged);
    const parents = []; view.state.doc.forEach((n) => parents.push([n.attrs.id, n.attrs.parent ?? null]));
    expect(parents).toEqual([["t", null], ["c", "t"], ["e", null]]);
    expect(changed.filter((tr) => tr.getMeta(MOVE)).length).toBe(1);
    expect(changed[0].getMeta(MOVE)).toBeTruthy();
    expect(view.state.selection.$head.parent.attrs.id).toBe("e");
  } finally { page.done(); }
});
