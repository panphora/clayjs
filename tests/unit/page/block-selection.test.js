import * as B from "../../../src/page/blocks.js";
import { make, run, short } from "./blocks-helpers.js";
import { blockMap, changedBlocks } from "../../../src/page/model.js";
import { state as pmState, history, transform } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";

const { Selection, TextSelection } = pmState;
const { BlockSelection } = B;

/**
 * BlockSelection: whole top-level blocks as one ProseMirror selection. It maps
 * through every transaction, survives history, and the move command keeps it.
 */

const SPEC = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];
const startOf = (doc, i) => { let at = 0; for (let k = 0; k < i; k++) at += doc.child(k).nodeSize; return at; };
const endOf = (doc, i) => startOf(doc, i) + doc.child(i).nodeSize;
const blocks = (s, i, j = i, backward = false) => {
  const from = startOf(s.doc, i), to = endOf(s.doc, j);
  return backward ? new BlockSelection(s.doc.resolve(to), s.doc.resolve(from)) : new BlockSelection(s.doc.resolve(from), s.doc.resolve(to));
};
const withBlocks = (s, i, j = i, backward = false) => s.apply(s.tr.setSelection(blocks(s, i, j, backward)));
const range = (s) => [s.selection.from, s.selection.to];
const texts = (s) => short(s);

test("a block selection covers whole blocks and copies them whole", () => {
  const s = withBlocks(make(SPEC), 1, 2);
  expect(range(s)).toEqual([startOf(s.doc, 1), endOf(s.doc, 2)]);
  expect(s.selection.visible).toBe(false);
  const slice = s.selection.content();
  expect([slice.openStart, slice.openEnd, slice.content.childCount]).toEqual([0, 0, 2]);
  expect(slice.content.textBetween(0, slice.content.size, "|")).toBe("B|C");
});

test("it round-trips through JSON and Selection.fromJSON", () => {
  const s = withBlocks(make(SPEC), 1, 2, true);
  const json = s.selection.toJSON();
  expect(json.type).toBe("page-block");
  const back = Selection.fromJSON(s.doc, json);
  expect(back instanceof BlockSelection).toBe(true);
  expect(back.eq(s.selection)).toBe(true);
  expect(back.anchor > back.head).toBe(true);
});

describe("mapping through changes", () => {
  test("text typed in an earlier block moves it along", () => {
    const s = withBlocks(make(SPEC), 2);
    const out = s.apply(s.tr.insertText("xyz", 1));
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(range(out)).toEqual([startOf(out.doc, 2), endOf(out.doc, 2)]);
  });

  test("text typed inside a selected block keeps the selection", () => {
    const s = withBlocks(make(SPEC), 1, 2);
    const out = s.apply(s.tr.insertText("xyz", startOf(s.doc, 1) + 1));
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(texts(out)).toBe("A | xyzB | C | D");
  });

  test("a block landing at either edge stays outside the selection", () => {
    const s = withBlocks(make(SPEC), 1, 2);
    const para = schema.nodes.paragraph.create(null, schema.text("N"));
    const left = s.apply(s.tr.insert(startOf(s.doc, 1), para));
    expect(texts(left)).toBe("A | N | B | C | D");
    expect(range(left)).toEqual([startOf(left.doc, 2), endOf(left.doc, 3)]);
    const right = s.apply(s.tr.insert(endOf(s.doc, 2), para));
    expect(texts(right)).toBe("A | B | C | N | D");
    expect(range(right)).toEqual([startOf(right.doc, 1), endOf(right.doc, 2)]);
  });

  test("a block landing between two selected blocks ends the selection with a caret in the first", () => {
    const s = withBlocks(make(SPEC), 1, 2);
    const para = schema.nodes.paragraph.create(null, schema.text("N"));
    const out = s.apply(s.tr.insert(endOf(s.doc, 1), para));
    expect(texts(out)).toBe("A | B | N | C | D");
    expect(out.selection instanceof TextSelection).toBe(true);
    expect(out.selection.$head.index(0)).toBe(1);
  });

  test("deleting a block inside the selection shrinks it; deleting all of them leaves a caret", () => {
    const s = withBlocks(make(SPEC), 0, 2);
    const shrunk = s.apply(s.tr.delete(startOf(s.doc, 1), endOf(s.doc, 1)));
    expect(shrunk.selection instanceof BlockSelection).toBe(true);
    expect(texts(shrunk)).toBe("A | C | D");
    expect(range(shrunk)).toEqual([0, endOf(shrunk.doc, 1)]);
    const gone = s.apply(s.tr.delete(0, endOf(s.doc, 2)));
    expect(gone.selection instanceof TextSelection).toBe(true);
    expect(texts(gone)).toBe("D");
  });

  test("Tab and Shift-Tab keep the selection", () => {
    const s0 = make([["a", "list_item", "A"], ["b", "list_item", "B"], ["c", "list_item", "C"]]);
    const s = withBlocks(s0, 1, 2);
    const out = run(s, B.indentBlocks);
    expect(out.doc.child(1).attrs.indent).toBe(1);
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(range(out)).toEqual(range(s));
    const back = run(out, B.outdentBlocks);
    expect(back.selection instanceof BlockSelection).toBe(true);
    expect(back.doc.child(1).attrs.indent).toBe(0);
  });

  test("one change that deletes a selected block and inserts a new one between the others ends the selection", () => {
    const s = withBlocks(make(SPEC), 0, 2);
    const tr = s.tr.delete(startOf(s.doc, 1), endOf(s.doc, 1));
    tr.insert(startOf(tr.doc, 1), schema.nodes.paragraph.create({ id: "x" }, schema.text("X")));
    const out = s.apply(tr);
    expect(out.selection instanceof BlockSelection).toBe(false);
  });
});

