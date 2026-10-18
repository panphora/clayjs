import { editor, key, posOf, select, shape, typeText } from "./view-helpers.js";

afterEach(() => { document.body.innerHTML = ""; });

const bar = (view, cls) => view.dom.parentElement.querySelector(cls);
const tool = (view, name) => bar(view, ".page-bubble").querySelector(`[data-cmd="${name}"]`);
const kinds = (view) => { const r = []; view.state.doc.forEach((n) => r.push(n.type.name === "list_item" ? n.attrs.kind : n.type.name)); return r; };

const DOC = [["a", "paragraph", "First"], ["b", "paragraph", "Second"], ["c", "paragraph", "Third"]];

test("the bubble and the dock list the tools in David's order", () => {
  const view = editor(DOC);
  view.hasFocus = () => true;
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  const order = ["strong", "em", "strike", "link", "bullet", "ordered", "check", "code"];
  expect([...bar(view, ".page-bubble").querySelectorAll("[data-cmd]")].map((b) => b.dataset.cmd)).toEqual(order);
  expect([...bar(view, ".page-dock").querySelectorAll("[data-cmd]")].map((b) => b.dataset.cmd)).toEqual(order);
});

test("a list button turns every selected block into that list, and a second press turns them back into text", () => {
  const view = editor(DOC);
  view.hasFocus = () => true;
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "a") + 2, posOf(view, "b") + 2);
  tool(view, "bullet").click();
  expect(kinds(view)).toEqual(["bullet", "bullet", "paragraph"]);
  expect(tool(view, "bullet").getAttribute("aria-pressed")).toBe("true");
  tool(view, "check").click();
  expect(kinds(view)).toEqual(["check", "check", "paragraph"]);
  tool(view, "check").click();
  expect(kinds(view)).toEqual(["paragraph", "paragraph", "paragraph"]);
  expect(shape(view)).toBe("First | Second | Third");
});

test("Code over whole lines makes one code block that keeps the first block's id, and one undo restores the lines", async () => {
  const { undo } = await import("../../../src/vendor/prosemirror.vendor.js").then((m) => m.history);
  const view = editor(DOC);
  view.hasFocus = () => true;
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "a"), posOf(view, "b", true));
  tool(view, "code").click();
  expect(kinds(view)).toEqual(["code_block", "paragraph"]);
  expect(view.state.doc.child(0).attrs.id).toBe("a");
  expect(view.state.doc.child(0).textContent).toBe("First\nSecond");
  expect(tool(view, "code").getAttribute("aria-pressed")).toBe("true");
  undo(view.state, view.dispatch);
  expect(shape(view)).toBe("First | Second | Third");
});

test("Code over part of a line stays inline code", () => {
  const view = editor(DOC);
  view.hasFocus = () => true;
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "a") + 1, posOf(view, "a") + 3);
  tool(view, "code").click();
  expect(kinds(view)).toEqual(["paragraph", "paragraph", "paragraph"]);
  expect(view.state.doc.rangeHasMark(posOf(view, "a") + 1, posOf(view, "a") + 3, view.state.schema.marks.code)).toBe(true);
});

describe("review round 1", () => {
  const setup = (spec) => {
    const view = editor(spec);
    view.hasFocus = () => true;
    view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
    return view;
  };
  const dock = (view, name) => bar(view, ".page-dock").querySelector(`[data-cmd="${name}"]`);

  test("Code over a whole line keeps its Shift+Enter breaks as newlines", () => {
    const view = setup([["a", "paragraph", "first"], ["b", "paragraph", "after"]]);
    select(view, posOf(view, "a", true));
    key(view, "Enter", { shiftKey: true });
    typeText(view, "second");
    select(view, posOf(view, "a"), posOf(view, "a", true));
    tool(view, "code").click();
    expect(view.state.doc.child(0).textContent).toBe("first\nsecond");
  });

  test("a block selection of one block or a selected image never changes the block after it", async () => {
    const { selectBlocks } = await import("../../../src/page/blocksel.js");
    const view = setup(DOC);
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 0)));
    dock(view, "bullet").click();
    expect(kinds(view)).toEqual(["bullet", "paragraph", "paragraph"]);
    const img = setup([["i", "image", "", { src: "/a.png" }], ["p", "paragraph", "P"]]);
    const { state: pm } = await import("../../../src/vendor/prosemirror.vendor.js");
    img.dispatch(img.state.tr.setSelection(pm.NodeSelection.create(img.state.doc, 0)));
    bar(img, ".page-dock").querySelector('[data-cmd="ordered"]').click();
    expect(kinds(img)).toEqual(["image", "paragraph"]);
  });

  test("Checklist over a mixed selection keeps the existing task's checked, owner and due", () => {
    const view = setup([["t", "list_item", "Task", { kind: "check", checked: true, owner: "Pat", due: "2026-10-20" }], ["p", "paragraph", "New"]]);
    select(view, posOf(view, "t"), posOf(view, "p", true));
    tool(view, "check").click();
    expect(kinds(view)).toEqual(["check", "check"]);
    const { checked, owner, due } = view.state.doc.child(0).attrs;
    expect([checked, owner, due]).toEqual([true, "Pat", "2026-10-20"]);
  });

  test("a list with a divider inside the selection toggles off, and the divider stays", () => {
    const view = setup([["a", "list_item", "A"], ["d", "divider", ""], ["b", "list_item", "B"]]);
    select(view, posOf(view, "a") + 1, posOf(view, "b") + 1);
    expect(tool(view, "bullet").getAttribute("aria-pressed")).toBe("true");
    tool(view, "bullet").click();
    expect(kinds(view)).toEqual(["paragraph", "divider", "paragraph"]);
  });
});

describe("Code toggles a code block back into text", () => {
  const setup = (spec) => {
    const view = editor(spec);
    view.hasFocus = () => true;
    view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
    return view;
  };

  test("whole lines become a code block, and Code again turns it back into those lines, keeping the first id", () => {
    const view = setup([["a", "paragraph", "one"], ["b", "paragraph", "two"], ["c", "paragraph", "after"]]);
    select(view, posOf(view, "a"), posOf(view, "b", true));
    tool(view, "code").click();
    expect(kinds(view)).toEqual(["code_block", "paragraph"]);
    expect(tool(view, "code").getAttribute("aria-pressed")).toBe("true");
    tool(view, "code").click();
    expect(kinds(view)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(shape(view)).toBe("one | two | after");
    expect(view.state.doc.child(0).attrs.id).toBe("a");
    expect(new Set([...Array(3)].map((_, i) => view.state.doc.child(i).attrs.id)).size).toBe(3);
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "\n")).toBe("one\ntwo");
  });

  test("with only the caret in a code block, Code turns it into text, and one undo brings the block back", async () => {
    const { history } = await import("../../../src/vendor/prosemirror.vendor.js");
    const view = setup([["k", "code_block", "x = 1\ny = 2", { lang: "python" }]]);
    view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(3))));
    tool(view, "code").click();
    expect(shape(view)).toBe("x = 1 | y = 2");
    history.undo(view.state, view.dispatch);
    expect(kinds(view)).toEqual(["code_block"]);
    expect(view.state.doc.child(0).textContent).toBe("x = 1\ny = 2");
  });
});
