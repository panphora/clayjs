// The heal check for one text block: after a room loss, what this tab typed and
// the agreed text no longer holds goes in a `heal` notice, for Restore. It is
// decided by identity, never by matching words. Every UTF-16 unit this tab
// types gets an id, and a typed unit is lost only when
//   - it is not in the agreed text,
//   - this tab did not delete it (by a delete, a replace, or an undo), and
//   - no peer write this tab saw deleted it.
// Lost units go out grouped by the run they were typed in: one notice a run.
// The page binding (binding.js) and the simulated tab of the S1 tests
// (tests/unit/page/collab/text/tab.js) both use this module.
//
// Where the ids live:
//   - In the editor (`view`): this tab's own edits move them exactly, and a
//     release takes them from the agreed text.
//   - On the replay's units (u.id): a write of this tab's own that the replay
//     places (the step mapper or placeByBase's keep path) inserts units with the
//     ids it sent (r.track), and every later placed write keeps them, since it
//     moves units, not text. A unit a placed write deletes says who deleted it
//     (u.del), so a peer's delete and this tab's own are told apart exactly.
//
// Paths that rebuild the units, so ids do not ride along: setWhole (a join, a
// non-exact rewind, a whole write, a heal that wins whole), the merge3 fallback
// in placeByBase, and healMerge3. After one of those, the ids carry over by a
// character alignment of the agreed text before and after (alignSure), and a
// unit the step itself made can take back an id: from this tab's own write or
// heal when it is the one stepped (the ids it sent), and while a check is
// armed, from the agreed text just before the loss. A rebase (an exact repair)
// keeps the units and inserts new ones without ids; those can take back an id
// the same two ways. An id the alignment drops counts as deleted by the step's
// author: this tab for its own write, a peer for a peer's write, and nobody
// (so it can be lost) for a heal, a repair, a join or a whole write.
import { step, join, tombstone, chainOf } from "./replay.js";

// The sure-match check costs one cell per pair of units in its window: past
// SURE_CELLS (about 1000 × 1000 units changed) it gives up and calls the
// window not sure. MARGIN is how far into the common prefix and suffix it
// first looks; it looks further while repeated text there could shift.
export const SURE_CELLS = 1 << 20;
const MARGIN = 8;

// Which units of b are surely which units of a: the pairs every longest common
// subsequence of a and b matches. A pair counts as sure only when forbidding it
// makes the alignment worse; two alignments that agree prove nothing, since
// repeated text can match either copy. map[j] is the unit of a that b's unit j
// surely is, or -1; `unsure` lists the units of a some longest alignment keeps
// and no sure pair does (repeated text, not proven kept).
//
// The check runs on the part between the common prefix and suffix, plus a
// margin of each. When the margin's outer pair is sure, so is everything past
// it (a text matched against itself has one longest alignment); when it is
// not, the margin doubles. Past SURE_CELLS it stops: a side whose outer pair
// some window proved sure keeps what lies past that window; everything else,
// prefix and suffix included, is unsure (not proven kept).
export function alignSure(a, b) {
  const map = new Int32Array(b.length).fill(-1);
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  const shift = a.length - b.length;
  // The units past which each side is proven: [0, left) and [a.length - right, a.length) of a.
  let left = 0, right = 0;
  for (let m = MARGIN; ; m *= 2) {
    const mp = Math.min(p, m), ms = Math.min(s, m);
    const a0 = p - mp, b0 = a0, N = a.length - s + ms - a0, M = b.length - s + ms - b0;
    const outside = (l, r) => {
      for (let j = 0; j < l; j++) map[j] = j;
      for (let j = b.length - r; j < b.length; j++) map[j] = j + shift;
    };
    if ((N + 1) * (M + 1) > SURE_CELLS) {
      outside(left, right);
      const unsure = [];
      for (let i = left; i < a.length - right; i++) unsure.push(i);
      return { map, unsure };
    }
    const { sure, kept } = surePairs(a, a0, N, b, b0, M);
    const leftSure = mp === p || sure[0] === 0, rightSure = ms === s || sure[M - 1] === N - 1;
    if (leftSure) left = Math.max(left, a0);
    if (rightSure) right = Math.max(right, a.length - (a0 + N));
    if (!(leftSure && rightSure)) continue;
    outside(b0, b.length - (b0 + M));
    const proven = new Uint8Array(N);
    for (let j = 0; j < M; j++) if (sure[j] >= 0) { map[b0 + j] = a0 + sure[j]; proven[sure[j]] = 1; }
    const unsure = [];
    for (let i = 0; i < N; i++) if (kept[i] && !proven[i]) unsure.push(a0 + i);
    return { map, unsure };
  }
}

