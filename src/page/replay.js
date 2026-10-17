// The replayed merge for one text block: pure functions, no store, no lane, no
// timers. Every tab feeds a block's ops to `step` (a set or a delete) and
// `tombstone` in room order, and gets the same agreed value S.
//
// A text block is { t, c, m?, ...fields }: c is its flat text, m (optional) one
// mark key per UTF-16 unit of c ("" for none). A write made by the page binding
// also carries w, which never reaches S or the saved file:
//   a  the writing tab
//   e  the epoch it was made in
//   k  the seq its editor was last released at: its steps extend S at k
//   s  its splices in order, [p, e, removed, n, removedMarks?]: offsets into the
//      text before that splice, whose length is n. The base is derived from the
//      write itself (chainOf), so a tab with no history can still place it.
//   g  on a repair: the seq the writer computed S through
//   h  on a heal: the seq the healing tab had reached in the lost room
//   u  on a heal: per splice, the lost room's seq of its write (null: unknown)
//   f  the non-text fields the write changed: S takes only those from it, so a
//      typing write never undoes a peer's toggle or move. Without f, S takes
//      every field of the write.
//
// Placement, the first that applies:
//   1. the step mapper, when this replay's history reaches back to k: positions
//      map through every write after k, ties at one spot go to the lower tab id,
//      and a delete removes only characters its writer had seen;
//   2. the self-described base placed by a diff (placeSplice), with a notice
//      when a delete cannot be placed exactly;
//   3. merge3Text, with the losing side in a notice.
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";
const { merge3Text, diff } = HyperMorph;

export const LIMITS = { logEntries: 1024, logBytes: 256 * 1024 };

