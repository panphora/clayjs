import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { migrateHybridValues, YMigrationError } from "../../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { createPageDoc, mintOp, mintId } from "../../../../src/page/ybind/layout.js";
import { entriesOf, dec, yValueOf, docFromValue, PART } from "../../../../src/page/ybind/provider.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";
import { orderedIds, project, renderModel } from "../../../../src/page/projection.js";
import { RECORD } from "../fixtures/all-kinds.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const reverseKeys = (value) => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseKeys(value[key])])) : value;
const small = { blocks: { p: { t: "paragraph", pos: "A", c: "Hi", m: [[2, "b"]] } } };

test("preserves every visible block, its formatting and non-text payloads", () => {
  const before = JSON.stringify(RECORD);
  const value = migrateHybridValues([RECORD]);
  const blocks = blocksFromYValue(value);
  const expected = Object.fromEntries(orderedIds(RECORD.blocks).filter((id) => !RECORD.deleted[id]).map((id, index) => {
    const { w, pos, ...block } = clone(RECORD.blocks[id]);
    return [id, { ...block, pos: String(index + 1).padStart(8, "0") }];
  }));
  expect(Object.keys(blocks)).toHaveLength(28);
  expect(blocks).toEqual(expected);
  expect(blocks.tbl.rows).toEqual(RECORD.blocks.tbl.rows);
  const doc = docFromValue(value, { strict: true });
  try {
    expect(doc.getMap("attrs").get("bd").has("columns")).toBe(false);
    expect(doc.getMap("attrs").get("bd").has("cards")).toBe(false);
    expect(doc.getMap("boardFields").get('["bd","card","a","title"]')).toBe("Sample inbox");
    expect(blocks.bd.columns).toEqual(RECORD.blocks.bd.columns);
    expect(blocks.bd.cards).toEqual(RECORD.blocks.bd.cards);
  } finally { doc.destroy(); }
  expect(blocks.tool).toMatchObject({ artifact: RECORD.blocks.tool.artifact, rev: "r1", state: { n: 1 } });
  expect(renderModel(project(blocks))).toBe(renderModel(project(expected)));
  expect(JSON.stringify(RECORD)).toBe(before);
});

test("uses invocation-local identifiers and canonical nested field order", () => {
  const first = migrateHybridValues([RECORD]);
  const pd = createPageDoc();
  try {
    for (let i = 0; i < 50; i++) { mintOp(pd); mintId(pd); }
    expect(migrateHybridValues([RECORD])).toEqual(first);
    expect(migrateHybridValues([reverseKeys(RECORD)])).toEqual(first);
  } finally { pd.ydoc.destroy(); }
});

