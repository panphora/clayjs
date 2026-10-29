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

  test("marks an empty check item with the To do placeholder", () => {
    const doc = docOf(schema.node("list_item", { id: "a", kind: "check" }));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    const found = set.find();
    expect(found).toHaveLength(1);
    expect(found[0].type.attrs["data-placeholder"]).toBe("To do");
    expect(found[0].type.attrs.class).toBe("page-check-placeholder");
    expect(found[0].from).toBe(0);
  });

  test("leaves a check item with text and a checked empty item alone", () => {
    const written = docOf(schema.node("list_item", { id: "a", kind: "check" }, [schema.text("Do it")]));
    expect(decorations(EditorState.create({ doc: written, selection: caret(written, 1) }))).toBeNull();
    const done = docOf(schema.node("list_item", { id: "b", kind: "check", checked: true }));
    expect(decorations(EditorState.create({ doc: done, selection: caret(done, 1) }))).toBeNull();
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

  test("marks the empty first root H1 with the Untitled title placeholder", () => {
    const doc = docOf(heading("a"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    const found = set.find();
    expect(found).toHaveLength(1);
    expect(found[0].type.attrs["data-placeholder"]).toBe("Untitled");
    expect(found[0].type.attrs.class).toBe("page-title-placeholder");
    expect(found[0].from).toBe(0);
  });

  test("the title placeholder shows without focus and leaves the caret block's own hint alone", () => {
    const doc = docOf(heading("h"), paragraph("p"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, heading("h").nodeSize + 1) }));
    const found = set.find();
    expect(found).toHaveLength(2);
    expect(found[0].type.attrs["data-placeholder"]).toBe("Untitled");
    expect(found[1].type.attrs["data-placeholder"]).toBe("Type / for blocks");
  });

  test("the title placeholder is only on the first root H1, and only when it is empty", () => {
    const filled = decorations(EditorState.create({ doc: docOf(heading("a", "Alpha")), selection: caret(docOf(heading("a", "Alpha")), 1) }));
    expect(filled).toBeNull();
    const later = decorations(EditorState.create({ doc: docOf(paragraph("p"), heading("b")), selection: caret(docOf(paragraph("p"), heading("b")), 1) }));
    expect(later.find()).toHaveLength(2);
    expect(later.find()[1].from).toBe(paragraph("p").nodeSize);
  });

  test("a nested empty H1 is not decorated as the title", () => {
    const nested = schema.node("heading", { id: "n", level: 1, parent: "t" }, []);
    const doc = docOf(nested);
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    expect(set).toBeNull();
  });

  test("an empty H2 is not a title placeholder", () => {
    const doc = docOf(schema.node("heading", { id: "h2", level: 2 }, []));
    expect(decorations(EditorState.create({ doc, selection: caret(doc, 1) }))).toBeNull();
  });

  test("decorates only the caret's block, not another empty paragraph", () => {
    const doc = docOf(paragraph("a"), paragraph("b"));
    const set = decorations(EditorState.create({ doc, selection: caret(doc, 1) }));
    const found = set.find();
    expect(found).toHaveLength(1);
    expect(found[0].from).toBe(0);
  });
});
