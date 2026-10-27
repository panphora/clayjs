// The long-document fixture: 2,000 top-level blocks built from the production schema
// and projection helpers, from one seed. No images and no network: two tabs, one page.
import { schema } from "../../../../src/page/schema.js";
import { markKey } from "../../../../src/page/inline.js";
import { runsOf } from "../../../../src/page/projection.js";
import { buildPageValue, seedClientId } from "../../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";

export const LONG_DOCUMENT = Object.freeze({
  paragraphs: 1_500,
  headings: 200,
  listItems: 200,
  toggles: 80,
  tables: 20,
  blocks: 2_000,
});

export const LONG_DOCUMENT_SEED = 20261026;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const int = (n) => Math.floor(next() * n);
  return { next, int };
}

const ordered = (...marks) => marks.filter(Boolean).sort((a, b) => a.type.rank - b.type.rank);
const strong = () => schema.marks.strong.create();
const em = () => schema.marks.em.create();
const code = () => schema.marks.code.create();
const link = (href) => schema.marks.link.create({ href });
const keys = (...marks) => markKey(ordered(...marks));
const S = keys(strong());
const E = keys(em());
const SE = keys(strong(), em());
const C = keys(code());
const L = keys(link("https://example.test/long-document"));
const SL = keys(strong(), link("https://example.test/long-document"));

const WORDS = ["activation", "retention", "note", "handoff", "review", "decision", "outline", "session", "checkpoint", "session-log"];
const word = (r, i) => WORDS[(i * 7 + r.int(WORDS.length)) % WORDS.length];

function prose(r, n, offset = 0) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(word(r, i + offset));
  return parts.join(" ");
}

function marked(parts) {
  const c = parts.map(([text]) => text).join("");
  const units = parts.map(([text, key]) => [text.length, key]);
  const m = runsOf(units.flatMap(([length, key]) => Array(length).fill(key)));
  return { c, ...(units.some(([, key]) => key) ? { m } : {}) };
}

function textBlock(type, id, index, r, extra = {}) {
  const n = 3 + r.int(14);
  const long = index % 137 === 0;
  const body = long
    ? `unbroken${"x".repeat(120)}${index}`
    : index % 53 === 0
      ? marked([
          [prose(r, Math.max(1, n >> 1)) + " ", ""],
          ["bold run", S],
          [" and ", ""],
          ["bold em", SE],
          [" then ", ""],
          ["link text", L],
          [" / ", ""],
          ["strong link", SL],
          [" / ", ""],
          ["code span", C],
          [" / ", ""],
          ["emphasis", E],
          [". " + prose(r, n >> 1, 3), ""],
        ])
      : { c: prose(r, n, index) };
  const block = { t: type, pos: String(index + 1).padStart(8, "0"), ...body, ...extra };
  if (type === "heading") block.level = 1 + (index % 3);
  if (type === "list_item") {
    block.kind = index % 3 === 0 ? "ordered" : index % 5 === 0 ? "check" : "bullet";
    if (block.kind === "check") block.checked = index % 2 === 0;
    if (block.kind === "ordered") block.indent = 1;
  }
  if (type === "toggle") {
    block.open = false;
    block.c = `Toggle ${id}`;
    delete block.m;
  }
  return block;
}

function tableBlock(index, r) {
  const cols = {
    c1: { pos: "1", name: "Week", kind: "date" },
    c2: { pos: "2", name: "Activation %", kind: "number" },
    c3: { pos: "3", name: "Note" },
  };
  const rows = {};
  for (let row = 1; row <= 3; row++) {
    rows[`r${row}`] = {
      pos: String(row),
      cells: { c1: `2026-10-${String(row).padStart(2, "0")}`, c2: String(20 + r.int(60) + index), c3: prose(r, 2, row) },
    };
  }
  return { t: "table", pos: String(index + 1).padStart(8, "0"), cols, rows };
}

function opaque(block) {
  return {
    ...block,
    format: {
      v: 1,
      kind: "newer-format",
      name: "m10-envelope",
      payload: { attrs: { tone: "notice", color: "#3b82f6" }, text: "opaque data a reader keeps", nested: { n: [1, 2, 3] } },
    },
  };
}

// The document order is the seed's: every block takes one slot, and the type of each
// slot comes from a seeded shuffle, so the quota is exact and no reseed can move it.
export function longDocumentBlocks(seed = LONG_DOCUMENT_SEED) {
  const r = rng(seed);
  const slots = Array.from({ length: LONG_DOCUMENT.blocks }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const kind = new Array(LONG_DOCUMENT.blocks).fill("paragraph");
  let at = 0;
  for (const name of ["heading", "list_item", "toggle", "table"]) {
    const count = { heading: LONG_DOCUMENT.headings, list_item: LONG_DOCUMENT.listItems, toggle: LONG_DOCUMENT.toggles, table: LONG_DOCUMENT.tables }[name];
    for (let i = 0; i < count; i++) kind[slots[at++]] = name;
  }
  const toggles = [];
  for (let i = 0; i < kind.length; i++) if (kind[i] === "toggle") toggles.push(i);
  const parentOf = (index) => {
    let best = null;
    for (const t of toggles) if (t < index && index - t <= 12) best = t;
    return best === null ? null : `t${best + 1}`;
  };
  const blocks = {};
  for (let index = 0; index < kind.length; index++) {
    const name = kind[index];
    const id = `${name[0]}${index + 1}`;
    if (name === "table") { blocks[id] = tableBlock(index, r); continue; }
    const extra = {};
    if (name !== "toggle" && index % 401 === 0) extra.parent = null;
    const block = textBlock(name, id, index, r);
    if (name === "paragraph" || name === "list_item") {
      const parent = parentOf(index);
      if (parent && index % 7 === 0) block.parent = parent;
    }
    blocks[id] = name === "paragraph" && index % 401 === 0 ? opaque(block) : block;
  }
  return blocks;
}

export function countOf(blocks) {
  const counts = { paragraph: 0, heading: 0, list_item: 0, toggle: 0, table: 0 };
  for (const block of Object.values(blocks)) {
    if (!Object.hasOwn(counts, block.t)) throw new Error(`long-document: unexpected block type ${block.t}`);
    counts[block.t] += 1;
  }
  return counts;
}

export function buildLongDocument({ seed = LONG_DOCUMENT_SEED } = {}) {
  const blocks = longDocumentBlocks(seed);
  const counts = countOf(blocks);
  expectCounts(counts);
  const value = buildPageValue([{ blocks }], seedClientId(blocks));
  const decoded = blocksFromYValue(value);
  const total = Object.keys(decoded).length;
  if (total !== LONG_DOCUMENT.blocks) throw new Error(`long-document: built ${total} top-level blocks, expected ${LONG_DOCUMENT.blocks}`);
  return { seed, value, blocks: decoded, counts, total };
}

function expectCounts(counts) {
  const want = {
    paragraph: LONG_DOCUMENT.paragraphs,
    heading: LONG_DOCUMENT.headings,
    list_item: LONG_DOCUMENT.listItems,
    toggle: LONG_DOCUMENT.toggles,
    table: LONG_DOCUMENT.tables,
  };
  for (const [type, n] of Object.entries(want)) if (counts[type] !== n) throw new Error(`long-document: ${counts[type]} ${type} blocks, expected ${n}`);
  if (Object.values(counts).reduce((a, b) => a + b, 0) !== LONG_DOCUMENT.blocks) throw new Error(`long-document: expected exactly ${LONG_DOCUMENT.blocks} top-level blocks`);
}
