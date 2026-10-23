import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { editor, key, posOf, select, typeText, shape } from "./view-helpers.js";

const { TextSelection } = pmState;

/**
 * Markdown shortcuts typed at the start of a block: each retypes it in place
 * (id, pos and parent kept), and Backspace right after puts the typed text back.
 */

afterEach(() => { document.body.innerHTML = ""; });

const typeAll = (view, text) => { for (const ch of text) typeText(view, ch); };
const page = () => editor([["a", "paragraph", "Alpha"], ["p", "paragraph", ""], ["z", "paragraph", "Zed"]]);
const atEmpty = (view) => { select(view, posOf(view, "p")); return view; };
const block = (view, id) => { let found = null; view.state.doc.forEach((n) => { if (n.attrs.id === id) found = n; }); return found; };

describe("block shortcuts", () => {
  test.each([
    ["# ", "heading", { level: 1 }],
    ["## ", "heading", { level: 2 }],
    ["### ", "heading", { level: 3 }],
    ["- ", "list_item", { kind: "bullet" }],
    ["* ", "list_item", { kind: "bullet" }],
    ["+ ", "list_item", { kind: "bullet" }],
    ["1. ", "list_item", { kind: "ordered" }],
    ["7) ", "list_item", { kind: "ordered" }],
    ["[] ", "list_item", { kind: "check", checked: false }],
    ["[ ] ", "list_item", { kind: "check", checked: false }],
    ["[x] ", "list_item", { kind: "check", checked: true }],
    ["> ", "toggle", { open: true }],
    ["```", "code_block", {}],
  ])("%j retypes the empty paragraph to %s", (typed, type, attrs) => {
    const view = atEmpty(page());
    const before = block(view, "p").attrs;
    typeAll(view, typed);
    const out = block(view, "p");
    expect(out.type.name).toBe(type);
    expect(out.textContent).toBe("");
    expect([out.attrs.id, out.attrs.pos, out.attrs.parent]).toEqual([before.id, before.pos, before.parent]);
    for (const [k, v] of Object.entries(attrs)) expect(out.attrs[k]).toBe(v);
    expect(view.state.doc.childCount).toBe(3);
  });

  test("a paragraph with text after the caret keeps the text", () => {
    const view = editor([["a", "paragraph", "Alpha"]]);
    select(view, posOf(view, "a"));
    typeAll(view, "## ");
    expect(view.state.doc.child(0).type.name).toBe("heading");
    expect(view.state.doc.child(0).textContent).toBe("Alpha");
  });

  test("a shortcut keeps the block's parent inside a toggle body", () => {
    const view = editor([["t", "toggle", "T", { open: true }], ["b", "paragraph", "", { parent: "t" }]]);
    select(view, posOf(view, "b"));
    typeAll(view, "- ");
    const out = block(view, "b");
    expect([out.type.name, out.attrs.parent, out.attrs.indent]).toEqual(["list_item", "t", 0]);
  });

  test("a shortcut in a nested bullet keeps the indent", () => {
    const view = editor([["a", "list_item", "A"], ["b", "list_item", "", { indent: 1 }]]);
    select(view, posOf(view, "b"));
    typeAll(view, "[] ");
    const out = block(view, "b");
    expect([out.attrs.kind, out.attrs.indent]).toEqual(["check", 1]);
  });

  test("a shortcut mid-line stays text", () => {
    const view = editor([["a", "paragraph", ""]]);
    select(view, posOf(view, "a"));
    typeAll(view, "a# ");
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("a# ");
  });

  test("a shortcut never fires in a code block", () => {
    const view = editor([["c", "code_block", ""]]);
    select(view, posOf(view, "c"));
    typeAll(view, "# ");
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).textContent).toBe("# ");
  });

  test("a shortcut typed in inline code stays literal", () => {
    const view = editor([["a", "paragraph", ""]]);
    select(view, posOf(view, "a"));
    view.dispatch(view.state.tr.addStoredMark(schema.marks.code.create()));
    typeAll(view, "# ");
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("# ");
  });
});

