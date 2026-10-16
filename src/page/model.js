// The page's live record and its ProseMirror document, and the way between them.
//
// The record is a flat map of blocks keyed by id: { "b-k1": { t, pos, ...attrs, c } }.
// `t` is the node type, `pos` a fractional order key, `c` the inline content in
// ProseMirror's JSON. Attributes equal to their schema default are left out, so
// a block's JSON is as small as the block. A table keeps its rows as an object
// keyed by row id ({ pos, cells: { <col id>: text } }), never a list, because a
// list in a live store is written whole and two tabs adding rows keep one.
//
// Order is (pos, id): pos strings compare as plain strings, and the id breaks
// the tie two tabs inserting at the same spot leave behind. Ids and positions
// are only ever assigned by a local edit (identityPlugin), never on open.
import { model, state } from "../vendor/prosemirror.vendor.js";

export const REMOTE = "clay-page-remote";

// ---- fractional order keys -------------------------------------------------

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const VALID_KEY = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export const isKey = (key) => typeof key === "string" && VALID_KEY.test(key);

// A key strictly between a and b, read as base-62 fractions 0.a and 0.b; a ""
// is zero and b null is one. No key ends in "0", so there is always room
// between two of them.
function midpoint(a, b) {
  if (b !== null) {
    let n = 0;
    while ((a[n] || "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

export function keyBetween(a = null, b = null) {
  if (a !== null && !isKey(a)) throw new TypeError(`page: invalid order key ${a}`);
  if (b !== null && !isKey(b)) throw new TypeError(`page: invalid order key ${b}`);
  if (a !== null && b !== null && a >= b) throw new RangeError(`page: order key ${a} is not before ${b}`);
  return midpoint(a ?? "", b);
}

// n keys between a and b, spread by halving so a thousand-row import keeps
// short keys.
export function keysBetween(a, b, n) {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  const mid = keyBetween(a, b);
  const half = Math.floor(n / 2);
  return [...keysBetween(a, mid, half), mid, ...keysBetween(mid, b, n - half - 1)];
}

export function orderedIds(map) {
  return Object.keys(map).sort((x, y) => {
    const px = map[x].pos ?? "", py = map[y].pos ?? "";
    if (px !== py) return px < py ? -1 : 1;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export function newId(prefix = "b") {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Date.now().toString(36)}${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}

// ---- block JSON <-> node ---------------------------------------------------

const KEYED = new Set(["id", "pos"]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (v) => (v === null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v)));

function attrsJson(node) {
  const out = {};
  for (const [name, spec] of Object.entries(node.type.spec.attrs || {})) {
    if (KEYED.has(name)) continue;
    if (!same(node.attrs[name], spec.default)) out[name] = copy(node.attrs[name]);
  }
  return out;
}

export function blockJson(node) {
  const out = { t: node.type.name, pos: node.attrs.pos, ...attrsJson(node) };
  if (node.type.name === "table") {
    const rows = {};
    node.forEach((row) => {
      const cells = {};
      row.forEach((cell) => { cells[cell.attrs.col] = cell.textContent; });
      rows[row.attrs.id] = { pos: row.attrs.pos, cells };
    });
    out.rows = rows;
  } else if (node.type.spec.content) {
    out.c = node.content.toJSON() || [];
  }
  return out;
}

export function blockMap(doc) {
  const map = {};
  doc.forEach((node) => { map[node.attrs.id] = blockJson(node); });
  return map;
}

export function nodeFromBlock(schema, id, blockValue) {
  const { t, pos, c, rows, ...attrs } = blockValue;
  if (t === "table") {
    const cols = orderedIds(attrs.cols || {});
    const { table_row: rowType, table_cell: cellType } = schema.nodes;
    const children = orderedIds(rows || {}).map((rid) => rowType.createChecked(
      { id: rid, pos: rows[rid].pos },
      cols.map((col) => {
        const text = rows[rid].cells?.[col];
        return cellType.createChecked({ col }, text ? schema.text(String(text)) : null);
      }),
    ));
    return schema.nodes.table.createChecked({ ...attrs, id, pos }, children);
  }
  return model.Node.fromJSON(schema, { type: t, attrs: { ...attrs, id, pos }, ...(c && c.length ? { content: c } : {}) });
}

export function docFromBlocks(schema, blocks) {
  const nodes = orderedIds(blocks).map((id) => nodeFromBlock(schema, id, blocks[id]));
  return nodes.length ? schema.nodes.doc.create(null, nodes) : schema.nodes.doc.createAndFill();
}

// The blocks a transaction touched, before and after, for diffOps. ProseMirror
// shares every unchanged node between the two documents, so identity is enough.
export function changedBlocks(before, after) {
  const index = (doc) => {
    const map = new Map();
    doc.forEach((node) => map.set(node.attrs.id, node));
    return map;
  };
  const b = index(before), a = index(after);
  const out = { before: {}, after: {} };
  for (const [id, node] of b) if (a.get(id) !== node) out.before[id] = blockJson(node);
  for (const [id, node] of a) if (b.get(id) !== node) out.after[id] = blockJson(node);
  return out;
}

// ---- identity: ids and order keys after a local edit -----------------------

// Indices of the longest run of keys, in document order, that is already
// strictly increasing. Those keep their pos; only the rest get new ones, so a
// moved block rewrites one key, not every key after it.
function longestIncreasing(keys) {
  const tails = [], tailAt = [], prev = new Array(keys.length).fill(-1);
  keys.forEach((key, i) => {
    if (key === null) return;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < key) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev[i] = tailAt[lo - 1];
    tails[lo] = key;
    tailAt[lo] = i;
  });
  const keep = new Set();
  for (let i = tailAt[tails.length - 1] ?? -1; i >= 0; i = prev[i]) keep.add(i);
  return keep;
}

// For siblings [{ id, pos }] in document order: the new { id, pos } each needs,
// or null. A missing id, or the second holder of an id (a split copies attrs
// to the new half, so the retained half keeps its id), gets a fresh one.
export function repairSiblings(items, prefix) {
  const seen = new Set();
  const fresh = items.map(({ id }) => {
    if (!id || seen.has(id)) return true;
    seen.add(id);
    return false;
  });
  const keep = longestIncreasing(items.map(({ pos }, i) => (!fresh[i] && isKey(pos) ? pos : null)));
  const out = items.map(() => null);
  for (let i = 0; i < items.length;) {
    if (keep.has(i)) { i++; continue; }
    let j = i;
    while (j < items.length && !keep.has(j)) j++;
    const lower = i > 0 ? items[i - 1].pos : null;
    const upper = j < items.length ? items[j].pos : null;
    const keys = keysBetween(lower, upper, j - i);
    for (let k = i; k < j; k++) out[k] = { id: fresh[k] ? newId(prefix) : items[k].id, pos: keys[k - i] };
    i = j;
  }
  return out;
}

export function identityPlugin() {
  return new state.Plugin({
    appendTransaction(transactions, _old, next) {
      if (!transactions.some((tr) => tr.docChanged && !tr.getMeta(REMOTE))) return null;
      const tr = next.tr;
      const fix = (node, at, change) => { if (change) tr.setNodeMarkup(at, null, { ...node.attrs, ...change }); };

      const top = [];
      next.doc.forEach((node, offset) => top.push({ node, offset }));
      repairSiblings(top.map(({ node }) => node.attrs), "b").forEach((change, i) => fix(top[i].node, top[i].offset, change));

      for (const { node, offset } of top) {
        if (node.type.name !== "table") continue;
        const rows = [];
        node.forEach((row, rowOffset) => rows.push({ row, at: offset + 1 + rowOffset }));
        repairSiblings(rows.map(({ row }) => row.attrs), "r").forEach((change, i) => fix(rows[i].row, rows[i].at, change));
      }
      return tr.docChanged ? tr : null;
    },
  });
}
