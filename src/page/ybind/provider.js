import * as Y from "../../vendor/yjs.vendor.js";
import { toBase64, fromBase64 } from "../../vendor/yjs.vendor.js";
import { NET } from "./layout.js";

export const enc = (u) => toBase64(u);
export const dec = (s) => fromBase64(s);

export const PART = 12 * 1024;
const PART_KEY = /^(.+)\.(\d+)\.(\d+)$/;

const baseOf = (k) => PART_KEY.exec(k)?.[1] ?? k;
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function entriesOf(y) {
  const whole = [];
  const parts = new Map();
  for (const k of Object.keys(y).sort()) {
    const m = PART_KEY.exec(k);
    if (!m) { whole.push([k, y[k]]); continue; }
    const group = parts.get(m[1]) ?? { n: Number(m[3]), got: [] };
    group.got[Number(m[2])] = y[k];
    parts.set(m[1], group);
  }
  for (const [k, group] of parts) {
    let have = 0;
    for (let i = 0; i < group.n; i++) if (typeof group.got[i] === "string") have++;
    if (have === group.n) whole.push([k, group.got.join("")]);
  }
  return whole;
}

export function yValueOf(ydoc) {
  return { v: 1, g: 0, y: { seed: enc(Y.encodeStateAsUpdateV2(ydoc)) } };
}

export class YDecodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "YDecodeError";
    this.code = code;
  }
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/;

function strictEntries(value) {
  if (value?.v !== 1 || !value.y || typeof value.y !== "object" || Array.isArray(value.y)) {
    throw new YDecodeError("invalid-value", "Expected a version 1 Yjs page value");
  }
  const groups = new Map();
  const whole = new Set();
  for (const [key, text] of Object.entries(value.y)) {
    if (typeof text !== "string") throw new YDecodeError("invalid-update", `Invalid Yjs update: ${key}`);
    const part = PART_KEY.exec(key);
    if (!part) { whole.add(key); continue; }
    const index = Number(part[2]), count = Number(part[3]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 1 || index >= count) {
      throw new YDecodeError("invalid-update", `Invalid Yjs update part: ${key}`);
    }
    const group = groups.get(part[1]) ?? { count, indices: new Set() };
    if (group.count !== count || group.indices.has(index)) {
      throw new YDecodeError("invalid-update", `Conflicting Yjs update parts: ${part[1]}`);
    }
    group.indices.add(index);
    groups.set(part[1], group);
  }
  for (const [key, group] of groups) {
    if (whole.has(key)) throw new YDecodeError("invalid-update", `Conflicting Yjs update forms: ${key}`);
    if (group.indices.size !== group.count) throw new YDecodeError("incomplete-update", `Incomplete Yjs update: ${key}`);
  }
  return entriesOf(value.y);
}

export function docFromValue(value, { strict = false } = {}) {
  const entries = strict ? strictEntries(value) : entriesOf(value.y);
  const d = new Y.Doc();
  try {
    for (const [key, value] of entries) {
      const text = strict ? value.replace(/[\t\n\f\r ]/g, "") : value;
      if (strict && !BASE64.test(text)) throw new YDecodeError("invalid-update", `Invalid base64 in Yjs update: ${key}`);
      Y.applyUpdateV2(d, dec(text), NET);
    }
    if (strict && (d.store.pendingStructs || d.store.pendingDs)) {
      throw new YDecodeError("unresolved-update", "Yjs page updates have missing prerequisites");
    }
    return d;
  } catch (error) {
    d.destroy();
    if (strict && !(error instanceof YDecodeError)) {
      throw new YDecodeError("invalid-update", `Invalid Yjs page update: ${error.message}`);
    }
    throw error;
  }
}

const sameDeletes = (a, b) => Y.equalDeleteSets(Y.createDeleteSetFromStructStore(a.store), Y.createDeleteSetFromStructStore(b.store));
const svEqual = (a, b) => { if (a.size !== b.size) return false; for (const [c, n] of a) if (b.get(c) !== n) return false; return true; };

