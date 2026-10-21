import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { ATOM, BREAK } from "../../../../src/page/projection.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";
import { tableKey, validCell, resolveTableFields, plainTable, tableChanges, writeTable } from "../../../../src/page/ybind/table.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const SEED = {
  cols: { c1: { pos: "1", name: "Week", kind: "date" }, c2: { pos: "2", name: "Activation %", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "Sep 21", c2: "58" } }, r2: { pos: "2", cells: { c1: "Sep 28", c2: "41" } } },
};
const fields = (entries) => new Map(entries.map(([tuple, value]) => [JSON.stringify(tuple), value]));

test("the page document has a tableFields root map", () => {
  const pd = createPageDoc(new Y.Doc());
  expect(pd.tableFields).toBeInstanceOf(Y.Map);
  expect(pd.tableFields).toBe(pd.ydoc.getMap("tableFields"));
  pd.ydoc.destroy();
});

test("keys are JSON tuples, so ids holding colons never collide", () => {
  expect(tableKey("t", "cell", "a:b", "c")).toBe('["t","cell","a:b","c"]');
  expect(tableKey("t", "cell", "a:b", "c")).not.toBe(tableKey("t", "cell", "a", "b:c"));
});

test("an empty overlay resolves to the seed", () => {
  expect(resolveTableFields(new Map(), "t", clone(SEED))).toEqual(SEED);
  expect(resolveTableFields(new Map(), "t", null)).toEqual({ cols: {}, rows: {} });
});

test("overrides apply field by field over the seed and only for their own table", () => {
  const marked = { c: "41 (dip)", m: [[2, "b"], [6, ""]] };
  const resolved = resolveTableFields(fields([
    [["t", "cell", "r2", "c2"], marked],
    [["t", "cell", "r1", "c1"], "Sep 20"],
    [["t", "row", "r1", "pos"], "3"],
    [["t", "col", "c1", "name"], "Week of"],
    [["t", "col", "c1", "kind"], null],
    [["t", "col", "c2", "width"], 120],
    [["other", "cell", "r1", "c1"], "elsewhere"],
  ]), "t", clone(SEED));
  expect(resolved.rows.r1).toEqual({ pos: "3", cells: { c1: "Sep 20", c2: "58" } });
  expect(resolved.rows.r2).toEqual({ pos: "2", cells: { c1: "Sep 28", c2: marked } });
  expect(resolved.cols.c1).toEqual({ pos: "1", name: "Week of" });
  expect(resolved.cols.c2).toEqual({ pos: "2", name: "Activation %", kind: "number", width: 120 });
});

test("alive:false hides a seed entity and a new entity needs alive:true", () => {
  const resolved = resolveTableFields(fields([
    [["t", "row", "r1", "alive"], false],
    [["t", "cell", "r1", "c1"], "edited after delete"],
    [["t", "col", "c2", "alive"], false],
    [["t", "cell", "r3", "c1"], "orphan cell"],
    [["t", "row", "r4", "alive"], true],
    [["t", "row", "r4", "pos"], "4"],
    [["t", "cell", "r4", "c1"], "Oct 5"],
    [["t", "col", "c3", "name"], "Undone column"],
  ]), "t", clone(SEED));
  expect(Object.keys(resolved.rows).sort()).toEqual(["r2", "r4"]);
  expect(resolved.rows.r4).toEqual({ pos: "4", cells: { c1: "Oct 5" } });
  expect(Object.keys(resolved.cols)).toEqual(["c1"]);
});

test("the resolver never mutates its seed", () => {
  const seed = clone(SEED);
  resolveTableFields(fields([[["t", "cell", "r1", "c1"], "x"], [["t", "col", "c1", "name"], "y"]]), "t", seed);
  expect(seed).toEqual(SEED);
});

