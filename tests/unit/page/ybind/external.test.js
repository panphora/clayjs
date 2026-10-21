import { execFileSync } from "node:child_process";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { migrateHybridValues } from "../../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";
import { dec, enc, docFromValue, yValueOf, PART } from "../../../../src/page/ybind/provider.js";
import { entriesOf } from "../../../../src/page/ybind/parts.js";
import { BREAK } from "../../../../src/page/projection.js";

const seed = (blocks) => migrateHybridValues([{ blocks }]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const child = `
  import { readFileSync } from "node:fs";
  if (typeof window !== "undefined" || typeof document !== "undefined" || typeof DOMParser !== "undefined") throw new Error("Unexpected browser globals");
  const { readYValue, writeYValue } = await import("@panphora/clayjs/page/yjs");
  const { op, value, options } = JSON.parse(readFileSync(0, "utf8"));
  try {
    const pending = op.startsWith("write") ? writeYValue(value, options) : readYValue(value);
    if (op === "write-mutated") { value.y.seed = "not base64"; options.changes[0].content.c = "tampered"; }
    process.stdout.write(JSON.stringify({ result: await pending }));
  }
  catch (error) { process.stdout.write(JSON.stringify({ error: { code: error.code, message: error.message } })); }
`;
function run(op, value, options) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", child], { input: JSON.stringify({ op, value, options }), encoding: "utf8" }));
}

