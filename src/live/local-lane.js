// clay.live's local tab lane: on a host without live-data, tabs of one document
// in one browser share live stores at full speed. One tab, the sequencer (held
// with a Web Lock), runs the room; the others reach it over a BroadcastChannel.
// The transport interface is fast-lane.js's; the frames are the server lane's.

import { applyOps, cloneJson, validateOp } from "./ops.js";
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";

const VERSION = 1;
export const REQUEST_MS = 2000;
const CAPTURES_KEPT = 64;

export function localLaneSupported() {
  return typeof BroadcastChannel === "function" && typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * @param {object} options
 * @param {() => Map<string, {value: any, ephemeral: boolean, text: string}>} options.seed -
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

  function post(message) {
    channel?.postMessage({ v: VERSION, ...message });
  }

  function roomState() {
    const stores = {};
    for (const [name, store] of room.stores) stores[name] = { value: cloneJson(store.value), ephemeral: store.ephemeral };
    return { epoch: room.epoch, seq: room.seq, writer: clientId, stores };
  }

  function startRoom(values) {
    const stores = new Map();
    for (const [name, held] of values) {
      stores.set(name, { value: cloneJson(held.value), ephemeral: held.ephemeral, seen: held.text, captured: new Set() });
    }
    room = { epoch: randomId(), seq: 0, stores, lastN: new Map() };
    const state = roomState();
    epoch = state.epoch;
    post({ type: "data-state", state });
    handlers.state(state);
  }

  function roomApply(from, frame) {
    if (!frame || typeof frame.name !== "string" || !Number.isInteger(frame.n) || frame.n < 1 || !Array.isArray(frame.ops) || !frame.ops.length) {
      return { status: 400, body: { error: "bad-frame" }, retryAfter: 0 };
    }
    const store = room.stores.get(frame.name);
    if (!store) return { status: 404, body: { error: "unknown-store" }, retryAfter: 0 };
    const nKey = frame.name + "\n" + from;
    if (frame.n <= (room.lastN.get(nKey) || 0)) {
      return { status: 200, body: { duplicate: true, seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
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
    room.lastN.set(nKey, frame.n);
    room.seq += 1;
    const data = { epoch: room.epoch, seq: room.seq, name: frame.name, ops, from, n: frame.n };
    post({ type: "data", data });
    handlers.frame(cloneJson(data));
    return { status: 200, body: { seq: room.seq, epoch: room.epoch }, retryAfter: 0 };
  }

  function remember(name, text) {
    const store = room?.stores.get(name);
    if (!store) return;
    store.captured.delete(text);
    store.captured.add(text);
    if (store.captured.size > CAPTURES_KEPT) store.captured.delete(store.captured.values().next().value);
  }

  // The sequencer: a file frame whose live-tag text this browser never wrote is
  // an outside save, and the room starts over from the frame.
  function roomFileFrame(texts) {
    let outside = false;
    for (const [name, text] of texts) {
      const store = room.stores.get(name);
      if (!store || text === store.seen || store.captured.has(text)) continue;
      outside = true;
    }
    if (!outside) {
      for (const [name, text] of texts) {
        const store = room.stores.get(name);
        if (store) store.seen = text;
      }
      return;
    }
    const values = new Map();
    for (const [name, store] of room.stores) {
      const text = texts.get(name);
      let value = store.value;
      if (text !== undefined) {
        try {
          const parsed = HyperMorph.parseJsonRelaxed(text);
          if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed) === Array.isArray(store.value)) value = parsed;
        } catch {}
      }
      values.set(name, { value, ephemeral: store.ephemeral, text: text ?? store.seen });
    }
    startRoom(values);
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
    if (m.type === "data") handlers.frame(m.data);
    else if (m.type === "data-state") {
      if (typeof m.state?.epoch === "string") epoch = m.state.epoch;
      handlers.state(m.state);
    } else if (m.type === "answer") {
      if (m.to === clientId) waiting.get(m.rid)?.(m.result);
    } else if (room && m.type === "post") {
      const result = m.epoch === room.epoch ? roomApply(m.from, m.frame) : { status: 200, body: { epoch: room.epoch }, retryAfter: 0 };
      post({ type: "answer", to: m.from, rid: m.rid, result });
    }
    else if (room && m.type === "state-request") post({ type: "answer", to: m.from, rid: m.rid, result: roomState() });
    else if (room && m.type === "capture") remember(m.name, m.text);
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
      return state;
    },
    // A capture wrote this text into a saved store's tag.
    captured(name, text) {
      if (stopped) return;
      if (room) remember(name, text);
      else post({ type: "capture", name, text });
    },
    // A file frame arrived with these live-tag texts, by name.
    fileFrame(texts) {
      if (room && !stopped) roomFileFrame(texts);
    },
    get isSequencer() {
      return room !== null;
    },
  };
}