test.each([
  ["not JSON", "broken", true],
  ["a three-part key", '["t","row","r1"]', true],
  ["an unknown kind", JSON.stringify(["t", "widget", "w", "alive"]), true],
  ["an unknown row field", JSON.stringify(["t", "row", "r1", "name"]), "x"],
  ["an unknown column field", JSON.stringify(["t", "col", "c1", "cells"]), "x"],
  ["a non-boolean alive", JSON.stringify(["t", "row", "r1", "alive"]), "yes"],
  ["a numeric pos", JSON.stringify(["t", "row", "r1", "pos"]), 2],
  ["a null name", JSON.stringify(["t", "col", "c1", "name"]), null],
  ["a zero width", JSON.stringify(["t", "col", "c1", "width"]), 0],
  ["a text width", JSON.stringify(["t", "col", "c1", "width"]), "120"],
  ["a numeric cell", JSON.stringify(["t", "cell", "r1", "c1"]), 5],
  ["a cell without marks", JSON.stringify(["t", "cell", "r1", "c1"]), { c: "x" }],
  ["runs that miss the text", JSON.stringify(["t", "cell", "r1", "c1"]), { c: "abc", m: [[2, "b"]] }],
  ["an unknown mark code", JSON.stringify(["t", "cell", "r1", "c1"]), { c: "ab", m: [[2, "z"]] }],
  ["a break on plain text", JSON.stringify(["t", "cell", "r1", "c1"]), { c: "ab", m: [[1, ""], [1, BREAK]] }],
  ["an empty entity id", JSON.stringify(["t", "row", "", "pos"]), "1"],
  ["a reserved table id", JSON.stringify(["__proto__", "row", "r1", "pos"]), "1"],
])("refuses %s, whichever table it belongs to", (_, key, value) => {
  const map = new Map([[key, value]]);
  for (const owner of [null, "t", "someone-else"]) {
    expect(() => resolveTableFields(map, owner, clone(SEED))).toThrow(expect.objectContaining({ code: "unsupported-content" }));
  }
});

test("a cell holds plain text or the page's inline encoding", () => {
  expect(validCell("plain")).toBe(true);
  expect(validCell({ c: "bold", m: [[4, "b"]] })).toBe(true);
  expect(validCell({ c: "link", m: [[4, 'a["https://x.test"]']] })).toBe(true);
  expect(validCell({ c: `a${ATOM}b`, m: [[1, ""], [1, BREAK], [1, "i"]] })).toBe(true);
  expect(validCell({ c: "ab", m: ["b", "b"] })).toBe(false);
  expect(validCell({ c: "ab", m: [[2, "b"]], extra: 1 })).toBe(false);
});

test("plainTable shows marked cells as their text", () => {
  const table = { cols: SEED.cols, rows: { r1: { pos: "1", cells: { c1: { c: `a${ATOM}b`, m: [[1, "b"], [1, BREAK], [1, ""]] }, c2: "58" } } } };
  expect(plainTable(table).rows.r1.cells).toEqual({ c1: "a\nb", c2: "58" });
  expect(plainTable(table).cols).toBe(SEED.cols);
});

test("one changed cell writes one cell key", () => {
  const after = clone(SEED);
  after.rows.r2.cells.c2 = "44";
  expect(tableChanges("t", new Map(), SEED, SEED, after)).toEqual([[tableKey("t", "cell", "r2", "c2"), "44"]]);
});

test("a new row writes alive, pos and only the cells that are not empty", () => {
  const after = clone(SEED);
  after.rows.r3 = { pos: "3", cells: { c1: "Oct 5", c2: "" } };
  expect(tableChanges("t", new Map(), SEED, SEED, after)).toEqual([
    [tableKey("t", "row", "r3", "alive"), true],
    [tableKey("t", "row", "r3", "pos"), "3"],
    [tableKey("t", "cell", "r3", "c1"), "Oct 5"],
  ]);
});

test("a cell missing from an existing row reads as empty and clears a stored value", () => {
  const after = clone(SEED);
  delete after.rows.r1.cells.c2;
  expect(tableChanges("t", new Map(), SEED, SEED, after)).toEqual([[tableKey("t", "cell", "r1", "c2"), ""]]);
});

