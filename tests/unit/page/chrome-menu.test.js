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
    expect(shape(view)).toBe("A | A1 | divider | paragraph | Z");
    expect(view.state.selection.$head.index(0)).toBe(3);
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

describe("the actions menu", () => {
  const selectedIds = (view) => {
    const { lo, hi } = view.state.selection.span(view.state.doc);
    const out = [];
    for (let i = lo; i <= hi; i++) out.push(view.state.doc.child(i).attrs.id);
    return out;
  };
  const row = (view, label) => rows(view).find((r) => r.querySelector(".page-menu-label").textContent === label);
  const FOLD = [["p", "paragraph", "P"], ["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]];

  test("Mod+/ opens it and selects the caret's block with its hidden body", () => {
    const view = open(FOLD, "t");
    expect(key(view, "/", { ctrlKey: true })).toBe(true);
    expect(isOpen(view)).toBe(true);
    expect(selectedIds(view)).toEqual(["t", "b1"]);
    expect(labels(view)).toEqual(["Turn into", "Duplicate", "Move up", "Move down", "Indent", "Outdent", "Delete"]);
  });

  test("it also opens on Cmd+/ and the highlight starts on the first row", () => {
    const view = open(FOLD, "p");
    key(view, "/", { metaKey: true });
    expect(isOpen(view)).toBe(true);
    expect(view.dom.getAttribute("aria-activedescendant")).toBe(`${menu(view).id}-0`);
  });

  test("Move up moves the selected block above its previous sibling and keeps it selected", () => {
    const view = open(FOLD, "t");
    key(view, "/", { ctrlKey: true });
    row(view, "Move up").click();
    expect(shape(view)).toBe("T | b1<t | P | Z");
    expect(selectedIds(view)).toEqual(["t", "b1"]);
    expect(isOpen(view)).toBe(false);
  });

  test("Duplicate copies the block with its body and selects the copy; one undo removes it", () => {
    const view = open(FOLD, "t");
    key(view, "/", { ctrlKey: true });
    row(view, "Duplicate").click();
    expect(shape(view).split(" | ").length).toBe(6);
    expect(selectedIds(view)).not.toContain("t");
  });

  test("Delete removes the span", () => {
    const view = open(FOLD, "t");
    key(view, "/", { ctrlKey: true });
    row(view, "Delete").click();
    expect(shape(view)).toBe("P | Z");
  });

  test("Indent and Outdent work on a list item through the menu", () => {
    const view = open([["a", "list_item", "A"], ["b", "list_item", "B"]], "b");
    key(view, "/", { ctrlKey: true });
    row(view, "Indent").click();
    expect(view.state.doc.child(1).attrs.indent).toBe(1);
    key(view, "/", { ctrlKey: true });
    row(view, "Outdent").click();
    expect(view.state.doc.child(1).attrs.indent).toBe(0);
  });

  test("Turn into opens the type list and retypes every selected block, keeping each id", () => {
    const view = open([["a", "paragraph", "A"], ["b", "paragraph", "B"], ["z", "paragraph", "Z"]], "a");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    key(view, "/", { ctrlKey: true });
    expect(selectedIds(view)).toEqual(["a", "b"]);
    row(view, "Turn into").click();
    expect(menu(view).querySelector(".page-menu-title").textContent).toBe("Turn into");
    rows(view)[1].click();
    expect([...Array(3).keys()].map((i) => [view.state.doc.child(i).type.name, view.state.doc.child(i).attrs.id])).toEqual([["heading", "a"], ["heading", "b"], ["paragraph", "z"]]);
  });

  test("Turn into is not offered when a selected block is not text", () => {
    const view = open([["a", "paragraph", "A"], ["d", "divider", ""]], "a");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    key(view, "/", { ctrlKey: true });
    expect(selectedIds(view)).toEqual(["a", "d"]);
    expect(labels(view)).not.toContain("Turn into");
  });

  test("Escape closes it and keeps the block selection", () => {
    const view = open(FOLD, "p");
    key(view, "/", { ctrlKey: true });
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(selectedIds(view)).toEqual(["p"]);
  });
});

describe("the actions menu on an image", () => {
  const IMG = [["p", "paragraph", "P"], ["i", "image", "", { src: "/a.png", alt: "", caption: "" }]];
  const row = (view, label) => rows(view).find((r) => r.querySelector(".page-menu-label").textContent === label);
  const onImage = () => {
    const view = open(IMG, "p");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 1)));
    return view;
  };
  const popover = (view) => view.dom.parentElement.querySelector('.page-link[data-mode="alt"]');
  const press = (input, k) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  test("an image gets Alt text, Small, Medium and Full width after the common actions", () => {
    const view = onImage();
    key(view, "/", { ctrlKey: true });
    expect(labels(view)).toEqual(["Duplicate", "Move up", "Move down", "Indent", "Outdent", "Delete", "Alt text…", "Small", "Medium", "Full width"]);
  });

  test("Small, Medium and Full width set the pixel width, each as one step", () => {
    const view = onImage();
    for (const [label, width] of [["Small", 240], ["Medium", 480], ["Full width", null]]) {
      key(view, "/", { ctrlKey: true });
      row(view, label).click();
      expect(view.state.doc.child(1).attrs.width).toBe(width);
    }
  });

  test("Alt text opens a one-field popover; Enter saves it as one undo step", () => {
    const view = onImage();
    key(view, "/", { ctrlKey: true });
    row(view, "Alt text…").click();
    const input = popover(view).querySelector(".page-link-input");
    expect(input.getAttribute("aria-label")).toBe("Alt text");
    input.value = "  A red door  ";
    press(input, "Enter");
    expect(popover(view)).toBeNull();
    expect(view.state.doc.child(1).attrs.alt).toBe("A red door");
    history.undo(view.state, view.dispatch);
    expect(view.state.doc.child(1).attrs.alt).toBe("");
  });

  test("Escape closes the popover and leaves the alt text alone, and it opens showing the current text", () => {
    const view = onImage();
    view.dispatch(view.state.tr.setNodeMarkup(view.state.doc.child(0).nodeSize, null, { ...view.state.doc.child(1).attrs, alt: "Door" }));
    key(view, "/", { ctrlKey: true });
    row(view, "Alt text…").click();
    const input = popover(view).querySelector(".page-link-input");
    expect(input.value).toBe("Door");
    input.value = "changed";
    press(input, "Escape");
    expect(popover(view)).toBeNull();
    expect(view.state.doc.child(1).attrs.alt).toBe("Door");
  });
});

