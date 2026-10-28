import { make, at, short } from "./blocks-helpers.js";

test("a structural change right after a clean edit is still repaired", () => {
  let s = make([["a", "list_item", "A"], ["a1", "list_item", "A1", { indent: 1 }], ["a11", "list_item", "A11", { indent: 2 }], ["b", "list_item", "B"]]);
  s = s.apply(s.tr.insertText("x", at(s, "a1")));
  s = s.apply(s.tr.insertText("y", at(s, "b")));
  const p = at(s, "a") - 1;
  s = s.apply(s.tr.delete(p, p + s.doc.child(0).nodeSize));
  expect(short(s)).toEqual("xA1@0 | A11@1 | yB@0");
});
