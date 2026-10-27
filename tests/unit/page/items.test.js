import * as I from "../../../src/page/items.js";
import * as C from "../../../src/page/chrome.js";
import { make, caret, short } from "./blocks-helpers.js";

/**
 * The block menu's data: ranking, retyping that keeps identity, and the
 * divider insertions.
 */

const byKey = (k) => I.BLOCK_TYPES.find((b) => b.key === k);
const keys = (query) => I.rankItems(I.MENU_ITEMS, query).map((i) => i.key);

test("chrome.js still exports the block helpers it used to define", () => {
  expect(C.BLOCK_TYPES).toBe(I.BLOCK_TYPES);
  expect(C.turnInto).toBe(I.turnInto);
  expect(C.insertAfter).toBe(I.insertAfter);
  expect(C.blockTypeOf).toBe(I.blockTypeOf);
});

describe("rankItems", () => {
  test("an empty query keeps menu order", () => {
    expect(keys("")).toEqual(I.MENU_ITEMS.map((i) => i.key));
    expect(I.MENU_ITEMS.length).toBe(I.BLOCK_TYPES.length + I.INSERT_ITEMS.length);
  });

  test("h lists the headings first, then the toggle headings, then the divider through its hr alias", () => {
    expect(keys("h").slice(0, 6)).toEqual(["h1", "h2", "h3", "toggle-h1", "toggle-h2", "toggle-h3"]);
    expect(keys("h")[6]).toBe("divider");
  });

  test("an exact alias or hint comes first", () => {
    expect(keys("todo")[0]).toBe("check");
    expect(keys("---")).toEqual(["divider"]);
    expect(keys("[]")[0]).toBe("check");
    expect(keys("h2")[0]).toBe("h2");
  });

  test("a label prefix beats an alias prefix: t lists Text before Toggle", () => {
    expect(keys("t").slice(0, 2)).toEqual(["text", "toggle"]);
  });

  test("list finds the two list types by alias, then Checklist by substring", () => {
    expect(keys("list")).toEqual(["bullet", "ordered", "check"]);
  });

  test("substrings match, and letters in order match as a fuzzy abbreviation", () => {
    expect(keys("llou")).toEqual(["callout"]);
    expect(keys("hd2")).toEqual(["h2", "toggle-h2"]);
    expect(keys("zz")).toEqual([]);
  });

  test("the query is trimmed and ignores case", () => {
    expect(keys("  CODE ")).toEqual(["code"]);
  });
});

describe("retype", () => {
  test("keeps id, pos and parent, and a list item's indent", () => {
    const s = make([["t", "toggle", "T", { open: true }], ["a", "list_item", "A", { parent: "t" }], ["b", "list_item", "B", { parent: "t", indent: 1 }]]);
    const before = s.doc.child(2).attrs;
    const out = s.apply(I.retype(s.tr, 2, byKey("check"))).doc.child(2);
    expect([out.attrs.id, out.attrs.pos, out.attrs.parent, out.attrs.indent, out.attrs.kind]).toEqual([before.id, before.pos, "t", 1, "check"]);
  });

  test("turnInto returns null for a block that is not a textblock", () => {
    const s = make([["d", "divider", ""]]);
    expect(I.turnInto(s, 0, byKey("h1"))).toBeNull();
  });
});

describe("dividers", () => {
  test("an empty paragraph becomes a divider with its id and pos, and a new paragraph with its own id and key holds the caret", () => {
    const s = make([["a", "paragraph", "A"], ["p", "paragraph", ""], ["z", "paragraph", "Z"]]);
    const before = s.doc.child(1).attrs;
    const out = s.apply(I.insertDivider(caret(s, "p"), 1));
    expect(out.doc.childCount).toBe(4);
    const [div, para] = [out.doc.child(1), out.doc.child(2)];
    expect([div.type.name, div.attrs.id, div.attrs.pos]).toEqual(["divider", before.id, before.pos]);
    expect(para.type.name).toBe("paragraph");
    expect(para.attrs.id).toBeTruthy();
    expect(para.attrs.pos > before.pos && para.attrs.pos < out.doc.child(3).attrs.pos).toBe(true);
    expect(out.selection.$head.parent).toBe(para);
  });

  test("the identity plugin appends nothing after it, so one transaction holds the whole change", () => {
    const s = make([["p", "paragraph", ""]]);
    const { transactions } = caret(s, "p").applyTransaction(I.insertDivider(caret(s, "p"), 0));
    expect(transactions.length).toBe(1);
  });

  test("a paragraph with text gets the divider after its whole subtree and keeps its place", () => {
    const s = make([["t", "toggle", "T", { open: true }], ["b", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]]);
    const out = s.apply(I.insertDivider(s, 0));
    expect(out.doc.child(2).type.name).toBe("divider");
    expect(short(out)).toBe("T | body<t |  |  | Z");
    expect(out.doc.child(3).type.name).toBe("paragraph");
    expect(out.selection.$head.index(0)).toBe(3);
    expect(out.doc.child(2).attrs.parent).toBeNull();
  });

  test("a divider inside a toggle body keeps the body's parent on both new blocks", () => {
    const s = make([["t", "toggle", "T", { open: true }], ["p", "paragraph", "", { parent: "t" }]]);
    const out = s.apply(I.insertDivider(caret(s, "p"), 1));
    expect([out.doc.child(1).attrs.parent, out.doc.child(2).attrs.parent]).toEqual(["t", "t"]);
  });
});

describe("the menu list", () => {
  test("lists the fourteen block types, then Divider, Table of contents, Image, File, Table, Import CSV and Board", () => {
    expect(I.MENU_ITEMS.map((i) => i.key)).toEqual(["text", "h1", "h2", "h3", "bullet", "ordered", "check", "toggle", "toggle-h1", "toggle-h2", "toggle-h3", "callout", "quote", "code", "divider", "toc", "image", "file", "table", "csv", "board"]);
  });

  test("picture, photo and attachment find Image and File through aliases", () => {
    expect(keys("pic")[0]).toBe("image");
    expect(keys("attach")[0]).toBe("file");
  });
});
