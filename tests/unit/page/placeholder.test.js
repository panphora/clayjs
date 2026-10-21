import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { placeholderPlugin } from "../../../src/page/placeholder.js";

const { EditorState, TextSelection } = pmState;

const docOf = (...nodes) => schema.node("doc", null, nodes);
const paragraph = (id, text = "") => schema.node("paragraph", { id }, text ? [schema.text(text)] : []);
const heading = (id, text = "") => schema.node("heading", { id, level: 1 }, text ? [schema.text(text)] : []);
const caret = (doc, pos) => TextSelection.create(doc, pos);
const decorations = (state) => {
  const plugin = placeholderPlugin();
  return plugin.props.decorations(state);
};

describe("the empty-line placeholder", () => {
  test("decorates an empty top-level paragraph holding the caret", () => {
    const doc = docOf(paragraph("a"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    const found = set.find();
    expect(found).toHaveLength(1);
    expect(found[0].type.attrs["data-placeholder"]).toBe("Type / for blocks");
    expect(found[0].from).toBe(0);
  });

  test("leaves a paragraph with text alone", () => {
    const doc = docOf(paragraph("a", "Alpha"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    expect(set).toBeNull();
  });

  test("leaves a non-empty selection alone", () => {
    const doc = docOf(paragraph("a", "Alpha"));
    const set = decorations(EditorState.create({ doc, selection: TextSelection.create(doc, 1, 2) }));
    expect(set).toBeNull();
  });

  test("leaves an empty heading alone", () => {
    const doc = docOf(heading("a"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    expect(set).toBeNull();
  });

  test("decorates only the caret's block, not another empty paragraph", () => {
    const doc = docOf(paragraph("a"), paragraph("b"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    const found = set.find();
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe(0);
  });
});
