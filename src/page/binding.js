// The page editor's live binding: one ProseMirror view on one live store, with
// every text block merged by its own replay (replay.js).
//
// The store's value is { blocks: { <id>: block }, deleted: { <id>: true } }.
// A text block is { t, pos, ...attrs, c, m? } (model.js, inline.js), and this
// binding's writes add w (replay.js). Any other block is written whole and the
// later write wins. A delete sets the tombstone in the same update, so a stale
// write never brings the block back.
//
// Local side: each transaction becomes one store update with one write per
// block it changed, never a ProseMirror step carried across keys. A split
// truncates the first half and creates the second; a join or a delete across
// blocks rewrites the first and deletes the rest.
//
// Remote side: each frame's ops go through the replays in room order. A block
// is released into the editor (its agreed value, as minimal steps kept out of
// the undo history) once this tab has no write for it in flight and is not
// composing in it, so a release never has unconfirmed local steps under it.
import { state as pmState, transform as pmTransform } from "../vendor/prosemirror.vendor.js";
import { REMOTE, blockJson, docFromBlocks, insideTextblocks, newId, nodeFromBlock } from "./model.js";
import { flatten, marksOf, packMarks, unflatten, unpackMarks } from "./inline.js";
import { createReplay, healChain, mapCaret, regions, repairOf, strip } from "./replay.js";
import { createHealCheck } from "./heal-check.js";
import { registerUnsavedState } from "../lib/unsaved-state.js";
import { applyOp, cloneJson } from "../live/ops.js";

const { TextSelection } = pmState;
// A copy of a block of the record, with one mark key per unit (the record
// keeps runs). A copy, because the store changes its value in place.
const rawOf = (value, id) => {
  const raw = (value && value.blocks && value.blocks[id]) || null;
  return raw && typeof raw === "object" ? unpackMarks(cloneJson(raw)) : raw;
};
const readAt = (root, path) => {
  let node = root;
  for (const seg of path) node = node && typeof node === "object" ? node[seg] : undefined;
  return node;
};
const tombOf = (value, id) => !!(value && value.deleted && value.deleted[id]);
// hashOf(a) === hashOf(b) on JSON values, without building either string:
// the same values without w, keys in any order.
const equalJson = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equalJson(a[i], b[i])) return false;
    return true;
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object" || Array.isArray(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const k of keys) if (!Object.prototype.hasOwnProperty.call(b, k) || !equalJson(a[k], b[k])) return false;
    return true;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};
export const sameJson = (a, b) => equalJson(strip(a), strip(b));
const same = (a, b) => (a === null || b === null ? a === b : sameJson(a, b));
const keyAt = (m, i) => (m && m[i]) || "";
const isHigh = (u) => u >= 0xd800 && u <= 0xdbff;
const isLow = (u) => u >= 0xdc00 && u <= 0xdfff;

// The record's document: every block not under its tombstone.
export function docFromRecord(schema, value) {
  const blocks = {};
  for (const [id, block] of Object.entries((value && value.blocks) || {})) if (!tombOf(value, id)) blocks[id] = strip(block);
  return docFromBlocks(schema, blocks);
}

// The block an op touches, or null for one on the whole map.
function blockOf(op) {
  if ((op.path[0] === "blocks" || op.path[0] === "deleted") && op.path.length >= 2) return String(op.path[1]);
  return null;
}

// One frame's ops as block ops, in order: { id, X } (X null: deleted) or
// { id, tombstone: true }, X with one mark key per unit; a set of one block
// also carries the value as sent. An op deeper than a block (a data API set on
// one field) or on the whole map takes the block's value after the frame, whole.
// before(path): what the record held there before the frame (the store's
// rebase event), or null.
function blockOps(ops, before, next) {
  const out = [];
  for (const op of ops) {
    const [root, id] = op.path;
    if (op.path.length === 0 || (op.path.length === 1 && root === "blocks")) {
      const ids = new Set([...Object.keys((before && before(["blocks"])) ?? {}), ...Object.keys(next?.blocks ?? {})]);
      for (const k of ids) out.push({ id: k, X: rawOf(next, k) ? strip(rawOf(next, k)) : null });
      if (op.path.length === 0) for (const k of Object.keys(next?.deleted ?? {})) out.push({ id: k, tombstone: true });
      continue;
    }
    if (root === "deleted") {
      if (op.path.length === 1 && op.op === "set" && op.value) for (const k of Object.keys(op.value)) if (op.value[k]) out.push({ id: k, tombstone: true });
      if (op.path.length === 2 && op.op === "set" && op.value) out.push({ id: String(id), tombstone: true });
      continue;
    }
    if (root !== "blocks") continue;
    if (op.path.length === 2) out.push({ id: String(id), X: op.op === "set" ? unpackMarks(op.value) : null, sent: op.op === "set" ? op.value : null });
    // A merge's diff sets many fields of one block: one step for them all.
    else if (!(out.length && out[out.length - 1].deep === String(id))) out.push({ id: String(id), X: rawOf(next, id) ? strip(rawOf(next, id)) : null, deep: String(id) });
  }
  return out;
}