test("matches the pinned marked seed in a fresh Node process", () => {
  const value = migrateHybridValues([small]);
  expect(blocksFromYValue(value)).toEqual({ p: { t: "paragraph", pos: "00000001", c: "Hi", m: [[2, "b"]] } });
  expect(createHash("sha256").update(JSON.stringify(value)).digest("hex")).toBe("13edd5b59d7e01d91db1538d3240b298d5c0554bd7c75d9a873c79c405050e80");
  const url = new URL("../../../../src/page/ybind/migrate.js", import.meta.url).href;
  const script = `
    import { readFileSync } from "node:fs";
    if (typeof document !== "undefined" || typeof window !== "undefined") throw new Error("Unexpected DOM");
    const { migrateHybridValues } = await import(${JSON.stringify(url)});
    process.stdout.write(JSON.stringify(migrateHybridValues(JSON.parse(readFileSync(0, "utf8")))));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { input: JSON.stringify([small]), encoding: "utf8" });
  expect(JSON.parse(output)).toEqual(value);
});

test("uses the existing tag precedence and per-tag tombstone behavior", () => {
  const a = { blocks: { p: { t: "paragraph", pos: "2", c: "old" }, q: { t: "paragraph", pos: "1", c: "earlier" } } };
  const b = { blocks: { p: { t: "paragraph", pos: "2", c: "new" }, q: { t: "paragraph", pos: "1", c: "deleted in this tag" } }, deleted: { q: true } };
  const blocks = blocksFromYValue(migrateHybridValues([a, b]));
  expect(orderedIds(blocks)).toEqual(["q", "p"]);
  expect(blocks.q.c).toBe("earlier");
  expect(blocks.p.c).toBe("new");
});

test("keeps fractional order for integer-shaped block ids", () => {
  const blocks = blocksFromYValue(migrateHybridValues([{ blocks: { "2": { t: "paragraph", pos: "B", c: "second" }, "10": { t: "paragraph", pos: "A", c: "first" } } }]));
  expect(orderedIds(blocks)).toEqual(["10", "2"]);
  expect(blocks["10"].c).toBe("first");
});

test("converts legacy inline JSON and preserves surrogate pairs and a literal atom character", () => {
  const blocks = blocksFromYValue(migrateHybridValues([{ blocks: {
    old: { t: "paragraph", pos: "A", c: [{ type: "text", text: "Both", marks: [{ type: "em" }, { type: "strong" }] }, { type: "hard_break" }, { type: "text", text: "tail" }] },
    unicode: { t: "paragraph", pos: "B", c: "😀\uFFFC", m: [[2, "s"], [1, ""]] },
    file: { t: "file", pos: "C", src: "/file.txt", name: "file.txt", size: 123, mime: "text/plain" },
  } }]));
  expect(blocks.old).toMatchObject({ c: "Both\uFFFCtail", m: [[4, "bi"], [1, '@{"type":"hard_break"}'], [4, ""]] });
  expect(blocks.unicode).toMatchObject({ c: "😀\uFFFC", m: [[2, "s"], [1, ""]] });
  expect(blocks.file).toMatchObject({ src: "/file.txt", name: "file.txt", size: 123, mime: "text/plain" });
});

test("partitions a large marked seed using the existing multipart format", () => {
  const c = "😀ab".repeat(8000);
  const value = migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "A", c, m: [[c.length, "bi"]] } } }]);
  expect(Object.keys(value.y).length).toBeGreaterThan(1);
  expect(Object.values(value.y).every((part) => typeof part === "string" && part.length <= PART)).toBe(true);
  expect(blocksFromYValue(value).p).toEqual({ t: "paragraph", pos: "00000001", c, m: [[c.length, "bi"]] });
});

test("duplicate application retains one seeded lineage", () => {
  const value = migrateHybridValues([RECORD]);
  const doc = new Y.Doc();
  try {
    for (const [, text] of entriesOf(value.y)) Y.applyUpdateV2(doc, dec(text));
    const first = Y.encodeStateAsUpdateV2(doc);
    for (const [, text] of entriesOf(value.y)) Y.applyUpdateV2(doc, dec(text));
    expect(Y.encodeStateAsUpdateV2(doc)).toEqual(first);
    expect([...Y.decodeStateVector(Y.encodeStateVector(doc)).keys()]).toEqual([1]);
    expect(blocksFromYValue(yValueOf(doc))).toEqual(blocksFromYValue(value));
  } finally { doc.destroy(); }
});

test("keeps the old lab seed helper unchanged", () => {
  const source = [{ id: "p", text: "plain lab seed" }];
  const before = seedValue(source);
  migrateHybridValues([RECORD]);
  expect(seedValue(source)).toEqual(before);
});

test("accepts empty pages and the existing null-as-empty text convention", () => {
  expect(blocksFromYValue(migrateHybridValues([{ blocks: {} }]))).toEqual({});
  expect(blocksFromYValue(migrateHybridValues([{ blocks: { p: { t: "paragraph", c: null, m: null } }, deleted: null }]))).toEqual({ p: { t: "paragraph", pos: "00000001", c: "" } });
});

test.each([
  ["missing source", []],
  ["already converted value", [{ v: 1, g: 0, y: {} }]],
  ["unknown block", [{ blocks: { p: { t: "future_widget", c: "text" } } }]],
  ["unknown field", [{ blocks: { p: { t: "paragraph", c: "text", future: { keep: true } } } }]],
  ["unknown mark", [{ blocks: { p: { t: "paragraph", c: "x", m: [[1, "z"]] } } }]],
  ["incomplete marks", [{ blocks: { p: { t: "paragraph", c: "text", m: [[1, "b"]] } } }]],
  ["unknown atom", [{ blocks: { p: { t: "paragraph", c: "\uFFFC", m: [[1, '@{"type":"future_atom"}']] } } }]],
  ["marks on code", [{ blocks: { p: { t: "code_block", c: "text", m: [[4, "b"]] } } }]],
  ["text on image", [{ blocks: { p: { t: "image", c: "keep this" } } }]],
  ["implicit-shaped id", [{ blocks: { "~intro": { t: "paragraph", c: "text" } } }]],
  ["copy-shaped id", [{ blocks: { "intro~2": { t: "paragraph", c: "text" } } }]],
])("refuses %s before returning a replacement", (_, values) => {
  const before = JSON.stringify(values);
  expect(() => migrateHybridValues(values)).toThrow(YMigrationError);
  expect(JSON.stringify(values)).toBe(before);
});

test("refuses text that the Yjs encoding cannot preserve", () => {
  expect(() => migrateHybridValues([{ blocks: { p: { t: "paragraph", c: "\ud800" } } }])).toThrow(/without loss/);
});
