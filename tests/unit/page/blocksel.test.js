import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import * as B from "../../../src/page/blocks.js";
import * as S from "../../../src/page/blocksel.js";
import { REMOTE, blockMap } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";
import { make, caret, run, short } from "./blocks-helpers.js";
import { editor, key, posOf, select, typeText } from "./view-helpers.js";

const { TextSelection, NodeSelection } = pmState;
const { BlockSelection } = B;

/**
 * The block selection commands and plugin: what Esc, the arrows, Delete, Mod+D,
 * typing and Mod+A do with whole blocks selected.
 */

afterEach(() => { document.body.innerHTML = ""; });

const FLAT = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];
const TOGGLE = [["p", "paragraph", "P"], ["t", "toggle", "T", { open: false }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]];
const LIST = [["l1", "list_item", "one"], ["l2", "list_item", "two", { indent: 1 }], ["l3", "list_item", "three", { indent: 1 }], ["l4", "list_item", "four"]];

const withSel = (s, a, b = a) => s.apply(s.tr.setSelection(S.selectBlocks(s.doc, a, b)));
const spanIds = (s) => { const ents = B.outline(s.doc); const { lo, hi } = s.selection.span(s.doc); return ents.slice(lo, hi + 1).map((e) => e.node.attrs.id); };
const stepKeys = (s, ...cmds) => cmds.reduce((st, c) => run(st, c), s);