// Per top-level block of the final document, the range of its content every
// step of these transactions touched, in that document's offsets. A step that
// only changes a node's type or attrs touches no content.
function touchedRanges(trs, doc) {
  const maps = trs.flatMap((tr) => tr.mapping.maps);
  const steps = trs.flatMap((tr) => tr.steps);
  const ranges = [];
  steps.forEach((s, i) => {
    if (s instanceof pmTransform.AttrStep) return;
    if (s instanceof pmTransform.ReplaceAroundStep && s.structure && s.gapFrom === s.from + 1 && s.gapTo === s.to - 1 && s.slice.content.childCount === 1 && s.slice.openStart === 0) return;
    const later = new pmTransform.Mapping(maps.slice(i + 1));
    const own = [];
    if (s instanceof pmTransform.AddMarkStep || s instanceof pmTransform.RemoveMarkStep) own.push([s.from, s.to]);
    else s.getMap().forEach((_a, _b, from, to) => own.push([from, to]));
    for (const [from, to] of own) ranges.push([later.map(from, -1), later.map(to, 1)]);
  });
  const out = new Map();
  doc.forEach((node, offset) => {
    if (!node.isTextblock || !node.attrs.id) return;
    const start = offset + 1, end = offset + node.nodeSize - 1;
    for (const [a, b] of ranges) {
      if (b < start || a > end) continue;
      const r = out.get(node.attrs.id) ?? { from: Infinity, to: -Infinity };
      out.set(node.attrs.id, { from: Math.min(r.from, Math.max(a, start) - start), to: Math.max(r.to, Math.min(b, end) - start) });
    }
  });
  return out;
}

const sameUnit = (x, i, y, j) => x.c.charCodeAt(i) === y.c.charCodeAt(j) && keyAt(x.m, i) === keyAt(y.m, j);

// The splice that turns prev into next (flat { c, m }): prev[p, e) became
// next[p, q). Its position comes from the steps' range when that range explains
// the change; otherwise from a diff. Units equal in text and marks at either
// end are trimmed off, and a surrogate pair is never cut.
function spliceFrom(prev, next, range) {
  let p, e, q;
  const fits = (p, e, q) => {
    if (p < 0 || e < p || q < p || e > prev.c.length || q > next.c.length || prev.c.length - e !== next.c.length - q) return false;
    for (let i = 0; i < p; i++) if (!sameUnit(prev, i, next, i)) return false;
    for (let i = 0; i < prev.c.length - e; i++) if (!sameUnit(prev, e + i, next, q + i)) return false;
    return true;
  };
  if (range && fits(range.from, prev.c.length - (next.c.length - range.to), range.to)) {
    p = range.from;
    q = range.to;
    e = prev.c.length - (next.c.length - q);
  } else {
    p = 0;
    while (p < prev.c.length && p < next.c.length && sameUnit(prev, p, next, p)) p++;
    let s = 0;
    while (s < prev.c.length - p && s < next.c.length - p && sameUnit(prev, prev.c.length - 1 - s, next, next.c.length - 1 - s)) s++;
    e = prev.c.length - s;
    q = next.c.length - s;
  }
  while (p < e && p < q && sameUnit(prev, p, next, p)) p++;
  while (e > p && q > p && sameUnit(prev, e - 1, next, q - 1)) { e--; q--; }
  if (p > 0 && isHigh(prev.c.charCodeAt(p - 1))) p--;
  if (e < prev.c.length && isLow(prev.c.charCodeAt(e))) { e++; q++; }
  if (p === e && p === q) return null;
  const rm = prev.m.slice(p, e);
  return [p, e, prev.c.slice(p, e), prev.c.length, ...(rm.some(Boolean) ? [rm] : [])];
}

function changedFields(before, after) {
  const out = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (name === "c" || name === "m" || name === "w") continue;
    if (JSON.stringify(before[name]) !== JSON.stringify(after[name])) out.push(name);
  }
  return out;
}

function findBlock(doc, id) {
  let found = null;
  doc.forEach((node, pos, index) => { if (!found && node.attrs.id === id) found = { node, pos, index }; });
  return found;
}

const orderKey = (pos, id) => [pos ?? "", id ?? ""];
const before = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);

/**
 * @param {object} o
 * @param {object} o.schema
 * @param {object} o.store         the live store (plugins/live.js storeOf)
 * @param {object} o.lane          the fast lane (fastLane()), for its writer and epoch
 * @param {string} o.me            this tab's client id: the author of its writes
 * @param {Function} [o.setTimer] @param {Function} [o.clearTimer]
 * @param {number} [o.quiet]       ms of quiet before the writer repairs the room
 * @param {Function} [o.checkpointWithin]  plugins/live.js; nudged after every change
 * @param {Function} [o.requestCheckpoint] plugins/live.js; the end of a flush
 * @param {Function} [o.onNotice]
 */
