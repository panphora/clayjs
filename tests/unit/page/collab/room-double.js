// A room double with the hyperclay server's rules, on a simulated clock.
// Rules cited: hyperclay/server-lib/live-data-rooms.js (apply, limits, writer,
// checkpoint), live-data-actions.js (rate bucket, error status), hey.js:1681
// (64 KB body). Delivery: each client's stream is FIFO with its own latency;
// a POST answer has an independent latency, so it can beat or trail the event.
import { applyOp, applyTracked, checkOp, cloneJson, diffOps, serializeLive, sizeChange, undoTracked, validateOp } from "../../../../src/live/ops.js";

export const LIMITS = { opsPerFrame: 128, storeBytes: 1024 * 1024, roomBytes: 2 * 1024 * 1024, logEntries: 4096, logBytes: 256 * 1024, bodyBytes: 64 * 1024 };
export const RATE = { perSecond: 25, burst: 40 };
const encoder = new TextEncoder();
const utf8 = (text) => encoder.encode(text).length;
const bytes = (v) => utf8(serializeLive(v));

export class Sim {
  constructor(seed = 1) {
    this.t = 0;
    this.q = [];
    this.n = 0;
    let s = seed >>> 0;
    this.rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.now = () => this.t;
    this.setTimer = (fn, ms) => {
      const h = { dead: false };
      this.after(Math.max(0, ms || 0), () => { if (!h.dead) fn(); });
      return h;
    };
    this.clearTimer = (h) => { if (h) h.dead = true; };
  }
  at(t, fn) {
    const e = { t, n: this.n++, fn };
    let lo = 0, hi = this.q.length;
    while (lo < hi) { const m = (lo + hi) >> 1; const x = this.q[m]; if (x.t < t || (x.t === t && x.n < e.n)) lo = m + 1; else hi = m; }
    this.q.splice(lo, 0, e);
  }
  after(ms, fn) { this.at(this.t + ms, fn); }
  async run(until = Infinity) {
    while (this.q.length && this.q[0].t <= until) {
      const e = this.q.shift();
      this.t = e.t;
      e.fn();
      for (let i = 0; i < 4; i++) await Promise.resolve();
    }
    if (until !== Infinity) this.t = Math.max(this.t, until);
  }
  async idle(quiet = 3000) {
    // run until nothing but far-future timers remain for `quiet` ms
    let last = -1;
    while (this.q.length) {
      await this.run(this.t + quiet);
      if (this.q.length && this.q[0].t > this.t + quiet) break;
      if (this.t === last) break;
      last = this.t;
    }
  }
}

