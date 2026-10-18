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
// character alignment of the agreed text before and after (alignUnits), and a
// unit the step itself made can take back an id: from this tab's own write or
// heal when it is the one stepped (the ids it sent), and while a check is
// armed, from the agreed text just before the loss. A rebase (an exact repair)
// keeps the units and inserts new ones without ids; those can take back an id
// the same two ways. An id the alignment drops counts as deleted by the step's
// author: this tab for its own write, a peer for a peer's write, and nobody
// (so it can be lost) for a heal, a repair, a join or a whole write.
import { step, join, tombstone, chainOf } from "./replay.js";

const MAX_EDITS = 2000;

// For each unit of b, the index of the unit of a it is, or -1: a common prefix
// and suffix, and a shortest edit script (Myers) on the rest, given up past
// MAX_EDITS edits (the rest then counts as replaced).
export function alignUnits(a, b) {
  const map = new Int32Array(b.length).fill(-1);
  let p = 0;
  const n = Math.min(a.length, b.length);
  while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) { map[p] = p; p++; }
  let s = 0;
  while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) { map[b.length - 1 - s] = a.length - 1 - s; s++; }
  const A = a.slice(p, a.length - s), B = b.slice(p, b.length - s);
  if (!A.length || !B.length) return map;
  const N = A.length, M = B.length, max = Math.min(N + M, MAX_EDITS);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A.charCodeAt(x) === B.charCodeAt(y)) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { found = true; break; }
    }
  }
  if (!found) return map;
  let x = N, y = M;
  for (let d = trace.length - 1; d > 0; d--) {
    const t = trace[d];
    const k = x - y;
    const prev = k === -d || (k !== d && t[off + k - 1] < t[off + k + 1]) ? k + 1 : k - 1;
    const px = t[off + prev], py = px - prev;
    while (x > px && y > py) { x--; y--; map[p + y] = p + x; }
    if (x === px) y--; else x--;
  }
  while (x > 0 && y > 0) { x--; y--; map[p + y] = p + x; }
  return map;
}

const reverse = (t) => { let out = ""; for (let i = t.length - 1; i >= 0; i--) out += t[i]; return out; };

// alignUnits, keeping only the matches that hold either way: the alignment
// that matches from the start (alignUnits) and the one that matches from the
// end (alignUnits of the reversed texts) agree on them. Repeated text gives
// two equally short edit scripts that pair a unit with different copies; a
// unit they disagree on is not proven kept, so it maps to -1 here, and
// `unsure` lists the units of a either alignment keeps that this map does not.
export function alignSure(a, b) {
  const fwd = alignUnits(a, b);
  const rev = alignUnits(reverse(a), reverse(b));
  const map = new Int32Array(b.length).fill(-1);
  const keptF = new Uint8Array(a.length), keptS = new Uint8Array(a.length);
  for (let j = 0; j < b.length; j++) {
    const r = rev[b.length - 1 - j];
    const back = r >= 0 ? a.length - 1 - r : -1;
    if (fwd[j] >= 0) keptF[fwd[j]] = 1;
    if (back >= 0) keptF[back] = 1;
    if (fwd[j] >= 0 && fwd[j] === back) { map[j] = fwd[j]; keptS[fwd[j]] = 1; }
  }
  const unsure = [];
  for (let i = 0; i < a.length; i++) if (keptF[i] && !keptS[i]) unsure.push(i);
  return { map, unsure };
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
  function around(X, kind, fn) {
    if (next === 1) { fn(); return; }
    const rebuilds = r.rebuilds, beforeText = r.S ? r.S.c : "";
    const arr = r.units;
    const tagged = [];
    let count = 0;
    for (const u of arr) if (!u.del) { if (u.id) tagged.push([count, u]); count++; }
    const mine = kind === "own" || (kind === "room" && X && X.w && X.w.a === me) ? sent.get(keyOf(X)) : seed && X && !X.w && X.c === seed.text ? seed : null;
    const back = kind !== "peer" && (mine || pre);
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
    join(X, seq, opts) { around(null, "room", () => join(r, X, seq, opts)); },
    tombstone(seq) { for (const u of visible(r)) if (u.id) peer.add(u.id); tombstone(r, seq); },
    agreedIds,
    // A notice (a refusal's) named every unit the editor shows and the agreed
    // text lacks: they are accounted for, like this tab's own deletes.
    named() {
      const agreed = new Set(agreedIds());
      for (const id of view) if (id && !agreed.has(id)) erased.add(id);
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

  function lostRuns() {
    if (!risk) return [];
    const shown = new Set(view.filter(Boolean));
    for (const id of agreedIds()) if (id) shown.add(id);
    const runs = new Map();
    for (const id of [...risk].sort((a, b) => a - b)) {
      if (shown.has(id) || erased.has(id) || peer.has(id)) continue;
      const run = runOf.get(id);
      runs.set(run, (runs.get(run) ?? "") + chOf.get(id));
    }
    return [...runs.values()].filter((t) => t.trim());
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