describe("the divider", () => {
  test("--- makes a divider that keeps the paragraph's id and pos, with a new paragraph holding the caret", () => {
    const view = atEmpty(page());
    const before = block(view, "p").attrs;
    typeAll(view, "---");
    expect(view.state.doc.childCount).toBe(4);
    const [div, para, next] = [view.state.doc.child(1), view.state.doc.child(2), view.state.doc.child(3)];
    expect([div.type.name, div.attrs.id, div.attrs.pos]).toEqual(["divider", before.id, before.pos]);
    expect(para.type.name).toBe("paragraph");
    expect(para.attrs.id).toBeTruthy();
    expect(para.attrs.id).not.toBe(before.id);
    expect(para.attrs.pos > before.pos && para.attrs.pos < next.attrs.pos).toBe(true);
    expect(view.state.selection.$head.parent).toBe(para);
  });

  test("--- after other text stays text", () => {
    const view = editor([["a", "paragraph", "x"]]);
    select(view, posOf(view, "a", true));
    typeAll(view, "---");
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).textContent).toBe("x---");
  });

  test("--- in a code block stays text", () => {
    const view = editor([["c", "code_block", ""]]);
    select(view, posOf(view, "c"));
    typeAll(view, "---");
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).textContent).toBe("---");
  });

  test("Backspace right after it restores --- , the original id, and no leftover paragraph", () => {
    const view = atEmpty(page());
    const before = block(view, "p").attrs;
    typeAll(view, "---");
    key(view, "Backspace");
    expect(view.state.doc.childCount).toBe(3);
    const back = view.state.doc.child(1);
    expect([back.type.name, back.textContent, back.attrs.id, back.attrs.pos]).toEqual(["paragraph", "---", before.id, before.pos]);
  });

  test("Mod+Z after it goes back to the paragraph holding the first two hyphens", () => {
    const view = atEmpty(page());
    typeAll(view, "---");
    key(view, "z", { ctrlKey: true });
    expect(view.state.doc.childCount).toBe(3);
    expect(block(view, "p").type.name).toBe("paragraph");
    expect(block(view, "p").textContent).toBe("--");
  });
});

describe("Backspace", () => {
  test("Mod+Z after a heading shortcut is a step of its own: the paragraph is back with the hashes", () => {
    const view = atEmpty(page());
    typeAll(view, "## ");
    key(view, "z", { ctrlKey: true });
    expect(block(view, "p").type.name).toBe("paragraph");
    expect(block(view, "p").textContent).toBe("##");
  });

  test("right after a shortcut it gives the typed text back", () => {
    const view = atEmpty(page());
    typeAll(view, "## ");
    expect(block(view, "p").type.name).toBe("heading");
    key(view, "Backspace");
    const out = block(view, "p");
    expect([out.type.name, out.textContent]).toEqual(["paragraph", "## "]);
  });

  test("at the start of a heading it makes a paragraph; inside a toggle body the next Backspace joins it onto the summary", () => {
    const view = editor([["t", "toggle", "T", { open: true }], ["h", "heading", "H", { parent: "t", level: 2 }]]);
    select(view, posOf(view, "h"));
    key(view, "Backspace");
    expect(block(view, "h").type.name).toBe("paragraph");
    expect(block(view, "h").attrs.parent).toBe("t");
    key(view, "Backspace");
    expect(block(view, "h")).toBeNull();
    expect(block(view, "t").textContent).toBe("TH");
  });

  test("at the start of an empty code block it makes a paragraph; a non-empty code block keeps its type", () => {
    const empty = editor([["c", "code_block", ""]]);
    select(empty, posOf(empty, "c"));
    key(empty, "Backspace");
    expect(empty.state.doc.child(0).type.name).toBe("paragraph");
    const full = editor([["c", "code_block", "code"]]);
    select(full, posOf(full, "c"));
    key(full, "Backspace");
    expect(full.state.doc.child(0).type.name).toBe("code_block");
    expect(full.state.doc.child(0).textContent).toBe("code");
  });

  test("Mod+E toggles inline code and Mod+Shift+S strikes through", () => {
    const view = editor([["a", "paragraph", "word"]]);
    select(view, posOf(view, "a"), posOf(view, "a") + 4);
    key(view, "e", { ctrlKey: true });
    expect(view.state.doc.rangeHasMark(1, 5, schema.marks.code)).toBe(true);
    key(view, "S", { ctrlKey: true, shiftKey: true, keyCode: 83 });
    expect(view.state.doc.rangeHasMark(1, 5, schema.marks.strike)).toBe(true);
  });
});

test("F14 Backspace conversion and following typing undo separately", () => {
  const view = editor([["h", "heading", "hello", { level: 1 }]]);
  try {
    select(view, 1);
    key(view, "Backspace");
    typeText(view, "!");
    expect(history.undoDepth(view.state)).toBe(2);
    history.undo(view.state, view.dispatch);
    expect(view.state.doc.firstChild.type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("hello");
  } finally { view.destroy(); }
});

test("F21 a code fence before existing marked text leaves that text and its marks intact", () => {
  const view = editor([["p", "paragraph", "see docs"]]);
  try {
    view.dispatch(view.state.tr.addMark(1, 9, schema.marks.link.create({ href: "https://example.test" })));
    select(view, 1);
    typeAll(view, "```");
    expect(view.state.doc.firstChild.type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("```see docs");
    expect(view.state.doc.rangeHasMark(4, 12, schema.marks.link)).toBe(true);
  } finally { view.destroy(); }
});
