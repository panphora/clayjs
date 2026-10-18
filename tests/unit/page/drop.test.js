import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { outline, structureFixes, BlockSelection } from "../../../src/page/blocks.js";
import { asStep } from "../../../src/page/blocksel.js";
import { gapTargets, pickTarget, moveSpanTo, summaryTarget } from "../../../src/page/drop.js";
import { make, run, short } from "./blocks-helpers.js";

/**
 * Where a dragged span may land. Every candidate is checked by simulating the
 * move and asking the structure plugin's own repair pass whether it would change
 * anything outside the span, so a target can never disagree with the plugin.
 */

const FIXTURE = () => make([
  ["p", "paragraph", "P"],
  ["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }],
  ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["b", "list_item", "B"],
  ["z", "paragraph", "Z"],
  ["c", "toggle", "C"], ["c1", "paragraph", "c1", { parent: "c" }],
], [history.history()]);
const fmt = (ts) => ts.map((t) => `${t.parent ?? "root"}:${t.indent}:d${t.depth}`);
const posMap = (s) => { const m = {}; s.doc.forEach((n) => { m[n.attrs.id] = n.attrs.pos; }); return m; };
const changedKeys = (a, b) => Object.keys(b).filter((id) => id in a && a[id] !== b[id]);

describe("gapTargets", () => {
  test("a paragraph may drop into an open toggle's body or at root after it", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 6, 6, 3))).toEqual(["root:0:d0", "t:0:d1"]);
  });

  test("a paragraph between two list items at one level goes only at root", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 6, 6, 5))).toEqual(["root:0:d0"]);
  });

  test("a paragraph between a parent item and its child is not offered", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 6, 6, 4))).toEqual([]);
  });

  test("a list item after a child may take indent 0, 1 or 2", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 5, 5, 5))).toEqual(["root:0:d0", "root:1:d1", "root:2:d2"]);
  });

  test("a list item between a parent and its child may take indent 0 or 1", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 5, 5, 4))).toEqual(["root:0:d0", "root:1:d1"]);
  });

  test("a closed toggle with its body may drop into an open toggle's body", () => {
    const s = FIXTURE();
    expect(fmt(gapTargets(s, outline(s.doc), 7, 8, 3))).toEqual(["root:0:d0", "t:0:d1"]);
  });

  test("the page end is a target, and no target lies strictly inside the span", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    expect(fmt(gapTargets(s, ents, 0, 0, -1))).toEqual(["root:0:d0"]);
    expect(gapTargets(s, ents, 3, 4, 4)).toEqual([]);
  });

  test("a gap after a closed toggle's body offers root only, never inside the closed body", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    expect(fmt(gapTargets(s, ents, 0, 0, -1))).toEqual(["root:0:d0"]);
    expect(gapTargets(s, ents, 0, 0, -1).some((t) => t.parent === "c")).toBe(false);
  });
});

describe("pickTarget", () => {
  test("chooses by pointer depth, ties to the first", () => {
    const s = FIXTURE();
    const targets = gapTargets(s, outline(s.doc), 7, 8, 3);
    expect(pickTarget(targets, 0.2).parent).toBe(null);
    expect(pickTarget(targets, 0.8).parent).toBe("t");
    expect(pickTarget([], 1)).toBeNull();
  });
});

