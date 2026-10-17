import * as C from "../../../src/page/chrome.js";
import { make, caret, run, short } from "./blocks-helpers.js";

/**
 * The chrome's block commands: turning a block into another type keeps its
 * identity, and the plus inserts below a block's whole subtree.
 */

const byKey = (k) => C.BLOCK_TYPES.find((b) => b.key === k);

test("turning a paragraph into a checklist item keeps its id, pos and parent", () => {
  const s = make([["t", "toggle", "T", { open: true }], ["p", "paragraph", "Body", { parent: "t" }]]);
  const before = s.doc.child(1).attrs;
  const after = s.apply(C.turnInto(s, 1, byKey("check"))).doc.child(1);
  expect(after.type.name).toBe("list_item");
  expect(after.attrs.kind).toBe("check");
  expect([after.attrs.id, after.attrs.pos, after.attrs.parent]).toEqual([before.id, before.pos, "t"]);
});

test("a nested bullet turned into a numbered item keeps its indent", () => {
  const s = make([["a", "list_item", "A"], ["b", "list_item", "B", { indent: 1 }]]);
  expect(short(s.apply(C.turnInto(s, 1, byKey("ordered"))))).toBe("A@0 | B@1");
  expect(s.apply(C.turnInto(s, 1, byKey("ordered"))).doc.child(1).attrs.kind).toBe("ordered");
});

test("a block turned into a toggle starts open", () => {
  const s = make([["p", "paragraph", "P"]]);
  const n = s.apply(C.turnInto(s, 0, byKey("toggle"))).doc.child(0);
  expect([n.type.name, n.attrs.open]).toEqual(["toggle", true]);
});

test("turning a marked paragraph into code drops the marks instead of throwing", () => {
  const s = make([["p", "paragraph", "x"]]);
  const marked = s.apply(s.tr.addMark(1, 2, s.schema.marks.strong.create()));
  const n = marked.apply(C.turnInto(marked, 0, byKey("code"))).doc.child(0);
  expect(n.type.name).toBe("code_block");
  expect(n.textContent).toBe("x");
});

test("the plus inserts a paragraph after a closed toggle's whole body, with the caret in it", () => {
  const s = make([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]]);
  const out = s.apply(C.insertAfter(caret(s, "t"), 0));
  expect(short(out)).toBe("T | b1<t |  | Z");
  expect(out.selection.$head.index(0)).toBe(2);
});

test("the plus under a list item lands after its children at the item's level", () => {
  const s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["b", "list_item", "B"]]);
  expect(short(s.apply(C.insertAfter(s, 0)))).toBe("A@0 | A1@1 |  | B@0");
});

test("blockTypeOf names headings by level and lists by kind", () => {
  const s = make([["h", "heading", "H", { level: 2 }], ["c", "list_item", "C", { kind: "check" }], ["p", "paragraph", "P"]]);
  expect([0, 1, 2].map((i) => C.blockTypeOf(s.doc.child(i)).label)).toEqual(["Heading 2", "Checklist", "Text"]);
});
