// clay.live's local tab lane: on a host without live-data, tabs of one document
// in one browser share live stores at full speed. One tab, the sequencer (held
// with a Web Lock), runs the room; the others reach it over a BroadcastChannel.
// The transport interface is fast-lane.js's; the frames are the server lane's.
//
// Every tab keeps a mirror of what it needs to become the sequencer: the epochs
// this browser's room has had, the senders' receipts, and per store the moves
// applied since the last position known to be in the file. So a hand-off keeps
// every receipt (a resend is a duplicate), and a file frame merges like an
// outside save on the host: the room's own unedited checkpoint (its live-at
// stamp names one of this browser's epochs and the hash matches) only records
// how far the file reaches; anything else becomes the value with the room's
// later moves replayed on top, in the same epoch.

import { applyOps, applyOp, checkOp, cloneJson, validateOp, serializeLive, textHash } from "./ops.js";
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";

const VERSION = 2;
export const REQUEST_MS = 2000;
export const LOG_ENTRIES = 1024;

export function localLaneSupported() {
  return typeof BroadcastChannel === "function" && typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * @param {object} options
 * @param {() => Map<string, {value: any, ephemeral: boolean, text?: string}>} options.seed -
 *   what this tab holds for each live tag, used when it becomes the sequencer
 * @param {string} [options.key]
 */
export function localTransport({ seed, key = "clay-live:" + window.location.pathname }) {
  const clientId = randomId();
  let channel = null;
  let handlers = null;
  let room = null;
  let stopped = false;
  let releaseLock = null;
  let epoch = null;
  let rid = 0;
  const waiting = new Map();

  // The mirror. history: this browser's room epochs, oldest first. seen:
  // "name\nclientId" -> the newest n applied. stores: name -> { log, landed,
  // text }, log being [{ epoch, seq, ops }] after landed ({ epoch, seq } or
  // null), text the store's tag text in the last file this browser saw.
  let history = [];
  let seen = new Map();
  let stores = new Map();

  function post(message) {
    channel?.postMessage({ v: VERSION, ...message });
  }

  function mirrorOf(name) {
    let m = stores.get(name);
    if (!m) stores.set(name, (m = { log: [], landed: null, text: null }));
    return m;
  }

  function noteEpoch(e) {
    if (typeof e === "string" && !history.includes(e)) history.push(e);
  }

  // Is position pos past base, in this browser's epoch order?
  function after(pos, base) {
    if (!base) return true;
    if (pos.epoch === base.epoch) return pos.seq > base.seq;
    const a = history.indexOf(pos.epoch);
    const b = history.indexOf(base.epoch);
    return b < 0 ? true : a > b;
  }

  function landedAt(m, pos) {
    m.landed = { epoch: pos.epoch, seq: pos.seq };
    m.log = m.log.filter((entry) => after(entry, pos));
  }

  // A data frame went by (sent by the sequencer, or applied by this tab as it).
  function record(data) {
    if (!data || typeof data.name !== "string") return;
    noteEpoch(data.epoch);
    const nKey = data.name + "\n" + data.from;
    if ((seen.get(nKey) ?? 0) < data.n) seen.set(nKey, data.n);
    const m = mirrorOf(data.name);
    m.log.push({ epoch: data.epoch, seq: data.seq, ops: data.ops });
    if (m.log.length > LOG_ENTRIES) m.log.shift();
  }

  function mirrorState() {
    const out = {};
    for (const [name, m] of stores) out[name] = { log: m.log, landed: m.landed, text: m.text };
    return { history, seen: [...seen], stores: out };
  }

  function installMirror(mirror) {
    if (!mirror || !Array.isArray(mirror.history)) return;
    history = [...mirror.history];
    seen = new Map(mirror.seen);
    stores = new Map(Object.entries(mirror.stores || {}).map(([name, m]) => [name, { log: m.log || [], landed: m.landed || null, text: m.text ?? null }]));
  }

  function receiptsFor(name) {
    const out = {};
    for (const [nKey, n] of seen) {
      const cut = nKey.indexOf("\n");
      if (nKey.slice(0, cut) === name) out[nKey.slice(cut + 1)] = n;
    }
    return out;
  }

  function roomState() {
    const out = {};
    for (const [name, store] of room.stores) out[name] = { value: cloneJson(store.value), ephemeral: store.ephemeral, seen: receiptsFor(name) };
    return { epoch: room.epoch, seq: room.seq, writer: clientId, stores: out, mirror: mirrorState() };
  }

  function announce() {
    const state = roomState();
    epoch = state.epoch;
    post({ type: "data-state", state });
    handlers.state(state);
  }

  // A new room, from this tab's values and its mirror's receipts: a sender's
  // resend of a move this tab already applied is answered as a duplicate.
  function startRoom(values) {
    const roomStores = new Map();
    for (const [name, held] of values) {
      roomStores.set(name, { value: cloneJson(held.value), ephemeral: held.ephemeral });
      const m = mirrorOf(name);
      if (m.text === null && typeof held.text === "string") m.text = held.text;
    }
    const lastN = new Map();
    for (const [nKey, n] of seen) lastN.set(nKey, { n, seq: 0 });
    room = { epoch: randomId(), seq: 0, stores: roomStores, lastN };
    noteEpoch(room.epoch);
    announce();
  }

  function roomApply(from, frame) {
    if (!frame || typeof frame.name !== "string" || !Number.isInteger(frame.n) || frame.n < 1 || !Array.isArray(frame.ops) || !frame.ops.length) {
      return { status: 400, body: { error: "bad-frame" }, retryAfter: 0 };
    }
    const store = room.stores.get(frame.name);
    if (!store) return { status: 404, body: { error: "unknown-store" }, retryAfter: 0 };
    const nKey = frame.name + "\n" + from;
    const last = room.lastN.get(nKey);
    if (last && frame.n <= last.n) {
      return { status: 200, body: { duplicate: true, seq: last.seq, epoch: room.epoch }, retryAfter: 0 };
    }
    let ops;
    let next;
    try {
      ops = frame.ops.map(validateOp);
      next = applyOps(cloneJson(store.value), ops);
    } catch (err) {
      return { status: 422, body: { error: err.message }, retryAfter: 0 };
    }
    store.value = next;
    room.lastN.set(nKey, { n: frame.n, seq: room.seq + 1 });
    room.seq += 1;
    const data = { epoch: room.epoch, seq: room.seq, name: frame.name, ops, from, n: frame.n };
    record(data);
    post({ type: "data", data });
    handlers.frame(cloneJson(data));
    return { status: 200, body: { seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
  }

  // A file frame (another device's save, or this browser's own checkpoint
  // coming back), per saved store: { text, at }. Every tab moves its mirror; the
  // sequencer also merges outside edits into the room. Text unchanged since the
  // last file holds nothing new for that store.
  function onFileFrame(frames) {
    let changed = false;
    for (const [name, { text, at }] of frames) {
      const m = mirrorOf(name);
      const ours = at && history.includes(at.epoch) ? at : null;
      if (ours && ours.hash === textHash(text)) {
        if (after(ours, m.landed)) landedAt(m, ours);
        m.text = text;
        continue;
      }
      if (text === m.text) continue;
      m.text = text;
      if (ours) landedAt(m, ours);
      const store = room?.stores.get(name);
      if (!store || store.ephemeral) continue;
      let value;
      try {
        value = HyperMorph.parseJsonRelaxed(text);
      } catch {
        continue;
      }
      if (value === null || typeof value !== "object" || Array.isArray(value) !== Array.isArray(store.value)) continue;
      for (const entry of m.log) {
        for (const op of entry.ops) {
          try {
            checkOp(value, op);
            value = applyOp(value, op);
          } catch {}
        }
      }
      if (serializeLive(value) === serializeLive(store.value)) continue;
      store.value = value;
      changed = true;
    }
    if (!changed) return;
    room.seq += 1;
    announce();
  }

  function request(message) {
    return new Promise((resolve) => {
      const id = ++rid;
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve(null);
      }, REQUEST_MS);
      waiting.set(id, (result) => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(result);
      });
      post({ ...message, from: clientId, rid: id });
    });
  }

  function onMessage({ data: m }) {
    if (stopped || !m || m.v !== VERSION) return;
    if (m.type === "data") {
      record(m.data);
      handlers.frame(m.data);
    } else if (m.type === "data-state") {
      if (typeof m.state?.epoch === "string") epoch = m.state.epoch;
      installMirror(m.state?.mirror);
      handlers.state(m.state);
    } else if (m.type === "landed") {
      if (m.at && typeof m.name === "string") {
        noteEpoch(m.at.epoch);
        const mirror = mirrorOf(m.name);
        if (after(m.at, mirror.landed)) landedAt(mirror, m.at);
      }
    } else if (m.type === "answer") {
      if (m.to === clientId) waiting.get(m.rid)?.(m.result);
    } else if (room && m.type === "post") {
      const result = m.epoch === room.epoch ? roomApply(m.from, m.frame) : { status: 200, body: { stale: true, epoch: room.epoch }, retryAfter: 0 };
      post({ type: "answer", to: m.from, rid: m.rid, result });
    } else if (room && m.type === "state-request") post({ type: "answer", to: m.from, rid: m.rid, result: roomState() });
  }

  return {
    clientId,
    start(next) {
      handlers = next;
      channel = new BroadcastChannel(key);
      channel.onmessage = onMessage;
      navigator.locks
        .request(key, () => {
          if (stopped) return undefined;
          startRoom(seed());
          return new Promise((resolve) => {
            releaseLock = resolve;
          });
        })
        .catch(() => {});
      handlers.open({ clientId, lane: "live" });
      return () => {
        stopped = true;
        room = null;
        releaseLock?.();
        for (const resolve of waiting.values()) resolve(null);
        channel?.close();
        channel = null;
      };
    },
    async send(_clientId, frame) {
      if (room) return roomApply(clientId, frame);
      return (await request({ type: "post", frame, epoch })) || { status: 0, body: null, retryAfter: 0 };
    },
    async fetchState() {
      if (room) return roomState();
      const state = await request({ type: "state-request" });
      if (typeof state?.epoch === "string") epoch = state.epoch;
      installMirror(state?.mirror);
      return state;
    },
    // A file frame arrived: Map<name, { text, at }>, at being the tag's parsed
    // live-at stamp or null.
    fileFrame(frames) {
      if (!stopped) onFileFrame(frames);
    },
    // This tab's save holding store name at position at ({ epoch, seq }) was
    // accepted. Its own save never comes back as a frame, so every tab is told.
    landed(name, at) {
      if (stopped || !at) return;
      const m = mirrorOf(name);
      if (after(at, m.landed)) landedAt(m, at);
      post({ type: "landed", name, at: { epoch: at.epoch, seq: at.seq } });
    },
    get isSequencer() {
      return room !== null;
    },
  };
}
