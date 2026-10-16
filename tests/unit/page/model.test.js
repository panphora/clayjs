import { schema } from "../../../src/page/schema.js";
import {
  REMOTE, blockJson, blockMap, changedBlocks, docFromBlocks, identityPlugin, isKey,
  keyBetween, keysBetween, nodeFromBlock, orderedIds, repairSiblings,
} from "../../../src/page/model.js";
import { diffOps } from "../../../src/live/ops.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

/**
 * The page's live record: a flat map of blocks keyed by id, ordered by
 * (pos, id). Every block kind survives record -> document -> record; ids and
 * order keys are only assigned by a local edit; a keystroke is one small op.
 */

const text = (t, marks) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

const EVERY_KIND = {
  "b-title": { t: "heading", pos: "1", level: 1, c: [text("Relay launch review")] },
  "b-p": { t: "paragraph", pos: "2", c: [text("We "), text("fixed", [{ type: "strong" }]), text(" it, "), text("see", [{ type: "link", attrs: { href: "https://example.com" } }]), { type: "hard_break" }, text("next")] },
  "b-empty": { t: "paragraph", pos: "3", c: [] },
  "b-li": { t: "list_item", pos: "4", indent: 1, c: [text("Nested bullet")] },
  "b-check": { t: "list_item", pos: "5", kind: "check", checked: true, owner: "Jules", due: "2026-10-23", c: [text("Check mobile empty state")] },
  "b-callout": { t: "callout", pos: "6", c: [text("Decision: launch")] },
  "b-code": { t: "code_block", pos: "7", lang: "js", c: [text("const a = 1;\n<b>")] },
  "b-toggle": { t: "toggle", pos: "8", c: [text("Interview notes")] },
  "b-inside": { t: "paragraph", pos: "9", parent: "b-toggle", c: [text("Lena: it clicked")] },
  "b-hr": { t: "divider", pos: "A" },
  "b-img": { t: "image", pos: "B", src: "/_/uploads/a/b.png", alt: "Inbox", caption: "The sample inbox", w: 480 },
  "t-1": {
    t: "table", pos: "C",
    cols: { c1: { pos: "1", name: "week", kind: "text" }, c2: { pos: "2", name: "signups", kind: "number" } },
    sort: { col: "c2", dir: "desc" },
    rows: { r1: { pos: "1", cells: { c1: "Sep 14", c2: "180" } }, r2: { pos: "2", cells: { c1: "Sep 21", c2: "" } } },
  },
  "ch-1": { t: "chart", pos: "D", source: "t-1", x: "c1", series: ["c2"], title: "Signups", highlight: "r2" },
  "k-1": { t: "board", pos: "E", columns: { todo: { pos: "1", name: "To do" } }, cards: { k1: { pos: "1", col: "todo", title: "Ship", owner: "Maya", due: null } } },
  "ai-1": { t: "tool", pos: "F", artifact: { title: "Countdown", html: "<p></p>", css: "", javascript: "", fallbackHtml: "<p>Oct 26</p>", summary: "" }, rev: "1", state: { n: 2 } },
  "x-1": { t: "preserved", pos: "G", html: "<marquee>kept</marquee>" },
};

function editor(blocks) {
  return pmState.EditorState.create({ doc: docFromBlocks(schema, blocks), plugins: [identityPlugin()] });
}

function find(doc, id) {
  let found = null;
  doc.forEach((node, offset) => { if (node.attrs.id === id) found = { node, offset }; });
  return found;
}

test("every block kind survives record -> document -> record", () => {
  const doc = docFromBlocks(schema, EVERY_KIND);
  expect(blockMap(doc)).toEqual(EVERY_KIND);
  expect(doc.childCount).toBe(Object.keys(EVERY_KIND).length);
});

test("attributes at their default are left out of a block's JSON", () => {
  const node = nodeFromBlock(schema, "b-x", { t: "list_item", pos: "1", c: [text("a")] });
  expect(blockJson(node)).toEqual({ t: "list_item", pos: "1", c: [text("a")] });
});

test("order is pos, then id for a tie", () => {
  expect(orderedIds({ b: { pos: "V" }, a: { pos: "V" }, c: { pos: "1" } })).toEqual(["c", "a", "b"]);
  const doc = docFromBlocks(schema, {
    "b-2": { t: "paragraph", pos: "V", c: [text("second")] },
    "b-1": { t: "paragraph", pos: "V", c: [text("first")] },
  });
  expect(doc.textBetween(0, doc.content.size, "|")).toBe("first|second");
});

test("keyBetween always lands strictly between and never ends in 0", () => {
  let keys = [keyBetween(null, null)];
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) {
    const at = Math.floor(rand() * (keys.length + 1));
    const key = keyBetween(keys[at - 1] ?? null, keys[at] ?? null);
    keys.splice(at, 0, key);
  }
  for (let i = 1; i < keys.length; i++) expect(keys[i - 1] < keys[i]).toBe(true);
  expect(keys.every(isKey)).toBe(true);
  expect(() => keyBetween("V", "V")).toThrow(RangeError);
  expect(() => keyBetween("V0", null)).toThrow(TypeError);
});

test("keysBetween spreads a large insert with short keys", () => {
  const keys = keysBetween("1", null, 900);
  expect(keys).toHaveLength(900);
  expect(new Set(keys).size).toBe(900);
  for (let i = 1; i < keys.length; i++) expect(keys[i - 1] < keys[i]).toBe(true);
  expect(keys[0] > "1").toBe(true);
  expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(6);
});

