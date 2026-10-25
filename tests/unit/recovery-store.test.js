// Scenario: one shared local recovery store, and an API that cannot lose writing.
//
// A recovery copy is only worth having if it is never overwritten by another tab,
// never resurrects what a save already covered, never reports a memory fallback as
// durable, and never takes an existing copy away because a new write could not land.
// These tests hold the store and its facade to those four promises, with a test-only
// IndexedDB that never reaches the runtime closure.

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";
import { createStore, openDatabase } from "../../src/recovery/store.js";
import { createRecovery } from "../../src/core/recovery.js";

// jsdom has no structuredClone, and the test-only IndexedDB clones every value it
// stores with it. A real browser has it; this file supplies the same thing.
globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const SCOPE = ["https://example.test", "documentid", "doc-1", "edit"];
const OTHER_SCOPE = ["https://example.test", "documentid", "doc-2", "edit"];

const text = (over = {}) => ({
  id: ["notes", "n1", "writer-1"],
  kind: "text",
  channel: "notes",
  version: 1,
  key: "n1",
  writerId: "writer-1",
  revision: 1,
  status: "journaled",
  baseEtag: null,
  base: null,
  payload: { body: "one" },
  lineage: null,
  created: 1,
  updated: 1,
  ...over,
});

// A factory whose writes fail on demand, so quota, aborts and a write that recovers
// are refused and then allowed without a browser that is actually full.
function guardedFactory(base, failWith) {
  const wrapStore = (store) =>
    new Proxy(store, {
      get(target, prop) {
        if (prop === "put") {
          return (...args) => {
            const error = failWith();
            if (error) throw error;
            return target.put(...args);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  const wrapTx = (tx) =>
    new Proxy(tx, {
      get(target, prop) {
        if (prop === "objectStore") return (name) => wrapStore(target.objectStore(name));
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  const wrapDb = (db) =>
    new Proxy(db, {
      get(target, prop) {
        if (prop === "transaction") return (...args) => wrapTx(target.transaction(...args));
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  return {
    open(name, version) {
      const request = version === undefined ? base.open(name) : base.open(name, version);
      return new Proxy(request, {
        get(target, prop) {
          if (prop === "result") {
            const db = target.result;
            return db ? wrapDb(db) : db;
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, prop, value) {
          Reflect.set(target, prop, value, target);
          return true;
        },
      });
    },
  };
}

// A host that never answers the open: the upgrade is held by another connection.
function blockedFactory() {
  return {
    open() {
      let blocked = null;
      return {
        set onupgradeneeded(_) {},
        set onsuccess(_) {},
        set onerror(_) {},
        set onblocked(fn) {
          blocked = fn;
          setTimeout(() => blocked && blocked(new Event("blocked")), 0);
        },
      };
    },
  };
}

const recoveryWith = (options = {}) => createRecovery({ indexedDB: new IDBFactory(), ...options });

afterEach(() => {
  document.documentElement.removeAttribute("documentid");
  document.documentElement.removeAttribute("htmlclayid");
});

test("the first open creates the three stores and files a text record under its scope", async () => {
  const factory = new IDBFactory();
  const store = createStore({ scope: SCOPE, indexedDB: factory });
  const receipt = await store.put(text());

  expect(receipt).toMatchObject({ ok: true, revision: 1 });
  const listed = await store.list();
  expect(listed.ok).toBe(true);
  expect(listed.records).toHaveLength(1);
  expect(listed.records[0].scope).toEqual(SCOPE);
  expect(listed.status.usage.scopeBytes).toBeGreaterThan(0);

  const raw = await openDatabase(factory, { name: "clay-recovery", version: 1 });
  expect([...raw.db.objectStoreNames]).toEqual(expect.arrayContaining(["records", "watermarks", "meta"]));
  raw.db.close();
});

test("the latest revision of one text key wins", async () => {
  const entries = recoveryWith().register({ channel: "notes" });
  const first = entries.stage({ key: "n1", payload: { body: "one" } });
  const second = entries.stage({ key: "n1", payload: { body: "two" } });

  expect(second.revision).toBeGreaterThan(first.revision);
  expect(second.id).toEqual(first.id);
  const flushed = await entries.flush();
  expect(flushed.ok).toBe(true);

  const { records } = await entries.list();
  expect(records).toHaveLength(1);
  expect(records[0].payload.body).toBe("two");
  expect(records[0].revision).toBe(second.revision);
});

test("two tabs stay separate writers and neither overwrites the other", async () => {
  const factory = new IDBFactory();
  const first = createRecovery({ indexedDB: factory });
  const second = createRecovery({ indexedDB: factory });
  const a = first.register({ channel: "notes" });
  const b = second.register({ channel: "notes" });

  a.stage({ key: "n1", payload: { body: "from A" } });
  b.stage({ key: "n1", payload: { body: "from B" } });
  await a.flush();
  await b.flush();

  const { records } = await a.list();
  expect(records.map((record) => record.payload.body).sort()).toEqual(["from A", "from B"]);
  expect(new Set(records.map((record) => record.writerId)).size).toBe(2);
});

test("a record of a version this build does not know is listed and never dropped", async () => {
  const factory = new IDBFactory();
  const entries = createRecovery({ indexedDB: factory }).register({ channel: "notes", version: 1 });
  entries.stage({ key: "n2", payload: { body: "mine" } });
  await entries.flush();
  const [mine] = (await entries.list()).records;

  const later = createStore({ scope: mine.scope, indexedDB: factory });
  await later.put(text({ id: ["notes", "n1", "writer-9"], writerId: "writer-9", version: 7, payload: { body: "from a later build" } }));

  const listed = await entries.list();
  const unknown = listed.records.filter((record) => record.version === 7);
  expect(unknown).toHaveLength(1);
  expect(unknown[0].supported).toBe(false);
  expect(unknown[0].payload.body).toBe("from a later build");
  expect(listed.records.filter((record) => record.supported)).toHaveLength(1);

  expect((await entries.list()).records.map((record) => record.version).sort()).toEqual([1, 7]);
});

test("a database a later build already upgraded is reported, not downgraded or deleted", async () => {
  const factory = new IDBFactory();
  const ahead = await openDatabase(factory, { version: 2 });
  ahead.db.close();

  const store = createStore({ scope: SCOPE, indexedDB: factory });
  const receipt = await store.put(text());
  expect(receipt).toEqual({ ok: false, code: "unknown-schema" });
  expect(store.status()).toMatchObject({ ok: false, code: "unknown-schema", durable: false });

  const stillAhead = await openDatabase(factory, { version: 2 });
  expect(stillAhead.ok).toBe(true);
  expect([...stillAhead.db.objectStoreNames]).toEqual(expect.arrayContaining(["records", "watermarks", "meta"]));
  stillAhead.db.close();
});

test("a binary record keeps its bytes, not an object of numeric properties", async () => {
  const entries = recoveryWith().register({ channel: "clay.page", version: 1 });
  const bytes = new Uint8Array([7, 0, 255, 12]);
  entries.stage({ key: "page-1", kind: "binary", payload: bytes });
  expect((await entries.flush()).ok).toBe(true);

  const { records } = await entries.list();
  expect(records).toHaveLength(1);
  expect(ArrayBuffer.isView(records[0].payload)).toBe(true);
  expect(records[0].payload.constructor.name).toBe("Uint8Array");
  expect([...records[0].payload]).toEqual([7, 0, 255, 12]);
});

test("a caller that mutates its buffer after staging cannot change the staged record", async () => {
  const entries = recoveryWith().register({ channel: "clay.page" });
  const buffer = new Uint8Array([1, 2, 3]);
  entries.stage({ key: "page-1", kind: "binary", payload: buffer });
  buffer[0] = 99;
  buffer.fill(42);

  await entries.flush();
  const { records } = await entries.list();
  expect([...records[0].payload]).toEqual([1, 2, 3]);
});

test("a failed write keeps the older copy and reports a code", async () => {
  const factory = new IDBFactory();
  const store = createStore({ scope: SCOPE, indexedDB: factory });
  expect((await store.put(text({ revision: 1, payload: { body: "one" } }))).ok).toBe(true);
  store.close();

  let failures = 1;
  const flaky = guardedFactory(factory, () => (failures-- > 0 ? new DOMException("The quota has been exceeded.", "QuotaExceededError") : null));
  const failing = createStore({ scope: SCOPE, indexedDB: flaky });
  const receipt = await failing.put(text({ revision: 2, payload: { body: "two" } }));

  expect(receipt).toEqual({ ok: false, code: "quota" });
  const kept = await failing.get(["notes", "n1", "writer-1"]);
  expect(kept.ok).toBe(true);
  expect(kept.record.payload.body).toBe("one");
  expect(kept.record.revision).toBe(1);
});

test("an over-budget write is refused and the earlier copy stays", async () => {
  const factory = new IDBFactory();
  const store = createStore({ scope: SCOPE, indexedDB: factory });
  await store.put(text());

  const small = createStore({ scope: SCOPE, indexedDB: factory, maxScopeBytes: 8 });
  const receipt = await small.put(text({ revision: 2, payload: { body: "x".repeat(4096) } }));
  expect(receipt).toEqual({ ok: false, code: "over-budget" });

  const listed = await small.list();
  expect(listed.records).toHaveLength(1);
  expect(listed.records[0].revision).toBe(1);
});

test("quota, blocked and unavailable each report a non-durable failure", async () => {
  const quota = createRecovery({
    indexedDB: guardedFactory(new IDBFactory(), () => new DOMException("full", "QuotaExceededError")),
  }).register({ channel: "notes" });
  quota.stage({ key: "n1", payload: { body: "one" } });
  expect(await quota.flush()).toEqual({ ok: false, code: "quota" });

  const blocked = createRecovery({ indexedDB: blockedFactory() }).register({ channel: "notes" });
  blocked.stage({ key: "n1", payload: { body: "one" } });
  expect(await blocked.flush()).toEqual({ ok: false, code: "blocked" });

  const unavailable = createRecovery({ indexedDB: null }).register({ channel: "notes" });
  unavailable.stage({ key: "n1", payload: { body: "one" } });
  expect(await unavailable.flush()).toEqual({ ok: false, code: "unavailable" });
  expect((await unavailable.list()).ok).toBe(false);
});

test("a failure warns once per episode and clears only after a transaction completes", async () => {
  let failures = 2;
  const factory = guardedFactory(new IDBFactory(), () => (failures-- > 0 ? new DOMException("full", "QuotaExceededError") : null));
  const recovery = createRecovery({ indexedDB: factory });
  const entries = recovery.register({ channel: "notes" });
  entries.stage({ key: "n1", payload: { body: "one" } });

  const warned = [];
  entries.subscribe((detail) => {
    const code = detail.status.code;
    if (warned[warned.length - 1] !== code) warned.push(code);
  });

  expect(await entries.flush()).toEqual({ ok: false, code: "quota" });
  expect(await entries.flush()).toEqual({ ok: false, code: "quota" });
  expect(warned).toEqual(["quota"]);
  expect(recovery.status()).toMatchObject({ ok: false, code: "quota", durable: false });

  expect((await entries.flush()).ok).toBe(true);
  expect(warned).toEqual(["quota", null]);
  expect(recovery.status()).toMatchObject({ ok: true, code: null, durable: true });
});

test("an acknowledgement refuses a queued write for a revision it already covers", async () => {
  const store = createStore({ scope: SCOPE, indexedDB: new IDBFactory() });
  await store.put(text({ revision: 1 }));

  const ack = await store.acknowledge(["notes", "n1", "writer-1"], { revision: 1, etag: "E2", captureId: 42 });
  expect(ack).toMatchObject({ ok: true, acknowledged: 1, deleted: true });
  expect((await store.get(["notes", "n1", "writer-1"])).ok).toBe(false);

  const late = await store.put(text({ revision: 1, payload: { body: "stale" } }));
  expect(late).toMatchObject({ ok: true, skipped: true });
  expect((await store.get(["notes", "n1", "writer-1"])).ok).toBe(false);

  const newer = await store.put(text({ revision: 2, payload: { body: "typed after the save" } }));
  expect(newer.ok).toBe(true);
  expect((await store.get(["notes", "n1", "writer-1"])).record.payload.body).toBe("typed after the save");
});

test("an acknowledgement leaves a newer revision and every other writer alone", async () => {
  const store = createStore({ scope: SCOPE, indexedDB: new IDBFactory() });
  await store.put(text({ revision: 3, payload: { body: "newest" } }));
  await store.put(text({ id: ["notes", "n1", "writer-2"], writerId: "writer-2", revision: 1 }));

  const ack = await store.acknowledge(["notes", "n1", "writer-1"], { revision: 1 });
  expect(ack).toMatchObject({ ok: true, deleted: false });
  expect((await store.get(["notes", "n1", "writer-1"])).record.payload.body).toBe("newest");
  expect((await store.get(["notes", "n1", "writer-2"])).ok).toBe(true);
});

test("dismiss is a compare-and-delete that refuses a newer record", async () => {
  const entries = recoveryWith().register({ channel: "notes" });
  const first = entries.stage({ key: "n1", payload: { body: "one" } });
  await entries.flush();
  await entries.dismiss(first.id, { revision: first.revision });
  expect((await entries.list()).records).toHaveLength(0);

  const stale = entries.stage({ key: "n1", payload: { body: "two" } });
  await entries.flush();
  const newer = entries.stage({ key: "n1", payload: { body: "three" } });
  await entries.flush();

  expect(await entries.dismiss(stale.id, { revision: stale.revision })).toEqual({ ok: false, code: "stale" });
  const { records } = await entries.list();
  expect(records).toHaveLength(1);
  expect(records[0].payload.body).toBe("three");
  expect(await entries.dismiss(newer.id, { revision: newer.revision })).toMatchObject({ ok: true });
  expect((await entries.list()).records).toHaveLength(0);
});

test("a scope keeps its documents, its origins and its modes apart", async () => {
  const factory = new IDBFactory();
  const one = createStore({ scope: SCOPE, indexedDB: factory });
  const other = createStore({ scope: OTHER_SCOPE, indexedDB: factory });
  const elsewhere = createStore({ scope: ["https://another.test", "documentid", "doc-1", "edit"], indexedDB: factory });
  const draft = createStore({ scope: ["https://example.test", "documentid", "doc-1", "draft"], indexedDB: factory });

  await one.put(text());
  await other.put(text());
  await elsewhere.put(text());
  await draft.put(text());

  expect((await one.list()).records).toHaveLength(1);
  for (const store of [other, elsewhere, draft]) expect((await store.list()).records).toHaveLength(1);
  expect((await one.list()).status.usage.dbBytes).toBeGreaterThan(0);
});

test("a copied tab is its own writer, and no writer id comes from sessionStorage", async () => {
  window.sessionStorage.setItem("clay:recovery:writer", "inherited-by-a-duplicate-tab");
  const read = jest.spyOn(Storage.prototype, "getItem");
  try {
    const first = createRecovery({ indexedDB: new IDBFactory() }).register({ channel: "notes" });
    const second = createRecovery({ indexedDB: new IDBFactory() }).register({ channel: "notes" });
    first.stage({ key: "n1", payload: { body: "one" } });
    second.stage({ key: "n1", payload: { body: "two" } });
    await first.flush();
    await second.flush();

    const [a] = (await first.list()).records;
    const [b] = (await second.list()).records;
    expect(a.writerId).not.toBe(b.writerId);
    expect(a.writerId).not.toBe("inherited-by-a-duplicate-tab");
    expect(read.mock.calls.filter(([key]) => String(key).includes("recovery"))).toEqual([]);
  } finally {
    read.mockRestore();
    window.sessionStorage.clear();
  }
});

test("a document identity the root no longer carries is reported as a mismatch", async () => {
  document.documentElement.setAttribute("documentid", "doc-A");
  const recovery = recoveryWith();
  const entries = recovery.register({ channel: "notes" });
  entries.stage({ key: "n1", payload: { body: "one" } });
  expect((await entries.flush()).ok).toBe(true);

  const [record] = (await entries.list()).records;
  expect(record.scope.slice(1, 3)).toEqual(["documentid", "doc-A"]);
  expect(recovery.status().identityMismatch).toBe(false);

  document.documentElement.setAttribute("documentid", "doc-B");
  expect(recovery.status().identityMismatch).toBe(true);
  expect((await entries.list()).records.map((stored) => stored.scope)).toEqual([record.scope]);
});

test("draft mode files under the path and asks the host nothing", async () => {
  const asked = jest.fn();
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = asked;
  try {
    document.documentElement.setAttribute("documentid", "host-answered");
    const recovery = recoveryWith({ mode: "draft" });
    const entries = recovery.register({ channel: "notes" });
    entries.stage({ key: "n1", payload: { body: "a visitor's writing" } });
    expect((await entries.flush()).ok).toBe(true);

    const [record] = (await entries.list()).records;
    expect(record.scope[3]).toBe("draft");
    expect(record.scope[1]).toBe("path");
    expect(record.scope[2]).toBe(window.location.pathname);
    expect(asked).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test("registering one channel twice in a page is an error", () => {
  const recovery = recoveryWith();
  recovery.register({ channel: "notes", version: 1 });
  expect(() => recovery.register({ channel: "notes", version: 1 })).toThrow(/already registered/);
});

test("dispose flushes best-effort, releases subscribers and keeps the records", async () => {
  const factory = new IDBFactory();
  const recovery = createRecovery({ indexedDB: factory });
  const entries = recovery.register({ channel: "notes" });
  const seen = [];
  entries.subscribe((detail) => seen.push(detail));
  entries.stage({ key: "n1", payload: { body: "one" } });
  expect(seen).toHaveLength(1);

  expect((await entries.dispose()).ok).toBe(true);
  entries.stage({ key: "n2", payload: { body: "after dispose" } });
  expect(seen).toHaveLength(1);

  const reopened = createRecovery({ indexedDB: factory }).register({ channel: "notes" });
  const records = (await reopened.list()).records;
  expect(records.map((record) => record.payload.body)).toEqual(["one"]);
});