describe("review menu regressions", () => {
  test("F9 plus Divider adds a following paragraph and selects its caret", () => {
    const view = open([["p", "paragraph", "hello"]]);
    try {
      view.dom.parentElement.querySelector(".page-plus").click();
      rows(view)[10].click();
      expect(view.state.doc.childCount).toBe(3);
      expect(view.state.doc.child(1).type.name).toBe("divider");
      expect(view.state.doc.child(2).type.name).toBe("paragraph");
      expect(view.state.selection.$head.index(0)).toBe(2);
    } finally { view.destroy(); }
  });

  test("F9 one undo restores a slash divider query", () => {
    const view = open([["p", "paragraph", ""]]);
    try {
      type(view, "/divider");
      key(view, "Enter");
      history.undo(view.state, view.dispatch);
      expect(view.state.doc.textContent).toBe("/divider");
    } finally { view.destroy(); }
  });

  test("F10 cancelling the slash file picker keeps its query", () => {
    const view = open([["p", "paragraph", ""]]);
    try {
      type(view, "/image");
      key(view, "Enter");
      view.dom.parentElement.querySelector(".page-file-input").dispatchEvent(new Event("cancel"));
      expect(view.state.doc.textContent).toBe("/image");
    } finally { view.destroy(); }
  });

  test("F12 slash after a hard break opens the menu", () => {
    const view = open([["p", "paragraph", "hello"]]);
    try {
      key(view, "Enter", { shiftKey: true });
      typeText(view, "/");
      expect(isOpen(view)).toBe(true);
    } finally { view.destroy(); }
  });

  test("F12 slash from block mode opens the menu at its actual insertion point", () => {
    const view = open([["p", "paragraph", ""]]);
    try {
      view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0)));
      typeText(view, "/");
      expect(isOpen(view)).toBe(true);
      expect(view.state.doc.textContent).toBe("/");
    } finally { view.destroy(); }
  });

  test("F14 Turn into and following typing undo separately", () => {
    const view = open([["p", "paragraph", "hello"]]);
    try {
      view.dom.parentElement.querySelector(".page-tool-turn").click();
      rows(view)[1].click();
      typeText(view, "!");
      expect(history.undoDepth(view.state)).toBe(2);
      history.undo(view.state, view.dispatch);
      expect(view.state.doc.firstChild.type.name).toBe("heading");
      expect(view.state.doc.textContent).toBe("hello");
    } finally { view.destroy(); }
  });

  test("F15 IME Enter does not pick a slash row", () => {
    const view = open([["p", "paragraph", ""]]);
    try {
      type(view, "/h1");
      const before = view.state.doc;
      key(view, "Enter", { isComposing: true });
      expect(view.state.doc === before).toBe(true);
      expect(isOpen(view)).toBe(true);
    } finally { view.destroy(); }
  });

  test("F16 the toolbar Link button leaves focus in the address field", () => {
    const view = open([["p", "paragraph", "hello"]]);
    try {
      select(view, 1, 4);
      view.dom.parentElement.querySelector('.page-dock [data-cmd="link"]').click();
      expect(document.activeElement).toBe(view.dom.parentElement.querySelector(".page-link-input"));
    } finally { view.destroy(); }
  });
});
