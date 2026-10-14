// clay.live's fast lane: every op goes to a room that orders it (seq) and hands
// it to every tab, so stores move at network speed instead of save speed. The
// room is on the host (server-lane.js) or in one tab of this browser; both speak
// the same frames through a transport:
//   start({ open, close, frame, state, writer }) -> stop function
//   send(clientId, { name, n, ops, epoch }) -> Promise<{ status, body, retryAfter }>
//   fetchState(clientId) -> Promise<{ epoch, seq, writer, stores } | { status } | null>

import { applyOps, cloneJson } from "./ops.js";

export const MIN_GAP_MS = 40;
export const MAX_OPS = 128;
export const RETRY_MS = 500;
export const FRAME_BYTES = 15 * 1024;
const BUFFER_MAX = 512;
const RETRY_MAX_MS = 8000;
const REVOKED = new Set([401, 403]);
const STATE_GONE = new Set([401, 403, 404]);
const encoder = new TextEncoder();
const byteSize = (value) => encoder.encode(JSON.stringify(value)).length;

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
  let resyncDelay = RETRY_MS;
  // Bumped when the stream opens or closes, and when a state is taken: a state
  // request answered after either is obsolete.
  let connection = 0;
  let stateCount = 0;
  let fetchAgain = false;
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
      // Packed by bytes as well as count: the host refuses a body over 16 KB.
      let size = byteSize({ name, n: lane.n + 1, ops: [], epoch });
      let count = 0;
      while (count < lane.unsent.length && count < MAX_OPS) {
        const more = byteSize(lane.unsent[count].op) + 1;
        if (size + more > FRAME_BYTES) break;
        size += more;
        count++;
      }
      if (count === 0) {
        const [entry] = lane.unsent.splice(0, 1);
        console.warn(`clay.live("${name}"): one update was larger than ${FRAME_BYTES} bytes, so it was undone`);
        const store = entries.get(name)?.store;
        store?.rebase(store.authoritative, { source: "state", through: entry.id });
        continue;
      }
      const take = lane.unsent.splice(0, count);
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
      result = await transport.send(clientId, { name, n: frame.n, ops: frame.ops, epoch: sentEpoch });
    } catch {
      result = null;
    }
    inFlight = false;
    if (stopped) return;
    if (sentEpoch === epoch && lane.awaiting.includes(frame)) answered(name, lane, frame, result || { status: 0 });
    schedule();
  }

  // Every frame the room ordered at or before the applied seq is in the
  // authoritative values now, whether its answer or its event said so.
  function settleAwaiting() {
    for (const [name, lane] of lanes) {
      let through;
      while (lane.awaiting.length && lane.awaiting[0].seq !== null && lane.awaiting[0].seq <= seq) {
        through = lane.awaiting.shift().through;
      }
      if (through === undefined) continue;
      const store = entries.get(name)?.store;
      store?.rebase(store.authoritative, { source: "state", through });
    }
  }

  function answered(name, lane, frame, { status, body, retryAfter }) {
    if (status >= 200 && status < 300) {
      retryDelay = RETRY_MS;
      if (body?.epoch && body.epoch !== epoch) {
        resync();
        return;
      }
      frame.seq = Number.isInteger(body?.seq) ? body.seq : null;
      // Its event already went by, or came inside a state this tab took: the ops are in.
      settleAwaiting();
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
    settleAwaiting();
  }

  function onFrame(frame) {
    if (stopped || !frame || !Number.isInteger(frame.seq)) return;
    if (!synced) {
      buffered.push(frame);
      if (buffered.length > BUFFER_MAX) buffered.shift();
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
    stateCount++;
    // Older than what this tab already applied: keep what it has.
    if (state.epoch === epoch && Number.isInteger(state.seq) && state.seq < seq) {
      drain();
      return;
    }
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
    drain();
  }

  // Back in step: apply what arrived while the state was being read.
  function drain() {
    synced = true;
    const later = buffered.filter((frame) => frame.epoch === epoch && frame.seq > seq).sort((a, b) => a.seq - b.seq);
    buffered = [];
    for (const frame of later) onFrame(frame);
    schedule();
  }

  // Read the room's whole state. Frames wait in the buffer meanwhile, so the
  // answer and the frames after it apply in order.
  async function resync() {
    if (stopped) return;
    if (fetching) {
      fetchAgain = true;
      return;
    }
    fetching = true;
    fetchAgain = false;
    synced = false;
    const asked = { connection, stateCount };
    let state = null;
    try {
      state = await transport.fetchState(clientId);
    } catch {}
    fetching = false;
    if (stopped) return;
    if (asked.connection !== connection || fetchAgain) {
      if (connected) resync();
      return;
    }
    if (asked.stateCount !== stateCount) {
      if (synced) return;
      state = null;
    }
    if (state && typeof state.epoch === "string") {
      resyncDelay = RETRY_MS;
      applyState(state);
      return;
    }
    if (state && STATE_GONE.has(state.status)) {
      stop();
      return;
    }
    if (connected) {
      setTimer(resync, resyncDelay);
      resyncDelay = Math.min(resyncDelay * 2, RETRY_MAX_MS);
    }
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
      connection++;
      resync();
    },
    close() {
      connected = false;
      connection++;
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
