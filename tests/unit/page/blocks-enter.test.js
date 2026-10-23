import * as B from "../../../src/page/blocks.js";
import { make, caret, run, short, rows } from "./blocks-helpers.js";
import { blockMap } from "../../../src/page/model.js";
import { history as pmHistory, commands } from "../../../src/vendor/prosemirror.vendor.js";

describe("lists", () => {
  test("Enter mid-item splits, new half keeps kind, unchecked", () => {
    let s = make([["a", "list_item", "Alpha", { kind: "check", checked: true }], ["b", "list_item", "Beta"]]);
    s = run(caret(s, "a", 2), B.enterListItem);
    expect(rows(s).map((r) => r.slice(0, 4))).toEqual([["a", "list_item", "Al", 0], ["NEW", "list_item", "pha", 0], ["b", "list_item", "Beta", 0]]);
  });

  test("new half unchecked", () => {
    let s = make([["a", "list_item", "Alpha", { kind: "check", checked: true }], ["b", "list_item", "Beta"]]);
    s = run(caret(s, "a", 2), B.enterListItem);
    expect(s.doc.child(1).attrs.checked === false && s.doc.child(1).attrs.kind === "check").toBe(true);
  });

  test("Enter at start: empty unchecked item above, text keeps id and checked", () => {
    let s = make([["a", "list_item", "Alpha", { kind: "check", checked: true }]]);
    s = run(caret(s, "a", 0), B.enterListItem);
    expect([s.doc.child(0).textContent, s.doc.child(0).attrs.checked, s.doc.child(1).attrs.id, s.doc.child(1).attrs.checked]).toEqual(["", false, "a", true]);
  });

  test("Enter at end of an item with children makes its first child", () => {
    let s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }]]);
    s = run(caret(s, "a", 1), B.enterListItem);
    expect(short(s)).toBe("A@0 | @1 | A1@1");
  });

  test("Enter on empty nested item outdents it, later sibling becomes its child", () => {
    let s = make([["a", "list_item", "A"], ["e", "list_item", "", { indent: 1 }], ["c", "list_item", "C", { indent: 1 }]]);
    s = run(caret(s, "e"), B.enterListItem);
    expect(short(s)).toBe("A@0 | @0 | C@1");
  });

  test("Enter again on empty top item leaves the list, child promotes", () => {
    let s = make([["a", "list_item", "A"], ["e", "list_item", "", { indent: 1 }], ["c", "list_item", "C", { indent: 1 }]]);
    s = run(caret(s, "e"), B.enterListItem);
    s = run(caret(s, "e"), B.enterListItem);
    expect(short(s)).toBe("A@0 |  | C@0");
  });

  test("Backspace at start of nested item outdents it with its subtree", () => {
    let s = make([["a", "list_item", "A"], ["b", "list_item", "B", { indent: 1 }], ["b1", "list_item", "B1", { indent: 2 }]]);
    s = run(caret(s, "b"), B.backspaceListItem);
    expect(short(s)).toBe("A@0 | B@0 | B1@1");
  });

  test("Backspace at start of top item turns it into a paragraph, children promote", () => {
    let s = make([["a", "list_item", "A"], ["b", "list_item", "B", { indent: 1 }], ["b1", "list_item", "B1", { indent: 2 }]]);
    s = run(caret(s, "b"), B.backspaceListItem);
    s = run(caret(s, "b"), B.backspaceListItem);
    expect(short(s)).toBe("A@0 | B | B1@0");
  });
});

