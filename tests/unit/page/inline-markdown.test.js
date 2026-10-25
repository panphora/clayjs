import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { editor, key, posOf, select, typeText } from "./view-helpers.js";

/**
 * Inline shortcuts typed around text: **bold** and __bold__ to strong,
 * *italic* and _italic_ to em, `code`, ~~strike~~ and [label](address) to a
 * link. Backspace right after puts every literal character back.
 */

afterEach(() => { document.body.innerHTML = ""; });

const typeAll = (view, text) => { for (const ch of text) typeText(view, ch); };
const page = () => editor([["a", "paragraph", ""]]);
const atStart = (view) => { select(view, posOf(view, "a")); return view; };
const para = (view) => view.state.doc.child(0);
const markRange = (view, text) => [1, 1 + text.length];
const marked = (view, text, name) => view.state.doc.rangeHasMark(...markRange(view, text), schema.marks[name]);
const typed = (text) => { const view = atStart(page()); typeAll(view, text); return view; };

describe("the shortcuts", () => {
  test.each([
    ["**bold**", "bold", "strong"],
    ["__bold__", "bold", "strong"],
    ["*italic*", "italic", "em"],
    ["_italic_", "italic", "em"],
    ["`code`", "code", "code"],
    ["~~strike~~", "strike", "strike"],
  ])("%j leaves %j carrying %s", (input, text, name) => {
    const view = typed(input);
    expect(para(view).textContent).toBe(text);
    expect(marked(view, text, name)).toBe(true);
    if (name !== "strong") expect(marked(view, text, "strong")).toBe(false);
  });

  test("a bold inside a sentence converts without touching the words around it", () => {
    const view = atStart(editor([["a", "paragraph", "one three"]]));
    select(view, 1 + "one ".length);
    typeAll(view, "**two** ");
    expect(para(view).textContent).toBe("one two three");
    expect(view.state.doc.rangeHasMark(5, 8, schema.marks.strong)).toBe(true);
    expect(view.state.doc.rangeHasMark(1, 4, schema.marks.strong)).toBe(false);
  });

  test("a safe link keeps its address", () => {
    const view = typed("[label](https://example.test/x)");
    expect(para(view).textContent).toBe("label");
    const link = schema.marks.link.isInSet(para(view).child(0).marks);
    expect(link.attrs.href).toBe("https://example.test/x");
  });

  test.each(["[x](javascript:void)", "[x](data:text/html,x)", "[x]()"])("%j stays literal", (input) => {
    const view = typed(input);
    expect(para(view).textContent).toBe(input);
    expect(view.state.doc.rangeHasMark(0, view.state.doc.content.size, schema.marks.link)).toBe(false);
  });

  test("a single-character body converts", () => {
    const em = typed("*a*");
    expect(para(em).textContent).toBe("a");
    expect(marked(em, "a", "em")).toBe(true);
    const strong = typed("**a**");
    expect(para(strong).textContent).toBe("a");
    expect(marked(strong, "a", "strong")).toBe(true);
  });

  test("a marked body keeps its own mark", () => {
    const view = editor([["a", "paragraph", "word"]]);
    view.dispatch(view.state.tr.addMark(1, 5, schema.marks.em.create()));
    select(view, 1);
    typeAll(view, "**");
    select(view, 1 + "**word".length);
    typeAll(view, "**");
    expect(para(view).textContent).toBe("word");
    expect(view.state.doc.rangeHasMark(1, 5, schema.marks.strong)).toBe(true);
    expect(view.state.doc.rangeHasMark(1, 5, schema.marks.em)).toBe(true);
  });

  test("a hard break inside the body stays a hard break", () => {
    const view = atStart(page());
    typeAll(view, "**a");
    key(view, "Enter", { shiftKey: true });
    typeAll(view, "b**");
    expect(para(view).childCount).toBe(3);
    expect(para(view).child(1).type.name).toBe("hard_break");
    expect(para(view).textContent).toBe("ab");
    expect(view.state.doc.rangeHasMark(1, 4, schema.marks.strong)).toBe(true);
  });
});

