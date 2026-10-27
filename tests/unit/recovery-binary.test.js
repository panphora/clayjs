// Scenario: the page channel of the shared recovery store.
//
// A Document journals its Yjs updates as bytes, and those bytes are the only copy of
// work the browser has not saved. So an append is durable only when its transaction
// commits, a refusal keeps exactly the bytes it refused, two tabs never erase each
// other, and a write that arrives after a checkpoint or a compaction can put nothing
// back. The store never learns what the bytes mean: the merge here is a
// concatenation, standing in for the adapter's Y.mergeUpdatesV2.

import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";
import { createStore } from "../../src/recovery/store.js";
import { createRecovery } from "../../src/core/recovery.js";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const CHANNEL = "page.yjs";
const KEY = "doc-1";
const CONTEXT = {
  authority: { host: "https://example.test", documentId: "doc-1", principalId: "acct-1" },
  lineage: { generation: "gen-1", baseDigest: "a".repeat(64), baseVector: [1, 2] },
  formatFloor: 1,
};

const bytes = (...values) => new Uint8Array(values);
const read = (value) => [...(ArrayBuffer.isView(value) ? value : value.payload)];
const written = (records) => records.map(read).join("|");

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// A factory whose writes fail on demand, so quota and an abort mid-transaction are
// refused and then allowed without a browser that is actually full.
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

// The whole library registering at its own version, then this build's channel on top.
function pageChannel({ factory = new IDBFactory(), writerId, ...options } = {}, register = {}) {
  const recovery = createRecovery({ indexedDB: factory, writerId, ...options });
  const channel = recovery.register({
    channel: CHANNEL,
    version: 1,
    merge: concat,
    validateCheckpoint: (proof, records) => records,
    ...register,
  });
  return { factory, recovery, channel };
}

const ofKind = (records, kind) => records.filter((record) => record.kind === kind);
const capsuleOf = (records) => ofKind(records, "binary")[0];
const batchesOf = (records) => ofKind(records, "binary-batch");

test("an append copies its bytes before the caller can change them", async () => {
  const { channel } = pageChannel();
  const update = bytes(1, 2, 3);
  const appending = channel.append({ key: KEY, context: CONTEXT, update });
  update[0] = 99;
  const receipt = await appending;
  update[2] = 88;
  expect(receipt).toMatchObject({ ok: true, revision: 1 });

  const { records } = await channel.list();
  expect(records.length).toBeGreaterThan(0);
  expect(read(batchesOf(records)[0])).toEqual([1, 2, 3]);
});

test("an append resolves only once its transaction has committed, and survives a reopen", async () => {
  const { factory, channel } = pageChannel({ writerId: "w-1" });
  const receipt = await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2, 3), base: bytes(9, 9) });
  expect(receipt).toMatchObject({ ok: true, revision: 1 });

  const listed = (await channel.list()).records;
  expect(listed).toHaveLength(2);
  const elsewhere = createStore({ scope: listed[0].scope, indexedDB: factory });
  const committed = await elsewhere.list();
  expect(committed.ok).toBe(true);
  expect(committed.records).toHaveLength(2);

  await channel.dispose();

  const { channel: reopened } = pageChannel({ factory, writerId: "w-2" });
  const after = (await reopened.list()).records;
  expect(after.length).toBeGreaterThan(0);
  expect(read(capsuleOf(after).payload.base)).toEqual([9, 9]);
  expect(read(batchesOf(after)[0])).toEqual([1, 2, 3]);
});

test("an acknowledgement changes metadata only and keeps every byte", async () => {
  const { channel } = pageChannel();
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(3) });

  const before = (await channel.list()).records;
  expect(before.length).toBeGreaterThan(0);
  expect(before).toHaveLength(3);

  const receipt = await channel.markAcknowledged({
    records: before.map(({ id, revision }) => ({ id, revision })),
    authority: CONTEXT.authority,
    epoch: 7,
    sequence: 42,
  });
  expect(receipt).toEqual({ ok: true, acknowledged: 1 });

  const after = (await channel.list()).records;
  expect(after).toHaveLength(3);
  expect(capsuleOf(after).acknowledged).toEqual({ authority: CONTEXT.authority, epoch: 7, sequence: 42 });
  expect(new Set(batchesOf(after).map(read)).size).toBe(2);
  expect(batchesOf(after).map(read).map(String).sort()).toEqual(["1,2", "3"]);
});