export function createRoom(sim, initialStores, { latency = () => 40, answerLatency = () => 40, refuse = () => null } = {}) {
  const room = {
    epoch: "e1", seq: 0, writer: null, lastN: new Map(), buckets: new Map(), clients: new Map(),
    stores: new Map(), frames: 0, refused: [], posts: 0,
  };
  for (const [name, value] of Object.entries(initialStores)) room.stores.set(name, { value: cloneJson(value), bytes: bytes(value), last: 0, landed: 0, floor: 0, log: [], logBytes: 0 });
  room.lastSentAt = new Map();
  // live-data-rooms.js leave(): the writer leaving elects the connected
  // participant that sent most recently; live-data-actions.js sends data-writer.
  function setWriter(id) {
    room.writer = id;
    for (const cid of room.clients.keys()) deliver(cid, "writer", { epoch: room.epoch, writer: id });
  }
  const roomBytes = () => [...room.stores.values()].reduce((n, s) => n + s.bytes, 0);

  function take(person) {
    const t = sim.now();
    let b = room.buckets.get(person);
    if (!b) room.buckets.set(person, (b = { tokens: RATE.burst, at: t }));
    b.tokens = Math.min(RATE.burst, b.tokens + ((t - b.at) / 1000) * RATE.perSecond);
    b.at = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  function deliver(clientId, type, data) {
    const c = room.clients.get(clientId);
    if (!c || !c.connected) return;
    const at = Math.max(c.streamAt, sim.now() + latency(clientId));
    c.streamAt = at;
    const conn = c.connection;
    const copy = cloneJson(data);
    sim.at(at, () => { if (c.connected && c.connection === conn) c.handlers[type](copy); });
  }

  // live-data-rooms.js:123-134: a save is asked for once the log past the last
  // checkpoint is more than half the caps.
  function pressed(store) {
    let count = 0, size = 0;
    for (const entry of store.log) {
      if (store.landed !== -1 && entry.seq <= store.landed) continue;
      count += 1;
      size += entry.bytes;
    }
    return size > LIMITS.logBytes / 2 || count > LIMITS.logEntries / 2;
  }

  function apply(clientId, frame) {
    room.posts++;
    const extra = refuse(clientId, frame, room);
    if (extra) return extra;
    // The host's body parser answers before the room sees the frame: no code,
    // unlike the room's own size refusal below.
    if (utf8(JSON.stringify(frame)) > LIMITS.bodyBytes) return { status: 413, body: { error: "request entity too large" } };
    const person = room.clients.get(clientId)?.person ?? clientId;
    if (!take(person)) { room.limited = (room.limited || 0) + 1; return { status: 429, body: { code: "rate-limited" }, retryAfter: 1 }; }
    if (frame.epoch !== undefined && frame.epoch !== room.epoch) return { status: 200, body: { stale: true, epoch: room.epoch } };
    const store = room.stores.get(frame.name);
    if (!store) return { status: 404, body: { code: "unknown-store" } };
    if (!Number.isInteger(frame.n) || frame.n < 1 || !Array.isArray(frame.ops) || !frame.ops.length || frame.ops.length > LIMITS.opsPerFrame) return { status: 400, body: { code: "bad-frame" } };
    const nKey = frame.name + "\n" + clientId;
    const last = room.lastN.get(nKey);
    if (last && frame.n <= last.n) return { status: 200, body: { duplicate: true, seq: last.seq, epoch: room.epoch } };
    // In place, as live-data-rooms.js apply does: sized slot by slot, taken back when refused.
    let ops;
    let value = store.value;
    let b = store.bytes;
    const done = [];
    const undo = () => { for (let i = done.length - 1; i >= 0; i--) undoTracked(done[i]); };
    try {
      ops = frame.ops.map(validateOp);
      for (const op of ops) {
        const rec = applyTracked(value, op);
        if (!rec) continue;
        done.push(rec);
        b += sizeChange(rec, bytes, b);
        value = rec.root;
      }
    } catch (err) {
      undo();
      return { status: 422, body: { code: "bad-op", error: err.message } };
    }
    if (b > LIMITS.storeBytes || roomBytes() - store.bytes + b > LIMITS.roomBytes) {
      undo();
      return { status: 413, body: { code: "too-large" } };
    }
    store.value = value;
    store.bytes = b;
    room.seq += 1;
    store.last = room.seq;
    const logged = utf8(JSON.stringify(ops));
    store.log.push({ seq: room.seq, ops, bytes: logged, from: clientId, n: frame.n });
    store.logBytes += logged;
    while (store.log.length > LIMITS.logEntries || store.logBytes > LIMITS.logBytes) {
      const gone = store.log.shift();
      store.logBytes -= gone.bytes;
      store.floor = gone.seq;
    }
    room.lastN.set(nKey, { n: frame.n, seq: room.seq });
    room.lastSentAt.set(clientId, sim.now());
    if (!room.writer) setWriter(clientId);
    room.frames++;
    const data = { epoch: room.epoch, seq: room.seq, name: frame.name, ops, from: clientId, n: frame.n, writer: room.writer, checkpoint: pressed(store) };
    for (const id of room.clients.keys()) deliver(id, "frame", data);
    return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
  }

  // A save of the file landed (live-data-rooms.js fileWritten): the file's
  // value with the room's moves after its stamp replayed on top, less the
  // saving tab's own frames through live-by's n, which the value holds. A
  // changed value is logged as a diff and every tab gets the room's state
  // (live-data-registry.js data-state); otherwise how far the file reaches
  // goes out on a writer event. at: { epoch, seq } or null; by: { client, n } or null.
  room.fileWritten = (name, fileValue, at = null, by = null) => {
    const store = room.stores.get(name);
    if (!store) return null;
    const base = at && at.epoch === room.epoch && at.seq <= room.seq ? at.seq : store.landed;
    const skip = by && at && at.epoch === room.epoch ? by : null;
    let value = cloneJson(fileValue);
    const entries = store.log.filter((e) => e.seq > base && !(skip && e.from === skip.client && e.n <= skip.n));
    for (const e of entries) for (const op of e.ops) { try { checkOp(value, op); value = applyOp(value, op); } catch {} }
    const changed = serializeLive(value) !== serializeLive(store.value);
    if (changed) {
      const ops = diffOps(store.value, value);
      store.value = value;
      store.bytes = bytes(value);
      room.seq += 1;
      store.last = room.seq;
      const logged = utf8(JSON.stringify(ops));
      store.log.push({ seq: room.seq, ops, bytes: logged, ...(skip && { from: skip.client, n: skip.n }) });
      store.logBytes += logged;
    }
    store.landed = entries.length ? base : store.last;
    room.merges = (room.merges || 0) + 1;
    if (changed) for (const cid of room.clients.keys()) deliver(cid, "state", room.state(cid));
    else for (const cid of room.clients.keys()) deliver(cid, "writer", { epoch: room.epoch, writer: room.writer, landed: { [name]: store.landed } });
    return { changed, value: cloneJson(store.value) };
  };

  // The harness marks a landed checkpoint save so `pressed` counts from there.
  room.land = (name, seq) => {
    const store = room.stores.get(name);
    if (!store) return null;
    store.landed = seq;
    return store;
  };

  // The room's moves after `seq` for one store, when its log still reaches
  // back that far. A store's log can start above seq + 1 without a gap (the
  // seqs between went to other stores); only `floor` says entries were evicted.
  room.logSince = (name, seq) => {
    const store = room.stores.get(name);
    if (!store) return null;
    if (seq >= store.last) return [];
    if (seq < store.floor) return null;
    return store.log.filter((e) => e.seq > seq).map((e) => ({ seq: e.seq, ops: cloneJson(e.ops) }));
  };
  room.state = (clientId, since) => {
    const state = {
      epoch: room.epoch, seq: room.seq, writer: room.writer,
      stores: Object.fromEntries([...room.stores].map(([name, s]) => [name, {
        value: cloneJson(s.value), ephemeral: false, last: s.last, landed: s.landed, floor: s.floor,
        seen: { [clientId]: room.lastN.get(name + "\n" + clientId)?.n ?? 0 },
      }])),
    };
    if (typeof since === "number") state.moves = Object.fromEntries([...room.stores.keys()].map((name) => [name, room.logSince(name, since)]));
    return state;
  };

  room.transport = (clientId, { person = clientId, onFrame } = {}) => ({
    start(handlers) {
      const wrapped = { ...handlers, frame: (d) => { onFrame?.(d); handlers.frame(d); } };
      room.clients.set(clientId, { handlers: wrapped, connected: false, streamAt: 0, connection: 0, person });
      return () => room.clients.delete(clientId);
    },
    send: (id, frame) => new Promise((resolve) => {
      const c = room.clients.get(id);
      const conn = c?.connection;
      // the request reaches the room after half the answer latency
      const lat = answerLatency(id);
      sim.after(lat / 2, () => {
        if (!c || !c.connected || c.connection !== conn) { sim.after(lat / 2, () => resolve({ status: 0, body: null, retryAfter: 0 })); return; }
        const result = apply(id, frame);
        if (result.status >= 400 && result.status !== 429) room.refused.push({ id, code: result.body?.code, status: result.status });
        sim.after(lat / 2, () => resolve({ retryAfter: 0, ...result }));
      });
    }),
    // live-data-rooms.js state(): a tab's own read (since its { epoch, seq },
    // or null for a first read) carries the moves after its seq in its own
    // epoch, else this epoch's from 0. A number is a seq of this epoch.
    fetchState: (id, since) => new Promise((resolve) => {
      const lat = answerLatency(id);
      sim.after(lat, () => {
        const from = typeof since === "number" ? since : since && since.epoch === room.epoch && Number.isInteger(since.seq) ? since.seq : 0;
        resolve(room.state(id, from));
      });
    }),
  });

  room.open = (clientId) => {
    const c = room.clients.get(clientId);
    c.connected = true;
    c.connection++;
    c.streamAt = sim.now();
    c.handlers.open({ clientId, lane: "live" });
  };
  room.close = (clientId) => {
    const c = room.clients.get(clientId);
    c.connected = false;
    c.connection++;
    c.handlers.close();
    if (room.writer === clientId) {
      let best = null, bestAt = -1;
      for (const [id, other] of room.clients) if (other.connected && (room.lastSentAt.get(id) ?? 0) > bestAt) { best = id; bestAt = room.lastSentAt.get(id) ?? 0; }
      setWriter(best);
    }
  };
  // Server restart: a new epoch seeded from the last checkpoint (the file).
  room.restart = (fileStores) => {
    room.epoch = "e" + (Number(room.epoch.slice(1)) + 1);
    room.seq = 0;
    room.writer = null;
    room.lastSentAt = new Map();
    room.lastN = new Map();
    room.stores = new Map();
    for (const [name, value] of Object.entries(fileStores)) room.stores.set(name, { value: cloneJson(value), bytes: bytes(value), last: 0, landed: 0, floor: 0, log: [], logBytes: 0 });
    for (const id of room.clients.keys()) { const c = room.clients.get(id); if (c.connected) { room.close(id); sim.after(200, () => room.open(id)); } }
  };
  return room;
}