describe("toggles", () => {
  test("Enter at end of an open summary creates the first body block", () => {
    let s = make([["t", "toggle", "Notes", { open: true }], ["b1", "paragraph", "body", { parent: "t" }]]);
    s = run(caret(s, "t", 5), B.enterToggle);
    expect(short(s)).toBe("Notes | <t | body<t");
  });

  test("caret lands in the new body block", () => {
    let s = make([["t", "toggle", "Notes", { open: true }], ["b1", "paragraph", "body", { parent: "t" }]]);
    s = run(caret(s, "t", 5), B.enterToggle);
    expect(s.selection.$from.index(0) === 1).toBe(true);
  });

  test("Enter mid-summary of a closed toggle: the rest becomes a new closed toggle below the body", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "t", 3), B.enterToggle);
    expect(short(s)).toBe("Not | body<t | es | Z");
  });

  test("caret at start of the new toggle", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "t", 3), B.enterToggle);
    expect(s.selection.$from.parent.textContent === "es" && s.selection.$from.parentOffset === 0).toBe(true);
  });

  test("Enter on an empty toggle with no body turns it into a paragraph", () => {
    let s = make([["e", "toggle", ""], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "e"), B.enterToggle);
    expect(s.doc.child(0).type.name).toBe("paragraph");
  });

  test("Enter on an empty last body paragraph steps out of the toggle", () => {
    let s = make([["t", "toggle", "Notes", { open: true }], ["b1", "paragraph", "body", { parent: "t" }], ["e", "paragraph", "", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "e"), B.exitToggleOnEmpty);
    expect(short(s)).toBe("Notes | body<t |  | Z");
  });

  test("Backspace after a closed toggle joins into the summary, body kept", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Zed"]]);
    s = run(caret(s, "z"), B.backspaceAfterCollapsed);
    expect(short(s)).toBe("NotesZed | body<t");
  });

  test("caret at the join", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Zed"]]);
    s = run(caret(s, "z"), B.backspaceAfterCollapsed);
    expect(s.selection.head === 1 + 5).toBe(true);
  });

  test("Delete at the end of a closed summary pulls the next visible line up, body kept", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Zed"]]);
    s = run(caret(s, "t", 5), B.deleteAtCollapsedEnd);
    expect(short(s)).toBe("NotesZed | body<t");
  });

  test("Backspace at the start of a toggle turns it into a paragraph, body released", () => {
    let s = make([["t", "toggle", "Notes"], ["b1", "paragraph", "body", { parent: "t" }]]);
    s = run(caret(s, "t", 0), B.backspaceToggle);
    expect(short(s)).toBe("Notes | body");
  });
});

describe("Backspace inside a toggle body", () => {
  const body = () => make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["b3", "paragraph", "b3", { parent: "t" }], ["z", "paragraph", "Z"]]);

  test("Backspace at the start of a middle body paragraph joins it to the line above, inside the body", () => {
    expect(short(run(caret(body(), "b2"), commands.joinBackward))).toBe("T | b1b2<t | b3<t | Z");
    expect(B.backspaceBodyBlock(caret(body(), "b2"), () => {})).toBe(false);
  });

  test("Backspace in an empty middle body paragraph removes it and stays in the body", () => {
    let s = make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["e", "paragraph", "", { parent: "t" }], ["b3", "paragraph", "b3", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "e"), commands.chainCommands(B.blockKeys.Backspace, commands.joinBackward));
    expect(short(s)).toBe("T | b1<t | b3<t | Z");
    expect(s.selection.$from.parent.attrs.id).toBe("b1");
  });

  test("Backspace at the start of the first body paragraph joins it onto the summary", () => {
    const s = run(caret(body(), "b1"), B.backspaceBodyBlock);
    expect(short(s)).toBe("Tb1 | b2<t | b3<t | Z");
    expect(s.selection.$from.parentOffset).toBe(1);
  });

  test("a first body list item loses its list format first, then joins the summary", () => {
    let s = make([["t", "toggle", "T", { open: true }], ["l", "list_item", "L", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "l"), B.blockKeys.Backspace);
    expect(short(s)).toBe("T | L<t | Z");
    s = run(caret(s, "l"), B.blockKeys.Backspace);
    expect(short(s)).toBe("TL | Z");
  });

  test("a root paragraph is left to the default join", () => {
    const s = make([["p", "paragraph", "P"], ["q", "paragraph", "Q"]]);
    expect(B.backspaceBodyBlock(caret(s, "q"), () => {})).toBe(false);
  });

  test("Backspace mid-text in a body paragraph is not handled", () => {
    expect(B.backspaceBodyBlock(caret(body(), "b1", 1), () => {})).toBe(false);
  });
});

describe("undo", () => {
  test("Enter in a list is one undo step", () => {
    const s0 = make([["a", "list_item", "Alpha"], ["b", "list_item", "Beta"]], [pmHistory.history()]);
    const start = JSON.stringify(blockMap(s0.doc));
    let s = run(caret(s0, "a", 2), B.enterListItem);
    s = run(s, pmHistory.undo);
    expect(JSON.stringify(blockMap(s.doc))).toBe(start);
  });
});