describe("what stays literal", () => {
  test.each([
    ["an unfinished pair", "**bold"],
    ["a half-closed pair", "**bold*"],
    ["an empty body", "****"],
    ["a whitespace-padded body", "** **"],
    ["a leading escape", "\\**bold**"],
    ["an escaped closing delimiter", "**bold\\**"],
    ["intraword underscores", "snake_case_name"],
  ])("%s", (_name, input) => {
    const view = typed(input);
    expect(para(view).textContent).toBe(input);
    expect(view.state.doc.rangeHasMark(1, para(view).content.size, schema.marks.strong)).toBe(false);
    expect(view.state.doc.rangeHasMark(1, para(view).content.size, schema.marks.em)).toBe(false);
  });

  test("a shortcut inside a code block stays text", () => {
    const view = editor([["c", "code_block", ""]]);
    select(view, posOf(view, "c"));
    typeAll(view, "**bold**");
    expect(view.state.doc.child(0).textContent).toBe("**bold**");
  });

  test("a shortcut typed inside inline code stays text", () => {
    const view = atStart(page());
    view.dispatch(view.state.tr.addStoredMark(schema.marks.code.create()));
    typeAll(view, "**bold**");
    expect(para(view).textContent).toBe("**bold**");
    expect(view.state.doc.rangeHasMark(1, 9, schema.marks.strong)).toBe(false);
  });

  test("a shortcut before inline code stays text", () => {
    const view = editor([["a", "paragraph", "code"]]);
    view.dispatch(view.state.tr.addMark(1, 5, schema.marks.code.create()));
    select(view, 1);
    typeAll(view, "**");
    select(view, 1 + "**code".length);
    typeAll(view, "**");
    expect(para(view).textContent).toBe("**code**");
    expect(view.state.doc.rangeHasMark(1, 9, schema.marks.strong)).toBe(false);
  });
});

describe("the rest of the input path", () => {
  test("a table cell converts like any other textblock", () => {
    const view = editor([["p", "paragraph", "| Name | Owner |"]]);
    select(view, 1 + "| Name | Owner |".length);
    expect(key(view, "Enter")).toBe(true);
    expect(view.state.selection.$head.parent.type.name).toBe("table_cell");
    typeAll(view, "**bold**");
    const cell = view.state.selection.$head.parent;
    expect(cell.textContent).toBe("bold");
    expect(cell.child(0).marks.map((m) => m.type.name)).toEqual(["strong"]);
  });

  test("a whole shortcut delivered as one multi-character input converts", () => {
    const view = atStart(page());
    expect(typeText(view, "**bold**")).toBe(true);
    expect(para(view).textContent).toBe("bold");
    expect(marked(view, "bold", "strong")).toBe(true);
  });

  test("text typed during composition stays literal until the composition ends", async () => {
    const view = atStart(page());
    const setComposing = (value) => Object.defineProperty(view, "composing", { value, configurable: true });
    setComposing(true);
    typeAll(view, "**bold**");
    expect(para(view).textContent).toBe("**bold**");
    setComposing(false);
    view.dom.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(para(view).textContent).toBe("bold");
    expect(marked(view, "bold", "strong")).toBe(true);
  });
});

describe("reversibility", () => {
  test.each([
    ["**bold**"],
    ["__bold__"],
    ["*italic*"],
    ["_italic_"],
    ["`code`"],
    ["~~strike~~"],
    ["[label](https://example.test/x)"],
  ])("Backspace right after %j restores every literal character and the caret", (input) => {
    const view = typed(input);
    expect(key(view, "Backspace")).toBe(true);
    expect(para(view).textContent).toBe(input);
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.from).toBe(1 + input.length);
    expect(view.state.doc.rangeHasMark(1, 1 + input.length, schema.marks.strong)).toBe(false);
    expect(view.state.doc.rangeHasMark(1, 1 + input.length, schema.marks.em)).toBe(false);
  });

  test("Backspace after a converted body restores the delimiters around it", () => {
    const view = atStart(editor([["a", "paragraph", "one  three"]]));
    select(view, 1 + "one ".length);
    typeAll(view, "**two**");
    expect(para(view).textContent).toBe("one two three");
    key(view, "Backspace");
    expect(para(view).textContent).toBe("one **two** three");
    expect(view.state.doc.rangeHasMark(5, 8, schema.marks.strong)).toBe(false);
    expect(view.state.selection.from).toBe(1 + "one **two**".length);
  });

  test("typing after the restoration undoes separately", () => {
    const view = typed("**bold**");
    key(view, "Backspace");
    typeText(view, "!");
    expect(para(view).textContent).toBe("**bold**!");
    expect(history.undo(view.state, view.dispatch)).toBe(true);
    expect(para(view).textContent).toBe("**bold**");
    expect(history.undo(view.state, view.dispatch)).toBe(true);
    expect(para(view).textContent).toBe("bold");
    expect(para(view).child(0).marks.map((m) => m.type.name)).toEqual(["strong"]);
  });

  test("Mod-Z after a shortcut goes back to before the last typed character", () => {
    const view = typed("**bold**");
    key(view, "z", { ctrlKey: true });
    expect(para(view).textContent).toBe("**bold*");
    expect(view.state.doc.rangeHasMark(1, 9, schema.marks.strong)).toBe(false);
  });

  test("a second undo after the restoration is separate from the shortcut", () => {
    const view = typed("*a*");
    expect(history.undoDepth(view.state)).toBeGreaterThanOrEqual(1);
    key(view, "z", { ctrlKey: true });
    expect(para(view).textContent).toBe("*a");
    key(view, "z", { ctrlKey: true });
    expect(para(view).textContent).toBe("");
  });
});