test("a stale id or revision retires, acknowledges and swaps nothing", async () => {
  const { channel } = pageChannel();
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1) });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(2) });

  const records = (await channel.list()).records;
  expect(records.length).toBeGreaterThan(0);
  const [batch] = batchesOf(records);

  expect(await channel.checkpoint({ records: [{ id: batch.id, revision: 999 }], proof: {} })).toEqual({
    ok: true,
    retired: [],
  });
  expect(await channel.checkpoint({ records: [{ id: "no-such-record", revision: 1 }], proof: {} })).toEqual({
    ok: true,
    retired: [],
  });
  expect(await channel.compact({ records: [{ id: batch.id, revision: 999 }] })).toEqual({ ok: true, retired: [] });
  expect(
    await channel.markAcknowledged({ records: [{ id: capsuleOf(records).id, revision: 999 }], epoch: 1, sequence: 1 })
  ).toEqual({ ok: true, acknowledged: 0 });

  const kept = (await channel.list()).records;
  expect(kept).toHaveLength(records.length);
  expect(capsuleOf(kept).acknowledged).toBeNull();
  expect(written(batchesOf(kept).sort((a, b) => a.revision - b.revision))).toBe("1|2");
});

test("two writers cannot erase each other", async () => {
  const factory = new IDBFactory();
  const { channel: first } = pageChannel({ factory, writerId: "w-a" });
  const { channel: second } = pageChannel({ factory, writerId: "w-b" });
  await first.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  await second.append({ key: KEY, context: CONTEXT, update: bytes(3, 4) });

  const all = (await first.list()).records;
  expect(all).toHaveLength(4);
  const observed = all.map(({ id, revision }) => ({ id, revision }));

  const retired = await first.checkpoint({ records: observed, proof: {} });
  expect(retired.ok).toBe(true);
  expect(retired.retired).toHaveLength(2);

  const left = (await first.list()).records;
  expect(left.length).toBeGreaterThan(0);
  expect(new Set(left.map((record) => record.writerId))).toEqual(new Set(["w-b"]));
  expect(written(batchesOf(left))).toBe("3,4");

  const mine = batchesOf(all).filter((record) => record.writerId === "w-b");
  const swapped = await first.compact({ records: mine.map(({ id, revision }) => ({ id, revision })) });
  expect(swapped.ok).toBe(true);
  expect(swapped.retired).toHaveLength(1);
  const capsule = capsuleOf((await first.list()).records);
  expect(read(capsule.payload.owned).includes(3)).toBe(true);
});

test("a quota error keeps the originals, the accounting and the bytes", async () => {
  const factory = new IDBFactory();
  let armed = false;
  const flaky = guardedFactory(factory, () =>
    armed ? new DOMException("The quota has been exceeded.", "QuotaExceededError") : null
  );
  const { recovery, channel } = pageChannel({ factory: flaky, writerId: "w-1" });

  expect((await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) })).ok).toBe(true);
  const before = recovery.status().usage.scopeBytes;

  armed = true;
  const refused = await channel.append({ key: KEY, context: CONTEXT, update: bytes(3, 4) });
  armed = false;
  expect(refused).toEqual({ ok: false, code: "quota" });

  const kept = (await channel.list()).records;
  expect(kept.length).toBeGreaterThan(0);
  expect(kept).toHaveLength(2);
  expect(written(batchesOf(kept))).toBe("1,2");
  expect(recovery.status().usage.scopeBytes).toBe(before);

  expect((await channel.flush()).ok).toBe(true);
  const stored = (await channel.list()).records;
  expect(stored).toHaveLength(3);
  expect(written(batchesOf(stored).sort((a, b) => a.revision - b.revision))).toBe("1,2|3,4");
});

