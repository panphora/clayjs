import { schema } from "../../../../src/page/schema.js";
import { keepsView, keepViewPos, docDiff } from "../../../../src/page/ybind/bridge.js";

const { paragraph, table, table_row: row, table_cell: cell, doc: page } = schema.nodes;
const p = (id, pos, text, attrs = {}) => paragraph.create({ id, pos, ...attrs }, text ? schema.text(text) : null);
const t = (id, pos, rows) => table.create({ id, pos }, rows.map(([rid, rpos]) => row.create({ id: rid, pos: rpos }, cell.create({ col: "c" }, schema.text(rid)))));
const doc = (...blocks) => page.create(null, blocks);
const projected = (d) => {
  const out = [];
  d.forEach((b) => out.push(b.type.create({ ...b.attrs, pos: null }, b.content, b.marks)));
  return page.create(null, out);
};
const renders = (current, derived) => docDiff(current, keepViewPos(derived, current)) !== null;

test("a projection that differs from the view only in pos keeps the view, and render agrees", () => {
  const current = doc(p("a", "a1", "one"), t("t", "a2", [["r1", "a1"], ["r2", "a2"]]), p("b", "a3", "two"));
  expect(keepsView(current, projected(current))).toBe(true);
  expect(renders(current, projected(current))).toBe(false);
});

test("a changed id, text, attr or block count needs a render", () => {
  const current = doc(p("a", "a1", "one"), p("b", "a2", "two"));
  for (const derived of [
    doc(p("a", null, "one"), p("c", null, "two")),
    doc(p("a", null, "one"), p("b", null, "tw0")),
    doc(p("a", null, "one"), p("b", null, "two", { parent: "a" })),
    doc(p("a", null, "one")),
  ]) {
    expect(keepsView(current, derived)).toBe(false);
    expect(renders(current, derived)).toBe(true);
  }
});

test("a view whose ids or order keys keepViewPos would repair needs a render", () => {
  for (const current of [
    doc(p("a", "a1", "one"), p("a", "a2", "two")),
    doc(p("a", null, "one"), p("b", "a2", "two")),
    doc(p("a", "a2", "one"), p("b", "a1", "two")),
    doc(p("a", "a1", "one"), t("t", "a2", [["r1", "a2"], ["r2", "a1"]])),
    doc(p("a", "a1", "one"), t("t", "a2", [["r1", "a1"], ["r1", "a2"]])),
  ]) {
    expect(keepsView(current, projected(current))).toBe(false);
    expect(renders(current, projected(current))).toBe(true);
  }
});
