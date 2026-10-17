import { schema } from "../../../src/page/schema.js";
import { REMOTE } from "../../../src/page/model.js";
import * as B from "../../../src/page/blocks.js";
import { make, at, endOf, short } from "./blocks-helpers.js";

describe("outline", () => {
  test("outline subEnd", () => {
    const s = make([
      ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }],
      ["t", "toggle", "T"], ["t1", "paragraph", "t1", { parent: "t" }], ["tt", "toggle", "TT", { parent: "t", open: true }], ["tt1", "list_item", "x", { parent: "tt" }],
      ["t2", "list_item", "y", { parent: "t" }], ["z", "paragraph", "Z"],
    ]);
    const e = B.outline(s.doc);
    expect(e.map((x) => x.subEnd)).toEqual([3, 2, 2, 3, 8, 5, 7, 7, 8, 9]);
  });

  test("outline up", () => {
    const s = make([
      ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }],
      ["t", "toggle", "T"], ["t1", "paragraph", "t1", { parent: "t" }], ["tt", "toggle", "TT", { parent: "t", open: true }], ["tt1", "list_item", "x", { parent: "tt" }],
      ["t2", "list_item", "y", { parent: "t" }], ["z", "paragraph", "Z"],
    ]);
    const e = B.outline(s.doc);
    expect(e.map((x) => x.up)).toEqual([-1, 0, 1, 0, -1, 4, 4, 6, 4, -1]);
  });

  test("outline hidden", () => {
    const s = make([
      ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }],
      ["t", "toggle", "T"], ["t1", "paragraph", "t1", { parent: "t" }], ["tt", "toggle", "TT", { parent: "t", open: true }], ["tt1", "list_item", "x", { parent: "tt" }],
      ["t2", "list_item", "y", { parent: "t" }], ["z", "paragraph", "Z"],
    ]);
    const e = B.outline(s.doc);
    expect(e.map((x) => x.hidden)).toEqual([false, false, false, false, false, true, true, true, true, false]);
  });

  test("outline depth", () => {
    const s = make([
      ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }],
      ["t", "toggle", "T"], ["t1", "paragraph", "t1", { parent: "t" }], ["tt", "toggle", "TT", { parent: "t", open: true }], ["tt1", "list_item", "x", { parent: "tt" }],
      ["t2", "list_item", "y", { parent: "t" }], ["z", "paragraph", "Z"],
    ]);
    const e = B.outline(s.doc);
    expect(e.map((x) => x.depth)).toEqual([0, 0, 0, 0, 0, 1, 1, 2, 1, 0]);
  });

  test("valid doc has no fixes", () => {
    const s = make([
      ["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }],
      ["t", "toggle", "T"], ["t1", "paragraph", "t1", { parent: "t" }], ["tt", "toggle", "TT", { parent: "t", open: true }], ["tt1", "list_item", "x", { parent: "tt" }],
      ["t2", "list_item", "y", { parent: "t" }], ["z", "paragraph", "Z"],
    ]);
    expect(B.structureFixes(s.doc).length).toEqual(0);
  });
});

describe("structure", () => {
  test("deleting a parent item promotes its subtree one level", () => {
    let s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["a2", "list_item", "A2", { indent: 1 }], ["b", "list_item", "B"]]);
    const p = at(s, "a") - 1;
    s = s.apply(s.tr.delete(p, p + s.doc.child(0).nodeSize));
    expect(short(s)).toEqual("A1@0 | A11@1 | A2@0 | B@0");
  });

  test("a toggle turned paragraph releases its body in place", () => {
    let s = make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "list_item", "b2", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = s.apply(s.tr.setNodeMarkup(0, schema.nodes.paragraph, { id: "t", pos: s.doc.child(0).attrs.pos, parent: null }));
    expect(short(s)).toEqual("T | b1 | b2@0 | Z");
  });

  test("deleting a nested toggle hands its body to the outer toggle", () => {
    let s = make([["o", "toggle", "O", { open: true }], ["t", "toggle", "T", { parent: "o", open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]]);
    s = s.apply(s.tr.delete(at(s, "t") - 1, endOf(s, "t") + 1));
    expect(short(s)).toEqual("O | b1<o | Z");
  });

  test("a parentless block inserted inside a body joins the body", () => {
    let s = make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }]]);
    s = s.apply(s.tr.insert(at(s, "b2") - 1, schema.nodes.paragraph.create(null, schema.text("new"))));
    expect(short(s)).toEqual("T | b1<t | new<t | b2<t");
  });

  test("a remote transaction is never repaired", () => {
    let s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }]]);
    const p = at(s, "a") - 1;
    s = s.apply(s.tr.delete(p, p + s.doc.child(0).nodeSize).setMeta(REMOTE, true));
    expect(short(s)).toBe("A1@1");
  });
});
