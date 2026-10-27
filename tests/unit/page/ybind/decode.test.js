import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { schema } from "../../../../src/page/schema.js";
import { marksOf } from "../../../../src/page/inline.js";
import { ATOM, BREAK, DEFAULTS, orderedIds, unitsOf, runsOf, project, renderModel } from "../../../../src/page/projection.js";
import { blocksFromYValue, createPageDoc, walk, docOf } from "../../../../src/page/ybind/core.js";
import { yValueOf, docFromValue, YDecodeError } from "../../../../src/page/ybind/provider.js";
import { boardKey } from "../../../../src/page/ybind/board.js";
import { tableKey } from "../../../../src/page/ybind/table.js";
import { RECORD } from "../fixtures/all-kinds.js";

let docs;
beforeEach(() => { docs = []; });
afterEach(() => { for (const doc of docs) doc.destroy(); });
const track = (doc) => { docs.push(doc); return doc; };
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture(record = RECORD) {
  const pd = createPageDoc(track(new Y.Doc()));
  const expected = {};
  pd.ydoc.transact(() => {
    for (const id of orderedIds(record.blocks).filter((id) => !record.deleted?.[id])) {
      const { pos, w, c, m, ...fields } = clone(record.blocks[id]);
      const attrs = new Y.Map(Object.entries(fields).filter(([key]) => fields.t !== "board" || key !== "columns" && key !== "cards"));
      pd.attrs.set(id, attrs);
      if (fields.t === "board") {
        for (const [columnId, column] of Object.entries(fields.columns ?? {})) {
          pd.boardFields.set(boardKey(id, "column", columnId, "alive"), true);
          for (const key of ["name", "pos"]) pd.boardFields.set(boardKey(id, "column", columnId, key), column[key]);
        }
        for (const [cardId, card] of Object.entries(fields.cards ?? {})) {
          pd.boardFields.set(boardKey(id, "card", cardId, "alive"), true);
          for (const key of ["title", "owner", "due"]) if (card[key] !== undefined) pd.boardFields.set(boardKey(id, "card", cardId, key), card[key]);
          pd.boardFields.set(boardKey(id, "card", cardId, "placement"), { columnId: card.col, pos: card.pos });
        }
      }
      pd.flow.insertEmbed(pd.flow.length, { b: id }, {});
      if (c) {
        const units = unitsOf(m, c.length) ?? Array(c.length).fill("");
        let offset = 0;
        for (const [length, key] of runsOf(units)) {
          if (key === BREAK) {
            for (let i = 0; i < length; i++) pd.flow.insertEmbed(pd.flow.length, { br: 1 }, {});
          } else {
            const marks = Object.fromEntries(marksOf(schema, key).map((mark) => [mark.type.name + "~fixture", Object.keys(mark.attrs).length ? { ...mark.attrs } : true]));
            pd.flow.insert(pd.flow.length, c.slice(offset, offset + length), marks);
          }
          offset += length;
        }
      }
      expected[id] = { ...fields, pos: String(Object.keys(expected).length + 1).padStart(8, "0"), ...(c !== undefined ? { c } : {}), ...(m ? { m } : {}) };
    }
  });
  return { pd, expected, value: yValueOf(pd.ydoc) };
}

test("decodes the complete block fixture including table rows and unprojected tool state", () => {
  const { value, expected } = fixture();
  const before = JSON.stringify(value);
  const blocks = blocksFromYValue(value);
  expect(Object.keys(blocks)).toHaveLength(28);
  expect(blocks).toEqual(expected);
  expect(blocks.gone).toBeUndefined();
  expect(blocks.p1.m).toContainEqual([4, "bi"]);
  expect(blocks.p2.c).toContain(ATOM);
  expect(blocks.p2.m).toContainEqual([1, BREAK]);
  expect(blocks.tbl.rows).toEqual(RECORD.blocks.tbl.rows);
  expect(blocks.tool.state).toEqual({ n: 1 });
  expect(blocks.tool.artifact).toEqual(RECORD.blocks.tool.artifact);
  expect(renderModel(project(blocks))).toBe(renderModel(project(expected)));
  blocks.tool.state.n = 999;
  blocks.tbl.rows.r1.cells.c2 = "changed";
  expect(blocksFromYValue(value)).toEqual(expected);
  expect(JSON.stringify(value)).toBe(before);
});