// The longest common subsequences of a[a0, a0 + N) and b[b0, b0 + M): F holds
// the LCS of every pair of prefixes, G of every pair of suffixes. A matching
// pair (i, j) is on some longest alignment when F + 1 + G through it is the
// LCS; it is then the alignment's (F[i][j] + 1)-th match, and it is on every
// longest alignment exactly when no other such pair has that rank.
function surePairs(a, a0, N, b, b0, M) {
  const W = M + 1;
  const F = new Uint16Array((N + 1) * W), G = new Uint16Array((N + 1) * W);
  for (let i = 1; i <= N; i++) {
    const c = a.charCodeAt(a0 + i - 1);
    for (let j = 1; j <= M; j++) {
      const k = i * W + j;
      F[k] = c === b.charCodeAt(b0 + j - 1) ? F[k - W - 1] + 1 : Math.max(F[k - W], F[k - 1]);
    }
  }
  for (let i = N - 1; i >= 0; i--) {
    const c = a.charCodeAt(a0 + i);
    for (let j = M - 1; j >= 0; j--) {
      const k = i * W + j;
      G[k] = c === b.charCodeAt(b0 + j) ? G[k + W + 1] + 1 : Math.max(G[k + W], G[k + 1]);
    }
  }
  const L = F[N * W + M];
  const count = new Uint32Array(L + 1), at = new Int32Array(L + 1).fill(-1);
  const kept = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const c = a.charCodeAt(a0 + i);
    for (let j = 0; j < M; j++) {
      if (c !== b.charCodeAt(b0 + j)) continue;
      const rank = F[i * W + j];
      if (rank + 1 + G[(i + 1) * W + j + 1] !== L) continue;
      kept[i] = 1;
      count[rank]++;
      at[rank] = i * W + j;
    }
  }
  const sure = new Int32Array(M).fill(-1);
  for (let r = 0; r < L; r++) if (count[r] === 1) sure[at[r] % W] = Math.floor(at[r] / W);
  return { sure, kept };
}

// The ids of b's units, carried from a's ids through the alignment; the ids of
// a's units that b surely does not hold (gone); and the ids no alignment proves
// kept or gone (doubt: repeated text).
function carry(a, aIds, b) {
  const { map, unsure } = alignSure(a, b);
  const ids = new Array(b.length).fill(0);
  const kept = new Set(unsure);
  for (let j = 0; j < b.length; j++) if (map[j] >= 0) { ids[j] = aIds[map[j]] ?? 0; kept.add(map[j]); }
  const gone = [];
  for (let i = 0; i < a.length; i++) if (!kept.has(i) && aIds[i]) gone.push(aIds[i]);
  return { ids, gone, doubt: unsure.map((i) => aIds[i]).filter(Boolean) };
}

const visible = (r) => r.units.filter((u) => !u.del);

// Who a step is by: "own" (this tab's write), "peer" (a peer's write), or
// "room" (a heal, a repair, a whole write, a join).
function kindOf(X, me) {
  const w = X && X.w;
  if (!w || typeof w.a !== "string" || w.h !== undefined || w.g !== undefined) return "room";
  return w.a === me ? "own" : "peer";
}

/**
 * @param {object} o
 * @param {object} o.r - the block's replay (replay.js)
 * @param {string} o.me - this tab's id
 * @param {number} o.quiet - the binding's quiet spell; the check runs quiet × 6 after a loss
 * @param {Function} o.setTimer
 * @param {Function} o.clearTimer
 * @param {() => boolean} o.ready - the editor shows the agreed text and nothing of this block is in flight
 * @param {(lost: string) => void} o.notice - one heal notice, per run typed;
 *   none for a block that is gone, whose `removed` notice holds its text
 */
const LONG_WORD = 64;
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

// [start, end) UTF-16 offsets of each word segment of text, in order, covering it.
function wordSegments(text) {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => [s.index, s.index + s.segment.length]);
  const out = [];
  for (const m of text.matchAll(/\s|\S+/gu)) out.push([m.index, m.index + m[0].length]);
  return out;
}

