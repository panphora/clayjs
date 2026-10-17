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

// The changes from oldText to newText as { from, to, t } in old offsets.
export function regions(oldText, newText) {
  if (oldText === newText) return [];
  return diff(oldText, newText).map((h) => {
    const sp = spliceOf(oldText.slice(h.bs, h.be), h.text);
    return { from: h.bs + sp.p, to: h.bs + sp.e, t: sp.t };
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

export function createReplay(seed, { seq = 0, epoch = null, me = null } = {}) {
  const r = {
    me, epoch, seq, S: null, marks: null, prov: null, tomb: false,
    log: [], logBytes: 0, floor: seq, kept: seq, baseHash: null, epochStart: seq, healH: -1, behind: false,
    conflicts: [], stats: { ot: 0, fallback: 0, merge: 0, whole: 0, inexact: 0, rewinds: 0, refused: 0, agreed: 0, healMerges: 0 },
  };
  setWhole(r, seed, null, seq);
  r.baseHash = hashOf(r.S);
  return r;
}

function setWhole(r, v, a, q) {
  if (!v || r.tomb) { r.S = null; r.marks = null; r.prov = null; return; }
  const S = strip(v);
  r.S = withMarks(S, S.c, marksOf(S));
  r.marks = marksOf(S) ? [...S.m] : blank(S.c.length);
  r.prov = Array.from({ length: S.c.length }, () => ({ a, q }));
}

function note(r, c) {
  if (r.conflicts.some((x) => x.kind === c.kind && x.lost === c.lost && x.seq === c.seq && x.by === c.by)) return;
  r.conflicts.push(c);
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

const newEntry = (seq, X) => ({ seq, a: X && X.w ? X.w.a : null, X, events: [], authored: [], applied: [], whole: false, hash: null });

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
  if (!forced && w.e === r.epoch && Number.isInteger(w.k) && w.k >= r.floor && w.k <= r.seq) placeSteps(r, X, entry, ch.steps);
  else placeByBase(r, X, entry, ch, seq);
}

function whole(r, X, a, seq, entry) {
  const before = r.S, prov = r.prov;
  setWhole(r, X, a, seq);
  noticeJump(r, before, prov, "replaced", seq);
  entry.whole = true;
  r.stats.whole++;
}

// Offset q of writer x's editor (S at k, then x's own steps since k) in S now.
function mapPos(r, x, k, own, q) {
  const rec = new Map();
  for (let j = own.length - 1; j >= 0; j--) {
    const s = own[j], end = s.from + s.t.length;
    if (q >= s.from && q <= end) { rec.set(j, q - s.from); q = s.from; }
    else if (q > end) q -= s.t.length - (s.to - s.from);
  }
  let i = 0;
  for (const e of r.log) {
    if (e.seq <= k) continue;
    for (const ev of e.events) {
      if (ev.own) { if (e.a === x) { if (rec.has(i)) q = ev.at + rec.get(i); i++; } continue; }
      const { from, to, t, a } = ev;
      if (a === x) {
        if (q > from && q < to) q = from;
        else if (q >= to && !(q === from && from === to)) q += t.length - (to - from);
        continue;
      }
      if (q < from) continue;
      if (q > to) { q += t.length - (to - from); continue; }
      if (q === to && to > from) { q = from + t.length; continue; }
      q = x < a ? from : from + t.length;
    }
  }
  return q;
}

const ownSteps = (r, x, k, except) => r.log.filter((e) => e !== except && e.seq > k && e.a === x).flatMap((e) => e.authored);

// 1. The step mapper.
function placeSteps(r, X, entry, steps) {
  const { a: x, k } = X.w;
  const own = ownSteps(r, x, k, entry);
  const fields = fieldsOf(r, X);
  let c = r.S.c, marks = r.marks, prov = r.prov;
  const seen = (pv) => pv.q <= k || pv.a === x;
  for (const s of steps) {
    const F = mapPos(r, x, k, own, s.from);
    const T = s.to === s.from ? F : Math.max(F, mapPos(r, x, k, own, s.to));
    if (s.to > s.from && s.t === s.removed) {
      // Only the marks changed: the range keeps its text, including what peers
      // typed inside it, and takes the writer's marks.
      const uniform = s.tm.every((key) => key === s.tm[0]);
      const next = marks.slice();
      let j = 0;
      for (let p = F; p < T; p++) {
        if (uniform) next[p] = s.tm[0];
        else if (seen(prov[p])) { while (j < s.t.length && s.t[j] !== c[p]) j++; if (j < s.t.length) next[p] = s.tm[j++]; }
      }
      entry.applied.push([F, T, c.slice(F, T), c.length, marks.slice(F, T)]);
      marks = next;
    } else {
      for (let p = T - 1; p >= F; p--) {
        if (!seen(prov[p])) continue;
        let q = p;
        while (q - 1 >= F && seen(prov[q - 1])) q--;
        entry.applied.push([q, p + 1, c.slice(q, p + 1), c.length, marks.slice(q, p + 1)]);
        entry.events.push({ from: q, to: p + 1, t: "", a: x });
        c = c.slice(0, q) + c.slice(p + 1);
        marks = put(marks, q, p + 1, []);
        prov = put(prov, q, p + 1, []);
        p = q;
      }
      if (s.t) {
        entry.applied.push([F, F, "", c.length]);
        entry.events.push({ from: F, to: F, t: s.t, a: x });
        c = c.slice(0, F) + s.t + c.slice(F);
        marks = put(marks, F, F, s.tm);
        prov = put(prov, F, F, Array.from({ length: s.t.length }, () => ({ a: x, q: entry.seq })));
      }
    }
    entry.events.push({ own: true, at: F });
    own.push(s);
    entry.authored.push(s);
    r.S = withMarks(fields, c, marks);
    r.marks = marks;
    r.prov = prov;
  }
  r.stats.ot++;
}

// 2. The base the write describes, placed by a diff; 3. merge3Text.
function placeByBase(r, X, entry, ch, seq, { skip = () => false, heal = false } = {}) {
  const x = X.w.a;
  const fields = fieldsOf(r, X);
  let base = ch.base.c;
  let c = r.S.c, marks = r.marks, prov = r.prov;
  const events = [], applied = [], notes = [];
  let ok = true;
  ch.steps.forEach((s, i) => {
    if (!ok) return;
    const nextBase = base.slice(0, s.from) + s.t + base.slice(s.to);
    if (skip(i)) { base = nextBase; return; }
    const placed = placeSplice(base, c, s);
    if (!placed) { ok = false; return; }
    const { from, to } = placed;
    const gone = c.slice(from, to);
    if (s.to > s.from && gone !== s.removed && s.t !== s.removed) notes.push({ kind: "inexact", lost: s.removed, kept: gone, by: x, seq });
    applied.push([from, to, gone, c.length, marks.slice(from, to)]);
    events.push({ from, to, t: s.t, a: x }, { own: true, at: from });
    c = c.slice(0, from) + s.t + c.slice(to);
    marks = put(marks, from, to, s.tm);
    prov = put(prov, from, to, Array.from({ length: s.t.length }, () => ({ a: x, q: seq })));
    base = nextBase;
  });
  if (ok) {
    entry.events.push(...events);
    entry.applied.push(...applied);
    if (!heal) entry.authored.push(...ch.steps);
    for (const n of notes) { note(r, n); r.stats.inexact++; }
    r.S = withMarks(fields, c, marks);
    r.marks = marks;
    r.prov = prov;
    r.stats.fallback++;
    return;
  }
  if (heal) {
    ch.steps.forEach((s, i) => { if (!skip(i) && s.t.trim()) note(r, { kind: "heal", lost: s.t, by: x, seq }); });
    return;
  }
  const values = [ch.base, { c: r.S.c, m: r.marks }, { c: X.c, m: marksOf(X) ?? blank(X.c.length) }];
  const enc = encodeForMerge(values);
  const merged = enc ? merge3Text(enc.strings[0], enc.strings[1], enc.strings[2], "remote") : merge3Text(values[0].c, values[1].c, values[2].c, "remote");
  const out = enc ? enc.decode(merged.text) : { c: merged.text, m: blank(merged.text.length) };
  for (const cf of merged.conflicts) {
    const lost = enc ? enc.decode(cf.local).c : cf.local;
    if (lost.trim()) note(r, { kind: "merge", lost, kept: enc ? enc.decode(cf.remote).c : cf.remote, by: x, seq });
  }
  if (!enc) note(r, { kind: "marks", lost: "", by: x, seq });
  r.S = withMarks(fields, out.c, out.m);
  r.marks = out.m;
  r.prov = Array.from({ length: out.c.length }, () => ({ a: null, q: seq }));
  entry.whole = true;
  r.stats.merge++;
}

// A repair: S as the writer computed it through seq g. A replay with the same
// hash at g changes nothing. One that differs takes it and places every later
// write it holds on top, when it holds them all (g at or above `kept`);
// otherwise it refuses the repair and is behind until it can take one.
function repair(r, X, seq, entry) {
  const n = X.w.g;
  entry.repair = n;
  if (X.w.e !== r.epoch || r.tomb) return;
  const mine = hashAt(r, n);
  if (mine !== null && mine === hashOf(X)) { r.stats.agreed++; settled(r, n); return; }
  if (Number.isInteger(n) && n >= r.kept && n <= r.seq) {
    rewind(r, n, X, seq, entry);
    r.behind = false;
    settled(r, n);
    return;
  }
  r.stats.refused++;
  r.behind = true;
}

// The writer placed every write through seq n exactly: a delete this replay
// could only place by a diff before then is no longer in doubt.
function settled(r, n) {
  r.conflicts = r.conflicts.filter((c) => !(c.kind === "inexact" && c.seq <= n));
}

// S at seq n becomes V, and every later op this replay holds is applied again
// on top, by its base (its steps were made against the old S). The step mapper
// resumes for writes made at or after seq m.
function rewind(r, n, V, m, trigger) {
  r.stats.rewinds++;
  const before = r.S, beforeProv = r.prov;
  const again = r.log.filter((e) => e.seq > n && e !== trigger);
  r.log = [];
  r.logBytes = 0;
  r.tomb = false;
  setWhole(r, V, null, n);
  r.floor = n;
  r.kept = n;
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

// A heal after a room loss: the heal from the longest stream of the lost room
// is S at the new epoch's start, and every other op of the epoch is applied on
// it again; a shorter heal adds only its writes the longer stream had not seen.
function heal(r, X, seq, entry) {
  entry.heal = true;
  if (X.w.e !== r.epoch) { entry.skipped = true; return; }
  if (X.w.h > r.healH) {
    r.healH = X.w.h;
    if (r.kept <= r.epochStart) return rewind(r, r.epochStart, X, seq, entry);
    whole(r, X, null, seq, entry);
    r.behind = true;
    return;
  }
  healMerge(r, X, seq, entry);
}

function healMerge(r, X, seq, entry) {
  const ch = chainOf(X);
  if (!ch || !r.S) return;
  const u = Array.isArray(X.w.u) ? X.w.u : [];
  r.stats.healMerges++;
  placeByBase(r, X, entry, ch, seq, { heal: true, skip: (i) => Number.isInteger(u[i]) && u[i] <= r.healH });
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
  r.kept = moves ? since : seq;
  r.baseHash = hashOf(r.S);
  r.behind = false;
  if (fresh) { r.healH = -1; r.epochStart = r.kept; }
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

// The caret of writer `me`, whose editor is S at k plus its own steps since.
export function mapCaret(r, me, k, q, viewText) {
  if (!r.S) return 0;
  if (Number.isInteger(k) && k >= r.floor && k <= r.seq) return Math.max(0, Math.min(r.S.c.length, mapPos(r, me, k, ownSteps(r, me, k), q)));
  return Math.max(0, Math.min(r.S.c.length, mapOffset(viewText ?? r.S.c, r.S.c, q)));
}