export function createPageBinding({ schema, store, lane, me, setTimer = setTimeout, clearTimer = clearTimeout, quiet = 500, checkpointWithin = () => {}, requestCheckpoint = null, onNotice = () => {} }) {
  const blocks = new Map();
  const dirty = new Set();
  const opBlock = new Map();
  const own = [];
  // Text blocks with writes the stream has not brought back (B.unechoed).
  const waiting = new Set();
  const stats = { writes: 0, releases: 0, repairs: 0, follows: 0, heals: 0 };
  const waiters = new Set();
  let view = null;
  let epoch = null;
  let seq = 0;
  // An open composition holds the block of the selection head at its start
  // (that block's id), or the whole page ("*") when the head is in no block or
  // the composition moves to another block; null when none is open.
  let composing = null;
  let compositionTimer = null;
  function reconcileComposition() {
    if (composing === null || !view || view.composing) return false;
    composing = null;
    clearTimer(compositionTimer);
    compositionTimer = null;
    return true;
  }
  function watchComposition() {
    clearTimer(compositionTimer);
    compositionTimer = setTimer(() => {
      compositionTimer = null;
      if (!view || composing === null) return;
      if (reconcileComposition()) releaseAll();
      else watchComposition();
    }, 5000);
  }
  const holds = (id) => composing === "*" || (composing !== null && composing === id);
  const headBlock = (v) => {
    const sel = v.state.selection;
    if (!(sel instanceof TextSelection) || sel.$head.depth < 1) return "*";
    return sel.$head.node(1).attrs.id || "*";
  };

  const isText = (t) => !!schema.nodes[t]?.isTextblock;
  const agreedOf = (B) => (B.text ? B.r.S : B.tomb ? null : strip(rawOf(store.authoritative, B.id)));
  const epochNow = () => epoch ?? lane.status.epoch ?? null;

  function ensure(id, value, X) {
    let B = blocks.get(id);
    if (B) return B;
    const raw = value ? rawOf(value, id) : null;
    const t = (X && X.t) || (raw && raw.t);
    B = { id, text: t ? isText(t) : true, r: null, tomb: false, k: seq, edited: false, refused: false, removedFrom: null, unechoed: [], timer: null };
    if (B.text) {
      B.r = createReplay(raw ? strip(raw) : null, { seq, epoch: epochNow(), me });
      B.r.tomb = tombOf(value, id);
      if (B.r.tomb) B.r.S = null;
      B.heal = createHealCheck({ r: B.r, me, quiet, setTimer, clearTimer, ready: () => readyFor(B), notice: (lost) => notice({ kind: "heal", id, lost, by: me }) });
    } else {
      B.tomb = tombOf(value, id);
      // A block written whole: this tab's last write to it while that write is
      // the latest the tab knows (mine), the writes not yet seen back (ownSent,
      // each { value, id: its op, seq: where it landed }), and the values the
      // tab has seen it hold (seen), for a room loss.
      B.mine = null;
      B.ownSent = [];
      B.seen = raw ? [strip(raw)] : [];
    }
    blocks.set(id, B);
    return B;
  }
  for (const id of Object.keys(store.authoritative?.blocks ?? {})) ensure(id, store.authoritative);

  function remember(B, X) {
    if (!X || B.seen.some((v) => sameJson(v, X))) return;
    B.seen.push(strip(X));
    if (B.seen.length > 32) B.seen.shift();
  }

  // A whole value of block B came in the stream at room seq `at` (a frame's,
  // or a state's): this tab's own, or another value. Another value ends this
  // tab's claim only when it is ordered after every write of this tab's own
  // not yet seen back, by room seq, never by content: an own write that landed
  // later, or is still on its way (its op still pending), keeps the claim.
  function cameWhole(B, X, at = null, frame = null) {
    remember(B, X);
    if (!frame) {
      const delivered = B.ownSent.find((v) => v.seq === at && v.client !== null && v.n !== null);
      if (delivered) frame = { from: delivered.client, n: delivered.n };
    }
    const matches = (v) => frame && v.client === frame.from && v.n === frame.n;
    const echoed = B.ownSent.filter(matches);
    if (echoed.length) {
      const last = echoed[echoed.length - 1];
      B.ownSent = B.ownSent.filter((v) => !matches(v));
      if (!B.ownSent.some((v) => v.id > last.id)) B.mine = { value: last.value };
      return;
    }
    if (!B.mine) return;
    const pending = new Set(store.pendingEntries().map((e) => e.id));
    B.ownSent = B.ownSent.filter((v) => v.seq !== null ? at === null || v.seq > at : v.id === undefined || pending.has(v.id));
    if (!B.ownSent.length) B.mine = null;
  }

  const sentWhole = (B, value) => {
    B.mine = { value: strip(value) };
    B.ownSent.push({ value: strip(value), id: undefined, seq: null, client: null, n: null });
    remember(B, value);
  };

  const plugin = new pmState.Plugin({
    // A pasted copy of a block gets a new id from identityPlugin (model.js),
    // which knows the original from the transaction's mapping. Clearing ids in
    // transformPasted would be wrong: ProseMirror runs it on a drag that moves
    // a block too, before it knows the drop is a move.
    props: {
      handleDOMEvents: {
        compositionstart(v) { composing = headBlock(v); watchComposition(); return false; },
        compositionend() {
          composing = null;
          clearTimer(compositionTimer);
          compositionTimer = null;
          setTimer(releaseAll, 0);
          return false;
        },
      },
    },
    // A block that comes back under its tombstone's id (undo of a delete, a
    // paste of a deleted block) is a new block.
    appendTransaction(trs, old, next) {
      if (!trs.some((tr) => tr.docChanged && !tr.getMeta(REMOTE))) return null;
      if (trs.every(insideTextblocks)) return null;
      const had = new Set();
      old.doc.forEach((node) => had.add(node.attrs.id));
      const tr = next.tr;
      next.doc.forEach((node, offset) => {
        const id = node.attrs.id;
        if (id && !had.has(id) && tombOf(store.value, id)) tr.setNodeMarkup(offset, null, { ...node.attrs, id: newId("b") });
      });
      return tr.docChanged ? tr : null;
    },
  });

  // ---- local side ----------------------------------------------------------

  function dispatch(tr) {
    const prev = view.state;
    const { state, transactions } = prev.applyTransaction(tr);
    view.updateState(state);
    const compositionEnded = reconcileComposition();
    if (composing !== null && composing !== "*" && headBlock(view) !== composing) composing = "*";
    const local = transactions.filter((t) => !t.getMeta(REMOTE));
    if (local.some((t) => t.docChanged) && !transactions.some((t) => t.getMeta(REMOTE))) commit(prev.doc, state.doc, local);
    if (compositionEnded) queueMicrotask(releaseAll);
  }

  function commit(prevDoc, nextDoc, trs) {
    const index = (doc) => {
      const map = new Map();
      doc.forEach((node) => { if (node.attrs.id) map.set(node.attrs.id, node); });
      return map;
    };
    const was = index(prevDoc), now = index(nextDoc);
    const ranges = touchedRanges(trs, nextDoc);
    const writes = [];
    for (const [id, node] of was) if (!now.has(id)) writes.push({ id, del: true, text: node.textContent });
    for (const [id, node] of now) {
      const old = was.get(id);
      if (old === node) continue;
      const value = blockJson(node);
      if (!old) { writes.push({ id, value }); continue; }
      const prevJson = blockJson(old);
      if (sameJson(prevJson, value)) continue;
      const B = blocks.get(id);
      if (!B || !B.text || !node.isTextblock || !old.isTextblock) { writes.push({ id, value }); continue; }
      const sp = spliceFrom({ c: prevJson.c, m: flatten(old.content).m }, { c: value.c, m: flatten(node.content).m }, ranges.get(id));
      const w = { a: me, e: epochNow(), k: B.k, s: [sp ?? [0, 0, "", prevJson.c.length]], f: changedFields(prevJson, value) };
      const put = sp ? value.c.slice(sp[0], sp[0] + value.c.length - prevJson.c.length + sp[1] - sp[0]) : null;
      if (!sp) B.heal.editTo(prevJson.c, value.c);
      else if (put !== prevJson.c.slice(sp[0], sp[1])) B.heal.edit(sp[0], sp[1], put);
      B.heal.wrote({ ...value, w });
      writes.push({ id, value: { ...value, w } });
    }
    if (!writes.length) return;
    const mark = store.mark;
    store.handle.update((d) => {
      if (!d.blocks) d.blocks = {};
      for (const x of writes) {
        if (x.del) {
          delete d.blocks[x.id];
          if (d.deleted) d.deleted[x.id] = true;
          else d.deleted = { [x.id]: true };
        } else d.blocks[x.id] = packMarks(x.value);
      }
    });
    for (const x of writes) {
      const made = !blocks.has(x.id);
      const B = ensure(x.id, null, x.value);
      B.edited = true;
      if (x.del) B.removedFrom = x.text;
      if (!B.text) {
        if (x.del) { B.mine = null; B.ownSent = []; }
        else sentWhole(B, x.value);
      }
      // A block this tab made (a split's second half, a paste): its text is
      // tracked from its first unit, before the block's first release.
      else if (made && B.heal && typeof x.value.c === "string") B.heal.created(x.value.c);
    }
    sent(mark);
    stats.writes++;
    checkpointWithin(1500);
  }

  // The store ops made since mark: which block each is for, and the text
  // writes the stream has not brought back yet.
  function sent(mark) {
    for (const e of store.pendingEntries()) {
      if (e.id <= mark) continue;
      const id = blockOf(e.op);
      if (id === null) continue;
      opBlock.set(e.id, id);
      const B = blocks.get(id);
      if (B && B.text && e.op.op === "set" && e.op.path.length === 2 && e.op.path[0] === "blocks") { B.unechoed.push({ id: e.id, json: JSON.stringify(e.op.value), value: e.op.value, seq: null }); waiting.add(B); }
      if (B && !B.text && e.op.op === "set" && e.op.path.length === 2 && e.op.path[0] === "blocks") { const v = B.ownSent[B.ownSent.length - 1]; if (v && v.id === undefined) v.id = e.id; }
      // A delete the stream has not brought back: a room loss heals it too.
      if (B && e.op.op === "del" && e.op.path.length === 2 && e.op.path[0] === "blocks") B.unechoedDel = e.id;
    }
  }

  function send(B, value, ids) {
    if (value && B.heal) B.heal.wrote(value, ids ?? B.heal.agreedIds());
    if (value && !B.text) sentWhole(B, value);
    const mark = store.mark;
    if (value === null) store.handle.delete(["blocks", B.id]);
    else store.handle.set(["blocks", B.id], packMarks(value));
    sent(mark);
  }

  // Blocks with a write in flight ("*": an op on the whole map holds them all),
  // and blocks with a write a save carried that the room has not had.
  function heldIds() {
    const out = new Set();
    const pending = new Set();
    for (const e of store.pendingEntries()) { out.add(blockOf(e.op) ?? "*"); pending.add(e.id); }
    for (const B of waiting) {
      if (!B.unechoed.length) waiting.delete(B);
      else if (carried(B, pending).length) out.add(B.id);
    }
    return out;
  }

  // This tab's text writes that left pending without the room having them: a
  // save made while out of the room took them (the file holds them), and the
  // host's merge may have replayed a peer's later write over them.
  function carried(B, pending) {
    if (!B.text || !B.unechoed.length) return [];
    return B.unechoed.filter((u) => u.seq === null && !pending.has(u.id));
  }

  // Back in the same room after a save took writes it never had: each goes to
  // the room again as it was made, as the lane would have sent it had no save
  // taken it, so every tab places it by its steps, with the heal check armed.
  // When the room held the last one's text since (the merge kept it), none is
  // sent again.
  function resend(carry, from) {
    for (const [B, list] of carry) {
      const pending = new Set(store.pendingEntries().map((e) => e.id));
      const left = carried(B, pending).filter((u) => list.includes(u));
      B.unechoed = B.unechoed.filter((u) => !list.includes(u));
      const last = left[left.length - 1];
      const kept = (X) => !!X && X.c === last.value.c;
      if (!last || kept(B.r.S) || B.r.log.some((e) => e.seq > from && kept(e.X))) continue;
      stats.heals++;
      B.heal.arm();
      queueMicrotask(() => {
        for (const u of left) {
          const mark = store.mark;
          store.handle.set(["blocks", B.id], u.value);
          sent(mark);
        }
      });
    }
  }

  // ---- remote side ---------------------------------------------------------

  store.onDelivery((ev) => {
    if (ev.phase === "sent") {
      for (const B of blocks.values()) if (!B.text) {
        for (const v of B.ownSent) if (v.id >= ev.first && v.id <= ev.through) {
          v.client = ev.client;
          v.n = ev.n;
        }
      }
    }
    if ((ev.phase === "landed" || ev.phase === "echoed") && Number.isInteger(ev.seq)) {
      for (const B of blocks.values()) {
        for (const u of B.unechoed) if (u.seq === null && u.id <= ev.through) u.seq = ev.seq;
        if (!B.text) for (const v of B.ownSent) if (v.client === ev.client && v.n === ev.n) v.seq = ev.seq;
      }
    }
    if (ev.phase === "refused" || ev.phase === "undone") {
      const hit = (opId) => opId <= ev.through && (ev.from == null || opId >= ev.from);
      for (const [opId, id] of opBlock) if (hit(opId)) { const B = blocks.get(id); if (B) { B.refused = true; dirty.add(id); if (!B.text) { B.mine = null; B.ownSent = []; } } }
      // A refused write is out of recovery: never waited for, never healed back.
      for (const B of blocks.values()) {
        if (B.unechoed.length) B.unechoed = B.unechoed.filter((u) => !hit(u.id));
        if (B.unechoedDel && hit(B.unechoedDel)) B.unechoedDel = null;
      }
    }
  });

  function echoed(B, X) {
    const json = JSON.stringify(X);
    const i = B.unechoed.findIndex((u) => u.json === json);
    if (i >= 0) B.unechoed.splice(0, i + 1);
  }

  // The record before a frame, as far as ensure reads it for one block.
  const priorOf = (before, id) => ({ blocks: { [id]: before(["blocks", id]) }, deleted: { [id]: before(["deleted", id]) } });

  function replayOps(ops, at, before, next, frame = null) {
    for (const op of blockOps(ops, before, next)) {
      const B = blocks.get(op.id) ?? ensure(op.id, priorOf(before, op.id), op.X);
      dirty.add(op.id);
      if (op.tombstone) {
        B.unechoedDel = null;
        if (B.text) B.heal.tombstone(at);
        else B.tomb = true;
        continue;
      }
      if (!B.text) { cameWhole(B, op.X ? strip(op.X) : null, at, frame); continue; }
      const X = op.X && Array.isArray(op.X.c) ? { ...blockJson(nodeFromBlock(schema, op.id, op.X)), ...(op.X.w ? { w: op.X.w } : {}) } : op.X;
      if (X && X.w && X.w.a === me) echoed(B, op.sent ?? X);
      B.heal.step(X, at);
    }
    advance(at);
  }

  // Every replay knows its block through the stream's seq, so a write's k (its
  // release seq) means the same in every tab. A block with nothing left to
  // release shows its value as of this seq too.
  function advance(at) {
    seq = Math.max(seq, at);
    for (const B of blocks.values()) {
      if (B.text) B.r.seq = Math.max(B.r.seq, at);
      if (!dirty.has(B.id) && B.k !== null) B.k = Math.max(B.k, at);
    }
  }

  // The moves of a state read, each with the record before and after it, from
  // the record before the read: an op deeper than a block takes the block's
  // value after its own move, never after the last one (a merge's diff).
  // ev.prev is read only then: the store copies it on first read.
  function replayMoves(moves, ev, before, next) {
    const later = moves.filter((mv) => mv.seq > seq);
    const deep = later.some((mv) => mv.ops.some((op) => op.path[0] !== "deleted" && !(op.path[0] === "blocks" && op.path.length === 2)));
    if (!deep) {
      for (const mv of later) replayOps(mv.ops, mv.seq, before, next);
      return;
    }
    let cur = cloneJson(ev.prev ?? {});
    for (const mv of later) {
      const was = cur;
      let after = cloneJson(was);
      for (const op of mv.ops) { try { after = applyOp(after, op); } catch {} }
      replayOps(mv.ops, mv.seq, (path) => readAt(was, path), after);
      cur = after;
    }
  }

  store.onRebase((ev) => {
    const { frame, room, before, next } = ev;
    const carry = new Map(), from = seq;
    if (room && !room.fresh) {
      const pending = new Set(store.pendingEntries().map((e) => e.id));
      for (const B of waiting) {
        const list = carried(B, pending);
        if (!list.length) continue;
        carry.set(B, list);
      }
    }
    if (frame) {
      replayOps(frame.ops, frame.seq, before, next, frame);
      checkpointWithin(1500);
    } else if (room && room.fresh) onEpoch(room, next);
    else if (room && Array.isArray(room.moves)) replayMoves(room.moves, ev, before, next); else if (room) {
      const ids = new Set([...blocks.keys(), ...Object.keys(next?.blocks ?? {})]);
      for (const id of ids) {
        const B = ensure(id, next);
        dirty.add(id);
        if (!B.text) {
          B.tomb = tombOf(next, id);
          const raw = rawOf(next, id);
          if (raw && !sameJson(rawOf(ev.prev, id), raw)) cameWhole(B, strip(raw), room.seq);
          continue;
        }
        if (room.seq !== B.r.seq || !same(rawOf(next, id), B.r.S)) B.heal.join(rawOf(next, id), room.seq, { tomb: tombOf(next, id), shown: shownText(B) });
        // Writes the joined value already holds never come back one by one.
        B.unechoed = B.unechoed.filter((u) => u.seq === null || u.seq > room.seq);
      }
    }
    if (room) advance(room.seq);
    if (carry.size) resend(carry, from);
    for (const B of blocks.values()) if (B.unechoed.length || B.refused) dirty.add(B.id);
    for (const opId of opBlock.keys()) if (!store.pendingEntries().some((e) => e.id === opId)) opBlock.delete(opId);
    queueMicrotask(releaseAll);
    for (const fn of [...waiters]) fn();
  });

  // A room's state for an epoch this tab was not in: its first join, or a room
  // restarted from the file after a loss. On a restart, every text block heals:
  // its agreed value from the lost room, plus this tab's writes the stream never
  // brought back, goes to the new room as one heal (replay.js).
  function onEpoch(room, next) {
    const now = lane.status.epoch;
    const moves = (room.moves ?? []).flatMap((mv) => blockOps(mv.ops, null, next).map((op) => ({ seq: mv.seq, ...op })));
    const first = epoch === null;
    epoch = now;
    seq = room.seq;
    const pending = new Set(store.pendingEntries().map((e) => e.id));
    const held = heldIds();
    const ids = new Set([...blocks.keys(), ...Object.keys(next?.blocks ?? {}), ...moves.map((mv) => mv.id)]);
    for (const id of ids) {
      const B = ensure(id, next, moves.find((mv) => mv.id === id)?.X);
      dirty.add(id);
      const mine = moves.filter((mv) => mv.id === id);
      // The lost room had the block deleted (its tombstone, or this tab's own
      // delete the stream never brought back) and the new room has it: the
      // delete heals like the text does, so a join's second half never comes
      // back as a duplicate.
      const wasGone = B.text ? B.r.tomb : B.tomb;
      // A peer's write to the block in the new epoch wins over a lost delete:
      // nothing typed was lost, so nothing is noticed.
      const peerChanged = mine.some((mv) => !mv.tombstone && !(mv.X && mv.X.w && mv.X.w.a === me) && !(B.mine && mv.X && sameJson(strip(mv.X), B.mine.value)));
      const lostDel = !first && !peerChanged && (wasGone || (B.unechoedDel && !pending.has(B.unechoedDel))) && rawOf(next, id) && !tombOf(next, id);
      B.unechoedDel = null;
      if (lostDel) {
        stats.heals++;
        queueMicrotask(() => {
          const mark = store.mark;
          store.handle.update((d) => {
            if (d.blocks) delete d.blocks[id];
            if (d.deleted) d.deleted[id] = true;
            else d.deleted = { [id]: true };
          });
          sent(mark);
        });
      }
      if (!B.text) {
        B.tomb = tombOf(next, id);
        const raw = rawOf(next, id), now = raw ? strip(raw) : null;
        const lostWhole = !first && !lostDel && B.mine && !(now && sameJson(now, B.mine.value)) && !held.has(id);
        if (lostWhole) {
          const v = B.mine.value;
          // The new room holds a value this tab has seen (an older one, from the
          // file) and no peer wrote the block since: this tab's write heals. A
          // peer's write, or a value this tab never saw, wins, with a notice
          // that keeps this tab's value for Restore.
          if (peerChanged || B.tomb || (now && !B.seen.some((x) => sameJson(x, now)))) {
            B.mine = null;
            B.ownSent = [];
            notice({ kind: "heal", id, lost: "", by: me, block: v });
          } else {
            stats.heals++;
            queueMicrotask(() => send(B, v));
          }
        }
        B.seen = now ? [now] : [];
        continue;
      }
      const r = B.r;
      const lost = B.unechoed;
      B.unechoed = lost.filter((u) => pending.has(u.id));
      const oldSeq = r.seq;
      const base = r.S, baseMarks = r.marks;
      const chain = [], u = [];
      if (!first) {
        for (const x of lost) {
          if (!x.value || !x.value.w || x.value.w.g !== undefined) continue;
          B.heal.step(unpackMarks(x.value), r.seq);
          for (const sp of r.log[r.log.length - 1].applied) { chain.push(sp.slice(0, 3).concat([sp[3]], sp[4] && sp[4].some(Boolean) ? [sp[4]] : [])); u.push(x.seq); }
        }
      }
      const healed = first ? null : r.S, healIds = first ? null : B.heal.agreedIds();
      if (!first) B.heal.arm();
      B.heal.join(rawOf(next, id), room.seq, { epoch: now, moves: room.moves ? mine : null, since: 0, tomb: tombOf(next, id) && !mine.some((mv) => mv.tombstone) });
      B.k = null;
      if (healed && !r.tomb && !same(healed, r.S)) {
        stats.heals++;
        const value = { ...strip(healed), w: { a: me, e: now, h: oldSeq, ...healChain(base, baseMarks, healed, chain, u) } };
        queueMicrotask(() => send(B, value, healIds));
      }
    }
  }

  // The editor's text of text block B, or null.
  function shownText(B) {
    const found = view ? findBlock(view.state.doc, B.id) : null;
    return found && found.node.isTextblock ? flatten(found.node.content).c : null;
  }

  // The heal check (heal-check.js) runs once the editor shows the agreed text
  // and nothing of the block is in flight.
  function readyFor(B) {
    const found = view ? findBlock(view.state.doc, B.id) : null;
    const shown = found && found.node.isTextblock ? flatten(found.node.content).c : null;
    return !(heldIds().has(B.id) || B.unechoed.length || holds(B.id) || shown !== (B.r.S ? B.r.S.c : null));
  }

  // Show every changed block whose writes have all landed, in one transaction.
  function releaseAll() {
    reconcileComposition();
    if (!view || composing === "*" || (composing === null && view.composing)) return;
    const held = heldIds();
    if (held.has("*")) return;
    const ids = [...dirty].filter((id) => !held.has(id) && !holds(id));
    if (!ids.length) return;
    const tr = view.state.tr;
    const sel = view.state.selection;
    const at = (pos) => {
      const $p = view.state.doc.resolve(pos);
      if ($p.depth < 1) return null;
      return { id: $p.node(1).attrs.id, off: pos - $p.start(1) };
    };
    const text = sel instanceof TextSelection;
    const head = text ? at(sel.head) : null, anchor = text ? at(sel.anchor) : null;
    const carets = new Map();
    const order = [];
    for (const id of ids) {
      dirty.delete(id);
      const B = blocks.get(id);
      if (!B) continue;
      const S = agreedOf(B);
      const found = findBlock(tr.doc, id);
      if (!S) {
        if (found) remove(tr, B, found);
      } else if (!found) order.push(B);
      else {
        if (B.text && found.node.isTextblock && isText(S.t)) {
          const E = flatten(found.node.content);
          if (B.refused) {
            const named = [];
            for (const g of regions(E.c, S.c)) if (g.to > g.from && E.c.slice(g.from, g.to).trim()) { notice({ kind: "refused", id, lost: E.c.slice(g.from, g.to) }); named.push([g.from, g.to]); }
            // That text is in a notice already: the heal check never names it again.
            if (named.length) B.heal.named(named);
          }
          const k = B.k;
          carets.set(id, (off) => mapCaret(B.r, me, k, off, E.c));
          textSteps(tr, B, found, E, S);
          B.heal.released(S.c);
        } else if (!sameJson(blockJson(found.node), S)) tr.replaceWith(found.pos, found.pos + found.node.nodeSize, nodeFromBlock(schema, id, S));
        order.push(B);
      }
      B.k = B.text ? B.r.seq : seq;
      B.refused = false;
      stats.releases++;
    }
    // While a composition holds a block, no block moves on the page: a move
    // shown by halves (one block's new place, not the other's) would push the
    // composing block around. A new block goes in now; every one waits to be
    // placed again at the composition's end (releaseAll after compositionend).
    if (composing !== null) {
      for (const B of order) {
        if (!findBlock(tr.doc, B.id)) place(tr, B);
        dirty.add(B.id);
      }
    } else for (const B of order) place(tr, B);
    if (tr.docChanged) {
      const placeCaret = (x) => {
        if (!x || !x.id) return null;
        const f = findBlock(tr.doc, x.id);
        if (!f) return null;
        const off = carets.has(x.id) ? carets.get(x.id)(x.off) : x.off;
        return f.pos + 1 + Math.max(0, Math.min(off, f.node.content.size));
      };
      const h = placeCaret(head), a = placeCaret(anchor);
      if (h !== null && a !== null) tr.setSelection(TextSelection.create(tr.doc, a, h));
      tr.setMeta(REMOTE, true).setMeta("addToHistory", false).setMeta("rebased", 0);
      view.dispatch(tr);
    }
    for (const id of ids) if (blocks.has(id)) settle(blocks.get(id));
  }

  // A block a peer deleted leaves the editor. This tab's text in it is kept in
  // a notice, unless the replay already has one for this tab's writes there.
  function remove(tr, B, found) {
    const text = found.node.textContent;
    const noted = B.r && B.r.conflicts.some((n) => n.kind === "removed" && n.by === me);
    if (B.edited && !noted && text.trim() && text !== B.removedFrom) notice({ kind: "removed", id: B.id, lost: text, by: me, block: blockJson(found.node) });
    if (tr.doc.childCount === 1) tr.replaceWith(found.pos, found.pos + found.node.nodeSize, schema.nodes.paragraph.create());
    else tr.delete(found.pos, found.pos + found.node.nodeSize);
  }

  // The editor's block E becomes S: text by a diff, then marks where the text
  // did not change, then the node's type and attrs.
  function textSteps(tr, B, found, E, S) {
    const start = found.pos + 1;
    const type = found.node.type;
    let delta = 0;
    const gs = regions(E.c, S.c).map((g) => { const s = g.from + delta; delta += g.t.length - (g.to - g.from); return { ...g, s }; });
    for (const g of gs.reverse()) {
      const nodes = g.t ? unflatten(schema, g.t, (S.m ?? []).slice(g.s, g.s + g.t.length), type) : [];
      if (g.to > g.from) tr.replaceWith(start + g.from, start + g.to, nodes);
      else if (nodes.length) tr.insert(start + g.from, nodes);
    }
    const now = flatten(tr.doc.nodeAt(found.pos).content);
    for (let i = 0; i < S.c.length;) {
      if (keyAt(now.m, i) === keyAt(S.m, i)) { i++; continue; }
      let j = i + 1;
      while (j < S.c.length && keyAt(now.m, j) !== keyAt(S.m, j) && keyAt(S.m, j) === keyAt(S.m, i)) j++;
      if (keyAt(S.m, i)[0] === "@" || keyAt(now.m, i)[0] === "@") tr.replaceWith(start + i, start + j, unflatten(schema, S.c.slice(i, j), (S.m ?? []).slice(i, j), type));
      else {
        tr.removeMark(start + i, start + j, null);
        for (const mark of marksOf(schema, keyAt(S.m, i))) if (type.allowsMarkType(mark.type)) tr.addMark(start + i, start + j, mark);
      }
      i = j;
    }
    const target = schema.nodes[S.t];
    const node = tr.doc.nodeAt(found.pos);
    const attrs = {};
    for (const [name, spec] of Object.entries(target.spec.attrs ?? {})) attrs[name] = name === "id" ? B.id : name in S ? S[name] : spec.default ?? null;
    if (target !== node.type || JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
      if (target.validContent(node.content)) tr.setNodeMarkup(found.pos, target, attrs);
      else tr.replaceWith(found.pos, found.pos + node.nodeSize, nodeFromBlock(schema, B.id, S));
    }
  }

  // Put block B where its (pos, id) says, inserting it when the editor has none.
  function place(tr, B) {
    const S = agreedOf(B);
    if (!S) return;
    const key = orderKey(S.pos, B.id);
    let found = findBlock(tr.doc, B.id);
    if (found) {
      const prev = found.index > 0 ? tr.doc.child(found.index - 1) : null;
      const next = found.index + 1 < tr.doc.childCount ? tr.doc.child(found.index + 1) : null;
      const ok = (!prev || !prev.attrs.id || before(orderKey(prev.attrs.pos, prev.attrs.id), key)) && (!next || !next.attrs.id || before(key, orderKey(next.attrs.pos, next.attrs.id)));
      if (ok) return;
      tr.delete(found.pos, found.pos + found.node.nodeSize);
    }
    const node = found ? found.node : nodeFromBlock(schema, B.id, S);
    let at = tr.doc.content.size;
    let set = false;
    tr.doc.forEach((child, offset) => {
      if (set || !child.attrs.id) return;
      if (before(key, orderKey(child.attrs.pos, child.attrs.id))) { at = offset; set = true; }
    });
    tr.insert(at, node);
    // The empty block a page keeps when every block was deleted goes once one comes back.
    const empty = [];
    tr.doc.forEach((child, offset) => { if (!child.attrs.id && child.content.size === 0) empty.push(offset); });
    if (tr.doc.childCount > empty.length) for (const offset of empty.reverse()) tr.delete(offset, offset + tr.doc.nodeAt(offset).nodeSize);
  }

  function notice(n) {
    own.push(n);
    onNotice(n);
  }

  // ---- repair, follow ------------------------------------------------------

  // The writer repairs the room's value after a short quiet spell. A tab that
  // refused a repair it could not place follows the room after a long one, and
  // so does one that sees a block under its tombstone: every tab agrees it is
  // gone, so any tab may delete it again.
  function settle(B) {
    clearTimer(B.timer);
    B.timer = null;
    const raw = rawOf(store.authoritative, B.id);
    const S = agreedOf(B);
    if (same(raw, S)) { if (B.r) { B.r.behind = false; B.r.counter = false; } return; }
    const writer = lane.isWriter();
    const tomb = B.text ? B.r.tomb : B.tomb;
    const counter = !!(B.r && B.r.counter);
    if (!writer && !(B.r && B.r.behind) && !tomb && !counter) return;
    B.timer = setTimer(() => (lane.isWriter() || (B.r && B.r.counter) ? repair(B) : follow(B)), writer || counter ? quiet : quiet * 4);
  }

  function repair(B) {
    if (heldIds().has(B.id) || holds(B.id) || dirty.has(B.id)) return;
    const raw = rawOf(store.authoritative, B.id);
    const S = agreedOf(B);
    if (same(raw, S)) return;
    stats.repairs++;
    if (!S) send(B, null);
    else if (B.text) { send(B, { ...S, w: { ...repairOf(B.r, me), e: epochNow() } }); B.r.counter = false; }
  }

  function follow(B) {
    if (heldIds().has(B.id) || holds(B.id)) return;
    const tomb = B.text ? B.r.tomb : B.tomb;
    if (tomb && rawOf(store.authoritative, B.id)) { stats.repairs++; send(B, null); return; }
    if (!B.text || !B.r.behind) return;
    stats.follows++;
    B.heal.join(rawOf(store.authoritative, B.id), B.r.seq, { tomb: tombOf(store.authoritative, B.id) });
    dirty.add(B.id);
    releaseAll();
  }

  // ---- pending and flush ---------------------------------------------------

  // Resolves { ok: true } once every write this tab has made landed and, with
  // requestCheckpoint, once the file holds it.
  function flush({ timeoutMs = 10_000 } = {}) {
    return new Promise((resolve) => {
      let timer = null;
      const check = () => {
        if (store.pending.length) return;
        waiters.delete(check);
        clearTimer(timer);
        resolve(requestCheckpoint ? requestCheckpoint({ timeoutMs }) : { ok: true });
      };
      timer = setTimer(() => { waiters.delete(check); resolve({ ok: false, code: "timeout" }); }, timeoutMs);
      waiters.add(check);
      check();
    });
  }
  const unsaved = registerUnsavedState({ id: "page:live", isPending: () => store.pending.length > 0, flush });
  const unsavedHeld = registerUnsavedState({ id: "page:held", isPending: () => composing !== null });

  return {
    plugin,
    stats,
    blocks,
    dispatch,
    flush,
    doc: () => docFromRecord(schema, store.value),
    attach(v) { view = v; },
    writerChanged() {
      queueMicrotask(() => {
        releaseAll();
        for (const B of blocks.values()) settle(B);
      });
    },
    // Every notice, as data: the replays' (inexact, merge, removed, repair,
    // heal, joined, replaced) and this binding's (removed, refused).
    // A block's writes under its tombstone come as one notice per author: its
    // latest write, which holds the text of the ones before.
    notices() {
      const out = [];
      for (const B of blocks.values()) {
        if (!B.r) continue;
        const last = new Map();
        for (const n of B.r.conflicts) if (n.kind === "removed") last.set(n.by, n);
        for (const n of B.r.conflicts) if (n.kind !== "removed" || last.get(n.by) === n) out.push({ ...n, id: B.id });
      }
      return [...out, ...own];
    },
    dispose() {
      clearTimer(compositionTimer);
      compositionTimer = null;
      composing = null;
      unsaved.dispose();
      unsavedHeld.dispose();
      for (const B of blocks.values()) { clearTimer(B.timer); B.heal?.dispose(); }
      view = null;
    },
  };
}