test("covers file blocks, every supported top-level type, and UTF-16 mark lengths", () => {
  const record = clone(RECORD);
  record.blocks.download = { t: "file", pos: "U", src: "/file.txt", name: "file.txt", size: 123, mime: "text/plain" };
  record.blocks.unicode = { t: "paragraph", pos: "V", c: "😀\uFFFC", m: [[2, "s"], [1, ""]] };
  const { value, expected } = fixture(record);
  const actual = blocksFromYValue(value);
  expect(new Set(Object.values(actual).map((block) => block.t))).toEqual(new Set(Object.keys(DEFAULTS)));
  expect(actual).toEqual(expected);
  expect(actual.unicode).toMatchObject({ c: "😀\uFFFC", m: [[2, "s"], [1, ""]] });
});

test("resolves board fields in the editor and decoder, including hidden and missing-column cards", () => {
  const { pd } = fixture();
  pd.boardFields.set(boardKey("bd", "card", "c", "alive"), false);
  pd.boardFields.set(boardKey("bd", "card", "b", "placement"), { columnId: "lost", pos: "2" });
  const board = blocksFromYValue(yValueOf(pd.ydoc)).bd;
  const projected = docOf(pd, walk(pd)).child(24).attrs;
  expect(board.columns).toEqual(RECORD.blocks.bd.columns);
  expect(board.cards).toEqual({ a: RECORD.blocks.bd.cards.a, b: { ...RECORD.blocks.bd.cards.b, col: "lost" } });
  expect(projected.columns).toEqual(board.columns);
  expect(projected.cards).toEqual(board.cards);
  expect(renderModel(project({ bd: board }))).toContain("data-missing");
});

test("refuses nonempty unknown roots and ignores empty unknown roots", () => {
  const { pd } = fixture({ blocks: { p: { t: "paragraph", pos: "1", c: "text" } } });
  pd.ydoc.getMap("future");
  expect(blocksFromYValue(yValueOf(pd.ydoc)).p.c).toBe("text");
  pd.ydoc.getMap("future").set("payload", true);
  expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ code: "unsupported-content" }));
  pd.ydoc.getMap("future").delete("payload");
  expect(blocksFromYValue(yValueOf(pd.ydoc)).p.c).toBe("text");
});

test.each([
  ["not JSON", "broken", true],
  ["wrong tuple length", '["bd","card","a"]', true],
  ["unknown field", boardKey("bd", "card", "a", "future"), true],
  ["unknown entity kind", boardKey("bd", "widget", "a", "title"), "x"],
  ["wrong alive value", boardKey("bd", "card", "a", "alive"), "yes"],
  ["wrong placement", boardKey("bd", "card", "a", "placement"), { columnId: "k1", pos: 2 }],
])("refuses malformed board field: %s", (_, key, value) => {
  const { pd } = fixture();
  pd.boardFields.set(key, value);
  expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ code: "unsupported-content" }));
});

test("resolves table fields over the seed in the editor, the decoder and the article", () => {
  const { pd } = fixture();
  const marked = { c: "invite <first> now", m: [[6, "b"], [12, ""]] };
  pd.tableFields.set(tableKey("tbl", "cell", "r2", "c3"), marked);
  pd.tableFields.set(tableKey("tbl", "row", "r1", "alive"), false);
  pd.tableFields.set(tableKey("tbl", "row", "r3", "alive"), true);
  pd.tableFields.set(tableKey("tbl", "row", "r3", "pos"), "3");
  pd.tableFields.set(tableKey("tbl", "cell", "r3", "c1"), "Oct 5");
  pd.tableFields.set(tableKey("tbl", "cell", "r3", "c2"), "63");
  pd.tableFields.set(tableKey("tbl", "col", "c3", "name"), "Notes");
  pd.tableFields.set(tableKey("tbl", "col", "c2", "width"), 96);
  const table = blocksFromYValue(yValueOf(pd.ydoc)).tbl;
  expect(table.rows).toEqual({ r2: { pos: "2", cells: { c1: "Sep 28", c2: "41", c3: marked } }, r3: { pos: "3", cells: { c1: "Oct 5", c2: "63" } } });
  expect(table.cols).toEqual({ ...RECORD.blocks.tbl.cols, c2: { ...RECORD.blocks.tbl.cols.c2, width: 96 }, c3: { pos: "3", name: "Notes" } });
  let node = null;
  docOf(pd, walk(pd)).forEach((child) => { if (child.attrs.id === "tbl") node = child; });
  expect(node.childCount).toBe(2);
  expect(node.child(0).child(2).textContent).toBe("invite <first> now");
  expect(node.child(1).attrs.id).toBe("r3");
  expect(node.attrs.cols.c3.name).toBe("Notes");
  const html = renderModel(project({ tbl: table }));
  expect(html).toContain("<td><strong>invite</strong> &lt;first&gt; now</td>");
  expect(html).toContain("<th data-col=\"c3\">Notes</th>");
  expect(html).not.toContain("[object Object]");
});