test("an abort in the middle of a compaction keeps the originals and the accounting", async () => {
  const factory = new IDBFactory();
  let armed = false;
  const guarded = guardedFactory(factory, () => (armed ? new DOMException("aborted", "AbortError") : null));
  const { recovery, channel } = pageChannel({ factory: guarded, writerId: "w-1" });

  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(3, 4) });

  const before = (await channel.list()).records;
  expect(before.length).toBeGreaterThan(0);
  expect(batchesOf(before)).toHaveLength(2);
  const usage = recovery.status().usage.scopeBytes;

  armed = true;
  const refused = await channel.compact({ records: before.map(({ id, revision }) => ({ id, revision })) });
  armed = false;
  expect(refused).toEqual({ ok: false, code: "aborted", retired: [] });

  const kept = (await channel.list()).records;
  expect(kept.length).toBeGreaterThan(0);
  expect(kept).toHaveLength(3);
  expect(batchesOf(kept)).toHaveLength(2);
  expect(written(batchesOf(kept).sort((a, b) => a.revision - b.revision))).toBe("1,2|3,4");
  expect(read(capsuleOf(kept).payload.owned)).toEqual([]);
  expect(recovery.status().usage.scopeBytes).toBe(usage);

  expect((await channel.compact({ records: before.map(({ id, revision }) => ({ id, revision })) })).ok).toBe(true);
  const compacted = (await channel.list()).records;
  expect(compacted.length).toBeGreaterThan(0);
  expect(batchesOf(compacted)).toHaveLength(0);
  expect(read(capsuleOf(compacted).payload.owned)).toEqual([1, 2, 3, 4]);
});

test("a late append cannot resurrect a checkpointed revision", async () => {
  const { factory, channel } = pageChannel({ writerId: "w-1" });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(3, 4) });

  const records = (await channel.list()).records;
  expect(records.length).toBeGreaterThan(0);
  const [stale] = batchesOf(records).sort((a, b) => a.revision - b.revision);

  const retired = await channel.checkpoint({ records: [{ id: stale.id, revision: stale.revision }], proof: {} });
  expect(retired.retired).toHaveLength(1);

  const left = (await channel.list()).records;
  expect(left.length).toBeGreaterThan(0);
  expect(left.some((record) => JSON.stringify(record.id) === JSON.stringify(stale.id))).toBe(false);

  const store = createStore({ scope: records[0].scope, indexedDB: factory });
  const late = await store.appendBinary(stale, null);
  expect(late).toMatchObject({ ok: true, skipped: true });

  const after = (await channel.list()).records;
  expect(after).toHaveLength(left.length);
  expect(after.some((record) => JSON.stringify(record.id) === JSON.stringify(stale.id))).toBe(false);
});

test("a late append cannot resurrect a compacted revision", async () => {
  const { factory, channel } = pageChannel({ writerId: "w-1" });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  await channel.append({ key: KEY, context: CONTEXT, update: bytes(3, 4) });

  const records = (await channel.list()).records;
  expect(records.length).toBeGreaterThan(0);
  const [merged] = batchesOf(records).sort((a, b) => a.revision - b.revision);

  const swapped = await channel.compact({ records: records.map(({ id, revision }) => ({ id, revision })) });
  expect(swapped.ok).toBe(true);
  expect(swapped.retired).toHaveLength(2);

  const left = (await channel.list()).records;
  expect(left.length).toBeGreaterThan(0);
  expect(left.some((record) => JSON.stringify(record.id) === JSON.stringify(merged.id))).toBe(false);

  const store = createStore({ scope: records[0].scope, indexedDB: factory });
  const late = await store.appendBinary(merged, null);
  expect(late).toMatchObject({ ok: true, skipped: true });

  const after = (await channel.list()).records;
  expect(after).toHaveLength(left.length);
  expect(read(capsuleOf(after).payload.owned)).toEqual([1, 2, 3, 4]);
});

