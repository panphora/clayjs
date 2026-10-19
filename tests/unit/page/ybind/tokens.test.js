import { schema } from "../../../../src/page/schema.js";
import { tokensOf, tokenIndex, yAfter, yBefore } from "../../../../src/page/ybind/tokens.js";

const para = (id, ...c) => schema.nodes.paragraph.create({ id, pos: null }, c);
const label = (t) => (t.k === "c" ? t.ch : t.k === "b" ? "[" + t.id + ":" + t.t : "BR");

test("tokens and indexes of a three block document", () => {
  const doc = schema.nodes.doc.create(null, [
    para("a", schema.text("ab"), schema.nodes.hard_break.create(), schema.text("c")),
    schema.nodes.divider.create({ id: "d", pos: null }),
    para("b"),
  ]);
  expect(doc.content.size).toBe(9);
  expect(Array.from(tokenIndex(doc)).join(",")).toBe("0,1,2,3,4,5,5,6,7,7");
  expect(tokensOf(doc).map(label)).toEqual(["[a:paragraph", "a", "b", "BR", "c", "[d:divider", "[b:paragraph"]);
});

test("an implicit start block has no break token", () => {
  const imp = schema.nodes.doc.create(null, [para("~start", schema.text("lead")), para("p", schema.text("x"))]);
  expect(Array.from(tokenIndex(imp)).join(",")).toBe("0,0,1,2,3,4,4,5,6,6");
  expect(tokensOf(imp).map((t) => (t.k === "c" ? t.ch : "[" + t.id))).toEqual(["l", "e", "a", "d", "[p", "x"]);
});

test("holes shift positions", () => {
  expect(yAfter([{ at: 6, len: 1 }], 6)).toBe(7);
  expect(yBefore([{ at: 6, len: 1 }], 6)).toBe(6);
  expect(yBefore([{ at: 6, len: 1 }], 7)).toBe(8);
});
