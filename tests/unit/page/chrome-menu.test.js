import { jest } from "@jest/globals";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { editor, key, posOf, select, shape, typeText } from "./view-helpers.js";

/**
 * The block menu: the slash trigger and its session, the plus, the ranking
 * shown in the rows, and the aria state on the editor. jsdom has no layout, so
 * the caret's coordinates are stubbed where the menu anchors to them.
 */

afterEach(() => { document.body.innerHTML = ""; });

const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const open = (spec, id = spec[0][0], end = true) => {
  const view = editor(spec);
  view.coordsAtPos = () => COORDS;
  select(view, posOf(view, id, end));
  return view;
};
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const rows = (view) => [...menu(view).querySelectorAll(".page-menu-item")];
const labels = (view) => rows(view).map((r) => r.querySelector(".page-menu-label").textContent);
const type = (view, text) => { for (const ch of text) typeText(view, ch); };
const backspace = (view) => view.dispatch(view.state.tr.delete(view.state.selection.head - 1, view.state.selection.head));
const isOpen = (view) => !menu(view).hidden;

describe("the slash trigger", () => {
  test("opens at the start of an empty line, and shows every item", () => {
    const view = open([["e", "paragraph", ""]]);
    expect(typeText(view, "/")).toBe(true);
    expect(isOpen(view)).toBe(true);
    expect(labels(view)).toEqual(["Text", "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list", "Checklist", "Toggle", "Callout", "Code", "Divider", "Image", "File"]);
  });

  test("opens after a space in the middle of a line, and at the start of a line that has text", () => {
    const mid = open([["p", "paragraph", "hello "]]);
    expect(typeText(mid, "/")).toBe(true);
    expect(isOpen(mid)).toBe(true);
    document.body.innerHTML = "";
    const start = open([["p", "paragraph", "hello"]], "p", false);
    select(start, posOf(start, "p"));
    expect(typeText(start, "/")).toBe(true);
    expect(isOpen(start)).toBe(true);
  });

  test("right after a letter or digit it stays text", () => {
    const view = open([["p", "paragraph", "and"]]);
    expect(typeText(view, "/")).toBe(false);
    expect(isOpen(view)).toBe(false);
    expect(view.state.doc.textContent).toBe("and/");
    select(view, posOf(view, "p", true));
    view.dispatch(view.state.tr.insertText("7"));
    expect(typeText(view, "/")).toBe(false);
  });

  test("in a code block it stays text", () => {
    const view = open([["c", "code_block", "x "]]);
    expect(typeText(view, "/")).toBe(false);
    expect(isOpen(view)).toBe(false);
  });

  test("typing filters the rows with the shared ranking, and Enter retypes an empty line keeping its id", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/chec");
    expect(labels(view)).toEqual(["Checklist"]);
    key(view, "Enter");
    const node = view.state.doc.child(0);
    expect([node.type.name, node.attrs.kind, node.attrs.id, node.textContent]).toEqual(["list_item", "check", "e", ""]);
    expect(isOpen(view)).toBe(false);
  });

  test("a pick on a line with text goes into a new block below, with the caret in it", () => {
    const view = open([["p", "paragraph", "hello "], ["z", "paragraph", "Z"]], "p");
    type(view, "/h1");
    key(view, "Enter");
    expect(shape(view)).toBe("hello  | heading | Z");
    expect(view.state.doc.child(1).attrs.level).toBe(1);
    expect(view.state.selection.$head.index(0)).toBe(1);
  });

  test("a pick below a toggle with a body lands after the whole body", () => {
    const view = open([["t", "toggle", "T ", { open: true }], ["b", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]], "t");
    type(view, "/");
    key(view, "ArrowDown");
    key(view, "Enter");
    expect(shape(view)).toBe("T  | body<t | heading | Z");
  });

  test("Divider from the menu replaces an empty line, keeping its id, with a paragraph below holding the caret", () => {
    const view = open([["e", "paragraph", ""], ["z", "paragraph", "Z"]]);
    type(view, "/div");
    key(view, "Enter");
    expect(view.state.doc.child(0).type.name).toBe("divider");
    expect(view.state.doc.child(0).attrs.id).toBe("e");
    expect(view.state.selection.$head.index(0)).toBe(1);
    expect(view.state.doc.childCount).toBe(3);
  });

  test("Escape closes the menu and leaves the typed text", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/he");
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(view.state.doc.textContent).toBe("/he");
  });
});

describe("no match", () => {
  test("the menu stays open saying so, Enter does nothing, and Backspace brings the rows back", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/zq");
    expect(isOpen(view)).toBe(true);
    expect(rows(view)).toEqual([]);
    expect(menu(view).querySelector(".page-menu-empty").textContent).toBe("No matching blocks");
    const before = view.state.doc;
    expect(key(view, "Enter")).toBe(true);
    expect(view.state.doc).toBe(before);
    expect(isOpen(view)).toBe(true);
    backspace(view);
    backspace(view);
    expect(rows(view).length).toBe(13);
  });

  test("a space after a query with no match ends the session", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/zq");
    type(view, " ");
    expect(isOpen(view)).toBe(false);
    expect(view.state.doc.textContent).toBe("/zq ");
  });

  test("a space inside a query that still matches does not end it", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/to");
    type(view, "-");
    expect(isOpen(view)).toBe(true);
  });

  test("deleting the slash itself closes the menu", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/");
    backspace(view);
    expect(isOpen(view)).toBe(false);
  });
});

