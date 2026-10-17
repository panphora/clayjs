// A simulated page tab with one text block, "p", on the real clay.live store
// and fast lane, with the hybrid replay (src/page/replay.js) as its merge. The
// editor is a string plus one mark key per UTF-16 unit. It stands in for the
// page binding in the S1 rows and fuzz, and it is the reference for the
// binding's local and remote sides.
//
// The shard's value is { blocks: { p }, deleted: { p: true }? }. A delete sets
// the tombstone in the same frame, so a stale write never brings the block back.
import { createStore } from "../../../../../src/live/store.js";
import { createFastLane } from "../../../../../src/live/fast-lane.js";
import { createReplay, mapCaret, hashOf, spliceFor, withMarks, regions, strip, healChain, repairOf } from "../../../../../src/page/replay.js";
import { createHealCheck } from "../../../../../src/page/heal-check.js";

const ID = "p";
const rawOf = (v) => (v && v.blocks && v.blocks[ID]) || null;
const tombOf = (v) => !!(v && v.deleted && v.deleted[ID]);
const same = (a, b) => (a === null || b === null ? a === b : hashOf(a) === hashOf(b));
const put = (arr, from, to, items) => [...arr.slice(0, from), ...items, ...arr.slice(to)];

// The block ops of one room entry: [{ X, tombstone }], in order.
function blockOps(ops) {
  const out = [];
  for (const op of ops) {
    if (op.path.length === 1 && op.path[0] === "deleted" && op.op === "set" && op.value && op.value[ID]) out.push({ tombstone: true });
    if (op.path.length !== 2 || op.path[1] !== ID) continue;
    if (op.path[0] === "deleted" && op.op === "set" && op.value) out.push({ tombstone: true });
    if (op.path[0] === "blocks") out.push({ X: op.op === "set" ? op.value : null });
  }
  return out;
}