describe("history", () => {
  test("one undo restores the deleted blocks, their ids and keys, and the block selection", () => {
    const s0 = make(SPEC, [history.history()]);
    const s = withBlocks(s0, 1, 2);
    const before = JSON.stringify(blockMap(s.doc));
    const deleted = s.apply(history.closeHistory(s.tr.delete(s.selection.from, s.selection.to)));
    expect(texts(deleted)).toBe("A | D");
    let undone = deleted;
    history.undo(deleted, (tr) => { undone = deleted.apply(tr); });
    expect(JSON.stringify(blockMap(undone.doc))).toBe(before);
    expect(undone.selection instanceof BlockSelection).toBe(true);
    expect(range(undone)).toEqual(range(s));
  });
});

describe("moving", () => {
  const spec = [["p0", "paragraph", "P0"], ["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["x", "paragraph", "X"], ["y", "paragraph", "Y"]];

  test("Mod-Shift-Down on a selected closed toggle moves it with its body and keeps the block selection", () => {
    const s = withBlocks(make(spec), 1, 3);
    const out = run(s, B.moveBlock(1));
    expect(texts(out)).toBe("P0 | X | T | b1<t | b2<t | Y");
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(range(out)).toEqual([startOf(out.doc, 2), endOf(out.doc, 4)]);
  });

  test("only the moved blocks get new keys", () => {
    const s = withBlocks(make(spec), 1, 3);
    const out = run(s, B.moveBlock(1));
    expect(Object.keys(changedBlocks(s.doc, out.doc).after).sort()).toEqual(["b1", "b2", "t"]);
  });

  test("a move is still one undo step with the block selection back", () => {
    const s = withBlocks(make(spec, [history.history()]), 1, 3);
    const moved = run(s, B.moveBlock(1));
    let undone = moved;
    history.undo(moved, (tr) => { undone = moved.apply(tr); });
    expect(texts(undone)).toBe("P0 | T | b1<t | b2<t | X | Y");
  });

  test("touchedBlocks is exported and reads a block selection", () => {
    const s = withBlocks(make(SPEC), 1, 2);
    expect(B.touchedBlocks(s.doc, s.selection, B.outline(s.doc))).toEqual([1, 2]);
  });
});

test("deleting the selection with the default command leaves a valid page when every block is selected", () => {
  const s = withBlocks(make(SPEC), 0, 3);
  const out = s.apply(s.tr.deleteSelection());
  expect(out.doc.childCount).toBeGreaterThan(0);
  expect(out.doc.check()).toBeUndefined();
});