describe("the plus", () => {
  const plus = (view) => view.dom.parentElement.querySelector(".page-plus");

  test("opens the menu without changing the document, and closing it changes nothing", () => {
    const view = open([["p", "paragraph", "P"], ["z", "paragraph", "Z"]], "p");
    const before = view.state.doc;
    plus(view).click();
    expect(isOpen(view)).toBe(true);
    expect(view.state.doc).toBe(before);
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(view.state.doc).toBe(before);
  });

  test("a pick on a block with text inserts a new block after its whole subtree", () => {
    const view = open([["t", "toggle", "T"], ["b", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]], "t");
    plus(view).click();
    rows(view)[1].click();
    expect(shape(view)).toBe("T | body<t | heading | Z");
    expect(view.state.selection.$head.index(0)).toBe(2);
  });

  test("a pick on an empty line replaces it, keeping its id", () => {
    const view = open([["p", "paragraph", "P"], ["e", "paragraph", ""]], "e");
    plus(view).click();
    rows(view)[4].click();
    expect(view.state.doc.child(1).type.name).toBe("list_item");
    expect(view.state.doc.child(1).attrs.id).toBe("e");
  });

  test("Divider on a block with text goes after its subtree", () => {
    const view = open([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["z", "paragraph", "Z"]], "a");
    plus(view).click();
    rows(view).find((r) => r.textContent.startsWith("—")).click();
    expect(shape(view)).toBe("A | A1 | divider | Z");
  });

  test("Image opens the picker for images and File for anything, placed after the block", () => {
    const view = open([["p", "paragraph", "P"]], "p");
    const input = view.dom.parentElement.querySelector(".page-file-input");
    input.click = jest.fn();
    plus(view).click();
    rows(view).find((r) => r.textContent.startsWith("▣")).click();
    expect([input.accept, input.click.mock.calls.length]).toEqual(["image/*", 1]);
    plus(view).click();
    rows(view).find((r) => r.textContent.startsWith("⎘")).click();
    expect([input.accept, input.click.mock.calls.length]).toEqual(["", 2]);
  });

  test("an edit while it is open closes the menu", () => {
    const view = open([["p", "paragraph", "P"]], "p");
    plus(view).click();
    view.dispatch(view.state.tr.insertText("x"));
    expect(isOpen(view)).toBe(false);
  });
});

describe("the toolbar's turn menu", () => {
  test("still lists the ten block types under its own title and turns the caret's block", () => {
    const view = open([["p", "paragraph", "P"]], "p");
    view.dom.parentElement.querySelector(".page-tool-turn").click();
    expect(menu(view).querySelector(".page-menu-title").textContent).toBe("Turn into");
    expect(rows(view).length).toBe(10);
    rows(view)[1].click();
    expect(view.state.doc.child(0).type.name).toBe("heading");
  });
});

describe("rows and aria", () => {
  test("rows carry ids and the hint column, and the highlight is mirrored in aria-selected and .is-active", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/");
    const h1 = rows(view)[1];
    expect(h1.id).toBe(`${menu(view).id}-1`);
    expect(h1.getAttribute("role")).toBe("menuitem");
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(h1.querySelector(".page-menu-hint").textContent).toBe("#");
    key(view, "ArrowDown");
    expect(rows(view)[1].getAttribute("aria-selected")).toBe("true");
    expect(rows(view)[1].classList.contains("is-active")).toBe(true);
    expect(rows(view)[0].getAttribute("aria-selected")).toBe("false");
  });

  test("aria-activedescendant follows the highlight and goes with the menu, and survives typing", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/");
    expect(view.dom.getAttribute("aria-haspopup")).toBe("menu");
    expect(view.dom.getAttribute("aria-controls")).toBe(menu(view).id);
    expect(view.dom.getAttribute("aria-activedescendant")).toBe(`${menu(view).id}-0`);
    key(view, "ArrowDown");
    expect(view.dom.getAttribute("aria-activedescendant")).toBe(`${menu(view).id}-1`);
    type(view, "h");
    expect(view.dom.getAttribute("aria-activedescendant")).toBe(`${menu(view).id}-0`);
    key(view, "Escape");
    for (const name of ["aria-haspopup", "aria-controls", "aria-activedescendant"]) expect(view.dom.hasAttribute(name)).toBe(false);
  });

  test("with no match there is no active descendant", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/zq");
    expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("anchoring", () => {
  const y = (view) => menu(view).style.getPropertyValue("--page-pop-y");

  test("a slash menu sits under the slash", () => {
    const view = open([["e", "paragraph", ""]]);
    view.dom.parentElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
    type(view, "/");
    expect(y(view)).toBe("126px");
    expect(menu(view).style.getPropertyValue("--page-pop-x")).toBe("40px");
  });

  test("near the bottom of the viewport it flips above the slash", () => {
    const view = open([["e", "paragraph", ""]]);
    view.coordsAtPos = () => ({ left: 40, right: 48, top: 700, bottom: 716 });
    Object.defineProperty(menu(view), "offsetHeight", { configurable: true, value: 200 });
    type(view, "/");
    expect(y(view)).toBe("494px");
  });
});
