import * as B from "../../../src/page/blocks.js";
import { make, at, endOf, short } from "./blocks-helpers.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;

describe("selection across a closed toggle", () => {
  const fold = () => make([["p", "paragraph", "Para"], ["t", "toggle", "Summary"], ["b1", "paragraph", "hidden1", { parent: "t" }], ["b2", "paragraph", "hidden2", { parent: "t" }], ["z", "paragraph", "Zed"]], [B.collapsePlugin()]);

  test("a caret placed inside a hidden block snaps out", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "b1", 2))));
    expect(s.selection.$from.parent.attrs.id !== "b1").toBe(true);
  });

  test("a range from mid-summary across the hidden body widens to the whole summary line", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "t", 3), at(s0, "z", 1))));
    expect([s.selection.from, s.selection.to]).toEqual([at(s0, "t", 0), at(s0, "z", 1)]);
  });

  test("copying that range takes the hidden body", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "t", 3), at(s0, "z", 1))));
    const slice = s.doc.slice(s.selection.from, s.selection.to);
    const kinds = []; slice.content.forEach((n) => kinds.push(n.attrs.id));
    expect(kinds).toEqual(["t", "b1", "b2", "z"]);
  });

  test("deleting it removes the toggle and its body, nothing orphaned", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "t", 3), at(s0, "z", 1))));
    const del = s.apply(s.tr.deleteSelection());
    expect(short(del)).toBe("Para | ed");
  });

  test("a range from above across the toggle is left alone", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "p", 2), at(s0, "z", 1))));
    expect([s.selection.from, s.selection.to]).toEqual([at(s0, "p", 2), at(s0, "z", 1)]);
  });

  test("a range ending inside the hidden body: head snaps forward past it", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "p", 2), at(s0, "b1", 3))));
    expect(s.selection.head).toBe(at(s0, "z", 0));
  });

  test("closing a toggle with the caret inside moves the caret to the summary end", () => {
    const s0 = fold();
    let s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "p", 1))));
    s = s.apply(B.setOpen(s, 1, true));
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, "b1", 2))));
    s = s.apply(B.setOpen(s, 1, false));
    expect(s.selection.head).toBe(endOf(s, "t"));
  });

  test("pasted toggle gets a fresh id and its body names it", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "t", 3), at(s0, "z", 1))));
    const slice = s.doc.slice(s.selection.from, s.selection.to);
    const pasted = B.remapPasted(new (slice.constructor)(slice.content, 0, 0), s);
    const pids = []; pasted.content.forEach((n) => pids.push([n.type.name, n.attrs.id, n.attrs.parent]));
    expect(pids[0][1] && pids[0][1] !== "t" && pids[1][2] === pids[0][1] && pids[2][2] === pids[0][1] && pids[3][2] === null && pids[1][1] === null).toBe(true);
  });

  test("a range starting at the closed summary's end skips the toggle and its body", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, endOf(s0, "t"), at(s0, "z", 1))));
    expect([s.selection.from, s.selection.to]).toEqual([at(s0, "z", 0), at(s0, "z", 1)]);
    expect(short(s.apply(s.tr.deleteSelection()))).toBe("Para | Summary | hidden1<t | hidden2<t | ed");
  });

  test("the same range made backwards also skips the toggle", () => {
    const s0 = fold();
    const s = s0.apply(s0.tr.setSelection(TextSelection.create(s0.doc, at(s0, "z", 1), endOf(s0, "t"))));
    expect([s.selection.anchor, s.selection.head]).toEqual([at(s0, "z", 1), at(s0, "z", 0)]);
  });

  test("closed bodies get the hidden class and the summary reports collapsed", () => {
    const s0 = fold();
    const decos = B.decorationsFor(s0.doc).find();
    const hidden = decos.filter((d) => d.type.attrs && d.type.attrs.class === "page-hidden");
    expect(hidden.map((d) => s0.doc.nodeAt(d.from).attrs.id)).toEqual(["b1", "b2"]);
    const summary = decos.find((d) => d.type.attrs && d.type.attrs["aria-expanded"] !== undefined);
    expect(summary.type.attrs["aria-expanded"]).toBe("false");
  });

  test("an open toggle hides nothing", () => {
    let s = fold();
    s = s.apply(B.setOpen(s, 1, true));
    expect(B.hiddenRanges(B.outline(s.doc))).toEqual([]);
  });
});

describe("ordered numbering", () => {
  test("ordered markers", () => {
    const s = make([
      ["1", "list_item", "a", { kind: "ordered" }], ["2", "list_item", "b", { kind: "ordered", indent: 1 }], ["3", "list_item", "c", { kind: "ordered", indent: 1 }],
      ["4", "list_item", "d", { kind: "ordered", indent: 2 }], ["5", "list_item", "e", { kind: "ordered" }], ["6", "list_item", "f", { kind: "bullet" }],
      ["7", "list_item", "g", { kind: "ordered" }], ["8", "paragraph", "break"], ["9", "list_item", "h", { kind: "ordered" }],
    ]);
    const m = B.orderedMarkers(B.outline(s.doc));
    expect([...m.values()]).toEqual(["1.", "a.", "b.", "i.", "2.", "1.", "1."]);
  });
});