export function createYProvider({ store, ydoc, compact: limits = {}, setTimer = setTimeout, clearTimer = clearTimeout, stats = { applied: 0, offered: 0, compactions: 0 } }) {
  const initial = entriesOf(store.value.y);
  const known = new Set();
  let canCompact = !initial.some(([k]) => k[0] === "m");
  let counter = 0;
  const me = ydoc.clientID.toString(36);
  const nextKey = (p) => `${p}${me}-${(counter++).toString(36)}`;
  let timer = null;

  const partsOf = (key, s) => {
    if (s.length <= PART) return [[key, s]];
    const n = Math.ceil(s.length / PART);
    return Array.from({ length: n }, (_, i) => [`${key}.${i}.${n}`, s.slice(i * PART, (i + 1) * PART)]);
  };
  const put = (key, bytes) => {
    canCompact = true;
    known.add(key);
    for (const [k, v] of partsOf(key, enc(bytes))) store.handle.set(["y", k], v);
  };

  for (const [k] of initial) known.add(k);

  const onUpdate = (u, origin) => {
    if (origin === NET) return;
    put(nextKey("u"), u);
  };
  ydoc.on("updateV2", onUpdate);

  const applyKey = (k, v) => {
    if (known.has(k)) return;
    canCompact = true;
    known.add(k);
    stats.applied++;
    Y.applyUpdateV2(ydoc, dec(v), NET);
  };

  let wantReconcile = false;
  const schedule = (full) => {
    wantReconcile ||= full;
    if (timer) return;
    timer = setTimer(() => {
      timer = null;
      const full = wantReconcile;
      wantReconcile = false;
      if (full) reconcile();
      maybeCompact();
    }, 0);
  };

  const settle = () => { reconcile(); maybeCompact(); };

  function reconcile() {
    const y = store.value.y;
    const scratch = new Y.Doc();
    for (const [, v] of entriesOf(y)) Y.applyUpdateV2(scratch, dec(v), NET);
    const sv = Y.encodeStateVector(scratch);
    const mine = Y.decodeStateVector(Y.encodeStateVector(ydoc));
    const theirs = Y.decodeStateVector(sv);
    if (svEqual(mine, theirs) && sameDeletes(ydoc, scratch)) { scratch.destroy(); return false; }
    const diff = Y.encodeStateAsUpdateV2(ydoc, sv);
    scratch.destroy();
    stats.offered++;
    put(nextKey("r"), diff);
    return true;
  }

  const compact = { keys: 32, room: 768 * 1024, ...limits };
  let fold = null;
  let quietUntil = 0;
  const coverCache = new Map();
  const drop = (keys) => store.handle.update((data) => { for (const k of keys) delete data.y[k]; });
  const keysOf = (auth, bases) => Object.keys(auth).filter((k) => bases.has(baseOf(k)));

  function finishFold(auth) {
    if (fold.parts.every((k) => k in auth)) {
      drop(keysOf(auth, fold.inputs));
      fold = null;
      return true;
    }
    if (store.pending.length) return false;
    drop(fold.parts.filter((k) => k in auth));
    quietUntil = entriesOf(auth).length + compact.keys;
    fold = null;
    return true;
  }

  function dropCovered(auth, entries, crowded) {
    const folds = entries.filter(([k]) => k[0] === "m");
    const val = new Map(entries);
    const norm = new Map(folds);
    const normal = (k) => { const v = norm.get(k); if (typeof v === "string") norm.set(k, Y.mergeUpdatesV2([dec(v)])); return norm.get(k); };
    const covered = (k, v, mk) => {
      const c = `${k}|${mk}`;
      if (!coverCache.has(c)) { const b = normal(mk); coverCache.set(c, sameBytes(Y.mergeUpdatesV2([b, dec(v)]), b)); }
      return coverCache.get(c);
    };
    const gone = new Set();
    for (const [k, v] of entries) {
      if (!crowded && k[0] !== "m") continue;
      for (const [mk] of folds) {
        if (mk === k || gone.has(mk) || !covered(k, v, mk)) continue;
        if (k[0] === "m" && k < mk && covered(mk, val.get(mk), k)) continue;
        gone.add(k);
        break;
      }
    }
    if (!gone.size) return false;
    drop(keysOf(auth, gone));
    return true;
  }

  function maybeCompact() {
    if (!canCompact) return false;
    const auth = store.authoritative.y;
    if (fold) return finishFold(auth);
    const entries = entriesOf(auth);
    const crowded = entries.length > Math.max(compact.keys, quietUntil);
    if (!crowded && entries.filter(([k]) => k[0] === "m").length < 2) return false;
    if (dropCovered(auth, entries, crowded)) return true;
    if (!crowded) return false;
    const merged = enc(Y.mergeUpdatesV2(entries.map(([, v]) => dec(v))));
    const used = Object.values(auth).reduce((n, v) => n + v.length, 0);
    if (used + merged.length > compact.room) {
      quietUntil = entries.length + compact.keys;
      return false;
    }
    const key = nextKey("m");
    known.add(key);
    const parts = partsOf(key, merged);
    fold = { key, parts: parts.map(([k]) => k), inputs: new Set(entries.map(([k]) => k)) };
    store.handle.update((data) => { for (const [k, v] of parts) data.y[k] = v; });
    stats.compactions++;
    return true;
  }



  const off = store.onRebase((ev) => {
    const ops = ev.source === "remote" && ev.frame ? ev.frame.ops : null;
    const plain = ops && ops.every((op) => op.path[0] === "y" && op.path.length === 2 && !PART_KEY.test(op.path[1]));
    if (plain) {
      for (const op of ops) if (op.op === "set") applyKey(op.path[1], op.value);
    } else {
      for (const [k, v] of entriesOf(ev.next.y ?? {})) applyKey(k, v);
    }
    schedule(ev.source !== "remote" || !ops);
  });

  return { known, stats, settle, reconcile, compact: maybeCompact, dispose() { off(); ydoc.off("updateV2", onUpdate); if (timer) clearTimer(timer); } };
}
