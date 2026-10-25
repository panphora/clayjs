import * as B from "../../../src/page/blocks.js";
import { make, caret, run, short } from "./blocks-helpers.js";
import { blockMap, changedBlocks } from "../../../src/page/model.js";
import { history as pmHistory } from "../../../src/vendor/prosemirror.vendor.js";

describe("move", () => {
  const spec = [["p0", "paragraph", "P0"], ["t", "toggle", "T"]];
  for (let i = 1; i <= 5; i++) spec.push([`b${i}`, "paragraph", `b${i}`, { parent: "t" }]);
  spec.push(["x", "paragraph", "X"], ["y", "paragraph", "Y"]);

  test("moving a toggle down hops the next block and carries its body", () => {
    const s = run(caret(make(spec), "t", 0), B.moveBlock(1));
    expect(short(s)).toEqual("P0 | X | T | b1<t | b2<t | b3<t | b4<t | b5<t | Y");
  });

  test("the move rewrites the 6 moved keys and nothing else", () => {
    const s0 = make(spec);
    const before = s0.doc;
    const s = run(caret(s0, "t", 0), B.moveBlock(1));
    const changed = Object.keys(changedBlocks(before, s.doc).after).sort();
    expect(changed).toEqual(["b1", "b2", "b3", "b4", "b5", "t"]);
  });

  test("caret moved with the toggle", () => {
    const s = run(caret(make(spec), "t", 0), B.moveBlock(1));
    expect(s.selection.$from.parent.attrs.id).toBe("t");
  });

  test("pos still strictly increasing", () => {
    const s = run(caret(make(spec), "t", 0), B.moveBlock(1));
    const order = []; s.doc.forEach((n) => order.push(n.attrs.pos));
    expect(order.every((p, i) => i === 0 || order[i - 1] < p)).toBe(true);
  });

  test("moving up twice reaches the top", () => {
    let s = run(caret(make(spec), "t", 0), B.moveBlock(1));
    s = run(caret(s, "t", 0), B.moveBlock(-1));
    s = run(caret(s, "t", 0), B.moveBlock(-1));
    expect(short(s)).toEqual("T | b1<t | b2<t | b3<t | b4<t | b5<t | P0 | X | Y");
  });

  test("moving a list item carries its children", () => {
    let s = make([["a", "list_item", "A"], ["b", "list_item", "B"], ["b1", "list_item", "B1", { indent: 1 }], ["c", "list_item", "C"]]);
    s = run(caret(s, "b"), B.moveBlock(-1));
    expect(short(s)).toEqual("B@0 | B1@1 | A@0 | C@0");
  });

  test("moving a first child up steps out above its parent", () => {
    let s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a2", "list_item", "A2", { indent: 1 }]]);
    s = run(caret(s, "a1"), B.moveBlock(-1));
    expect(short(s)).toEqual("A1@0 | A@0 | A2@1");
  });

  test("moving a last body block down steps out below the toggle", () => {
    let s = make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = run(caret(s, "b1"), B.moveBlock(1));
    expect(short(s)).toEqual("T | b1 | Z");
  });

  test("moving a block down past a closed toggle hops the whole subtree", () => {
    let s = make([["p", "paragraph", "P"], ["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }]]);
    s = run(caret(s, "p"), B.moveBlock(1));
    expect(short(s)).toEqual("T | b1<t | P");
  });

  test("undo of a move is one step, ids and pos restored", () => {
    let s = make(spec, [pmHistory.history()]);
    const start = short(s);
    s = run(caret(s, "t", 0), B.moveBlock(1));
    s = run(s, pmHistory.undo);
    expect([short(s), JSON.stringify(blockMap(s.doc)) === JSON.stringify(blockMap(make(spec).doc))]).toEqual([start, true]);
  });

  test("a toggle move is six pos set ops in the live diff", () => {
    const spec = [["p0", "paragraph", "P0"], ["t", "toggle", "T"]];
    for (let i = 1; i <= 5; i++) spec.push([`b${i}`, "paragraph", `b${i}`, { parent: "t" }]);
    spec.push(["x", "paragraph", "X"], ["y", "paragraph", "Y"]);
    const s0 = make(spec);
    const s1 = run(caret(s0, "t", 0), B.moveBlock(1));
    const before = blockMap(s0.doc), after = blockMap(s1.doc);
    const changed = Object.keys(after).filter((id) => JSON.stringify(after[id]) !== JSON.stringify(before[id])).sort();
    expect(changed).toEqual(["b1", "b2", "b3", "b4", "b5", "t"]);
    for (const id of changed) {
      const { pos: a, ...restA } = before[id];
      const { pos: b, ...restB } = after[id];
      expect(restB).toEqual(restA);
      expect(b).not.toEqual(a);
    }
    for (const id of ["p0", "x", "y"]) expect(after[id]).toEqual(before[id]);
  });

  test("a move leaves no duplicate ids", () => {
    let s = make([["a", "list_item", "A"], ["b", "list_item", "B"], ["b1", "list_item", "B1", { indent: 1 }], ["c", "list_item", "C"]]);
    s = run(caret(s, "b"), B.moveBlock(-1));
    s = run(caret(s, "b"), B.moveBlock(1));
    const ids = []; s.doc.forEach((n) => ids.push(n.attrs.id));
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);
  });

  // Tab, Shift-Tab and Move read through the same validated port as a drag: the
  // attribute-only transactions carry the intent the port validates, computed
  // from the original outline and the proposed node attributes.
  const intent = (s, cmd) => { let out = null; cmd(s, (tr) => { out = tr; }); return out.getMeta(B.MOVE); };

  test("Tab on a list item carries an in-place intent with the changed indent", () => {
    const s = caret(make([["l1", "list_item", "one"], ["l2", "list_item", "two"], ["l3", "list_item", "three"]]), "l2");
    expect(intent(s, B.indentBlocks)).toEqual({ ids: ["l2"], afterId: "l1", parent: null, attrs: { l2: { indent: 1 } } });
  });

  test("Tab after a closed toggle adopts the block and carries the opened toggle", () => {
    const s = caret(make([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]]), "z");
    expect(intent(s, B.indentBlocks)).toEqual({ ids: ["z"], afterId: "b1", parent: "t", attrs: { t: { open: true } } });
  });

  test("Shift-Tab on a list item carries an in-place intent with the lowered indent", () => {
    const s = caret(make([["l1", "list_item", "one"], ["l2", "list_item", "two", { indent: 1 }], ["l3", "list_item", "three"]]), "l2");
    expect(intent(s, B.outdentBlocks)).toEqual({ ids: ["l2"], afterId: "l1", parent: null, attrs: { l2: { indent: 0 } } });
  });

  test("Shift-Tab on a toggle's last child carries an in-place intent with the new parent", () => {
    const s = caret(make([["t", "toggle", "T", { open: true }], ["c1", "paragraph", "c1", { parent: "t" }]]), "c1");
    expect(intent(s, B.outdentBlocks)).toEqual({ ids: ["c1"], afterId: "t", parent: null, attrs: {} });
  });
});
