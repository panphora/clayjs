// clay.live's fast lane: every op goes to a room that orders it (seq) and hands
// it to every tab, so stores move at network speed instead of save speed. The
// room is on the host (server-lane.js) or in one tab of this browser; both speak
// the same frames through a transport:
//   start({ open, close, frame, state, writer }) -> stop function
//   send(clientId, { name, n, ops, epoch }) -> Promise<{ status, body, retryAfter }>
//   fetchState(clientId) -> Promise<{ epoch, seq, writer, stores } | { status } | null>
// A new room (a new epoch) holds some of this tab's frames still in flight; see
// sortAwaiting for how each is sorted.
//
// Per open store the room says how far its file reaches: entry.last (the seq of
// the store's latest change) and entry.landed (the seq from which the file plus
// the room's log rebuilds the value; -1: rewrite now). Both are numbers in the
// current epoch, taken from the room and never carried across epochs.

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
// A refusal sent before the request was handled: the frame was not applied.
const unhandled = (status) => status === 429 || status === 503;

/**
 * @param {object} options
 * @param {object} options.transport
 * @param {Map<string, {store: object}>} options.entries - the live plugin's open stores, by name
 * @param {(epoch: string) => void} [options.onEpoch] - joined a room (first join or restart)
 * @param {() => void} [options.onWriter] - the room's writer may have changed
 * @param {() => void} [options.onApplied] - a store's room value moved (its entry's last advanced)
 * @param {() => void} [options.onLanded] - how far the file reaches moved (an entry's landed)
 * @param {() => void} [options.onCheckpoint] - the room asks the writer to save now (its log is half full)
 * @param {(name: string) => boolean} [options.held] - a save still on the wire carries some of
 *   this store's pending ops in file mode: nothing of the store is framed until release(name),
 *   so those ops are framed in order if the save does not land, and never if it does
 * @param {() => void} [options.onStop] - the lane stopped for good
 */
