import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { editor, key, posOf, select } from "./view-helpers.js";

const { AllSelection } = pmState;

/**
 * The chrome reads the caret's block on every update. A selection that ends at
 * the end of the page used to ask for block number childCount and throw.
 */

afterEach(() => { document.body.innerHTML = ""; });

const two = () => editor([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);

test("selecting the whole page does not throw", () => {
  const view = two();
  expect(() => view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))).not.toThrow();
});

test("Mod+A twice does not throw", () => {
  const view = two();
  select(view, posOf(view, "a"));
  expect(() => { key(view, "a", { ctrlKey: true }); key(view, "a", { ctrlKey: true }); }).not.toThrow();
  expect(view.state.selection.to).toBe(view.state.doc.content.size);
});

test("with the whole page selected the toolbar names the last block's type", () => {
  const view = editor([["a", "paragraph", "A"], ["h", "heading", "H", { level: 1 }]]);
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
  expect(view.dom.parentElement.querySelector(".page-tool-turn").textContent).toBe("Heading 1 ▾");
});