export function createHealCheck({ r, me, quiet = 500, setTimer, clearTimer, ready, notice }) {
  let next = 1;
  let view = new Array(r.S ? r.S.c.length : 0).fill(0);
  const runOf = new Map(), chOf = new Map();
  const erased = new Set(), peer = new Set();
  // Ids a rebuild could not prove kept or gone (repeated text): at risk at the
  // next loss, so a check names them unless they show again.
  const doubtful = new Set();
  const sent = new Map();
  let lastRun = 0, lastEnd = -1;
  let risk = null, pre = null, timer = null;
  // A block this tab made: its text and ids as made (created), for the write
  // that made it, which carries no w.
  let seed = null;

  const keys = new WeakMap();
  const keyOf = (X) => {
    if (!X || !X.w) return null;
    let key = keys.get(X);
    if (key === undefined) keys.set(X, (key = JSON.stringify(X.w)));
    return key;
  };
  const agreedIds = () => visible(r).map((u) => u.id || 0);

  // The ids of the units step i of this tab's own write X inserts.
  r.track = (X, i) => {
    if (!X.w || X.w.a !== me) return null;
    const mine = sent.get(keyOf(X));
    if (!mine) return null;
    if (!mine.steps) {
      const ch = chainOf(X);
      mine.steps = [];
      if (ch) {
        const at = new Array(ch.base.c.length).fill(null);
        ch.steps.forEach((s, n) => { if (!(s.to > s.from && s.t === s.removed)) at.splice(s.from, s.to - s.from, ...Array.from({ length: s.t.length }, (_, j) => [n, j])); });
        if (at.length === mine.text.length) {
          mine.steps = ch.steps.map((s) => new Array(s.t.length).fill(0));
          at.forEach((m, p) => { if (m) mine.steps[m[0]][m[1]] = mine.ids[p] || 0; });
        }
      }
    }
    return mine.steps[i] ?? null;
  };

  // This tab changed the editor's text: [from, to) became `inserted`.
  function edit(from, to, inserted) {
    for (let i = from; i < to; i++) if (view[i]) erased.add(view[i]);
    const run = lastRun && from === lastEnd && from > 0 && runOf.get(view[from - 1]) === lastRun ? lastRun : next;
    const ids = [];
    for (let j = 0; j < inserted.length; j++) {
      const id = next++;
      ids.push(id);
      runOf.set(id, run);
      chOf.set(id, inserted[j]);
      if (risk) risk.add(id);
    }
    if (inserted.length) { lastRun = run; lastEnd = from + inserted.length; }
    view = [...view.slice(0, from), ...ids, ...view.slice(to)];
  }

  // This tab changed the editor's text from `before` to `after`, by a diff
  // (an edit that came with no splice).
  function editTo(before, after) {
    if (before === after) return;
    let p = 0;
    while (p < before.length && p < after.length && before[p] === after[p]) p++;
    let s = 0;
    while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
    edit(p, before.length - s, after.slice(p, after.length - s));
  }

  // A write this tab sends: the ids of its text (the editor's, or the agreed
  // text's for a heal or a repair).
  function wrote(value, ids = view) {
    const key = keyOf(value);
    if (!key || typeof value.c !== "string") return;
    sent.set(key, { text: value.c, ids: ids.slice(0, value.c.length) });
    if (sent.size > 256) sent.delete(sent.keys().next().value);
  }

  // Units the step made with no id take one from `from` (text and ids) by an
  // alignment, when that id is not on a visible unit already.
  function adopt(vis, made, from) {
    if (!from || !from.ids.some(Boolean)) return;
    const c = vis.map((u) => u.ch).join("");
    const { map } = alignSure(from.text, c);
    const used = new Set(vis.map((u) => u.id).filter(Boolean));
    vis.forEach((u, j) => {
      if (u.id || !made.has(u) || map[j] < 0) return;
      const id = from.ids[map[j]];
      if (id && !used.has(id)) { u.id = id; used.add(id); }
    });
  }

  // Around every replay call: who deleted the units with ids, then, where
  // the units were rebuilt (r.rebuilds), the ids carried over, and ids taken
  // back by units the call made. A block this tab never typed in has no ids.
  // shown: the editor's text now (its ids are `view`), for a join: units the
  // join made take back the ids of this tab's text the editor shows.
  function around(X, kind, fn, shown = null) {
    if (next === 1) { fn(); return; }
    const rebuilds = r.rebuilds, beforeText = r.S ? r.S.c : "";
    const arr = r.units;
    const tagged = [];
    let count = 0;
    for (const u of arr) if (!u.del) { if (u.id) tagged.push([count, u]); count++; }
    const mine = kind === "own" || (kind === "room" && X && X.w && X.w.a === me) ? sent.get(keyOf(X)) : seed && X && !X.w && X.c === seed.text ? seed : null;
    const fromView = typeof shown === "string" && shown.length === view.length ? { text: shown, ids: view.slice() } : null;
    const back = kind !== "peer" && (mine || pre || fromView);
    // Units a placed write of this tab's own makes carry their ids already.
    const had = back && kind === "room" ? new Set(arr) : null;
    fn();
    const by = (id, a) => { if (a === me) erased.add(id); else if (typeof a === "string") peer.add(id); };
    for (const [, u] of tagged) if (u.del) for (const d of u.del) by(u.id, d.a);
    const rebuilt = r.rebuilds !== rebuilds;
    if (!rebuilt && !had) return;
    const vis = visible(r);
    if (rebuilt && tagged.length) {
      const ids = new Array(beforeText.length).fill(0);
      for (const [i, u] of tagged) ids[i] = u.id;
      const out = carry(beforeText, ids, vis.map((u) => u.ch).join(""));
      const used = new Set(vis.map((u) => u.id).filter(Boolean));
      vis.forEach((u, j) => { if (!u.id && out.ids[j] && !used.has(out.ids[j])) { u.id = out.ids[j]; used.add(u.id); } });
      for (const id of out.gone) if (!used.has(id)) by(id, kind === "own" ? me : kind === "peer" ? X.w.a : null);
      for (const id of out.doubt) if (!used.has(id)) { doubtful.add(id); if (risk) risk.add(id); }
    }
    if (back) {
      const made = rebuilt ? new Set(vis) : new Set(vis.filter((u) => !had.has(u)));
      if (made.size) {
        if (mine) adopt(vis, made, mine);
        if (pre) adopt(vis, made, pre);
        if (fromView) adopt(vis, made, fromView);
      }
    }
  }

  return {
    edit, editTo, wrote,
    // This tab made the block with this text: every unit is its own.
    created(text) {
      if (view.length || !text) return;
      edit(0, 0, text);
      seed = { text, ids: view.slice() };
    },
    step(X, seq) { around(X, kindOf(X, me), () => step(r, X, seq)); },
    join(X, seq, opts) { around(null, "room", () => join(r, X, seq, opts), opts?.shown ?? null); },
    tombstone(seq) { for (const u of visible(r)) if (u.id) peer.add(u.id); tombstone(r, seq); },
    agreedIds,
    // A notice (a refusal's) named the editor's text in these [from, to)
    // ranges: those units are accounted for, like this tab's own deletes. Text
    // the agreed text holds but could not identify is not among them.
    named(ranges) {
      for (const [from, to] of ranges) for (let i = from; i < to; i++) if (view[i]) erased.add(view[i]);
    },
    // The editor now shows `shown` (the agreed text, after a release).
    released(shown) {
      const c = r.S ? r.S.c : "";
      view = shown === c ? agreedIds() : carry(c, agreedIds(), shown ?? "").ids;
    },
    // A room loss: what this tab typed and still shows or agrees on is at
    // risk, and so is what it types until the check.
    arm() {
      risk ??= new Set();
      for (const id of view) if (id) risk.add(id);
      for (const id of doubtful) risk.add(id);
      const ids = agreedIds();
      for (const id of ids) if (id) risk.add(id);
      pre = { text: r.S ? r.S.c : "", ids };
      if (timer !== null) clearTimer(timer);
      timer = setTimer(check, quiet * 6);
    },
    check,
    get armed() { return risk !== null; },
    get ids() { return { view: view.slice(), agreed: agreedIds() }; },
    lostRuns,
    dispose() { if (timer !== null) clearTimer(timer); timer = null; },
  };

  // What a check names, one text a run: the lost units, each widened to the
  // whole word it is in, with the space before it. A word is a word segment of
  // the run's units as they stand (this tab's and peers' deletes left out), so
  // CJK splits into its words; a word over LONG_WORD units (a URL, base64)
  // names only its lost units. One pass a run.
  function lostRuns() {
    if (!risk) return [];
    const shown = new Set(view.filter(Boolean));
    for (const id of agreedIds()) if (id) shown.add(id);
    const lost = new Set();
    for (const id of risk) if (!shown.has(id) && !erased.has(id) && !peer.has(id)) lost.add(id);
    if (!lost.size) return [];
    const members = new Map();
    for (const [id, run] of runOf) {
      if (erased.has(id) || peer.has(id)) continue;
      if (!members.has(run)) members.set(run, []);
      members.get(run).push(id);
    }
    const runs = new Map();
    for (const run of new Set([...lost].map((id) => runOf.get(id)))) {
      const ids = members.get(run).sort((a, b) => a - b);
      const units = ids.map((id) => chOf.get(id));
      const named = new Uint8Array(ids.length);
      for (const [start, end] of wordSegments(units.join(""))) {
        let any = false;
        for (let k = start; k < end; k++) if (lost.has(ids[k])) { named[k] = 1; any = true; }
        if (!any || end - start > LONG_WORD || !units[start].trim()) continue;
        named.fill(1, start, end);
        if (start > 0 && !units[start - 1].trim()) named[start - 1] = 1;
      }
      let text = "";
      for (let i = 0; i < ids.length; i++) if (named[i]) text += units[i];
      runs.set(run, text);
    }
    return [...runs.entries()].sort((x, y) => x[0] - y[0]).map(([, t]) => t).filter((t) => t.trim());
  }

  function check() {
    timer = null;
    if (!risk) return;
    if (!ready()) { timer = setTimer(check, quiet * 2); return; }
    if (r.S) for (const lost of lostRuns()) notice(lost);
    for (const id of risk) doubtful.delete(id);
    risk = null;
    pre = null;
  }
}