test("opening a record assigns nothing", () => {
  const blocks = { "b-1": { t: "paragraph", pos: "V", c: [text("a")] } };
  const s = editor(blocks);
  expect(blockMap(s.doc)).toEqual(blocks);
});

test("a split keeps the id on the retained half and gives the new half one between its neighbours", () => {
  let s = editor({
    "b-1": { t: "paragraph", pos: "1", c: [text("First half")] },
    "b-2": { t: "paragraph", pos: "2", c: [text("Next")] },
  });
  const p = find(s.doc, "b-1");
  s = s.apply(s.tr.split(p.offset + 1 + "First".length));
  const ids = [];
  s.doc.forEach((n) => ids.push(n.attrs.id));
  expect(ids[0]).toBe("b-1");
  expect(ids[2]).toBe("b-2");
  expect(ids[1]).toMatch(/^b-[0-9a-z]+$/);
  const map = blockMap(s.doc);
  expect(map["b-1"].c).toEqual([text("First")]);
  expect(map[ids[1]].c).toEqual([text(" half")]);
  expect(map["b-1"].pos < map[ids[1]].pos && map[ids[1]].pos < map["b-2"].pos).toBe(true);
});

test("a pasted copy of a block gets a fresh id, the original keeps its own", () => {
  let s = editor({
    "b-1": { t: "paragraph", pos: "1", c: [text("one")] },
    "b-2": { t: "paragraph", pos: "2", c: [text("two")] },
  });
  const copyOf = find(s.doc, "b-1").node;
  s = s.apply(s.tr.insert(s.doc.content.size, copyOf));
  const ids = [];
  s.doc.forEach((n) => ids.push(n.attrs.id));
  expect(ids.slice(0, 2)).toEqual(["b-1", "b-2"]);
  expect(ids[2]).not.toBe("b-1");
  expect(blockMap(s.doc)[ids[2]].pos > "2").toBe(true);
});

test("moving a block rewrites only that block's pos", () => {
  const blocks = {};
  for (let i = 1; i <= 6; i++) blocks[`b-${i}`] = { t: "paragraph", pos: String(i), c: [text(`p${i}`)] };
  let s = editor(blocks);
  const last = find(s.doc, "b-6");
  let tr = s.tr.delete(last.offset, last.offset + last.node.nodeSize);
  tr = tr.insert(0, last.node);
  const before = s.doc;
  s = s.apply(tr);
  const ids = [];
  s.doc.forEach((n) => ids.push(n.attrs.id));
  expect(ids).toEqual(["b-6", "b-1", "b-2", "b-3", "b-4", "b-5"]);
  const { before: was, after: now } = changedBlocks(before, s.doc);
  expect(Object.keys(now)).toEqual(["b-6"]);
  expect(now["b-6"].pos < "1").toBe(true);
  expect(diffOps(was, now, ["blocks"])).toEqual([{ op: "set", path: ["blocks", "b-6", "pos"], value: now["b-6"].pos }]);
});

test("a remote transaction is never repaired", () => {
  let s = editor({ "b-1": { t: "paragraph", pos: "1", c: [text("one")] } });
  const dup = find(s.doc, "b-1").node;
  s = s.apply(s.tr.insert(s.doc.content.size, dup).setMeta(REMOTE, true));
  const ids = [];
  s.doc.forEach((n) => ids.push(n.attrs.id));
  expect(ids).toEqual(["b-1", "b-1"]);
});

test("a duplicated table row gets a fresh row id", () => {
  let s = editor({ "t-1": EVERY_KIND["t-1"] });
  const table = find(s.doc, "t-1");
  const firstRow = table.node.child(0);
  s = s.apply(s.tr.insert(table.offset + 1 + table.node.content.size, firstRow));
  const rows = blockMap(s.doc)["t-1"].rows;
  const ids = Object.keys(rows);
  expect(ids).toHaveLength(3);
  expect(ids.slice(0, 2)).toEqual(["r1", "r2"]);
  expect(ids[2]).toMatch(/^r-/);
  expect(rows[ids[2]].pos > "2").toBe(true);
});

test("a keystroke is one small set op on that block", () => {
  const blocks = {};
  keysBetween(null, null, 200).forEach((pos, i) => { blocks[`b-${i}`] = { t: "paragraph", pos, c: [text(`Paragraph ${i} with some words in it`)] }; });
  let s = editor(blocks);
  const target = find(s.doc, "b-100");
  const before = s.doc;
  const started = performance.now();
  s = s.apply(s.tr.insertText("!", target.offset + 1 + 3));
  const { before: was, after: now } = changedBlocks(before, s.doc);
  const ops = diffOps(was, now, ["blocks"]);
  const elapsed = performance.now() - started;
  expect(ops).toEqual([{ op: "set", path: ["blocks", "b-100", "c", 0, "text"], value: "Par!agraph 100 with some words in it" }]);
  expect(elapsed).toBeLessThan(50);
});

test("repairSiblings reorders only what is out of order", () => {
  const out = repairSiblings([{ id: "a", pos: "1" }, { id: "b", pos: "5" }, { id: "c", pos: "3" }, { id: "d", pos: "4" }], "b");
  expect(out[0]).toBeNull();
  expect(out[2]).toBeNull();
  expect(out[3]).toBeNull();
  expect(out[1].id).toBe("b");
  expect(out[1].pos > "1" && out[1].pos < "3").toBe(true);
});