export function createFastLane({
  transport,
  entries,
  onEpoch = () => {},
  onLeave = () => {},
  onWriter = () => {},
  onApplied = () => {},
  onLanded = () => {},
  onCheckpoint = () => {},
  held = () => false,
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
  // The frame on the wire now.
  let flying = null;
  let lastSentAt = -Infinity;
  let holdUntil = 0;
  let timer = null;
  let retryDelay = RETRY_MS;
  let resyncDelay = RETRY_MS;
  // Bumped when the stream opens or closes, and when a state is taken: a state
  // request answered after either is obsolete.
  let connection = 0;
  // The stream connection the host knows this tab by (server lane): a frame
  // applies only under it. undefined on a transport without one.
  let conn;
  let stateCount = 0;
  let fetchAgain = false;
  let unsubscribe = null;
  // Per store: the next n, ops not yet in a frame, frames sent but not yet seen
  // back (each { n, ops, through, seq, sent, refused, uncertain }), and the
  // newest op id ever put in a frame.
  const lanes = new Map();

  const tell = (name, event) => entries.get(name)?.store.deliver?.({ code: null, n: null, seq: null, through: null, retryAfter: null, ...event });

  function laneOf(name) {
    let lane = lanes.get(name);
    if (!lane) lanes.set(name, (lane = { n: 0, unsent: [], awaiting: [], framed: 0 }));
    return lane;
  }

  // The store's ops still to frame: pending, past what was framed.
  function unframed(name, lane) {
    const store = entries.get(name)?.store;
    if (!store) return [];
    return store.pendingEntries().filter((pending) => pending.id > lane.framed);
  }

  // Never applied: every attempt was refused before the room handled it.
  const unapplied = (frame) => frame.refused === true && !frame.uncertain;

  // Stop sending this store: it leaves the room. A frame the room may have
  // applied is dropped from pending (never replayed over a file that may hold
  // it); a frame refused unapplied, and ops never framed, stay pending for file
  // mode. Refused frames come last: a refusal stops sending until the next state.
  function leaveRoom(name, lane) {
    const store = entries.get(name)?.store;
    let through = 0;
    for (const frame of lane.awaiting) if (!unapplied(frame)) through = frame.through;
    if (store && through) store.rebase(store.authoritative, { source: "state", through, cause: "leave" });
    onLeave(name, { epoch, seq });
    lane.unsent = [];
    lane.awaiting = [];
    // What is left pending is framed afresh if the store comes back.
    lane.framed = through;
    store?.setMode("file");
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
      if (!lane.unsent.length || !roomNames.has(name) || held(name)) continue;
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
        store?.rebase(store.authoritative, { source: "state", through: entry.id, cause: "undone" });
        tell(name, { phase: "undone", code: "op-too-large", through: entry.id });
        continue;
      }
      const take = lane.unsent.splice(0, count);
      const frame = { n: ++lane.n, ops: take.map((entry) => entry.op), through: take[take.length - 1].id, seq: null, sent: false };
      lane.framed = Math.max(lane.framed, frame.through);
      lane.awaiting.push(frame);
      return { name, lane, frame };
    }
    return null;
  }

  async function flush() {
    if (inFlight || stopped || !connected || !synced || conn === null) return;
    const next = nextFrame();
    if (!next) return;
    const { name, lane, frame } = next;
    lanes.delete(name);
    lanes.set(name, lane);
    const sentEpoch = epoch;
    frame.sentOn = connection;
    frame.sent = true;
    tell(name, { phase: "sent", n: frame.n, through: frame.through });
    // Refusal is evidence about earlier attempts only: this one may apply.
    frame.refused = false;
    inFlight = true;
    flying = frame;
    lastSentAt = now();
    let result;
    try {
      result = await transport.send(clientId, { name, n: frame.n, ops: frame.ops, epoch: sentEpoch, ...(conn !== undefined && { conn }) });
    } catch {
      result = null;
    }
    inFlight = false;
    flying = null;
    if (stopped) return;
    if (frame.undecided) decide(name, lane, frame, result || { status: 0 });
    else if (sentEpoch === epoch && lane.awaiting.includes(frame)) answered(name, lane, frame, result || { status: 0 });
    schedule();
  }

  // The answer to a frame sent to the room before this one. Refused unapplied
  // (stale, a 4xx, 429/503): it goes again here. Otherwise the old room applied
  // it or may have: it is dropped, never sent again.
  function decide(name, lane, frame, { status, body }) {
    delete frame.undecided;
    if (!lane.awaiting.includes(frame)) return;
    const refused = body?.stale === true || unhandled(status) || (status >= 400 && status < 500 && !transient(status));
    if (refused && !frame.uncertain) {
      frame.refused = true;
      frame.sent = false;
      frame.seq = null;
      return;
    }
    lane.awaiting.splice(lane.awaiting.indexOf(frame), 1);
    const store = entries.get(name)?.store;
    store?.rebase(store.authoritative, { source: "state", through: frame.through, cause: "decided" });
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
      store?.rebase(store.authoritative, { source: "state", through, cause: "settled" });
    }
  }

  function answered(name, lane, frame, { status, body, retryAfter }) {
    if (status >= 200 && status < 300) {
      retryDelay = RETRY_MS;
      // Made for an earlier room and refused unapplied: it goes again once this
      // tab has the new room's state (which may already be here).
      if (body?.stale) {
        frame.sent = false;
        frame.refused = true;
        if (body.epoch !== epoch) resync();
        else schedule();
        return;
      }
      if (body?.epoch && body.epoch !== epoch) {
        resync();
        return;
      }
      frame.seq = Number.isInteger(body?.seq) ? body.seq : null;
      tell(name, { phase: "landed", n: frame.n, seq: frame.seq, through: frame.through });
      // Its event already went by, or came inside a state this tab took: the ops are in.
      settleAwaiting();
      return;
    }
    if (transient(status)) {
      frame.sent = false;
      tell(name, { phase: "retry", code: body?.code ?? (status === 0 ? "offline" : status === 429 ? "rate-limited" : "server"), n: frame.n, through: frame.through, retryAfter: retryAfter ?? null });
      if (unhandled(status)) frame.refused = true;
      else {
        frame.uncertain = true;
        // The earliest connection an attempt that may have applied was sent on.
        frame.uncertainSince ??= frame.sentOn;
      }
      // Sent under a connection the host no longer has: read the state for the
      // current one, which also settles or resends this frame by its receipt.
      if (status === 503 && body?.code === "not-connected") {
        conn = null;
        resync();
        return;
      }
      // The room holds a receipt for every connected sender and has no room for
      // this one: this store goes at save speed until the room takes it back.
      if (status === 503 && body?.code === "busy") {
        tell(name, { phase: "left", code: "busy", n: frame.n, through: frame.through });
        console.warn(`clay.live("${name}"): the room is full, so it stays at save speed for now`);
        roomNames.delete(name);
        leaveRoom(name, lane);
        setTimer(resync, (retryAfter > 0 ? retryAfter : 60) * 1000);
        return;
      }
      // Its fate is unknown and the stream reconnected while it was on the wire:
      // a state read on the new connection decides it, by its receipt or none.
      if (frame.uncertain && frame.sentOn !== connection) {
        resync();
        return;
      }
      holdUntil = now() + (retryAfter > 0 ? retryAfter * 1000 : retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      return;
    }
    if (REVOKED.has(status)) {
      tell(name, { phase: "refused", code: "revoked", n: frame.n, through: frame.through });
      if (!frame.uncertain) frame.refused = true;
      stop();
      return;
    }
    const reason = body?.error || body?.code || `status ${status}`;
    if (status === 404) {
      tell(name, { phase: "left", code: "no-store", n: frame.n, through: frame.through });
      console.warn(`clay.live("${name}"): the room has no such store, so it stays at save speed (${reason})`);
      frame.refused = true;
      roomNames.delete(name);
      leaveRoom(name, lane);
      return;
    }
    lane.awaiting.splice(lane.awaiting.indexOf(frame), 1);
    const store = entries.get(name)?.store;
    tell(name, { phase: "refused", code: body?.code ?? "refused", n: frame.n, through: frame.through });
    console.warn(`clay.live("${name}"): the host refused an update, so it was undone (${reason})`);
    store?.rebase(store.authoritative, { source: "state", through: frame.through, cause: "refused" });
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
        tell(frame.name, { phase: "echoed", n: frame.n, seq: frame.seq, through });
        lane.awaiting.splice(0, i + 1);
      }
    }
    store.rebase(next, { source: own ? "state" : "remote", through, frame: { seq: frame.seq, from: frame.from, n: frame.n, ops: frame.ops } });
    entries.get(frame.name).last = frame.seq;
    onApplied();
    if (frame.checkpoint === true) onCheckpoint();
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

  // A new room: what becomes of this tab's frames still awaiting an answer.
  // A frame a local successor's receipts (seen) say it holds settles. A frame
  // every attempt of which was refused unapplied goes again. Any other frame the
  // old room may have applied is dropped, never sent again: a late checkpoint of
  // the old room may bring that move back, so sending it again could count it
  // twice. Frames go one at a time and a refusal stops
  // sending until the next state, so the settled or dropped frames come first.
  // Returns the frames to send again and the op id the rest reach (0: none).
  function sortAwaiting(awaiting, room) {
    const seen = room.seen ? (room.seen[clientId] ?? 0) : null;
    const resend = [];
    let through = 0;
    for (const frame of awaiting) {
      if (seen !== null && frame.n <= seen) through = frame.through;
      else if (frame.sent && frame === flying) {
        // Still on the wire: its answer decides.
        frame.undecided = true;
        resend.push(frame);
      } else if (unapplied(frame)) resend.push(frame);
      else through = frame.through;
    }
    return { resend, through };
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
    let joined = false;
    epoch = state.epoch;
    seq = Number.isInteger(state.seq) ? state.seq : 0;
    writer = state.writer ?? null;
    if ("conn" in state) conn = state.conn;
    const stores = state.stores || {};
    roomNames = new Set(Object.keys(stores));
    for (const [name, entry] of entries) {
      const room = stores[name];
      const lane = laneOf(name);
      if (!room) {
        leaveRoom(name, lane);
        continue;
      }
      const rejoined = entry.store.handle.status.mode === "file";
      entry.store.setMode("fast");
      entry.last = Number.isInteger(room.last) ? room.last : 0;
      entry.landed = Number.isInteger(room.landed) ? room.landed : 0;
      if (fresh) {
        const { resend, through } = sortAwaiting(lane.awaiting, room);
        for (const frame of resend) {
          if (frame.undecided) continue;
          frame.sent = false;
          frame.seq = null;
        }
        lane.awaiting = resend;
        entry.store.rebase(room.value, { source: "state", through: through || undefined, room: { seq, fresh: true, moves: state.moves?.[name] ?? null, floor: Number.isInteger(room.floor) ? room.floor : null } });
        lane.unsent = unframed(name, lane);
      } else {
        const seen = room.seen ? room.seen[clientId] : undefined;
        const next = [];
        let through;
        for (const frame of lane.awaiting) {
          if (frame === flying) {
            next.push(frame);
          } else if ((frame.seq !== null && frame.seq <= seq) || (seen !== undefined && frame.n <= seen)) {
            // In this state, by its answer or by the room's receipt.
            through = frame.through;
          } else if (frame.seq !== null) {
            // Answered as applied after this state was read: its event is on its way.
            next.push(frame);
          } else if (!frame.uncertain || seen !== undefined || frame.uncertainSince === connection) {
            // Provably not applied: every attempt refused before handling, above
            // the room's receipt for this tab, or every attempt that may have
            // applied went on this connection, which never dropped (its receipt
            // cannot have gone). It goes again with the same n.
            frame.sent = false;
            next.push(frame);
          } else {
            // Unanswered, and the stream reconnected since: its receipt may be gone.
            through = frame.through;
          }
        }
        lane.awaiting = next;
        entry.store.rebase(room.value, { source: "state", through, room: { seq, fresh: false, moves: state.moves?.[name] ?? null, floor: Number.isInteger(room.floor) ? room.floor : null } });
        // Back in the room after a spell at save speed: frame what was made meanwhile.
        if (rejoined) {
          lane.unsent = unframed(name, lane);
          joined = true;
        }
      }
    }
    if (fresh || joined) onEpoch(epoch);
    onApplied();
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
    for (const [name, entry] of entries) {
      const lane = lanes.get(name);
      if (lane) leaveRoom(name, lane);
      else {
        onLeave(name, { epoch, seq });
        entry.store.setMode("file");
      }
    }
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
    // The room's writer, and how far the file reaches when a save landed.
    writer(data) {
      if (!data || data.epoch !== epoch) return;
      writer = data.writer ?? null;
      if (data.landed && typeof data.landed === "object") {
        // A state read in flight was taken before this: its landed is older.
        stateCount++;
        for (const [name, landed] of Object.entries(data.landed)) {
          const entry = entries.get(name);
          if (entry && Number.isInteger(landed)) {
            entry.landed = landed;
            tell(name, { phase: "checkpointed", seq: landed });
          }
        }
        onLanded();
      }
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
    // The save that held this store ended: frame whatever is still pending past
    // what was framed (an accepted save's ops have left pending).
    release(name) {
      if (stopped || epoch === null || !roomNames.has(name)) return;
      laneOf(name).unsent = unframed(name, laneOf(name));
      schedule();
    },
    // Read the room again: a store opened after this tab joined, or a save the
    // room merged whose state may not have arrived yet.
    refresh() {
      if (epoch !== null && connected) resync();
    },
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
