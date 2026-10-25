/**
 * recovery.js — `clay.recovery`, the shared local recovery service.
 *
 * One store per document and mode, and one API every edit-mode document can use:
 * an app registers a channel for the records it can journal and gets back an object
 * whose methods work immediately. The core here is the queue and the status; the
 * IndexedDB implementation and the identity that scopes it are imported only when a
 * channel registers, so a page that journals nothing downloads neither, and a reader
 * never opens the database at all.
 *
 * This is a recovery copy, not a save. Nothing here is allowed to become proof that
 * the host accepted anything: a completed transaction means this browser kept a
 * copy, and that is all it means. HTML stays the saved source, and a page never
 * renders from these records.
 *
 * A document is covered only for the channels its adapters register. There is no
 * whole-document observer behind this, by design.
 */

import { mode as pageMode } from "./is-edit-mode.js";

// Replaceable text is debounced after typing stops, and forced out after five
// seconds of continuous typing so a fast writer is never more than that behind.
const DEBOUNCE_MS = 500;
const MAX_INTERVAL_MS = 5000;

const TEXT = "text";

function pageWriterId() {
  const minted = globalThis.crypto?.randomUUID?.();
  if (minted) return minted;
  return `wr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function recordKey(id) {
  return Array.isArray(id) ? id.join("\u0000") : String(id);
}

function copyPayload(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  return value;
}

/**
 * Build one recovery service.
 *
 * The returned object is what the loader publishes as `clay.recovery`. Its own
 * state is per page load: the writer id, the open database and the queue. Tests
 * and, later, an embedded caller can build another one without touching this page's.
 *
 * @param {Object} [options]
 * @param {string} [options.mode] - "edit" or "draft"
 * @param {string} [options.writerId]
 * @param {?IDBFactory} [options.indexedDB]
 * @param {number} [options.maxScopeBytes]
 * @param {number} [options.maxDbBytes]
 * @param {Function} [options.now]
 * @returns {Object}
 */
export function createRecovery({
  mode = pageMode === "draft" ? "draft" : "edit",
  writerId = pageWriterId(),
  indexedDB,
  maxScopeBytes,
  maxDbBytes,
  now,
} = {}) {
  const channels = new Map();
  const listeners = new Set();
  let prepared = null;
  let identity = null;
  let store = null;
  let status = { ok: true, code: null, durable: false };

  function snapshot() {
    return {
      ok: status.ok,
      code: status.code,
      durable: status.durable,
      usage: store?.status().usage ?? null,
      identityMismatch: identity ? identity.check().ok === false : false,
    };
  }

  function announce(entry) {
    const detail = {
      channel: entry.channel,
      status: snapshot(),
      count: entry.pending.size,
      revisions: [...entry.pending.values()].map(({ id, revision }) => ({ id, revision })),
    };
    for (const fn of entry.listeners) {
      try {
        fn(detail);
      } catch (_) {}
    }
    for (const fn of listeners) {
      try {
        fn(detail);
      } catch (_) {}
    }
  }

  // Once per failure episode, and once when it clears. A page whose storage is gone
  // must not queue a console line per keystroke, and a warning may only clear after
  // a transaction actually completed.
  function note(result) {
    if (result && result.ok) {
      const wasOk = status.ok;
      status = { ok: true, code: null, durable: true };
      if (!wasOk) for (const entry of channels.values()) announce(entry);
      return;
    }
    const code = result?.code || "error";
    if (status.ok || status.code !== code) {
      status = { ok: false, code, durable: false };
      for (const entry of channels.values()) announce(entry);
      return;
    }
    status = { ok: false, code, durable: false };
  }

  async function prepare() {
    const [{ createIdentity }, { createStore }] = await Promise.all([
      import("../recovery/identity.js"),
      import("../recovery/store.js"),
    ]);
    identity = createIdentity({ mode, writerId });
    store = createStore({ scope: identity.scope, indexedDB, maxScopeBytes, maxDbBytes, now });
    const opened = await store.open();
    // Reaching the database is not a durable copy. Only a completed write is.
    if (opened.ok) status = { ok: true, code: null, durable: false };
    else note(opened);
    return opened;
  }

  function ensurePrepared() {
    if (!prepared) {
      prepared = prepare().catch((err) => ({ ok: false, code: err?.name === "DataCloneError" ? "uncloneable" : "unavailable" }));
    }
    return prepared;
  }

  function schedule(entry) {
    const at = now?.() ?? Date.now();
    if (!entry.burstStart) entry.burstStart = at;
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, entry.burstStart + MAX_INTERVAL_MS - at));
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      entry.burstStart = 0;
      flush(entry).catch(() => {});
    }, wait);
  }

  function stage(entry, { key, kind = TEXT, baseEtag = null, base = null, payload = null, lineage = null } = {}) {
    const name = key == null ? "" : String(key);
    if (!name) throw new TypeError("clay.recovery.stage needs a key");
    const at = now?.() ?? Date.now();
    const revision = ++entry.revision;
    const id = kind === TEXT ? [entry.channel, name, writerId] : (globalThis.crypto?.randomUUID?.() ?? `rec-${revision}-${Math.random().toString(36).slice(2)}`);
    const slot = recordKey(id);
    const previous = entry.pending.get(slot);
    const record = {
      id,
      kind,
      channel: entry.channel,
      version: entry.version,
      key: name,
      writerId,
      revision,
      status: "journaled",
      baseEtag,
      base: copyPayload(base),
      payload: copyPayload(payload),
      lineage,
      created: previous?.created ?? at,
      updated: at,
    };
    entry.pending.set(slot, record);
    schedule(entry);
    announce(entry);
    return { id, revision };
  }

  async function writePending(entry) {
    const batch = [...entry.pending.values()];
    if (!batch.length) return { ok: true, stored: [] };
    const opened = await ensurePrepared();
    if (!opened.ok) return { ok: false, code: opened.code };
    const stored = [];
    let failure = null;
    for (const record of batch) {
      const receipt = await store.put(record);
      if (receipt.ok) {
        const slot = recordKey(record.id);
        if (entry.pending.get(slot) === record) entry.pending.delete(slot);
        if (!receipt.skipped) stored.push({ id: record.id, revision: record.revision });
      } else {
        failure = failure || receipt.code || "error";
      }
    }
    note(failure ? { ok: false, code: failure } : { ok: true });
    announce(entry);
    return failure ? { ok: false, code: failure } : { ok: true, stored };
  }

  function flush(entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.burstStart = 0;
    entry.writing = entry.writing.then(
      () => writePending(entry),
      () => writePending(entry)
    );
    return entry.writing;
  }

  async function list(entry) {
    const opened = await ensurePrepared();
    if (!opened.ok) return { ok: false, code: opened.code, records: [], status: snapshot() };
    const result = await store.list();
    note(result);
    if (!result.ok) return { ok: false, code: result.code, records: [], status: snapshot() };
    const records = result.records
      .filter((record) => record.channel === entry.channel)
      .map((record) => ({ ...record, supported: record.version === entry.version }));
    return { ok: true, records, status: snapshot() };
  }

  async function dismiss(entry, id, { revision } = {}) {
    const opened = await ensurePrepared();
    if (!opened.ok) return { ok: false, code: opened.code };
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.burstStart = 0;
    await entry.writing;
    const slot = recordKey(id);
    const queued = entry.pending.get(slot);
    if (queued && (revision === undefined || queued.revision === revision)) entry.pending.delete(slot);
    const receipt = await store.remove(id, { revision });
    note(receipt);
    announce(entry);
    return receipt.ok ? { ok: true, id, revision } : { ok: false, code: receipt.code };
  }

  function subscribe(entry, fn) {
    entry.listeners.add(fn);
    return () => entry.listeners.delete(fn);
  }

  function dispose(entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.burstStart = 0;
    const flushed = flush(entry).catch(() => ({ ok: false, code: "aborted" }));
    entry.listeners.clear();
    channels.delete(entry.channel);
    return flushed;
  }

  function channelApi(entry) {
    return {
      channel: entry.channel,
      version: entry.version,
      stage: (spec) => stage(entry, spec),
      flush: () => flush(entry),
      list: () => list(entry),
      dismiss: (id, options) => dismiss(entry, id, options),
      subscribe: (fn) => subscribe(entry, fn),
      dispose: () => dispose(entry),
    };
  }

  /**
   * Take responsibility for one kind of record in this document.
   *
   * Returns synchronously, before anything asynchronous has happened: the queue is
   * in memory from the first `stage`. A channel is a name, a version and, for text,
   * the two functions that let a review compare stored writing with a saved file
   * without a second implementation of the entry format.
   *
   * @param {Object} spec
   * @param {string} spec.channel
   * @param {number} [spec.version]
   * @param {Function} [spec.readSaved] - (html) => Map<key, payload>
   * @param {Function} [spec.describe] - (record) => {label, text}
   * @returns {Object}
   */
  function register({ channel, version = 1, readSaved = null, describe = null } = {}) {
    if (!channel || typeof channel !== "string") throw new TypeError("clay.recovery.register needs a channel name");
    const existing = channels.get(channel);
    if (existing) {
      throw new Error(`clay.recovery: the "${channel}" channel is already registered at version ${existing.version}`);
    }
    const entry = {
      channel,
      version,
      readSaved,
      describe,
      revision: 0,
      pending: new Map(),
      timer: null,
      burstStart: 0,
      writing: Promise.resolve(),
      listeners: new Set(),
    };
    channels.set(channel, entry);
    ensurePrepared();
    return channelApi(entry);
  }

  return {
    register,
    status: snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const recovery = createRecovery();