test.each([
  ["a three-part key", '["tbl","row","r1"]', true],
  ["an unknown row field", tableKey("tbl", "row", "r1", "name"), "x"],
  ["a malformed cell", tableKey("tbl", "cell", "r1", "c1"), { c: "x", m: [[2, "b"]] }],
  ["a key for a table that is not on the page", tableKey("gone", "col", "c1", "width"), -1],
])("refuses a malformed table field: %s", (_, key, value) => {
  const { pd } = fixture();
  pd.tableFields.set(key, value);
  expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ code: "unsupported-content" }));
});

test("runs the exported decoder in a fresh Node process without a DOM", () => {
  const { value, expected } = fixture();
  const url = new URL("../../../../src/page/ybind/core.js", import.meta.url).href;
  const script = `
    import { readFileSync } from "node:fs";
    if (typeof window !== "undefined" || typeof document !== "undefined" || typeof DOMParser !== "undefined") throw new Error("Unexpected DOM");
    const { blocksFromYValue } = await import(${JSON.stringify(url)});
    process.stdout.write(JSON.stringify(blocksFromYValue(JSON.parse(readFileSync(0, "utf8")))));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { input: JSON.stringify(value), encoding: "utf8" });
  expect(JSON.parse(output)).toEqual(expected);
});

test("preserves the walker's removed-block and duplicate visibility policy", () => {
  const { pd } = fixture({ blocks: { p: { t: "paragraph", pos: "1", c: "kept" }, q: { t: "paragraph", pos: "2", c: "removed" } } });
  let removed;
  for (let it = pd.flow._start; it; it = it.right) if (it.content instanceof Y.ContentEmbed && it.content.embed.b === "q") removed = `${it.id.client}.${it.id.clock}`;
  expect(removed).toBeDefined();
  pd.gone.set(removed, { b: "q", e: null });
  pd.flow.insertEmbed(pd.flow.length, { b: "p" }, {});
  pd.flow.insert(pd.flow.length, "duplicate", {});
  const blocks = blocksFromYValue(yValueOf(pd.ydoc));
  expect(Object.keys(blocks)).toEqual(["p"]);
  expect(blocks.p.c).toBe("kept");
  expect(walk(pd).orphans.map((orphan) => orphan.text)).toEqual(expect.arrayContaining(["removed", "duplicate"]));
});

test("decodes implicit text, empty pages, and plain text after an atom", () => {
  const pd = createPageDoc(track(new Y.Doc()));
  pd.flow.insert(0, "lead", {});
  pd.flow.insertEmbed(pd.flow.length, { b: "divider" }, {});
  pd.attrs.set("divider", new Y.Map([["t", "divider"]]));
  pd.flow.insert(pd.flow.length, "tail", {});
  expect(blocksFromYValue(yValueOf(pd.ydoc))).toEqual({
    "~start": { t: "paragraph", pos: "00000001", c: "lead" },
    divider: { t: "divider", pos: "00000002" },
    "~divider": { t: "paragraph", pos: "00000003", c: "tail" },
  });
  expect(blocksFromYValue({ v: 1, y: {} })).toEqual({});
  expect(typeof docOf).toBe("function");
});

test("keeps both implicit paragraphs after duplicate atom markers in the article", () => {
  const pd = createPageDoc(track(new Y.Doc()));
  pd.ydoc.transact(() => {
    pd.attrs.set("img", new Y.Map([["t", "divider"]]));
    pd.flow.insertEmbed(0, { b: "img" }, {});
    pd.flow.insert(pd.flow.length, "first orphan text", {});
    pd.flow.insertEmbed(pd.flow.length, { b: "img" }, {});
    pd.flow.insert(pd.flow.length, "second orphan text", {});
  });
  const blocks = blocksFromYValue(yValueOf(pd.ydoc));
  const texts = Object.values(blocks).map((block) => block.c).filter(Boolean);
  expect(texts).toEqual(["first orphan text", "second orphan text"]);
  const html = renderModel(project(blocks));
  expect(html).toContain("first orphan text");
  expect(html).toContain("second orphan text");
});

test("accepts complete multipart captures and propagates strict loading failures", () => {
  const { value, expected } = fixture();
  const text = value.y.seed;
  const count = Math.ceil(text.length / 200);
  const parts = Object.fromEntries(Array.from({ length: count }, (_, i) => [`capture.${i}.${count}`, text.slice(i * 200, (i + 1) * 200)]).reverse());
  expect(count).toBeGreaterThan(1);
  expect(blocksFromYValue({ v: 1, y: parts })).toEqual(expected);
  delete parts[`capture.1.${count}`];
  expect(() => blocksFromYValue({ v: 1, y: parts })).toThrow(expect.objectContaining({ code: "incomplete-update" }));
  expect(() => blocksFromYValue({ v: 2, y: {} })).toThrow(expect.objectContaining({ code: "invalid-value" }));
});

test("honors mark cancellations and keeps attributes the block type has no schema for", () => {
  const { pd } = fixture({ blocks: { p: { t: "paragraph", pos: "1", c: "bold", m: [[4, "b"]] } } });
  pd.flow.format(1, 4, { "strong~fixture!cancel": true });
  pd.attrs.get("p").set("level", 4);
  pd.attrs.get("p").set("parent", null);
  expect(blocksFromYValue(yValueOf(pd.ydoc)).p).toEqual({ t: "paragraph", pos: "00000001", level: 4, c: "bold" });
});

test("keeps a newer peer's block type, marks and attributes as the records they are", () => {
  const { pd } = fixture({ blocks: { p: { t: "paragraph", pos: "1", c: "text" }, k: { t: "paragraph", pos: "2", c: "note" } } });
  pd.attrs.get("p").set("t", "future_widget");
  pd.attrs.get("p").set("theme", { bg: "red", tags: ["a"] });
  pd.flow.format(1, 2, { "underline~future": { color: "red" } });
  pd.flow.format(6, 2, { "annotation~future": { thread: "t-1" }, "clay_opaque_code~future": { tokens: ["u"] } });
  pd.attrs.get("k").set("due", "2026-11-01");
  expect(blocksFromYValue(yValueOf(pd.ydoc))).toEqual({
    p: { t: "future_widget", pos: "00000001", theme: { bg: "red", tags: ["a"] }, c: "text", m: [[2, "x[\"underline\",{\"color\":\"red\"}]"], [2, ""]] },
    k: { t: "paragraph", pos: "00000002", due: "2026-11-01", c: "note", m: [[2, "x[\"annotation\",{\"thread\":\"t-1\"}]u"], [2, ""]] },
  });
});

test.each([
  ["atom", (pd) => pd.flow.insertEmbed(2, { future_atom: 1 })],
  ["block attributes", (pd) => pd.attrs.set("p", { t: "paragraph" })],
  ["code hard break", (pd) => { pd.attrs.get("p").set("t", "code_block"); pd.flow.insertEmbed(2, { br: 1 }); }],
  ["mark key", (pd) => pd.flow.format(1, 1, { "future/mark~x": true })],
  ["mark token", (pd) => pd.flow.format(1, 1, { "clay_opaque_code~x": { tokens: ["u~"] } })],
])("refuses an unsupported %s instead of returning partial block data", (_, change) => {
  const { pd } = fixture({ blocks: { p: { t: "paragraph", pos: "1", c: "text" } } });
  change(pd);
  expect(() => blocksFromYValue(yValueOf(pd.ydoc))).toThrow(expect.objectContaining({ name: "YDecodeError", code: "unsupported-content" }));
});

test("destroys temporary documents on success and on content failure", () => {
  const { value } = fixture();
  const bad = track(docFromValue(value, { strict: true }));
  bad.getMap("attrs").set("p1", { t: "paragraph" });
  const badValue = yValueOf(bad);
  const destroy = jest.spyOn(Y.Doc.prototype, "destroy");
  try {
    expect(blocksFromYValue(value).h.c).toBe("Relay launch review");
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(() => blocksFromYValue(badValue)).toThrow(YDecodeError);
    expect(destroy).toHaveBeenCalledTimes(2);
  } finally { destroy.mockRestore(); }
});