export function makeTab(sim, room, id, initial, opts = {}) {
  const quiet = opts.quiet ?? 500;
  const store = createStore({ name: "page", value: initial });
  const entries = new Map([["page", { store }]]);
  const transport = room.transport(id, { person: opts.person ?? id });
  const seed = rawOf(initial);
  const r = createReplay(seed, { me: id });
  r.tomb = tombOf(initial);
  const tab = {
    id, store, r, view: seed ? seed.c : null, marks: seed ? (seed.m ? [...seed.m] : new Array(seed.c.length).fill("")) : null,
    caret: 0, k: 0, composing: false, edited: false, notices: [], repairs: 0, follows: 0, heals: 0, writes: 0, bytes: [],
  };
  let fields = seed ? (({ c, m, w, ...rest }) => rest)(seed) : { t: "p" };
  let timer = null;
  let refused = false;
  // This tab's writes not yet seen in the stream: { id (store op id), json, value, seq (when landed) }.
  let unechoed = [];
  // After a room loss, once the heals have settled: what this tab typed and the
  // agreed text lacks goes in a heal notice, for Restore (heal-check.js).
  const heal = createHealCheck({
    r, me: id, quiet, setTimer: sim.setTimer, clearTimer: sim.clearTimer,
    ready: () => !(store.pending.length || unechoed.length || tab.composing || tab.view !== (r.S ? r.S.c : null)),
    notice: (lost) => tab.notices.push({ kind: "heal", lost, by: id }),
  });
  tab.heal = heal;

  // Proposed server rule: `since` answers the room's moves after that seq in the
  // same epoch; for another epoch it answers the moves since the epoch began.
  const wrapped = {
    ...transport,
    fetchState: async (cid) => {
      const known = r.epoch;
      const state = await transport.fetchState(cid, r.seq);
      if (state && typeof state.epoch === "string" && state.epoch !== known) return room.state(cid, 0);
      return state;
    },
  };
  const lane = createFastLane({ transport: wrapped, entries, now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer, onWriter: () => queueMicrotask(release) });
  store.onLocal((ops) => lane.local("page", ops, store.mark));
  tab.lane = lane;

  store.onDelivery((ev) => {
    if (ev.phase === "landed" && Number.isInteger(ev.seq)) for (const u of unechoed) if (u.seq === null && u.id <= ev.through) u.seq = ev.seq;
    if (ev.phase === "refused" || ev.phase === "undone") refused = true;
  });

  function echoed(X) {
    const json = JSON.stringify(X);
    const i = unechoed.findIndex((u) => u.json === json);
    if (i >= 0) unechoed.splice(0, i + 1);
  }
  function replay(ops, seq) {
    for (const op of blockOps(ops)) {
      if (op.tombstone) { heal.tombstone(seq); continue; }
      if (op.X && op.X.w && op.X.w.a === id) echoed(op.X);
      heal.step(op.X, seq);
    }
  }

  store.onRebase(({ frame, room: rs, next }) => {
    if (frame) replay(frame.ops, frame.seq);
    else if (rs && rs.fresh) onEpoch(rs, next);
    else if (rs && Array.isArray(rs.moves)) { for (const mv of rs.moves) if (mv.seq > r.seq) replay(mv.ops, mv.seq); }
    else if (rs && (rs.seq !== r.seq || !same(rawOf(next), r.S))) heal.join(rawOf(next), rs.seq, { tomb: tombOf(next) });
    if (rs) r.seq = Math.max(r.seq, rs.seq);
    queueMicrotask(release);
  });

  // A room's state for an epoch this tab was not in: its first join, or a room
  // restarted from the file after a loss. On a restart, this tab heals: its
  // agreed value from the lost room plus every write of its own the stream never
  // brought back goes to the new room as one heal. That covers the writes that
  // landed and were dropped from pending, and the pending ones the lane sends
  // again, which every replay ignores in the new epoch.
  function onEpoch(rs, next) {
    const epoch = lane.status.epoch;
    const moves = (rs.moves ?? []).flatMap((mv) => blockOps(mv.ops).map((op) => ({ seq: mv.seq, ...op })));
    if (r.epoch === null) {
      r.epoch = epoch;
      if (rs.moves) for (const mv of moves) mv.tombstone ? heal.tombstone(mv.seq) : heal.step(mv.X, mv.seq);
      else heal.join(rawOf(next), rs.seq, { tomb: tombOf(next) });
      return;
    }
    const pending = new Set(store.pendingEntries().map((e) => e.id));
    const lost = unechoed;
    unechoed = unechoed.filter((u) => pending.has(u.id));
    const oldSeq = r.seq;
    const base = r.S, baseMarks = r.marks;
    const chain = [], u = [];
    for (const x of lost) {
      if (!x.value || !x.value.w || x.value.w.g !== undefined) continue;
      heal.step(x.value, r.seq);
      for (const sp of r.log[r.log.length - 1].applied) { chain.push(sp.slice(0, 3).concat([sp[3]], sp[4] && sp[4].some(Boolean) ? [sp[4]] : [])); u.push(x.seq); }
    }
    const healed = r.S, healIds = heal.agreedIds();
    heal.arm();
    heal.join(rawOf(next), rs.seq, { epoch, moves: rs.moves ? moves : null, since: 0, tomb: tombOf(next) && !moves.some((mv) => mv.tombstone) });
    tab.k = null;
    if (healed && !r.tomb && !same(healed, r.S)) {
      tab.heals++;
      const value = { ...strip(healed), w: { a: id, e: epoch, h: oldSeq, ...healChain(base, baseMarks, healed, chain, u) } };
      queueMicrotask(() => send(value, healIds));
    }
  }

  function send(value, ids) {
    heal.wrote(value, ids);
    tab.writes++;
    tab.bytes.push(JSON.stringify(value).length);
    store.handle.set(["blocks", ID], value);
    unechoed.push({ id: store.mark, json: JSON.stringify(value), value, seq: null });
  }
  function write(splices) {
    sim.clearTimer(timer);
    send({ ...withMarks(fields, tab.view, tab.marks), w: { a: id, e: r.epoch, k: tab.k, s: splices } });
  }

  // The editor shows S once this tab has nothing in flight and is not composing.
  function release() {
    if (tab.composing || store.pending.length) return;
    const S = r.S;
    if (!S) {
      if (tab.view !== null) {
        if (tab.edited && tab.view.trim() && tab.view !== tab.removedFrom) tab.notices.push({ kind: "removed", lost: tab.view });
        tab.view = null;
        tab.marks = null;
      }
    } else {
      if (refused && tab.view !== null) {
        for (const g of regions(tab.view, S.c)) if (g.to > g.from && tab.view.slice(g.from, g.to).trim()) tab.notices.push({ kind: "refused", lost: tab.view.slice(g.from, g.to) });
      }
      if (tab.view !== S.c || JSON.stringify(tab.marks) !== JSON.stringify(r.marks)) {
        tab.caret = tab.view === null ? S.c.length : mapCaret(r, id, tab.k, tab.caret, tab.view);
        tab.view = S.c;
        tab.marks = r.marks.slice();
      }
      heal.released(tab.view);
      fields = (({ c, m, w, ...rest }) => rest)(S);
    }
    refused = false;
    tab.k = r.seq;
    settle();
  }

  // The writer repairs the room's value after a short quiet spell. A tab that
  // refused a repair it could not place follows the room after a long one, and
  // so does one that sees a block under its tombstone: every tab agrees it is
  // gone, so any tab may delete it again (the room's writer may not run this
  // binding, and a del of a missing block is a no-op).
  function settle() {
    sim.clearTimer(timer);
    timer = null;
    const raw = rawOf(store.authoritative);
    if (same(raw, r.S)) { r.behind = false; r.counter = false; return; }
    const writer = lane.isWriter();
    if (!writer && !r.behind && !r.tomb && !r.counter) return;
    timer = sim.setTimer(writer || r.counter ? repair : follow, writer || r.counter ? quiet : quiet * 4);
  }
  function repair() {
    if (!lane.isWriter() && !r.counter) return follow();
    if (store.pending.length || tab.composing || tab.view !== (r.S ? r.S.c : null)) return;
    if (same(rawOf(store.authoritative), r.S)) return;
    tab.repairs++;
    if (!r.S) store.handle.delete(["blocks", ID]);
    else { send({ ...r.S, w: repairOf(r, id) }, heal.agreedIds()); r.counter = false; }
  }
  function follow() {
    if (lane.isWriter() || r.counter) return repair();
    if (store.pending.length || tab.composing) return;
    if (r.tomb && rawOf(store.authoritative)) { tab.repairs++; store.handle.delete(["blocks", ID]); return; }
    if (!r.behind) return;
    tab.follows++;
    heal.join(rawOf(store.authoritative), r.seq, { tomb: tombOf(store.authoritative) });
    release();
  }

  tab.replace = (from, to, text, key = "") => {
    if (tab.view === null) return;
    tab.edited = true;
    const s = spliceFor(tab.view, tab.marks, from, to);
    heal.edit(from, to, text);
    tab.view = tab.view.slice(0, from) + text + tab.view.slice(to);
    tab.marks = put(tab.marks, from, to, new Array(text.length).fill(key));
    tab.caret = from + text.length;
    write([s]);
  };
  tab.type = (text, key = "") => tab.replace(tab.caret, tab.caret, text, key);
  tab.format = (from, to, key) => {
    if (tab.view === null) return;
    tab.edited = true;
    const s = spliceFor(tab.view, tab.marks, from, to);
    tab.marks = put(tab.marks, from, to, new Array(to - from).fill(key));
    write([s]);
  };
  tab.remove = () => {
    if (tab.view === null) return;
    tab.removedFrom = tab.view;
    tab.view = null;
    tab.marks = null;
    sim.clearTimer(timer);
    store.handle.update((d) => {
      delete d.blocks[ID];
      if (d.deleted) d.deleted[ID] = true;
      else d.deleted = { [ID]: true };
    });
  };
  tab.compose = (on) => { tab.composing = on; if (!on) queueMicrotask(release); };
  tab.start = () => { lane.start(); room.open(id); };
  tab.allNotices = () => [...r.conflicts, ...tab.notices];
  return tab;
}

export const engine = { name: "text", makeTab, initial: (c) => ({ blocks: { p: { t: "p", c } }, deleted: {} }), adapt: (value) => value, check: () => [] };
