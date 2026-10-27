import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { schema } from "../../../src/page/schema.js";
import { ATOM, CODES, flatten, markKey, marksOf, packMarks, runsOf, unflatten, unitsOf, unpackMarks } from "../../../src/page/inline.js";
import { blockJson, blockMap, cellContent, cellValue, docFromBlocks, nodeFromBlock } from "../../../src/page/model.js";
import { cellText } from "../../../src/page/rich/cell.js";
import {
  MAX_DEPTH, MAX_KEYS, NAMED_CODE, NAME, OPAQUE_CODE, OPAQUE_MARK,
  bounded, descriptors, entriesOf, entriesOfYjs, isOpaque, keyOf, normalizeEntries, opaqueMark, yjsFields,
} from "../../../src/page/format-codec.js";
import { RECORD } from "./fixtures/all-kinds.js";

/**
 * The inline codec keeps the marks, tokens and attrs it has no schema type for,
 * refuses malformed ones, and writes the marks it knows exactly as before.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, "../../fixtures/page/formats", `${name}.json`), "utf8"));
const names = (marks) => marks.map((mark) => mark.type.name);
const round = (block) => packMarks(blockJson(nodeFromBlock(schema, "b-x", block)));
const keysTo = (key) => key;

test("every mark in the schema has its old compact code, and the opaque mark is not one", () => {
  expect(CODES).toEqual({ strong: "b", em: "i", strike: "s", code: "c", link: "a" });
  expect(CODES[OPAQUE_MARK]).toBeUndefined();
  expect(schema.marks[OPAQUE_MARK]).toBeUndefined();
  expect(OPAQUE_MARK).toBe("opaque_marks");
  expect(OPAQUE_CODE).toBe("clay_opaque_code");
  expect(NAMED_CODE).toBe("x");
  expect(NAME.test("glow")).toBe(true);
  expect(NAME.test("text~color")).toBe(false);
});

test("known marks keep today's keys byte for byte", () => {
  const keys = [
    "", "b", "bi", "c", "s", "bic",
    'a["https://example.test/?a=1&b=<2>"]',
    'ba["https://example.test/?a=1&b=<2>"]',
    'a["https://x.test/?q=\\"a]b\\"&p=\\\\[1]"]',
  ];
  for (const key of keys) expect(markKey(marksOf(schema, key))).toBe(key);
  expect(markKey([schema.marks.strong.create(), schema.marks.link.create({ href: "https://a.test" })])).toBe('ba["https://a.test"]');
});

test("an unfamiliar compact token is kept with its exact text", () => {
  for (const key of ["u", 'uz["value"]', 'z[{"n":1.5,"deep":{"a":[1,2,3]}}]', "bu", "iu", 'uy["kept"]']) {
    const marks = marksOf(schema, key);
    expect(names(marks)).toEqual(key === "bu" ? ["strong", OPAQUE_MARK] : key === "iu" ? ["em", OPAQUE_MARK] : [OPAQUE_MARK]);
    expect(isOpaque(marks[marks.length - 1])).toBe(true);
    expect(markKey(marks)).toBe(key);
  }
  expect(marksOf(schema, "u")[0].attrs.entries).toEqual([{ tokens: ["u"] }]);
  expect(marksOf(schema, 'uz["value"]')[0].attrs.entries).toEqual([{ tokens: ["u", 'z["value"]'] }]);
});

test("the named x grammar: name and attrs, kept verbatim and in one order", () => {
  expect(descriptors('x["glow",{"color":"red"}]')).toEqual([{ name: "glow", attrs: { color: "red" } }]);
  expect(descriptors('bx["sparkle",{}]')).toEqual([
    { code: "b", attrs: null, token: "b" },
    { name: "sparkle", attrs: {} },
  ]);
  const odd = 'x["glow",{"color":"red","fallback":"#e00"}]x["shimmer",{"color":"yellow"}]u';
  const canonical = 'x["glow",{"color":"red","fallback":"#e00"}]x["shimmer",{"color":"yellow"}]u';
  expect(markKey(marksOf(schema, odd))).toBe(canonical);
  expect(markKey(marksOf(schema, canonical))).toBe(canonical);
  expect(marksOf(schema, odd)[0].attrs.entries).toEqual([
    { name: "glow", attrs: { color: "red", fallback: "#e00" } },
    { name: "shimmer", attrs: { color: "yellow" } },
    { tokens: ["u"] },
  ]);
  expect(keyOf([{ name: "sparkle", attrs: {} }])).toBe('x["sparkle",{}]');
  expect(keyOf([{ tokens: ["u", 'z["value"]'] }])).toBe('uz["value"]');
});

test("two unknown marks in one block survive record -> document -> record", () => {
  const { record, expected } = fixture("two-unknown-marks");
  expect(round(record)).toEqual(expected);
  expect(JSON.stringify(round(record))).toBe(JSON.stringify(expected));
  const node = nodeFromBlock(schema, "b-x", record);
  expect(JSON.stringify(node.check())).toBeUndefined();
  expect(names(node.child(1).marks)).toEqual(["strong", OPAQUE_MARK]);
});

test("unfamiliar compact tokens survive record -> document -> record", () => {
  const { record, expected } = fixture("unknown-tokens");
  expect(round(record)).toEqual(expected);
  expect(round(expected)).toEqual(expected);
});

test("unknown attrs come back with their values untouched", () => {
  const { record, expected } = fixture("unknown-attrs");
  expect(round(record)).toEqual(expected);
  const entries = marksOf(schema, 'x["annotation",{"thread":"t-1","notes":["keep","these"]}]')[0].attrs.entries;
  expect(entries).toEqual([{ name: "annotation", attrs: { thread: "t-1", notes: ["keep", "these"] } }]);
  const unicode = marksOf(schema, `x["glow",${JSON.stringify({ label: "網目 🚦" })}]`)[0].attrs.entries;
  expect(unicode).toEqual([{ name: "glow", attrs: { label: "網目 🚦" } }]);
});

test("a table cell keeps marks it does not know, rich and bare", () => {
  const { record, expected } = fixture("table-marks");
  expect(round(record)).toEqual(expected);
  expect(round(expected)).toEqual(expected);
  const value = record.rows.r2.cells.c2;
  const content = cellContent(schema, value);
  expect(content.map((node) => node.type.name)).toEqual(["text", "hard_break"]);
  expect(marksOf(schema, "x[\"shimmer\",{\"color\":\"green\"}]")[0].type.name).toBe(OPAQUE_MARK);
  expect(content[0].marks.map((mark) => mark.type.name)).toEqual([OPAQUE_MARK]);
  expect(cellValue(schema.nodes.table_cell.create({ col: "c2" }, content))).toEqual(value);
  expect(cellText(value)).toBe("a\n");
  expect(cellText(record.rows.r2.cells.c1)).toBe("Sep 21");
  expect(cellText(record.rows.r3.cells.c1)).toBe("🚦 網");
});

test("supplementary characters keep one key per UTF-16 unit and their pairs whole", () => {
  const { record, expected } = fixture("supplementary");
  expect(round(record)).toEqual(expected);
  const units = unpackMarks(record);
  expect(units.m).toHaveLength(units.c.length);
  expect(units.m.slice(2, 4)).toEqual(['x["sparkle",{}]', 'x["sparkle",{}]']);
  expect(units.m.slice(4, 6)).toEqual(['bx["glow",{"color":"purple"}]', 'bx["glow",{"color":"purple"}]']);
  const nodes = unflatten(schema, units.c, units.m);
  expect(nodes.map((node) => node.text)).toEqual(["I ", "😀", "𠮷", " e\u0301"]);
  expect(nodes[1].marks).toHaveLength(1);
  expect(nodes[2].marks.map((mark) => mark.type.name)).toEqual(["strong", OPAQUE_MARK]);
});

test("an unknown block keeps its record and its inline values, and still refuses a node", () => {
  const { record, expected } = fixture("unknown-block");
  expect(record).toEqual(expected);
  expect(record.t).toBe("callout_future");
  expect(record.c).toBe("Read this too");
  for (const [length, key] of record.m) {
    expect(length).toBeGreaterThan(0);
    expect(keyOf(entriesOf(descriptors(keysTo(key))))).toBe(key);
  }
  expect(markKey(marksOf(schema, 'x["sparkle",{}]'))).toBe('x["sparkle",{}]');
  expect(() => nodeFromBlock(schema, "b-x", record)).toThrow("page: unknown block type callout_future");
  expect(record).toEqual(expected);
});

test("canceled Yjs marks drop exactly as ybind reads them", () => {
  const { fields, expected, positive } = fixture("canceled-yjs");
  expect(entriesOfYjs(fields)).toEqual(expected);
  expect(entriesOfYjs(positive.fields)).toEqual(positive.expected);
  expect(yjsFields(expected)).toEqual({ shimmer: { color: "yellow" }, glow: { color: "red" }, [OPAQUE_CODE]: { tokens: ["u", 'z["value"]'] } });
  expect(entriesOfYjs(yjsFields(expected))).toEqual(expected);
  expect(entriesOfYjs({ "glow~p-m0": null, "sparkle": true })).toEqual([{ name: "sparkle", attrs: {} }]);
  expect(() => entriesOfYjs({ [OPAQUE_CODE]: true })).toThrow(`page: ${OPAQUE_CODE} is not { tokens: [...] }`);
  expect(() => entriesOfYjs({ "glow~p-m0": { color: "red" }, [OPAQUE_CODE]: { tokens: ['x["a",{}]'] } })).toThrow("malformed mark token");
});

const refuses = (run) => {
  try { run(); return null; } catch (error) { return error.message; }
};

test("malformed data refuses, and the well-formed key beside it does not", () => {
  const { cases } = fixture("malformed");
  for (const { why, bad, good, badEntries, goodEntries } of cases) {
    if (bad !== undefined) {
      expect([why, refuses(() => marksOf(schema, bad))]).toEqual([why, expect.stringMatching(/^page: /)]);
      expect(markKey(marksOf(schema, good))).toBe(good);
    } else {
      expect([why, refuses(() => normalizeEntries(badEntries))]).toEqual([why, expect.stringMatching(/^page: /)]);
      expect(refuses(() => normalizeEntries(goodEntries))).toBeNull();
    }
  }
});

test("the descriptor JSON budget is bounded, never truncated", () => {
  expect(bounded({ a: [1, { b: 2 }] })).toEqual({ a: [1, { b: 2 }] });
  let deep = 1;
  for (let i = 1; i < MAX_DEPTH; i++) deep = [deep];
  expect(() => bounded(deep)).not.toThrow();
  expect(() => bounded([deep])).toThrow(`page: inline JSON is deeper than ${MAX_DEPTH}`);
  const many = Object.fromEntries(Array.from({ length: MAX_KEYS }, (_, i) => [`k${i}`, 1]));
  expect(() => bounded(many)).not.toThrow();
  expect(() => bounded({ ...many, extra: 1 })).toThrow(`page: inline JSON has more than ${MAX_KEYS} keys`);
  const deepAttrs = (levels) => {
    let value = {};
    for (let i = 1; i < levels; i++) value = { a: value };
    return value;
  };
  const deepKey = (levels) => `x["deep",${JSON.stringify(deepAttrs(levels))}]`;
  expect(() => marksOf(schema, deepKey(MAX_DEPTH))).toThrow(`page: inline JSON is deeper than ${MAX_DEPTH}`);
  expect(() => marksOf(schema, deepKey(1))).not.toThrow();
  expect(markKey(marksOf(schema, deepKey(MAX_DEPTH - 1)))).toBe(deepKey(MAX_DEPTH - 1));
});

test("entries read back from a mark are validated and normalized alike", () => {
  const mark = opaqueMark([{ tokens: ["u", 'z["v"]'] }, { name: "sparkle", attrs: {} }]);
  expect(mark.type.name).toBe(OPAQUE_MARK);
  expect(mark.type.spec.inclusive).toBe(false);
  expect(mark.type.spec.excludes).toBe("");
  expect(mark.attrs.entries).toEqual([{ name: "sparkle", attrs: {} }, { tokens: ["u", 'z["v"]'] }]);
  expect(markKey([mark])).toBe('x["sparkle",{}]uz["v"]');
  expect(markKey([schema.marks.strong.create(), mark])).toBe('bx["sparkle",{}]uz["v"]');
  expect(normalizeEntries(mark.attrs.entries)).toEqual(mark.attrs.entries);
  expect(markKey([opaqueMark([{ tokens: ["u"] }])])).toBe("u");
  expect(() => opaqueMark([{ name: "u", attrs: [] }])).toThrow("page: an opaque entry is not { name, attrs }");
});

test("the known record still encodes to today's bytes", () => {
  const strip = ({ w, ...block }) => block;
  const live = Object.fromEntries(Object.entries(RECORD.blocks).filter(([id]) => !RECORD.deleted?.[id]).map(([id, block]) => [id, strip(block)]));
  const encoded = Object.fromEntries(Object.entries(blockMap(docFromBlocks(schema, live))).map(([id, block]) => [id, packMarks(block)]));
  expect(encoded).toEqual(live);
  expect(JSON.stringify(encoded.p1)).toBe(JSON.stringify(live.p1));
  const link = 'a["https://example.test/?a=1&b=<2>"]';
  expect([...new Set(unitsOf(encoded.p1.m, encoded.p1.c.length))].sort()).toEqual(["", "b", "bi", "c", link, "b" + link].sort());
  expect(encoded.co.m).toEqual([[9, "b"], [8, ""]]);
  expect(encoded.p2.m).toEqual([[8, ""], [1, '@{"type":"hard_break"}'], [30, ""]]);
});