describe("moveSpanTo", () => {
  test("dropping a toggle with its body into another toggle rewrites exactly the moved keys, in one undo step", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const target = pickTarget(gapTargets(s, ents, 7, 8, 3), 1);
    const after = s.apply(asStep(moveSpanTo(s, ents, 7, 8, target)));
    expect(short(after)).toBe("P | T | b1<t | C<t | c1<c | A@0 | A1@1 | B@0 | Z");
    expect(changedKeys(posMap(s), posMap(after)).sort()).toEqual(["c", "c1"]);
    expect(short(run(after, history.undo))).toBe(short(s));
  });

  test("the moved span stays block-selected", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const after = s.apply(moveSpanTo(s, ents, 7, 8, pickTarget(gapTargets(s, ents, 7, 8, 3), 1)));
    expect(after.selection instanceof BlockSelection).toBe(true);
    expect(after.selection.span(after.doc)).toEqual({ lo: 3, hi: 4 });
  });

  test("dragging right in place nests a list item without changing any order key", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const nest = s.apply(moveSpanTo(s, ents, 5, 5, pickTarget(gapTargets(s, ents, 5, 5, 5), 2)));
    expect(short(nest)).toBe("P | T | b1<t | A@0 | A1@1 | B@2 | Z | C | c1<c");
    expect(changedKeys(posMap(s), posMap(nest))).toEqual([]);
  });

  test("a list item with its child keeps the child's relative indent", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const up = s.apply(moveSpanTo(s, ents, 3, 4, pickTarget(gapTargets(s, ents, 3, 4, 1), 0)));
    expect(short(up)).toBe("P | A@0 | A1@1 | T | b1<t | B@0 | Z | C | c1<c");
  });

  test("every offered target leaves the structure pass with nothing to repair outside the span", () => {
    const spec = [];
    for (let i = 0; i < 40; i++) {
      if (i % 9 === 0) spec.push([`t${i}`, "toggle", `T${i}`, { open: i % 18 === 0 }]);
      else if (i % 9 < 3) spec.push([`b${i}`, "paragraph", `b${i}`, { parent: `t${i - (i % 9)}` }]);
      else if (i % 9 < 6) spec.push([`l${i}`, "list_item", `L${i}`, { indent: i % 3 }]);
      else spec.push([`p${i}`, "paragraph", `P${i}`]);
    }
    const s = make(spec);
    const ents = outline(s.doc);
    let offered = 0;
    for (let lo = 0; lo < ents.length; lo++) {
      if (ents[lo].hidden || ents[lo].up >= 0) continue;
      const hi = ents[lo].subEnd;
      for (let next = -1; next < ents.length; next++) {
        if (next >= 0 && ents[next].hidden) continue;
        for (const t of gapTargets(s, ents, lo, hi, next)) {
          offered++;
          const after = s.apply(moveSpanTo(s, ents, lo, hi, t));
          const size = ents[hi].end - ents[lo].at;
          const inPlace = t.at === ents[lo].at || t.at === ents[hi].end;
          const from = inPlace ? ents[lo].at : t.at > ents[lo].at ? t.at - size : t.at;
          expect(structureFixes(after.doc, s.doc).every((f) => f.at >= from && f.at < from + size)).toBe(true);
        }
      }
    }
    expect(offered).toBeGreaterThan(40);
  });
});

describe("summaryTarget", () => {
  test("a closed toggle's summary accepts a drop that appends to its body and opens it", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const t = summaryTarget(s, ents, 6, 6, 7);
    expect(t).toMatchObject({ at: ents[8].end, parent: "c", open: "c" });
    const after = s.apply(asStep(moveSpanTo(s, ents, 6, 6, t)));
    expect(short(after)).toBe("P | T | b1<t | A@0 | A1@1 | B@0 | C | c1<c | Z<c");
    const toggle = after.doc.child(6);
    expect([toggle.attrs.id, toggle.attrs.open]).toEqual(["c", true]);
  });

  test("one undo puts the block back and closes the toggle again", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    const after = s.apply(asStep(moveSpanTo(s, ents, 6, 6, summaryTarget(s, ents, 6, 6, 7))));
    const undone = run(after, history.undo);
    expect(short(undone)).toBe(short(s));
    expect(undone.doc.child(7).attrs.open).toBe(false);
  });

  test("dropping a span right after the toggle's body only rewrites parent and opens the toggle, changing no key", () => {
    const s = make([["c", "toggle", "C"], ["c1", "paragraph", "c1", { parent: "c" }], ["z", "paragraph", "Z"]]);
    const ents = outline(s.doc);
    const after = s.apply(moveSpanTo(s, ents, 2, 2, summaryTarget(s, ents, 2, 2, 0)));
    expect(short(after)).toBe("C | c1<c | Z<c");
    expect(changedKeys(posMap(s), posMap(after))).toEqual([]);
    expect(after.doc.child(0).attrs.open).toBe(true);
  });

  test("not offered for an open toggle, a paragraph, the span itself or a toggle inside the span", () => {
    const s = FIXTURE();
    const ents = outline(s.doc);
    expect(summaryTarget(s, ents, 6, 6, 1)).toBeNull();
    expect(summaryTarget(s, ents, 5, 5, 6)).toBeNull();
    expect(summaryTarget(s, ents, 7, 8, 7)).toBeNull();
    expect(summaryTarget(s, ents, 0, 0, 99)).toBeNull();
  });
});

test("F2 dangling remote parents do not crash gap target calculation", () => {
  const s = make([["a", "paragraph", "A"], ["b", "paragraph", "B", { parent: "missing" }]]);
  let targets;
  expect(() => { targets = gapTargets(s, outline(s.doc), 0, 0, -1); }).not.toThrow();
  expect(Array.isArray(targets)).toBe(true);
});
