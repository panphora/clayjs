import * as B from "../../../src/page/blocks.js";
import { make, at, caret, run, short } from "./blocks-helpers.js";
import { blockMap } from "../../../src/page/model.js";
import { state as pmState, history as pmHistory } from "../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;

describe("Tab and Shift-Tab", () => {
  const spec = [["a", "list_item", "A"], ["b", "list_item", "B"], ["b1", "list_item", "B1", { indent: 1 }], ["c", "list_item", "C"]];

  test("Tab on the first item does nothing", () => {
    const s = make(spec);
    expect(short(run(caret(s, "a"), B.indentBlocks))).toEqual(short(s));
  });

  test("Tab indents an item with its subtree", () => {
    const s = run(caret(make(spec), "b"), B.indentBlocks);
    expect(short(s)).toEqual("A@0 | B@1 | B1@2 | C@0");
  });

  test("Tab is capped at previous + 1", () => {
    const s = run(caret(make(spec), "b"), B.indentBlocks);
    expect(short(run(caret(s, "b"), B.indentBlocks))).toEqual(short(s));
  });

  test("Shift-Tab outdents with subtree", () => {
    const s = run(caret(run(caret(make(spec), "b"), B.indentBlocks), "b"), B.outdentBlocks);
    expect(short(s)).toEqual("A@0 | B@0 | B1@1 | C@0");
  });

  test("Shift-Tab on a middle child: later siblings become its children", () => {
    const s = run(caret(make([["a", "list_item", "A"], ["b", "list_item", "B", { indent: 1 }], ["c", "list_item", "C", { indent: 1 }], ["d", "list_item", "D", { indent: 1 }]]), "c"), B.outdentBlocks);
    expect(short(s)).toEqual("A@0 | B@1 | C@0 | D@1");
  });

  test("Tab on a multi-item selection indents each", () => {
    let s = make([["a", "list_item", "A"], ["b", "list_item", "B"], ["c", "list_item", "C"], ["d", "list_item", "D"]]);
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, "b", 0), at(s, "c", 1))));
    s = run(s, B.indentBlocks);
    expect(short(s)).toEqual("A@0 | B@1 | C@1 | D@0");
  });

  test("Tab after a toggle puts the block in its body and opens it", () => {
    const s = run(caret(make([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["p", "paragraph", "P"], ["l", "list_item", "L"], ["l1", "list_item", "L1", { indent: 1 }]]), "p"), B.indentBlocks);
    expect([short(s), s.doc.child(0).attrs.open]).toEqual(["T | b1<t | P<t | L@0 | L1@1", true]);
  });

  test("Tab on a top list item after a toggle body (whose last block is not a list) joins the body with its children", () => {
    let s = run(caret(make([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["p", "paragraph", "P"], ["l", "list_item", "L"], ["l1", "list_item", "L1", { indent: 1 }]]), "p"), B.indentBlocks);
    s = run(caret(s, "l"), B.indentBlocks);
    expect(short(s)).toEqual("T | b1<t | P<t | L@0<t | L1@1<t");
  });

  test("Shift-Tab on a middle body block moves it out, below the toggle", () => {
    const s = run(caret(make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["b3", "paragraph", "b3", { parent: "t" }], ["z", "paragraph", "Z"]]), "b2"), B.outdentBlocks);
    expect(short(s)).toEqual("T | b1<t | b3<t | b2 | Z");
  });

  test("Shift-Tab on the last body block only reparents", () => {
    let s = run(caret(make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["b3", "paragraph", "b3", { parent: "t" }], ["z", "paragraph", "Z"]]), "b2"), B.outdentBlocks);
    s = run(caret(s, "b3"), B.outdentBlocks);
    expect(short(s)).toEqual("T | b1<t | b3 | b2 | Z");
  });

  test("Tab and Shift-Tab are one undo step each", () => {
    const spec = [["a", "list_item", "A"], ["b", "list_item", "B"], ["b1", "list_item", "B1", { indent: 1 }], ["c", "list_item", "C"]];
    const s0 = make(spec, [pmHistory.history()]);
    const start = JSON.stringify(blockMap(s0.doc));
    let s = run(caret(s0, "b"), B.indentBlocks);
    expect(short(s)).toBe("A@0 | B@1 | B1@2 | C@0");
    s = run(s, pmHistory.undo);
    expect(JSON.stringify(blockMap(s.doc))).toBe(start);
    s = run(caret(make(spec, [pmHistory.history()]), "b1"), B.outdentBlocks);
    expect(short(s)).toBe("A@0 | B@0 | B1@0 | C@0");
    s = run(s, pmHistory.undo);
    expect(JSON.stringify(blockMap(s.doc))).toBe(start);
  });

  test("Tab with nothing to indent still consumes the key", () => {
    const s = caret(make([["a", "list_item", "A"]]), "a");
    expect(B.indentBlocks(s)).toBe(true);
  });
});
