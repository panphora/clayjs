import { editor, posOf, select, shape } from "./view-helpers.js";

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