test("exports the DOM-free article projection for adapters", () => {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", `
    if (typeof document !== "undefined") throw new Error("Unexpected browser globals");
    const { projection } = await import("@panphora/clayjs/page/yjs");
    const html = projection.renderBlocks([{ id: "p", t: "paragraph", pos: "1", c: "hi" }]);
    process.stdout.write(JSON.stringify({ keys: Object.keys(projection).sort(), frozen: Object.isFrozen(projection), html }));
  `], { encoding: "utf8" });
  const { keys, frozen, html } = JSON.parse(out);
  expect(keys).toEqual(["ATOM", "BREAK", "canon", "normalizeText", "renderBlocks", "runsOf"]);
  expect(frozen).toBe(true);
  expect(html.html).toBe("<p data-id=\"0\">hi</p>");
});

test("loads the exported codec in plain Node and revisions include deletions and seed identity", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "abc" } });
  const first = run("read", value).result;
  const deleted = docFromValue(value, { strict: true });
  const alternate = new Y.Doc();
  try {
    const vector = Y.encodeStateVector(deleted);
    deleted.getText("flow").delete(2, 1);
    expect(Y.encodeStateVector(deleted)).toEqual(vector);
    const after = run("read", yValueOf(deleted)).result;
    expect(after.blocks.p.c).toBe("ac");
    expect(after.revision).not.toBe(first.revision);
    expect(run("write", yValueOf(deleted), { expectedRevision: first.revision, changes: [{ id: "p", content: { c: "old" } }] }).error.code).toBe("stale-revision");
    alternate.clientID = 42;
    const pd = createPageDoc(alternate);
    pd.flow.insertEmbed(0, { b: "p" });
    pd.flow.insert(1, "abc");
    pd.attrs.set("p", new Y.Map([["t", "paragraph"]]));
    expect(run("read", yValueOf(alternate)).result.blocks).toEqual(first.blocks);
    expect(run("read", yValueOf(alternate)).result.revision).not.toBe(first.revision);
  } finally { deleted.destroy(); alternate.destroy(); }
});

test("revision is stable across update order, multipart partitioning and compaction", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "abc", m: [[3, "b"]] } });
  const before = run("read", value).result;
  const written = run("write", value, { expectedRevision: before.revision, changes: [{ id: "p", content: { c: "ac", m: [[2, "b"]] } }] }).result;
  const reversed = { ...written.value, y: Object.fromEntries(Object.entries(written.value.y).reverse()) };
  expect(run("read", reversed).result.revision).toBe(written.revision);
  const text = value.y.seed;
  const count = Math.ceil(text.length / 31);
  const pieces = Object.fromEntries(Array.from({ length: count }, (_, i) => [`seed.${i}.${count}`, text.slice(i * 31, (i + 1) * 31)]));
  const partitioned = { ...written.value, y: { ...pieces, ...written.updates } };
  expect(run("read", partitioned).result.revision).toBe(written.revision);
  const merged = enc(Y.mergeUpdatesV2(entriesOf(written.value.y).map(([, part]) => dec(part))));
  expect(run("read", { v: 1, g: 0, y: { compacted: merged } }).result.revision).toBe(written.revision);
  expect(written.blocks.p).toEqual({ t: "paragraph", pos: "00000001", c: "ac", m: [[2, "b"]] });
});

test("requires a fresh revision and validates every edit before returning an update", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "one" }, q: { t: "heading", pos: "2", level: 3, c: "two" } });
  const original = clone(value);
  const revision = run("read", value).result.revision;
  expect(run("write", value, { changes: [{ id: "p", content: { c: "new" } }] }).error.code).toBe("missing-revision");
  expect(run("write", value, { expectedRevision: "stale", changes: [{ id: "p", content: { c: "new" } }] }).error.code).toBe("stale-revision");
  expect(run("write", value, { expectedRevision: revision, changes: [{ id: "p", content: { c: "new" } }, { id: "q", attrs: { future: true } }] }).error.code).toBe("invalid-content");
  expect(run("write", value, { expectedRevision: revision, changes: [{ id: "q", attrs: { level: "high" } }] }).error.code).toBe("invalid-content");
  expect(run("write", value, { expectedRevision: revision, changes: [{ id: "p", content: { c: "x", m: [[2, "b"]] } }] }).error.code).toBe("invalid-content");
  expect(value).toEqual(original);
  expect(run("read", value).result.revision).toBe(revision);
});

test("owns the request before asynchronous revision hashing", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "old" } });
  const revision = run("read", value).result.revision;
  const written = run("write-mutated", value, { expectedRevision: revision, changes: [{ id: "p", content: { c: "new" } }] }).result;
  expect(written.blocks.p.c).toBe("new");
  expect(written.value.y.seed).toBe(value.y.seed);
});

test("writes a fresh replacement as ordinary updates and preserves unrelated blocks and attributes", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "one", parent: "q" }, q: { t: "heading", pos: "2", level: 3, c: "two" } });
  const before = run("read", value).result;
  const written = run("write", value, { expectedRevision: before.revision, changes: [{ id: "p", content: { c: "ONE" }, attrs: { parent: null } }] }).result;
  expect(written.blocks.p).toEqual({ t: "paragraph", pos: "00000001", c: "ONE" });
  expect(written.blocks.q).toEqual(before.blocks.q);
  expect(written.revision).not.toBe(before.revision);
  expect(Object.keys(written.updates).length).toBeGreaterThan(0);
  expect(written.value.y.seed).toBe(value.y.seed);
  const doc = docFromValue(value, { strict: true });
  try {
    for (const [, bytes] of entriesOf(written.updates)) {
      Y.applyUpdateV2(doc, dec(bytes));
      const first = Y.encodeStateAsUpdateV2(doc);
      Y.applyUpdateV2(doc, dec(bytes));
      expect(Y.encodeStateAsUpdateV2(doc)).toEqual(first);
    }
    expect(blocksFromYValue(yValueOf(doc))).toEqual(written.blocks);
  } finally { doc.destroy(); }
  const newer = run("write", written.value, { expectedRevision: written.revision, changes: [{ id: "q", attrs: { level: 2 } }] }).result;
  expect(newer.blocks.q.level).toBeUndefined();
  expect(newer.blocks.p).toEqual(written.blocks.p);
});

test("writes marks and hard breaks through the existing text writer", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "plain" } });
  const revision = run("read", value).result.revision;
  const written = run("write", value, { expectedRevision: revision, changes: [{ id: "p", content: { c: "A\uFFFCB", m: [[1, "b"], [1, BREAK], [1, "i"]] } }] }).result;
  expect(written.blocks.p).toEqual({ t: "paragraph", pos: "00000001", c: "A\uFFFCB", m: [[1, "b"], [1, BREAK], [1, "i"]] });
  const remarked = run("write", written.value, { expectedRevision: written.revision, changes: [{ id: "p", content: { c: "A\uFFFCB", m: [[1, "i"], [1, BREAK], [1, "b"]] } }] }).result;
  expect(remarked.blocks.p.m).toEqual([[1, "i"], [1, BREAK], [1, "b"]]);
});

test("applies text edits in document order even when changes arrive out of order", () => {
  const value = seed({ a: { t: "paragraph", pos: "1", c: "short" }, b: { t: "paragraph", pos: "2", c: "last" } });
  const revision = run("read", value).result.revision;
  const written = run("write", value, { expectedRevision: revision, changes: [{ id: "b", content: { c: "LAST" } }, { id: "a", content: { c: "a much longer first paragraph" } }] }).result;
  expect(written.blocks.a.c).toBe("a much longer first paragraph");
  expect(written.blocks.b.c).toBe("LAST");
});

test("partitions a large external update without changing the revision", () => {
  const value = seed({ p: { t: "paragraph", pos: "1", c: "short" } });
  const revision = run("read", value).result.revision;
  const content = "long paragraph ".repeat(1500);
  const written = run("write", value, { expectedRevision: revision, changes: [{ id: "p", content: { c: content } }] }).result;
  expect(Object.keys(written.updates).length).toBeGreaterThan(1);
  expect(Object.values(written.updates).every((part) => part.length <= PART)).toBe(true);
  expect(run("read", written.value).result).toEqual({ blocks: written.blocks, revision: written.revision });
});

test("keeps the ID and attributes of an edited implicit paragraph", () => {
  const pd = createPageDoc();
  try {
    pd.flow.insert(0, "abc");
    const value = yValueOf(pd.ydoc);
    const revision = run("read", value).result.revision;
    const written = run("write", value, { expectedRevision: revision, changes: [{ id: "~start", content: { c: "abcd" }, attrs: { parent: "x" } }] }).result;
    expect(written.blocks["~start"]).toEqual({ t: "paragraph", pos: "00000001", parent: "x", c: "abcd" });
  } finally { pd.ydoc.destroy(); }
});

test("editing one block leaves another implicit paragraph and its attributes intact", () => {
  const pd = createPageDoc();
  try {
    pd.flow.insert(0, "lead");
    pd.flow.insertEmbed(pd.flow.length, { b: "hr" });
    pd.attrs.set("hr", new Y.Map([["t", "divider"]]));
    pd.flow.insert(pd.flow.length, "tail");
    pd.attrs.set("~hr", new Y.Map([["t", "paragraph"], ["parent", "hr"]]));
    const value = yValueOf(pd.ydoc);
    const before = run("read", value).result;
    const written = run("write", value, { expectedRevision: before.revision, changes: [{ id: "~start", content: { c: "LEAD" } }] }).result;
    expect(written.blocks["~start"].c).toBe("LEAD");
    expect(written.blocks.hr).toEqual(before.blocks.hr);
    expect(written.blocks["~hr"]).toEqual(before.blocks["~hr"]);
  } finally { pd.ydoc.destroy(); }
});

test("board replacements emit independent leaf field updates", () => {
  const value = seed({ bd: { t: "board", pos: "1", columns: { todo: { pos: "1", name: "To do" } }, cards: { a: { pos: "1", col: "todo", title: "A" }, b: { pos: "2", col: "todo", title: "B" } } } });
  const { blocks, revision } = run("read", value).result;
  const a = run("write", value, { expectedRevision: revision, changes: [{ id: "bd", attrs: { cards: { ...blocks.bd.cards, a: { ...blocks.bd.cards.a, title: "A1" } } } }] }).result;
  const b = run("write", value, { expectedRevision: revision, changes: [{ id: "bd", attrs: { cards: { ...blocks.bd.cards, b: { ...blocks.bd.cards.b, title: "B1" } } } }] }).result;
  const doc = docFromValue(value, { strict: true });
  try {
    for (const updates of [a.updates, b.updates]) for (const [, bytes] of entriesOf(updates)) Y.applyUpdateV2(doc, dec(bytes));
    const merged = blocksFromYValue(yValueOf(doc));
    expect(merged.bd.cards.a.title).toBe("A1");
    expect(merged.bd.cards.b.title).toBe("B1");
    expect(doc.getMap("attrs").get("bd").has("cards")).toBe(false);
    expect(doc.getMap("boardFields").get('["bd","card","a","title"]')).toBe("A1");
  } finally { doc.destroy(); }
  const removed = run("write", a.value, { expectedRevision: a.revision, changes: [{ id: "bd", attrs: { cards: { a: a.blocks.bd.cards.a } } }] }).result;
  expect(removed.blocks.bd.cards.b).toBeUndefined();
  const removedDoc = docFromValue(removed.value, { strict: true });
  try { expect(removedDoc.getMap("boardFields").get('["bd","card","b","alive"]')).toBe(false); }
  finally { removedDoc.destroy(); }
});

const TABLE = { t: "table", pos: "1", cols: { c1: { pos: "1", name: "Week" }, c2: { pos: "2", name: "Signups", kind: "number" } }, rows: { r1: { pos: "1", cells: { c1: "Sep 21", c2: "58" } }, r2: { pos: "2", cells: { c1: "Sep 28", c2: "41" } } } };
const tableFieldsOf = (value) => {
  const doc = docFromValue(value, { strict: true });
  try { return Object.fromEntries(doc.getMap("tableFields").entries()); } finally { doc.destroy(); }
};
const withCell = (rows, row, col, cell) => ({ ...rows, [row]: { ...rows[row], cells: { ...rows[row].cells, [col]: cell } } });

test("table replacements emit independent leaf field updates and keep the seed", () => {
  const value = seed({ tbl: clone(TABLE) });
  const { blocks, revision } = run("read", value).result;
  const a = run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { rows: withCell(blocks.tbl.rows, "r1", "c1", "Sep 20") } }] }).result;
  const b = run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { rows: withCell(blocks.tbl.rows, "r2", "c2", "44") } }] }).result;
  expect(tableFieldsOf(a.value)).toEqual({ '["tbl","cell","r1","c1"]': "Sep 20" });
  const doc = docFromValue(value, { strict: true });
  try {
    for (const updates of [a.updates, b.updates]) for (const [, bytes] of entriesOf(updates)) Y.applyUpdateV2(doc, dec(bytes));
    const merged = blocksFromYValue(yValueOf(doc));
    expect(merged.tbl.rows.r1.cells.c1).toBe("Sep 20");
    expect(merged.tbl.rows.r2.cells.c2).toBe("44");
    expect(doc.getMap("attrs").get("tbl").get("rows")).toEqual(TABLE.rows);
  } finally { doc.destroy(); }
});

test("table writes add and remove rows and columns as alive fields", () => {
  const value = seed({ tbl: clone(TABLE) });
  const { blocks, revision } = run("read", value).result;
  const rows = { r2: blocks.tbl.rows.r2, r3: { pos: "3", cells: { c1: "Oct 5", c3: "new" } } };
  const cols = { ...blocks.tbl.cols, c3: { pos: "3", name: "Note", width: 140 } };
  const written = run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { rows, cols } }] }).result;
  expect(written.blocks.tbl.rows).toEqual(rows);
  expect(written.blocks.tbl.cols).toEqual(cols);
  expect(tableFieldsOf(written.value)).toEqual({
    '["tbl","col","c3","alive"]': true, '["tbl","col","c3","name"]': "Note", '["tbl","col","c3","width"]': 140, '["tbl","col","c3","pos"]': "3",
    '["tbl","row","r1","alive"]': false,
    '["tbl","row","r3","alive"]': true, '["tbl","row","r3","pos"]': "3", '["tbl","cell","r3","c1"]': "Oct 5", '["tbl","cell","r3","c3"]': "new",
  });
  const again = run("write", written.value, { expectedRevision: written.revision, changes: [{ id: "tbl", attrs: { rows: written.blocks.tbl.rows } }] }).result;
  expect(tableFieldsOf(again.value)).toEqual(tableFieldsOf(written.value));
  expect(again.blocks).toEqual(written.blocks);
});

test("table writes keep marked cells and refuse malformed cells and widths", () => {
  const value = seed({ tbl: clone(TABLE) });
  const { blocks, revision } = run("read", value).result;
  const marked = { c: "Sep 21", m: [[3, "b"], [3, ""]] };
  const written = run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { rows: withCell(blocks.tbl.rows, "r1", "c1", marked) } }] }).result;
  expect(written.blocks.tbl.rows.r1.cells.c1).toEqual(marked);
  const unchanged = run("write", written.value, { expectedRevision: written.revision, changes: [{ id: "tbl", attrs: { rows: written.blocks.tbl.rows } }] }).result;
  expect(tableFieldsOf(unchanged.value)).toEqual(tableFieldsOf(written.value));
  for (const rows of [withCell(blocks.tbl.rows, "r1", "c1", { c: "x", m: [[2, "b"]] }), withCell(blocks.tbl.rows, "r1", "c1", 5), withCell(blocks.tbl.rows, "r1", "", "x")]) {
    expect(run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { rows } }] }).error.code).toBe("invalid-content");
  }
  for (const width of [0, -1, "120"]) {
    const cols = { ...blocks.tbl.cols, c1: { ...blocks.tbl.cols.c1, width } };
    expect(run("write", value, { expectedRevision: revision, changes: [{ id: "tbl", attrs: { cols } }] }).error.code).toBe("invalid-content");
  }
});
