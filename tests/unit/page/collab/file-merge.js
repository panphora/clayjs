// The host's merge of a written file into one store of a room, rule for rule
// from hyperclay/server-lib/live-data-rooms.js (fileWritten, baseOf, placed,
// provenBy, evict). A copy, not an import: clayjs does not depend on the
// hyperclay repo. Keep the two in step.
//
// room: { epoch, seq, lastN: Map(name\nclient -> { n, seq }), stores: Map }
// store: { value, bytes, from, last, landed, floor, log, logBytes, inFile }
// file: { value, at: { epoch, seq, hash } | null, by: { client, n } | null }
// Returns null when the store is unknown, else { changed, dropped, landedMoved }.
import { applyOp, checkOp, cloneJson, diffOps, serializeLive, textHash } from "../../../../src/live/ops.js";

import { frameSet, contains, descendants, saveReceipt, postReceipt, replaceReceipt } from "../../../../src/live/provenance.js";

const encoder = new TextEncoder();
const utf8 = (text) => encoder.encode(text).length;

export function evict(store, limits) {
  while (store.log.length > limits.logEntries || store.logBytes > limits.logBytes) {
    const gone = store.log.shift();
    store.logBytes -= gone.bytes;
    store.floor = gone.seq;
    store.inFile?.delete(gone.seq);
  }
}

function baseOf(room, store, at) {
  if (at && at.epoch === room.epoch && at.seq <= room.seq) return at.seq;
  if (at && store.from && at.epoch === store.from.epoch && at.seq >= store.from.seq) return 0;
  return store.landed;
}

function placed(room, store, at) {
  return !!at && ((at.epoch === room.epoch && at.seq <= room.seq) || (!!store.from && at.epoch === store.from.epoch && at.seq >= store.from.seq));
}

function provenBy(room, name, file, stamped) {
  if (!file.by || !stamped || file.at.epoch !== room.epoch) return null;
  if (file.by.v === 2) return file.by;
  const last = room.lastN.get(name + "\n" + file.by.client);
  return file.by.n <= (last ? last.n : 0) + 1 ? file.by : null;
}

export function mergeFile(room, name, file, { limits, restored = false } = {}) {
  const store = room.stores.get(name);
  if (!store || store.ephemeral || file.value === null || typeof file.value !== "object" || Array.isArray(file.value) !== Array.isArray(store.value)) return null;
  store.inFile ??= new Set();
  let value = cloneJson(file.value);
  const before = store.landed;
  const base = baseOf(room, store, file.at);
  const stamped = placed(room, store, file.at) && file.at.hash === textHash(serializeLive(value));
  if (base < store.floor) {
    store.landed = -1;
    return { changed: false, dropped: false, landedMoved: before !== -1 };
  }
  const by = restored ? null : provenBy(room, name, file, stamped);
  const frames = frameSet(by);
  const ancestry = descendants(by);
  const own = (entry) => {
    if (!by) return false;
    if (!entry.merge) return contains(frames, entry.from, entry.n);
    const p = entry.provenance;
    return by.v === 2 && p && p.at.epoch === file.at.epoch && p.at.seq === file.at.seq && contains(ancestry, ...p.capture);
  };
  if (stamped) store.inFile.clear();
  const entries = [];
  for (const entry of store.log) {
    if (entry.seq <= base) continue;
    if (own(entry)) store.inFile.add(entry.seq);
    else if (stamped || !store.inFile.has(entry.seq)) entries.push(entry);
  }
  for (const entry of entries) {
    for (const op of entry.ops) {
      try {
        checkOp(value, op);
        value = applyOp(value, op);
      } catch {}
    }
  }
  const text = serializeLive(value);
  let changed = false;
  if (text !== serializeLive(store.value)) {
    const bytes = utf8(text);
    const roomBytes = [...room.stores.values()].reduce((n, s) => n + s.bytes, 0);
    if (bytes > limits.storeBytes || roomBytes - store.bytes + bytes > limits.roomBytes) {
      room.stores.delete(name);
      return { changed: true, dropped: true, landedMoved: false };
    }
    const ops = diffOps(store.value, value);
    store.value = value;
    store.bytes = bytes;
    room.seq += 1;
    store.last = room.seq;
    const provenance = by?.v === 2 ? { at: { epoch: file.at.epoch, seq: file.at.seq }, by: by.frames, capture: by.capture } : null;
    const logged = utf8(JSON.stringify(provenance ? { ops, provenance } : ops));
    store.log.push({ seq: room.seq, ops, bytes: logged, merge: true, ...(provenance && { provenance }) });
    store.inFile.add(room.seq);
    store.logBytes += logged;
    evict(store, limits);
    changed = true;
  }
  store.landed = entries.length ? base : store.last;
  if (by?.v === 2) {
    for (const [client, ranges] of by.frames) saveReceipt(room, name + "\n" + client, ranges, store.last, limits.receipts ?? 4096);
  } else if (by) {
    const nKey = name + "\n" + by.client;
    const last = room.lastN.get(nKey);
    if ((!last || last.n < by.n) && (last || room.lastN.size < (limits.receipts ?? Infinity))) {
      replaceReceipt(room, nKey, postReceipt(last, by.n, store.last));
    }
  }
  return { changed, dropped: false, landedMoved: store.landed !== before };
}