test("an append that races a compaction survives it", async () => {
  const factory = new IDBFactory();
  let channel = null;
  let raced = null;
  const merging = async (parts) => {
    if (!raced) raced = await channel.append({ key: KEY, context: CONTEXT, update: bytes(7, 7) });
    return concat(parts);
  };
  ({ channel } = pageChannel({ factory, writerId: "w-1" }, { merge: merging }));

  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  const records = (await channel.list()).records;
  expect(records.length).toBeGreaterThan(0);
  const [merged] = batchesOf(records);

  const swapped = await channel.compact({ records: [{ id: merged.id, revision: merged.revision }] });
  expect(raced.ok).toBe(true);
  expect(swapped.ok).toBe(true);
  expect(swapped.retired).toHaveLength(1);

  const after = (await channel.list()).records;
  expect(after.length).toBeGreaterThan(0);
  expect(batchesOf(after)).toHaveLength(1);
  expect(read(batchesOf(after)[0])).toEqual([7, 7]);
  expect(read(capsuleOf(after).payload.owned)).toEqual([1, 2]);
});

test("a replacement that lost the head retries from the new head", async () => {
  const factory = new IDBFactory();
  let channel = null;
  let bumped = false;
  const merging = async (parts) => {
    if (!bumped) {
      bumped = true;
      const records = (await channel.list()).records;
      const head = capsuleOf(records);
      const other = createStore({ scope: head.scope, indexedDB: factory });
      // Another compaction wins the head while this merge is still being computed.
      await other.compactBinary({
        channel: CHANNEL,
        version: 1,
        capsuleId: head.id,
        expectedRevision: head.revision,
        replacement: { revision: head.revision + 1, updated: 2, payload: head.payload },
        inputs: [],
      });
    }
    return concat(parts);
  };
  ({ channel } = pageChannel({ factory, writerId: "w-1" }, { merge: merging }));

  await channel.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) });
  const records = (await channel.list()).records;
  expect(records.length).toBeGreaterThan(0);
  const [batch] = batchesOf(records);

  const swapped = await channel.compact({ records: [{ id: batch.id, revision: batch.revision }] });
  expect(swapped.ok).toBe(true);
  expect(swapped.retired).toHaveLength(1);

  const after = (await channel.list()).records;
  expect(after.length).toBeGreaterThan(0);
  expect(batchesOf(after)).toHaveLength(0);
  expect(read(capsuleOf(after).payload.owned)).toEqual([1, 2]);
});

test("a channel version this build does not know is listed and left untouched", async () => {
  const factory = new IDBFactory();
  const { channel: later } = pageChannel({ factory, writerId: "w-later" }, { version: 7 });
  expect((await later.append({ key: KEY, context: CONTEXT, update: bytes(1, 2) })).ok).toBe(true);

  const { channel: current } = pageChannel({ factory, writerId: "w-later" });
  const listed = (await current.list()).records;
  expect(listed.length).toBeGreaterThan(0);
  expect(listed).toHaveLength(2);
  expect(listed.every((record) => record.supported === false)).toBe(true);

  expect((await current.append({ key: KEY, context: CONTEXT, update: bytes(3) })).ok).toBe(false);
  const refused = await current.append({ key: KEY, context: CONTEXT, update: bytes(3) });
  expect(refused).toEqual({ ok: false, code: "unknown-version" });

  const [batch] = batchesOf(listed);
  const swapped = await current.compact({ records: [{ id: batch.id, revision: batch.revision }] });
  expect(swapped).toEqual({ ok: false, code: "unknown-version", retired: [] });
  expect(await current.checkpoint({ records: [{ id: batch.id, revision: batch.revision }], proof: {} })).toEqual({
    ok: true,
    retired: [],
  });

  const after = (await current.list()).records;
  expect(after).toHaveLength(listed.length);
  expect(written(batchesOf(after))).toBe("1,2");
});