describe("selecting", () => {
  test("Esc on a closed toggle selects it with its hidden body", () => {
    const s = run(caret(make(TOGGLE), "t"), S.selectCurrentBlock);
    expect(s.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(s)).toEqual(["t", "b1", "b2"]);
  });

  test("selecting a parent item takes its children", () => {
    const s = withSel(make(LIST), 0 + 0);
    const parent = run(caret(make(LIST), "l1"), S.selectCurrentBlock);
    expect(spanIds(parent)).toEqual(["l1", "l2", "l3"]);
    expect(spanIds(s)).toEqual(["l1", "l2", "l3"]);
  });

  test("a range from a child to a root block lifts to whole sibling subtrees", () => {
    const s = withSel(make(LIST), 2, 3);
    expect(spanIds(s)).toEqual(["l1", "l2", "l3", "l4"]);
  });

  test("Esc again leaves block mode with the caret at the end of the first selected text block", () => {
    const s = withSel(make(FLAT), 1, 2);
    const out = run(s, S.exitToText);
    expect(out.selection instanceof TextSelection).toBe(true);
    expect(out.selection.head).toBe(out.doc.resolve(out.selection.head).end());
    expect(out.selection.$head.parent.attrs.id).toBe("b");
  });

  test("Esc on a first selected block that is not text selects it as a node", () => {
    const s = withSel(make([["a", "paragraph", "A"], ["d", "divider", ""]]), 1);
    const out = run(s, S.exitToText);
    expect(out.selection instanceof NodeSelection).toBe(true);
  });

  test("Mod+A selects the block's text first, then every block", () => {
    const s = caret(make(FLAT), "b", 1);
    const one = run(s, S.selectAllBlocks);
    expect(one.selection instanceof TextSelection).toBe(true);
    expect([one.selection.from, one.selection.to]).toEqual([one.selection.$from.start(), one.selection.$from.end()]);
    const all = run(one, S.selectAllBlocks);
    expect(all.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(all)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moving the selection", () => {
  test("Down selects the next visible block and skips a closed body", () => {
    const s = withSel(make(TOGGLE), 0);
    const down = run(s, S.stepBlock(1));
    expect(spanIds(down)).toEqual(["t", "b1", "b2"]);
    const next = run(down, S.stepBlock(1));
    expect(spanIds(next)).toEqual(["z"]);
  });

  test("Up from the first block stays where it is", () => {
    const s = withSel(make(FLAT), 0);
    expect(spanIds(run(s, S.stepBlock(-1)))).toEqual(["a"]);
  });

  test("Shift+Down twice, then Shift+Up, shrinks by one root", () => {
    const s0 = withSel(make(FLAT), 0);
    const s2 = stepKeys(s0, S.extendBlock(1), S.extendBlock(1));
    expect(spanIds(s2)).toEqual(["a", "b", "c"]);
    expect(spanIds(run(s2, S.extendBlock(-1)))).toEqual(["a", "b"]);
  });

  test("Shift+Up past the anchor extends upward and Shift+Down shrinks from the top", () => {
    const s0 = withSel(make(FLAT), 2);
    const up = run(s0, S.extendBlock(-1));
    expect(spanIds(up)).toEqual(["b", "c"]);
    expect(up.selection.anchor > up.selection.head).toBe(true);
    const up2 = run(up, S.extendBlock(-1));
    expect(spanIds(up2)).toEqual(["a", "b", "c"]);
    expect(spanIds(run(up2, S.extendBlock(1)))).toEqual(["b", "c"]);
    expect(spanIds(stepKeys(up2, S.extendBlock(1), S.extendBlock(1)))).toEqual(["c"]);
  });

  test("Shift+Up on the first block stays on the first block", () => {
    const s = withSel(make(FLAT), 0);
    expect(spanIds(run(s, S.extendBlock(-1)))).toEqual(["a"]);
  });

  test("extending over a closed toggle takes its body", () => {
    const s = withSel(make(TOGGLE), 0);
    expect(spanIds(run(s, S.extendBlock(1)))).toEqual(["p", "t", "b1", "b2"]);
  });
});

describe("deleting and duplicating", () => {
  test("Delete removes a closed toggle and its body, caret at the end of the block before", () => {
    const s = withSel(make(TOGGLE), 1);
    const out = run(s, S.deleteBlocks);
    expect(short(out)).toBe("P | Z");
    expect(out.selection.$head.parent.attrs.id).toBe("p");
    expect(out.selection.head).toBe(out.doc.resolve(out.selection.head).end());
  });

  test("deleting every block leaves one empty paragraph", () => {
    const s = withSel(make(FLAT), 0, 3);
    const out = run(s, S.deleteBlocks);
    expect(out.doc.childCount).toBe(1);
    expect(out.doc.child(0).type.name).toBe("paragraph");
    expect(out.doc.textContent).toBe("");
  });

  test("one undo restores the blocks, their ids and keys, and the block selection", () => {
    const s0 = make(TOGGLE, [history.history()]);
    const s = withSel(s0, 1);
    const before = JSON.stringify(blockMap(s.doc));
    const deleted = run(s, S.deleteBlocks);
    let undone = deleted;
    history.undo(deleted, (tr) => { undone = deleted.apply(tr); });
    expect(JSON.stringify(blockMap(undone.doc))).toBe(before);
    expect(undone.selection instanceof BlockSelection).toBe(true);
  });

  test("copy takes whole blocks: openStart 0 and the hidden body included", () => {
    const s = withSel(make(TOGGLE), 1);
    const slice = s.selection.content();
    expect([slice.openStart, slice.openEnd, slice.content.childCount]).toEqual([0, 0, 3]);
  });

  test("Mod+D duplicates the span: fresh ids, the copied body names the copied toggle, no existing key changes, the copy is selected", () => {
    const s = withSel(make(TOGGLE), 1);
    const before = blockMap(s.doc);
    const out = run(s, S.duplicateBlocks);
    expect(short(out)).toBe("P | T | b1<t | b2<t | T | b1<" + out.doc.child(4).attrs.id + " | b2<" + out.doc.child(4).attrs.id + " | Z");
    const after = blockMap(out.doc);
    for (const id of Object.keys(before)) expect(after[id].pos).toBe(before[id].pos);
    const copy = out.doc.child(4);
    expect(copy.attrs.id).not.toBe("t");
    expect(new Set([out.doc.child(5).attrs.parent, out.doc.child(6).attrs.parent])).toEqual(new Set([copy.attrs.id]));
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(out)).toEqual([copy.attrs.id, out.doc.child(5).attrs.id, out.doc.child(6).attrs.id]);
  });

  test("Mod+D in text duplicates the caret block with its children", () => {
    const s = caret(make(LIST), "l1", 1);
    const out = run(s, S.duplicateBlocks);
    expect(short(out)).toBe("one@0 | two@1 | three@1 | one@0 | two@1 | three@1 | four@0");
    expect(out.selection instanceof TextSelection).toBe(true);
  });
});