export const strip = (v) => {
  if (!v) return null;
  const { w, ...rest } = v;
  return rest;
};
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",")}}` : JSON.stringify(v ?? null));
// 64 bits in two 32-bit lanes, so a divergent value never passes as agreed.
function hash64(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
export const hashOf = (v) => hash64(canon(strip(v)));

const blank = (n) => new Array(n).fill("");
const put = (arr, from, to, items) => [...arr.slice(0, from), ...items, ...arr.slice(to)];
const marksOf = (v) => (v && Array.isArray(v.m) && v.m.length === v.c.length ? v.m : null);
// The fields S takes from write X (see f above).
function fieldsOf(r, X) {
  const f = X.w && X.w.f;
  if (!Array.isArray(f) || !r.S) return strip(X);
  const out = { ...r.S };
  for (const name of f) {
    if (name === "c" || name === "m" || name === "w") continue;
    if (Object.prototype.hasOwnProperty.call(X, name)) out[name] = X[name];
    else delete out[name];
  }
  return out;
}

export function withMarks(fields, c, marks) {
  const { c: _c, m: _m, w: _w, ...rest } = fields;
  return marks && marks.some(Boolean) ? { ...rest, c, m: marks } : { ...rest, c };
}
const isHigh = (u) => u >= 0xd800 && u <= 0xdbff;
const isLow = (u) => u >= 0xdc00 && u <= 0xdfff;

// The single splice that turns a into b, never cutting a surrogate pair.
export function spliceOf(a, b) {
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  if (p > 0 && isHigh(a.charCodeAt(p - 1))) p--;
  let s = 0;
  while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  if (s > 0 && isLow(a.charCodeAt(a.length - s))) s--;
  return { p, e: a.length - s, t: b.slice(p, b.length - s) };
}

// The changes from oldText to newText as { from, to, t } in old offsets. The
// common prefix and suffix are cut off first, less a margin that ends at a
// space, so the word diff only segments the changed part: a 10,000-character
// CJK paragraph costs what its edit costs.
const MARGIN = 8, REACH = 64;
const isSpace = (u) => u === 32 || u === 10 || u === 9 || u === 0xa0;
export function regions(oldText, newText) {
  if (oldText === newText) return [];
  const n = Math.min(oldText.length, newText.length);
  let p = 0;
  while (p < n && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
  let s = 0;
  while (s < n - p && oldText.charCodeAt(oldText.length - 1 - s) === newText.charCodeAt(newText.length - 1 - s)) s++;
  p = Math.max(0, p - MARGIN);
  for (let i = 0; p > 0 && i < REACH && !isSpace(oldText.charCodeAt(p - 1)); i++) p--;
  s = Math.max(0, s - MARGIN);
  for (let i = 0; s > 0 && i < REACH && !isSpace(oldText.charCodeAt(oldText.length - s)); i++) s--;
  if (p > 0 && isLow(oldText.charCodeAt(p))) p--;
  if (s > 0 && isLow(oldText.charCodeAt(oldText.length - s))) s--;
  const a = oldText.slice(p, oldText.length - s), b = newText.slice(p, newText.length - s);
  return diff(a, b).map((h) => {
    const sp = spliceOf(a.slice(h.bs, h.be), h.text);
    return { from: p + h.bs + sp.p, to: p + h.bs + sp.e, t: sp.t };
  });
}

// A caret through those changes; text inserted at the caret goes after it.
export function mapOffset(oldText, newText, offset) {
  let delta = 0;
  for (const g of regions(oldText, newText)) {
    if (offset <= g.from) break;
    if (offset >= g.to) { delta += g.t.length - (g.to - g.from); continue; }
    return g.from + delta + g.t.length;
  }
  return offset + delta;
}

// Where offset q of the base sits in `side`: a change starting at q stays after
// it; inside a range the other side removed, the start of that range; inside a
// range the other side replaced with other text, null.
function mapHunks(hunks, q) {
  let delta = 0;
  for (const h of hunks) {
    if (h.from >= q) break;
    if (h.to <= q) { delta += h.t.length - (h.to - h.from); continue; }
    if (h.t === "") return h.from + delta;
    return null;
  }
  return q + delta;
}

// A writer's splice { from, to, t } of `base`, placed in `side`, or null when
// the other side changed text inside its range.
export function placeSplice(base, side, sp) {
  const hunks = regions(base, side);
  for (const h of hunks) {
    if (h.t !== "" && h.to > h.from && h.from < sp.to && h.to > sp.from) return null;
    if (h.from === h.to && h.from > sp.from && h.from < sp.to) return null;
  }
  const from = mapHunks(hunks, sp.from);
  const to = sp.to === sp.from ? from : mapHunks(hunks, sp.to);
  if (from === null || to === null || to < from) return null;
  return { from, to, t: sp.t };
}

// The write's base and steps, derived backward from its own text and splices.
// Each step: { from, to, t, tm, removed, rm }, offsets into the text before it.
export function chainOf(X) {
  const s = X && X.w && X.w.s;
  if (!Array.isArray(s) || !s.length || typeof X.c !== "string") return null;
  let c = X.c;
  let m = marksOf(X) ?? blank(c.length);
  const steps = [];
  for (let i = s.length - 1; i >= 0; i--) {
    if (!Array.isArray(s[i])) return null;
    const [p, e, removed, n, rm] = s[i];
    if (typeof removed !== "string" || !Number.isInteger(p) || !Number.isInteger(n) || p < 0 || e < p || e > n || e - p !== removed.length) return null;
    const len = c.length - p - (n - e);
    if (len < 0 || p + len > c.length) return null;
    const removedMarks = Array.isArray(rm) && rm.length === removed.length ? rm : blank(removed.length);
    steps.unshift({ from: p, to: e, t: c.slice(p, p + len), tm: m.slice(p, p + len), removed, rm: removedMarks });
    c = c.slice(0, p) + removed + c.slice(p + len);
    m = put(m, p, p + len, removedMarks);
  }
  return { base: { c, m }, steps };
}

// The splice a local edit makes: [from, to) of `before` replaced.
export function spliceFor(before, beforeMarks, from, to) {
  const rm = beforeMarks ? beforeMarks.slice(from, to) : [];
  return [from, to, before.slice(from, to), before.length, ...(rm.some(Boolean) ? [rm] : [])];
}

// Splices that turn fromText into toText, right to left so each one's offsets
// still hold.
export function chainFromDiff(fromText, fromMarks, toText) {
  const out = [];
  let n = fromText.length;
  for (const g of regions(fromText, toText).reverse()) {
    out.push(spliceFor(fromText, fromMarks, g.from, g.to).map((v, i) => (i === 3 ? n : v)));
    n += g.t.length - (g.to - g.from);
  }
  return out;
}

// Private-use encoding for merge3Text: every marked UTF-16 unit, and every
// private-use unit, becomes one code of its own, so text and marks merge
// together and private-use input never decodes as something else.
export function encodeForMerge(values) {
  const pua = (u) => u >= 0xe000 && u <= 0xf8ff;
  const keyOf = (v, i) => (v.m[i] || pua(v.c.charCodeAt(i)) ? v.c[i] + "\u0000" + v.m[i] : null);
  const keys = new Set();
  for (const v of values) for (let i = 0; i < v.c.length; i++) { const k = keyOf(v, i); if (k !== null) keys.add(k); }
  const sorted = [...keys].sort();
  if (sorted.length > 0xf8ff - 0xe000 + 1) return null;
  const code = new Map(sorted.map((k, i) => [k, String.fromCharCode(0xe000 + i)]));
  const back = new Map(sorted.map((k, i) => [String.fromCharCode(0xe000 + i), k]));
  const encode = (v) => { let out = ""; for (let i = 0; i < v.c.length; i++) { const k = keyOf(v, i); out += k === null ? v.c[i] : code.get(k); } return out; };
  const decode = (s) => {
    let c = "";
    const m = [];
    for (let i = 0; i < s.length; i++) {
      const k = back.get(s[i]);
      c += k ? k[0] : s[i];
      m.push(k ? k.slice(2) : "");
    }
    return { c, m };
  };
  return { strings: values.map(encode), decode };
}

// ---- units --------------------------------------------------------------
//
// A replay keeps the block's text as units, one per UTF-16 unit, in their
// order, with the deleted ones kept until the floor passes their delete:
//   ch  the unit;  m  its mark key;  mq  the seq its mark was last set at
//   a   its writer (null: a whole value, a merge or a repair)
//   q   the seq it was inserted at
//   ol  the unit it was typed after (its left origin), null at the start
//   del null, or [{ a, q }] for every write that deleted it
// Nothing about units is stored or sent: every tab that replays the same ops
// from the same value derives the same units. S, marks and prov are the
// visible units.

const unit = (ch, m, a, q, ol) => ({ ch, m: m || "", mq: q, a, q, ol, del: null });

function unitsOf(c, m, a, q) {
  const out = [];
  let prev = null;
  for (let i = 0; i < c.length; i++) { const u = unit(c[i], m ? m[i] : "", a, q, prev); out.push(u); prev = u; }
  return out;
}

// S, marks and prov from the visible units; fields are S's other fields.
function refresh(r, fields) {
  let c = "";
  const marks = [], prov = [];
  for (const u of r.units) if (!u.del) { c += u.ch; marks.push(u.m); prov.push({ a: u.a, q: u.q }); }
  r.marks = marks;
  r.prov = prov;
  r.S = withMarks(fields, c, marks);
}

// What writer x's editor held: S at its release k plus its own steps since.
// A unit is known to x when it was there at k or x typed it; it is hidden from
// x when a write at or before k, or x itself, deleted it.
const viewOf = (x, k) => ({
  known: (u) => u.q <= k || (x !== null && u.a === x),
  hidden: (u) => !!u.del && u.del.some((d) => d.q <= k || (x !== null && d.a === x)),
});

function viewIdx(r, P) {
  const out = [];
  r.units.forEach((u, i) => { if (P.known(u) && !P.hidden(u)) out.push(i); });
  return out;
}
const textAt = (r, idx) => { let s = ""; for (const i of idx) s += r.units[i].ch; return s; };
const visibleBefore = (r, i) => { let n = 0; for (let j = 0; j < i; j++) if (!r.units[j].del) n++; return n; };

// Where x's text typed right after unit L goes: after L, past the units x did
// not know that belong after it. Those are L's other children whose writer
// orders first (L's own writer continuing its run, then the lower tab id),
// with everything typed after them. The first unit x knew, or any other unit,
// stops it. No unit that typists typed in a row is ever split this way.
function insertAt(r, P, x, L) {
  let i = L ? r.units.indexOf(L) + 1 : 0;
  const key = (a) => (L && L.a !== null && a === L.a ? "0" : "1") + (a ?? "");
  const mine = key(x);
  const skipped = new Set();
  while (i < r.units.length) {
    const o = r.units[i];
    if (P.known(o)) break;
    if ((o.ol === L && key(o.a) < mine) || (o.ol !== null && skipped.has(o.ol))) { skipped.add(o); i++; continue; }
    break;
  }
  return i;
}

// Delete the units at item indices idx (one write's delete, in order) and
// record the visible runs it removed as applied splices, right to left.
function deleteUnits(r, idx, d, applied) {
  const runs = [];
  const want = new Set(idx);
  let p = 0, len = 0;
  r.units.forEach((u, i) => {
    if (!u.del && want.has(i)) {
      const last = runs[runs.length - 1];
      if (last && last.e === p) { last.e++; last.items.push(u); } else runs.push({ p, e: p + 1, items: [u] });
    }
    if (!u.del) { p++; len++; }
  });
  for (let j = runs.length - 1; j >= 0; j--) {
    const run = runs[j];
    applied.push([run.p, run.e, run.items.map((u) => u.ch).join(""), len, run.items.map((u) => u.m)]);
    len -= run.e - run.p;
  }
  for (const i of idx) { const u = r.units[i]; (u.del ??= []).push(d); }
}

function insertUnits(r, at, t, tm, a, q, L, applied, ids = null) {
  if (!t) return [];
  const made = [];
  let prev = L;
  for (let j = 0; j < t.length; j++) { const u = unit(t[j], tm ? tm[j] : "", a, q, prev); if (ids && ids[j]) u.id = ids[j]; made.push(u); prev = u; }
  let len = 0;
  for (const u of r.units) if (!u.del) len++;
  applied.push([visibleBefore(r, at), visibleBefore(r, at), "", len]);
  r.units.splice(at, 0, ...made);
  return made;
}

// The ids a tab's heal check (heal-check.js) gives the characters of step i
// of its own write X: they ride on the units, so a placed write keeps them.
const idsOf = (r, X, i) => (r.track ? r.track(X, i) : null);

// The units deleted at or before the floor are gone for good: no write the
// step mapper places can have known them.
function collect(r) {
  if (r.floor <= r.gcFloor) return;
  r.gcFloor = r.floor;
  if (r.units.some((u) => u.del && u.del.some((d) => d.q <= r.floor))) r.units = r.units.filter((u) => !(u.del && u.del.some((d) => d.q <= r.floor)));
}

export function createReplay(seed, { seq = 0, epoch = null, me = null } = {}) {
  const r = {
    me, epoch, seq, S: null, marks: null, prov: null, units: [], tomb: false,
    log: [], logBytes: 0, floor: seq, kept: seq, gcFloor: seq, baseHash: null, epochStart: seq, healH: -1, behind: false,
    doubt: [], counter: false,
    conflicts: [], stats: { ot: 0, fallback: 0, merge: 0, whole: 0, inexact: 0, rewinds: 0, rebases: 0, refused: 0, agreed: 0, healMerges: 0, viewMiss: 0, countered: 0 },
  };
  setWhole(r, seed, null, seq);
  r.baseHash = hashOf(r.S);
  return r;
}

function setWhole(r, v, a, q) {
  r.rebuilds = (r.rebuilds ?? 0) + 1;
  if (!v || r.tomb) { r.S = null; r.marks = null; r.prov = null; r.units = []; return; }
  const S = strip(v);
  const m = marksOf(S);
  r.units = unitsOf(S.c, m, a, q);
  r.S = withMarks(S, S.c, m);
  r.marks = m ? [...m] : blank(S.c.length);
  r.prov = Array.from({ length: S.c.length }, () => ({ a, q }));
}

function note(r, c) {
  if (r.conflicts.some((x) => x.kind === c.kind && x.lost === c.lost && x.seq === c.seq && x.by === c.by)) return;
  r.conflicts.push(c);
}

// This replay placed a write by a diff: its value through that seq is a guess.
// A repair it sends says so (w.i), and a tab that placed everything exactly
// answers it with its own repair instead of following it.
function doubt(r, seq) { if (!r.doubt.includes(seq)) r.doubt.push(seq); }
export const doubted = (r) => r.doubt.length > 0;
export function repairOf(r, a) {
  return { a, e: r.epoch, g: r.seq, ...(doubted(r) ? { i: 1 } : {}) };
}

// Text this tab typed that S no longer has, after a change that is not a
// placed write (a repair, a heal, a join, a whole write): it goes in a notice.
function noticeJump(r, before, beforeProv, kind, seq) {
  if (!before || !beforeProv || !r.me) return;
  const after = r.S ? r.S.c : "";
  for (const g of regions(before.c, after)) {
    if (g.to <= g.from) continue;
    let mine = false;
    for (let i = g.from; i < g.to; i++) if (beforeProv[i] && beforeProv[i].a === r.me) mine = true;
    const lost = before.c.slice(g.from, g.to);
    if (mine && lost.trim() && !g.t.includes(lost)) note(r, { kind, lost, kept: g.t, seq });
  }
}

function push(r, entry) {
  entry.bytes = entry.X ? JSON.stringify(entry.X).length : 8;
  r.log.push(entry);
  r.logBytes += entry.bytes;
  while (r.log.length > LIMITS.logEntries || r.logBytes > LIMITS.logBytes) {
    const gone = r.log.shift();
    r.logBytes -= gone.bytes;
    r.floor = Math.max(r.floor, gone.seq);
    r.kept = Math.max(r.kept, gone.seq);
    r.baseHash = gone.hash;
  }
}

function hashAt(r, n) {
  for (let i = r.log.length - 1; i >= 0; i--) if (r.log[i].seq <= n) return r.log[i].hash;
  return n >= r.kept ? r.baseHash : null;
}

const newEntry = (seq, X) => ({ seq, a: X && X.w ? X.w.a : null, X, applied: [], whole: false, hash: null });

// The shard's tombstone for the block landed: it stays deleted. Writes under it
// are kept in notices; the writer's repair deletes the block again.
export function tombstone(r, seq) {
  const entry = newEntry(seq, null);
  entry.tombstone = true;
  entry.whole = true;
  r.tomb = true;
  setWhole(r, null);
  push(r, entry);
  entry.hash = hashOf(r.S);
  r.floor = Math.max(r.floor, seq);
  r.seq = seq;
  return r.S;
}

// One op on the block, in room order: X is the value set there, or null for
// its delete.
export function step(r, X, seq) {
  const w = X && X.w;
  const entry = newEntry(seq, X);
  push(r, entry);
  if (w && w.g !== undefined) repair(r, X, seq, entry);
  else if (r.tomb) {
    if (X && w && typeof w.a === "string") note(r, { kind: "removed", lost: X.c, by: w.a, seq });
    entry.skipped = true;
  } else if (w && w.h !== undefined) heal(r, X, seq, entry);
  else apply(r, X, seq, entry, false);
  if (entry.whole) r.floor = Math.max(r.floor, seq);
  collect(r);
  entry.hash = hashOf(r.S);
  r.seq = seq;
  return r.S;
}

function apply(r, X, seq, entry, forced) {
  if (!X) { setWhole(r, null); entry.whole = true; return; }
  const w = X.w;
  if (!w || typeof w.a !== "string" || !r.S) {
    if (!r.S && w && typeof w.a === "string") { note(r, { kind: "removed", lost: X.c, by: w.a, seq }); entry.skipped = true; return; }
    // A create, a restore, a data API write: it wins whole.
    return whole(r, X, null, seq, entry);
  }
  // Made in another epoch and sent again by its lane: its tab's heal carries it.
  if (typeof w.e === "string" && w.e !== r.epoch) { entry.skipped = true; return; }
  const ch = chainOf(X);
  if (!ch) return whole(r, X, w.a, seq, entry);
  entry.k = w.k;
  if (!forced && w.e === r.epoch && Number.isInteger(w.k) && w.k >= r.floor && w.k <= r.seq && placeSteps(r, X, entry, ch)) return;
  placeByBase(r, X, entry, ch, seq);
}

function whole(r, X, a, seq, entry) {
  const before = r.S, prov = r.prov;
  setWhole(r, X, a, seq);
  noticeJump(r, before, prov, "replaced", seq);
  entry.whole = true;
  r.stats.whole++;
}

// 1. The step mapper. The writer's editor is rebuilt as units (viewOf); when
// its text is not exactly the write's own base, the write goes to the
// fallback instead. Each step then acts on the units the writer saw: a delete
// removes those and nothing a peer typed meanwhile, an insert goes after its
// left unit (insertAt), and a format covers the units it saw plus what peers
// typed strictly inside them, never what they typed at its edges.
function placeSteps(r, X, entry, ch) {
  const { a: x, k } = X.w;
  const P = viewOf(x, k);
  if (textAt(r, viewIdx(r, P)) !== ch.base.c) { r.stats.viewMiss++; return false; }
  const fields = fieldsOf(r, X);
  const seq = entry.seq;
  for (const [i, s] of ch.steps.entries()) {
    const view = viewIdx(r, P);
    if (s.to > s.from && s.t === s.removed) {
      const lo = view[s.from], hi = view[s.to - 1];
      const uniform = s.tm.every((key) => key === s.tm[0]);
      const F = visibleBefore(r, lo);
      const before = [];
      for (let i = lo; i <= hi; i++) if (!r.units[i].del) before.push(r.units[i]);
      entry.applied.push([F, F + before.length, before.map((u) => u.ch).join(""), visibleBefore(r, r.units.length), before.map((u) => u.m)]);
      for (let j = s.from; j < s.to; j++) { const u = r.units[view[j]]; u.m = s.tm[j - s.from]; u.mq = seq; }
      if (uniform) for (let i = lo + 1; i < hi; i++) { const u = r.units[i]; if (!u.del && !P.known(u)) { u.m = s.tm[0]; u.mq = seq; } }
      continue;
    }
    const L = s.from > 0 ? r.units[view[s.from - 1]] : null;
    deleteUnits(r, view.slice(s.from, s.to), { a: x, q: seq }, entry.applied);
    insertUnits(r, insertAt(r, P, x, L), s.t, s.tm, x, seq, L, entry.applied, idsOf(r, X, i));
  }
  refresh(r, fields);
  r.stats.ot++;
  return true;
}

// Where splice s of `base` lands in `side`: the current ranges to delete and
// the offset to insert at, or null when the other side replaced text inside
// it. Text the other side typed strictly inside a deleted range stays: the
// writer never saw it (the step mapper keeps it the same way). Inside a range
// the writer replaced, the policy for two writes changing one range applies,
// as merge3Text would apply it but without its diff: the later write's side
// wins and the text the other side typed there goes in a merge notice.
function placeKeep(base, side, s) {
  const hunks = regions(base, side);
  for (const h of hunks) if (h.t !== "" && h.to > h.from && h.from < s.to && h.to > s.from) return null;
  const inside = s.t && s.to > s.from && s.t !== s.removed ? hunks.filter((h) => h.t !== "" && h.from > s.from && h.from < s.to) : [];
  if (inside.length) {
    const at = mapHunks(hunks, s.from), end = mapHunks(hunks, s.to);
    if (at === null || end === null) return null;
    return { at, dels: [[at, end]], same: false, conflict: inside.map((h) => h.t).join("") };
  }
  const at = mapHunks(hunks, s.from);
  if (at === null) return null;
  // src: per unit of dels, in order, its offset in the step's range of base,
  // so formatting maps by the units that are still there.
  const dels = [], src = [];
  if (s.to > s.from) {
    let delta = 0, b = 0;
    const map = new Int32Array(s.to).fill(-1);
    for (const h of hunks) {
      for (; b < Math.min(h.from, s.to); b++) map[b] = b + delta;
      b = Math.max(b, h.to);
      delta += h.t.length - (h.to - h.from);
    }
    for (; b < s.to; b++) map[b] = b + delta;
    for (let i = s.from; i < s.to; i++) {
      if (map[i] < 0) continue;
      src.push(i - s.from);
      const last = dels[dels.length - 1];
      if (last && last[1] === map[i]) last[1]++;
      else dels.push([map[i], map[i] + 1]);
    }
  }
  return { at, dels, src, same: hunks.length === 0 };
}

// 2. The base the write describes, placed by a diff; 3. merge3Text.
function placeByBase(r, X, entry, ch, seq, { skip = () => false, heal = false } = {}) {
  const x = X.w.a;
  const fields = fieldsOf(r, X);
  let base = ch.base.c;
  let c = r.S.c;
  const plan = [], notes = [];
  let ok = true, exact = true;
  ch.steps.forEach((s, i) => {
    if (!ok) return;
    const nextBase = base.slice(0, s.from) + s.t + base.slice(s.to);
    if (skip(i)) { base = nextBase; return; }
    const placed = placeKeep(base, c, s);
    if (!placed) { ok = false; return; }
    if (!placed.same) exact = false;
    if (heal && s.to === s.from && s.t) {
      const there = regions(base, c).find((h) => h.from === s.from && h.to === h.from && h.t === s.t);
      if (there) { base = nextBase; return; }
    }
    const marksOnly = s.to > s.from && s.t === s.removed;
    const gone = placed.dels.map(([a, b]) => c.slice(a, b)).join("");
    if (placed.conflict) { notes.push({ kind: "merge", lost: placed.conflict, kept: s.t, by: x, seq }); r.stats.merge++; }
    else if (s.to > s.from && !marksOnly && gone !== s.removed) notes.push({ kind: "inexact", lost: s.removed, kept: gone, by: x, seq });
    plan.push({ s, i, ...placed, marksOnly });
    let next = c;
    if (!marksOnly) {
      for (const [a, b] of [...placed.dels].reverse()) next = next.slice(0, a) + next.slice(b);
      next = next.slice(0, placed.at) + s.t + next.slice(placed.at);
    }
    c = next;
    base = nextBase;
  });
  if (ok) {
    const vis = () => { const out = []; r.units.forEach((u, i) => { if (!u.del) out.push(i); }); return out; };
    for (const p of plan) {
      const v = vis();
      if (p.marksOnly) {
        const idx = p.dels.flatMap(([a, b]) => v.slice(a, b));
        const F = idx.length ? visibleBefore(r, idx[0]) : p.at;
        entry.applied.push([F, F + idx.length, idx.map((i) => r.units[i].ch).join(""), v.length, idx.map((i) => r.units[i].m)]);
        idx.forEach((i, j) => { const o = p.src ? p.src[j] : j; r.units[i].m = p.s.tm[o] ?? p.s.tm[0] ?? ""; r.units[i].mq = seq; });
        continue;
      }
      const L = p.at > 0 ? r.units[v[p.at - 1]] : null;
      deleteUnits(r, p.dels.flatMap(([a, b]) => v.slice(a, b)), { a: x, q: seq }, entry.applied);
      insertUnits(r, L ? r.units.indexOf(L) + 1 : 0, p.s.t, p.s.tm, x, seq, L, entry.applied, idsOf(r, X, p.i));
    }
    for (const n of notes) { note(r, n); if (n.kind === "inexact") r.stats.inexact++; }
    if (!exact || notes.length) doubt(r, seq);
    refresh(r, fields);
    r.stats.fallback++;
    return;
  }
  if (heal) {
    ch.steps.forEach((s, i) => { if (!skip(i) && s.t.trim()) note(r, { kind: "heal", lost: s.t, by: x, seq }); });
    return;
  }
  const values = [ch.base, { c: r.S.c, m: r.marks }, { c: X.c, m: marksOf(X) ?? blank(X.c.length) }];
  const enc = encodeForMerge(values);
  const strings = enc ? enc.strings : values.map((v) => v.c);
  const merged = merge3Window(strings[0], strings[1], strings[2]);
  const out = enc ? enc.decode(merged.text) : { c: merged.text, m: blank(merged.text.length) };
  for (const cf of merged.conflicts) {
    const lost = enc ? enc.decode(cf.local).c : cf.local;
    if (lost.trim()) note(r, { kind: "merge", lost, kept: enc ? enc.decode(cf.remote).c : cf.remote, by: x, seq });
  }
  if (!enc) note(r, { kind: "marks", lost: "", by: x, seq });
  r.units = unitsOf(out.c, out.m, null, seq);
  r.rebuilds++;
  r.S = withMarks(fields, out.c, out.m);
  r.marks = out.m;
  r.prov = Array.from({ length: out.c.length }, () => ({ a: null, q: seq }));
  doubt(r, seq);
  entry.whole = true;
  r.stats.merge++;
}

// merge3Text on the part the three strings do not share at both ends: the
// result is the same, and a long paragraph costs what its edits cost.
function merge3Window(b, l, x, prefer = "remote") {
  const n = Math.min(b.length, l.length, x.length);
  let p = 0;
  while (p < n && b.charCodeAt(p) === l.charCodeAt(p) && b.charCodeAt(p) === x.charCodeAt(p)) p++;
  let s = 0;
  while (s < n - p && b.charCodeAt(b.length - 1 - s) === l.charCodeAt(l.length - 1 - s) && b.charCodeAt(b.length - 1 - s) === x.charCodeAt(x.length - 1 - s)) s++;
  p = Math.max(0, p - MARGIN);
  for (let i = 0; p > 0 && i < REACH && !isSpace(b.charCodeAt(p - 1)); i++) p--;
  s = Math.max(0, s - MARGIN);
  for (let i = 0; s > 0 && i < REACH && !isSpace(b.charCodeAt(b.length - s)); i++) s--;
  if (p > 0 && isLow(b.charCodeAt(p))) p--;
  if (s > 0 && isLow(b.charCodeAt(b.length - s))) s--;
  const cut = (v) => v.slice(p, v.length - s);
  const merged = merge3Text(cut(b), cut(l), cut(x), prefer);
  return { text: b.slice(0, p) + merged.text + b.slice(b.length - s), conflicts: merged.conflicts };
}

// A repair: S as the writer computed it through seq g. A replay with the same
// hash at g changes nothing. One that differs takes it and keeps every later
// write it holds on top, when it holds them all (g at or above `kept`);
// otherwise it refuses the repair and is behind until it can take one. A
// repair from a writer that guessed (w.i) does not move a replay that placed
// every write exactly: that replay answers with its own repair.
function repair(r, X, seq, entry) {
  const n = X.w.g;
  entry.repair = n;
  if (X.w.e !== r.epoch || r.tomb) return;
  const guessed = !!X.w.i;
  const mine = hashAt(r, n);
  if (mine !== null && mine === hashOf(X)) { r.stats.agreed++; if (!guessed) settled(r, n); return; }
  if (Number.isInteger(n) && n >= r.kept && n <= r.seq) {
    if (guessed && !r.doubt.some((q) => q <= n)) { r.stats.countered++; r.counter = true; return; }
    rewind(r, n, X, seq, entry);
    r.behind = false;
    if (!guessed) settled(r, n);
    return;
  }
  r.stats.refused++;
  r.behind = true;
}

// A writer that placed every write exactly through seq n agreed with this
// replay or brought it there: a guess before then is no longer in doubt.
function settled(r, n) {
  r.conflicts = r.conflicts.filter((c) => !(c.kind === "inexact" && c.seq <= n));
  r.doubt = r.doubt.filter((q) => q > n);
  r.counter = false;
}

// S at seq n becomes V. When the units reach back to n, the difference
// between S at n and V is placed as one more write made at n, so every later
// write keeps its exact place and nothing is placed again by a diff (rebase).
// Otherwise every later op this replay holds is applied again on top of V, by
// its base, and the step mapper resumes for writes made at or after seq m.
function rewind(r, n, V, m, trigger, exact = true) {
  r.stats.rewinds++;
  if (exact && n >= r.floor && r.S && !r.tomb && V && typeof V.c === "string") return rebase(r, n, V, m, trigger);
  const before = r.S, beforeProv = r.prov;
  const again = r.log.filter((e) => e.seq > n && e !== trigger);
  r.log = [];
  r.logBytes = 0;
  r.tomb = false;
  setWhole(r, V, null, n);
  r.floor = n;
  r.kept = n;
  r.gcFloor = n;
  r.baseHash = hashOf(r.S);
  for (const old of again) {
    const entry = newEntry(old.seq, old.X);
    push(r, entry);
    const w = old.X && old.X.w;
    if (old.tombstone) { entry.tombstone = true; entry.whole = true; r.tomb = true; setWhole(r, null); }
    else if (w && w.g !== undefined) entry.repair = w.g;
    else if (r.tomb) entry.skipped = true;
    else if (w && w.h !== undefined) { entry.heal = true; healMerge(r, old.X, old.seq, entry); }
    else apply(r, old.X, old.seq, entry, true);
    entry.hash = hashOf(r.S);
  }
  push(r, trigger);
  trigger.whole = true;
  r.floor = Math.max(r.floor, m);
  noticeJump(r, before, beforeProv, "repair", m);
}

function rebase(r, n, V, seq, trigger) {
  r.stats.rebases++;
  const before = r.S, beforeProv = r.prov;
  const tag = {};
  const P = {
    known: (u) => u.q <= n || u.tag === tag,
    hidden: (u) => !!u.del && u.del.some((d) => d.q <= n || d.tag === tag),
  };
  const view0 = viewIdx(r, P);
  const Sn = textAt(r, view0);
  const hunks = regions(Sn, V.c);
  let delta = 0;
  const vFrom = hunks.map((h) => { const at = h.from + delta; delta += h.t.length - (h.to - h.from); return at; });
  const Vm = marksOf(V) ?? blank(V.c.length);
  const applied = [];
  for (let j = hunks.length - 1; j >= 0; j--) {
    const h = hunks[j];
    const view = viewIdx(r, P);
    const L = h.from > 0 ? r.units[view[h.from - 1]] : null;
    deleteUnits(r, view.slice(h.from, h.to), { a: null, q: seq, tag }, applied);
    const made = insertUnits(r, insertAt(r, P, null, L), h.t, Vm.slice(vFrom[j], vFrom[j] + h.t.length), null, seq, L, applied);
    for (const u of made) u.tag = tag;
  }
  const view = viewIdx(r, P);
  view.forEach((i, j) => { const u = r.units[i]; if (u.mq <= n && u.m !== Vm[j]) { u.m = Vm[j] || ""; u.mq = seq; } });
  let fields = strip(V);
  for (const e of r.log) {
    if (e.seq <= n || e === trigger || e.skipped || !e.X || e.tombstone || (e.X.w && (e.X.w.g !== undefined || e.X.w.h !== undefined))) continue;
    const f = e.X.w && e.X.w.f;
    if (!Array.isArray(f)) fields = strip(e.X);
    else for (const name of f) { if (name === "c" || name === "m" || name === "w") continue; if (Object.prototype.hasOwnProperty.call(e.X, name)) fields = { ...fields, [name]: e.X[name] }; else { const { [name]: _gone, ...rest } = fields; fields = rest; } }
  }
  refresh(r, fields);
  for (const e of r.log) if (e.seq > n && e.seq < seq) e.hash = null;
  r.kept = Math.max(r.kept, seq);
  noticeJump(r, before, beforeProv, "repair", seq);
}

// A heal after a room loss: the heal from the longest stream of the lost room
// is S at the new epoch's start, and every other op of the epoch is applied on
// it again; a shorter heal adds only its writes the longer stream had not seen.
function heal(r, X, seq, entry) {
  entry.heal = true;
  if (X.w.e !== r.epoch) { entry.skipped = true; return; }
  if (X.w.h > r.healH) {
    r.healH = X.w.h;
    if (r.kept <= r.epochStart) return rewind(r, r.epochStart, X, seq, entry, false);
    whole(r, X, null, seq, entry);
    r.behind = true;
    return;
  }
  healMerge(r, X, seq, entry);
}

// A heal that describes no splices (its own writes were heals or whole) is
// never dropped in silence: what it holds that S does not goes in a notice.
function healMerge(r, X, seq, entry) {
  if (!r.S) return;
  const ch = chainOf(X);
  if (!ch) {
    if (typeof X.c === "string" && X.c !== r.S.c && regions(r.S.c, X.c).some((g) => g.t.trim())) note(r, { kind: "heal", lost: X.c, kept: r.S.c, by: X.w.a, seq });
    return;
  }
  const u = Array.isArray(X.w.u) ? X.w.u : [];
  r.stats.healMerges++;
  if (u.length && u.every((v) => v === null)) return healMerge3(r, X, ch, seq, entry);
  placeByBase(r, X, entry, ch, seq, { heal: true, skip: (i) => Number.isInteger(u[i]) && u[i] <= r.healH });
}

// A heal whose splices come from a diff (healChain) cannot say which of them
// the longer stream already holds, so it merges three ways with its own base:
// what both sides hold is kept once, and where they differ S keeps its text
// and the heal's goes in a notice.
function healMerge3(r, X, ch, seq, entry) {
  const values = [ch.base, { c: r.S.c, m: r.marks }, { c: X.c, m: marksOf(X) ?? blank(X.c.length) }];
  const enc = encodeForMerge(values);
  const strings = enc ? enc.strings : values.map((v) => v.c);
  const merged = merge3Window(strings[0], strings[1], strings[2], "local");
  const out = enc ? enc.decode(merged.text) : { c: merged.text, m: blank(merged.text.length) };
  for (const cf of merged.conflicts) {
    const lost = enc ? enc.decode(cf.remote).c : cf.remote;
    if (lost.trim()) note(r, { kind: "heal", lost, kept: enc ? enc.decode(cf.local).c : cf.local, by: X.w.a, seq });
  }
  if (out.c === r.S.c && JSON.stringify(out.m) === JSON.stringify(r.marks)) return;
  const fields = fieldsOf(r, X);
  r.units = unitsOf(out.c, out.m, null, seq);
  r.rebuilds++;
  r.S = withMarks(fields, out.c, out.m);
  r.marks = out.m;
  r.prov = Array.from({ length: out.c.length }, () => ({ a: null, q: seq }));
  entry.whole = true;
  r.stats.merge++;
}

// The splices of a heal: this tab's writes the stream never brought back, as
// the replay applied them on base (S before them). When those do not explain
// the healed value (a write was skipped or applied whole, as a heal is), the
// heal describes the whole change from base by a diff instead.
export function healChain(base, baseMarks, healed, chain, u) {
  if (!base || !healed) return { s: chain, u };
  const ch = chain.length ? chainOf({ c: healed.c, m: healed.m, w: { s: chain } }) : null;
  if (chain.length ? ch && ch.base.c === base.c : base.c === healed.c) return { s: chain, u };
  const s = chainFromDiff(base.c, baseMarks, healed.c);
  return { s, u: s.map(() => null) };
}

// The block's value from a state read: S becomes it. `moves` are the room's ops
// after `since` that the value already holds ({ seq, X } or { seq, tombstone }),
// kept so a later repair or heal can apply them again. In a new epoch whose
// moves hold a heal, the ops from the first heal on are stepped as every other
// tab stepped them, so this tab computes the same S as one that was there.
export function join(r, X, seq, { epoch = r.epoch, moves = null, since = seq, tomb = false } = {}) {
  const before = r.S, beforeProv = r.prov;
  const fresh = epoch !== r.epoch;
  r.epoch = epoch;
  r.tomb = tomb;
  setWhole(r, X, null, seq);
  r.log = [];
  r.logBytes = 0;
  r.seq = seq;
  r.floor = seq;
  r.gcFloor = seq;
  r.kept = moves ? since : seq;
  r.baseHash = hashOf(r.S);
  r.behind = false;
  r.counter = false;
  if (fresh) { r.healH = -1; r.epochStart = r.kept; r.doubt = []; }
  const list = moves ?? [];
  const first = fresh ? list.findIndex((mv) => mv.X && mv.X.w && mv.X.w.h !== undefined) : -1;
  const held = first < 0 ? list : list.slice(0, first);
  for (const mv of held) {
    const entry = newEntry(mv.seq, mv.X ?? null);
    entry.whole = true;
    entry.tombstone = mv.tombstone === true;
    push(r, entry);
  }
  if (held.length) { r.log[r.log.length - 1].hash = first < 0 ? hashOf(r.S) : null; r.baseHash = null; }
  if (first >= 0) {
    r.seq = held.length ? held[held.length - 1].seq : since;
    for (const mv of list.slice(first)) mv.tombstone ? tombstone(r, mv.seq) : step(r, mv.X ?? null, mv.seq);
    r.seq = Math.max(r.seq, seq);
  }
  if (!fresh) noticeJump(r, before, beforeProv, "joined", seq);
}

// The caret of writer `me`, whose editor is S at k plus its own steps since:
// it goes where the next character typed there would go.
export function mapCaret(r, me, k, q, viewText) {
  if (!r.S) return 0;
  if (Number.isInteger(k) && k >= r.floor && k <= r.seq) {
    const P = viewOf(me, k);
    const view = viewIdx(r, P);
    if (viewText === undefined || viewText === null || textAt(r, view) === viewText) {
      const at = Math.max(0, Math.min(q, view.length));
      const L = at > 0 ? r.units[view[at - 1]] : null;
      return Math.max(0, Math.min(r.S.c.length, visibleBefore(r, insertAt(r, P, me, L))));
    }
  }
  return Math.max(0, Math.min(r.S.c.length, mapOffset(viewText ?? r.S.c, r.S.c, q)));
}
