// clay.live's fast lane: every op goes to a room that orders it (seq) and hands
// it to every tab, so stores move at network speed instead of save speed. The
// room is on the host (server-lane.js) or in one tab of this browser; both speak
// the same frames through a transport:
//   start({ open, close, frame, state, writer }) -> stop function
//   send(clientId, { name, n, ops }) -> Promise<{ status, body, retryAfter }>
//   fetchState() -> Promise<{ epoch, seq, writer, stores } | null>

import { applyOps, cloneJson } from "./ops.js";

export const MIN_GAP_MS = 40;
export const MAX_OPS = 128;
export const RETRY_MS = 500;
const RETRY_MAX_MS = 8000;
const REVOKED = new Set([401, 403]);

const transient = (status) => status === 0 || status === 408 || status === 429 || status >= 500;

/**
 * @param {object} options
 * @param {object} options.transport
 * @param {Map<string, {store: object}>} options.entries - the live plugin's open stores, by name
 * @param {(epoch: string) => void} [options.onEpoch] - joined a room (first join or restart)
 * @param {() => void} [options.onWriter] - the room's writer may have changed
 * @param {() => void} [options.onStop] - the lane stopped for good
 */
export function createFastLane({
  transport,
  entries,
  onEpoch = () => {},
  onWriter = () => {},
  onStop = () => {},
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let clientId = null;
  let connected = false;
  let synced = false;
  let epoch = null;
  let seq = 0;
  let writer = null;
  let roomNames = new Set();
  let buffered = [];
  let fetching = false;
  let stopped = false;
  let inFlight = false;
  let lastSentAt = -Infinity;
  let holdUntil = 0;
  let timer = null;
  let retryDelay = RETRY_MS;
  let unsubscribe = null;
  // Per store: the next n, ops not yet in a frame, and frames sent but not yet
  // seen back (each { n, ops, through, seq, sent }).
  const lanes = new Map();

  function laneOf(name) {
    let lane = lanes.get(name);
    if (!lane) lanes.set(name, (lane = { n: 0, unsent: [], awaiting: [] }));
    return lane;
  }

  function schedule() {
    if (timer !== null || inFlight || stopped) return;
    const t = now();
    const delay = Math.max(0, lastSentAt + MIN_GAP_MS - t, holdUntil - t);
    timer = setTimer(() => {
      timer = null;
      flush();
    }, delay);
  }

  // A frame whose send failed goes again first, with its own n. Otherwise the
  // oldest unsent ops of one store; stores take turns.
  function nextFrame() {
    for (const [name, lane] of lanes) {
      const retry = lane.awaiting.find((frame) => !frame.sent);
      if (retry) return { name, lane, frame: retry };
    }
    for (const [name, lane] of lanes) {
      if (!lane.unsent.length || !roomNames.has(name)) continue;
      const take = lane.unsent.splice(0, MAX_OPS);
      const frame = { n: ++lane.n, ops: take.map((entry) => entry.op), through: take[take.length - 1].id, seq: null, sent: false };
      lane.awaiting.push(frame);
      return { name, lane, frame };
    }
    return null;
  }

  async function flush() {
    if (inFlight || stopped || !connected || !synced) return;
    const next = nextFrame();
    if (!next) return;
    const { name, lane, frame } = next;
    lanes.delete(name);
    lanes.set(name, lane);
    const sentEpoch = epoch;
    frame.sent = true;
    inFlight = true;
    lastSentAt = now();
    let result;
    try {
      result = await transport.send(clientId, { name, n: frame.n, ops: frame.ops });
    } catch {
      result = null;
    }
    inFlight = false;
    if (stopped) return;
    if (sentEpoch === epoch && lane.awaiting.includes(frame)) answered(name, lane, frame, result || { status: 0 });
    schedule();
  }

  function confirm(name, lane, frame) {
    const i = lane.awaiting.indexOf(frame);
    if (i < 0) return;
    lane.awaiting.splice(0, i + 1);
    const store = entries.get(name)?.store;
    store?.rebase(store.authoritative, { source: "state", through: frame.through });
  }

  function answered(name, lane, frame, { status, body, retryAfter }) {
    if (status >= 200 && status < 300) {
      retryDelay = RETRY_MS;
      if (body?.epoch && body.epoch !== epoch) {
        resync();
        return;
      }
      frame.seq = Number.isInteger(body?.seq) ? body.seq : null;
      // Its event already went by inside a state this tab took: the ops are in.
      if (frame.seq !== null && frame.seq <= seq) confirm(name, lane, frame);
      return;
    }
    if (transient(status)) {
      frame.sent = false;
      holdUntil = now() + (retryAfter > 0 ? retryAfter * 1000 : retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      return;
    }
    if (REVOKED.has(status)) {
      stop();
      return;
    }
    lane.awaiting.splice(lane.awaiting.indexOf(frame), 1);
    const store = entries.get(name)?.store;
    const reason = body?.error || body?.code || `status ${status}`;
    if (status === 404) {
      console.warn(`clay.live("${name}"): the room has no such store, so it stays at save speed (${reason})`);
      roomNames.delete(name);
      lane.unsent = [];
      lane.awaiting = [];
      store?.setMode("file");
      return;
    }
    console.warn(`clay.live("${name}"): the host refused an update, so it was undone (${reason})`);
    store?.rebase(store.authoritative, { source: "state", through: frame.through });
  }

  function apply(frame) {
    seq = frame.seq;
    const store = entries.get(frame.name)?.store;
    if (!store || !roomNames.has(frame.name)) return;
    let next;
    try {
      next = applyOps(cloneJson(store.authoritative), frame.ops);
    } catch {
      resync();
      return;
    }
    let through;
    const own = frame.from === clientId;
    if (own) {
      const lane = laneOf(frame.name);
      const i = lane.awaiting.findIndex((sent) => sent.n === frame.n);
      if (i >= 0) {
        through = lane.awaiting[i].through;
        lane.awaiting.splice(0, i + 1);
      }
    }
    store.rebase(next, { source: own ? "state" : "remote", through });
  }

  function onFrame(frame) {
    if (stopped || !frame || !Number.isInteger(frame.seq)) return;
    if (!synced) {
      buffered.push(frame);
      return;
    }
    if (frame.epoch !== epoch) {
      buffered.push(frame);
      resync();
      return;
    }
    if (frame.seq <= seq) return;
    if (frame.seq !== seq + 1) {
      buffered.push(frame);
      resync();
      return;
    }
    apply(frame);
  }

  function applyState(state) {
    if (stopped || !state || typeof state.epoch !== "string") return;
    const fresh = state.epoch !== epoch;
    epoch = state.epoch;
    seq = Number.isInteger(state.seq) ? state.seq : 0;
    writer = state.writer ?? null;
    const stores = state.stores || {};
    roomNames = new Set(Object.keys(stores));
    for (const [name, entry] of entries) {
      const room = stores[name];
      const lane = laneOf(name);
      if (!room) {
        lane.unsent = [];
        lane.awaiting = [];
        entry.store.setMode("file");
        continue;
      }
      entry.store.setMode("fast");
      if (fresh) {
        lane.awaiting = [];
        lane.unsent = entry.store.pendingEntries();
        entry.store.rebase(room.value, { source: "state" });
      } else {
        let through;
        while (lane.awaiting.length && lane.awaiting[0].seq !== null && lane.awaiting[0].seq <= seq) {
          through = lane.awaiting.shift().through;
        }
        entry.store.rebase(room.value, { source: "state", through });
      }
    }
    if (fresh) onEpoch(epoch);
    onWriter();
    synced = true;
    const later = buffered.filter((frame) => frame.epoch === epoch && frame.seq > seq).sort((a, b) => a.seq - b.seq);
    buffered = [];
    for (const frame of later) onFrame(frame);
    schedule();
  }

  async function resync() {
    if (fetching || stopped) return;
    fetching = true;
    let state = null;
    try {
      state = await transport.fetchState();
    } catch {}
    fetching = false;
    if (stopped) return;
    if (state && typeof state.epoch === "string") applyState(state);
    else if (connected) setTimer(resync, RETRY_MS);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    unsubscribe?.();
    for (const entry of entries.values()) entry.store.setMode("file");
    onStop();
  }

  const handlers = {
    open(info) {
      clientId = info.clientId;
      connected = true;
      resync();
    },
    close() {
      connected = false;
      synced = false;
      buffered = [];
    },
    frame: onFrame,
    state: applyState,
    writer(data) {
      if (!data || data.epoch !== epoch) return;
      writer = data.writer ?? null;
      onWriter();
    },
  };

  return {
    start() {
      if (!unsubscribe && !stopped) unsubscribe = transport.start(handlers);
    },
    // A store committed ops; lastId is the id of the last one (store.mark).
    local(name, ops, lastId) {
      if (stopped || epoch === null || !roomNames.has(name)) return;
      const lane = laneOf(name);
      const first = lastId - ops.length + 1;
      ops.forEach((op, i) => lane.unsent.push({ id: first + i, op }));
      schedule();
    },
    // A store opened after this tab joined: fetch the room again for its value.
    storeOpened() {
      if (epoch !== null && connected) resync();
    },
    isWriter() {
      return writer !== null && writer === clientId;
    },
    get status() {
      return { connected, synced, epoch, seq, writer, clientId, stopped };
    },
    stop,
  };
}