test("a deleted row or column writes only alive:false", () => {
  const noRow = clone(SEED);
  delete noRow.rows.r1;
  expect(tableChanges("t", new Map(), SEED, SEED, noRow)).toEqual([[tableKey("t", "row", "r1", "alive"), false]]);
  const noCol = clone(SEED);
  delete noCol.cols.c2;
  for (const row of Object.values(noCol.rows)) delete row.cells.c2;
  expect(tableChanges("t", new Map(), SEED, SEED, noCol)).toEqual([[tableKey("t", "col", "c2", "alive"), false]]);
});

test("a new column writes alive and its fields, and its empty cells write nothing", () => {
  const after = clone(SEED);
  after.cols.c3 = { pos: "3", name: "Column 3", kind: "text" };
  for (const row of Object.values(after.rows)) row.cells.c3 = "";
  expect(tableChanges("t", new Map(), SEED, SEED, after)).toEqual([
    [tableKey("t", "col", "c3", "alive"), true],
    [tableKey("t", "col", "c3", "name"), "Column 3"],
    [tableKey("t", "col", "c3", "kind"), "text"],
    [tableKey("t", "col", "c3", "pos"), "3"],
  ]);
});

test("a row that comes back is compared with what is stored for it", () => {
  const stored = fields([[["t", "row", "r9", "alive"], false], [["t", "row", "r9", "pos"], "9"], [["t", "cell", "r9", "c1"], "old"]]);
  const after = clone(SEED);
  after.rows.r9 = { pos: "9", cells: { c1: "", c2: "7" } };
  expect(tableChanges("t", stored, SEED, SEED, after)).toEqual([
    [tableKey("t", "row", "r9", "alive"), true],
    [tableKey("t", "cell", "r9", "c1"), ""],
    [tableKey("t", "cell", "r9", "c2"), "7"],
  ]);
});

test("a row position is compared with the stored position, so a position only the view repaired is written", () => {
  const shown = clone(SEED);
  shown.rows.r2.pos = "1V";
  expect(tableChanges("t", new Map(), SEED, shown, clone(shown))).toEqual([[tableKey("t", "row", "r2", "pos"), "1V"]]);
  const stored = fields([[["t", "row", "r2", "pos"], "1V"]]);
  expect(tableChanges("t", stored, SEED, shown, clone(shown))).toEqual([]);
});

test("an unchanged marked cell writes nothing, raw or as the editor shows it", () => {
  const marked = { c: "41", m: [[2, "b"]] };
  const before = resolveTableFields(fields([[["t", "cell", "r2", "c2"], marked]]), "t", clone(SEED));
  expect(tableChanges("t", new Map(), SEED, before, clone(before))).toEqual([]);
  const shown = plainTable(before);
  expect(tableChanges("t", new Map(), SEED, shown, clone(shown))).toEqual([]);
  const edited = clone(shown);
  edited.rows.r1.cells.c1 = "Sep 22";
  expect(tableChanges("t", new Map(), SEED, shown, edited)).toEqual([[tableKey("t", "cell", "r1", "c1"), "Sep 22"]]);
});

test("writeTable reads the seed from the block's attributes and writes leaf keys", () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.transact(() => pd.attrs.set("t", new Y.Map([["t", "table"], ["cols", clone(SEED.cols)], ["rows", clone(SEED.rows)]])));
  const after = clone(SEED);
  after.rows.r1.cells.c2 = "60";
  pd.ydoc.transact(() => writeTable(pd, "t", SEED, after));
  expect([...pd.tableFields.entries()]).toEqual([[tableKey("t", "cell", "r1", "c2"), "60"]]);
  expect(pd.attrs.get("t").get("rows")).toEqual(SEED.rows);
  expect(resolveTableFields(pd.tableFields, "t", { cols: pd.attrs.get("t").get("cols"), rows: pd.attrs.get("t").get("rows") })).toEqual(after);
  pd.ydoc.destroy();
});
