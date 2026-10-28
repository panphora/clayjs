// Scenario: typing after a save survives a crash.
//
// An accepted save retires the batches it covers. The typing that follows was built on
// them, so the journal has to move its capsule onto the saved state: otherwise the
// capsule rebuilds from a base that no longer holds what the later batches need, and its
// lineage names a page the tab will never reopen on.

import { webcrypto } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";
import { createRecovery } from "../../../src/core/recovery.js";
import { createStore } from "../../../src/live/store.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { createYPageBinding } from "../../../src/page/ybind/binding.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { canonicalPageBytes, pageProof, digestHex } from "../../../src/page/ybind/recovery-proof.js";
import {
  capsulesOf,
  createPageJournal,
  pageChannel,
  pageJournalContext,
  reconstructPage,
  replayJournals,
} from "../../../src/page/ybind/recovery-replay.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const AUTHORITY = { host: "https://fixture.test", documentId: "doc-1", principalId: "acct-1" };
const KEY = `${AUTHORITY.host}:${AUTHORITY.documentId}`;
// fake-indexeddb clones a Uint8Array into another realm, where the store's own
// comparison cannot read it as one; a plain array compares the same way in every realm.
const contextFor = async (base) => {
  const context = await pageJournalContext({ authority: AUTHORITY, base });
  return { ...context, lineage: { ...context.lineage, baseVector: [...context.lineage.baseVector] } };
};

// The same realm problem for what the store hands back: bytes read from fake-indexeddb
// are brought into this realm before the journal's code reads them.
const here = (bytes) => (ArrayBuffer.isView(bytes) ? new Uint8Array(bytes) : bytes);
const inRealm = (records) =>
  records.map((record) => ({
    ...record,
    payload: ArrayBuffer.isView(record.payload)
      ? here(record.payload)
      : Object.fromEntries(Object.entries(record.payload ?? {}).map(([name, bytes]) => [name, here(bytes)])),
  }));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settled = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

const textOf = (value) => {
  const blocks = blocksFromYValue(value);
  return Object.keys(blocks).sort().map((id) => blocks[id].c ?? "").join("|");
};

function openTab({ factory, writerId, value, clientID }) {
  const recovery = createRecovery({ indexedDB: factory, writerId });
  const channel = pageChannel(recovery);
  const store = createStore({ name: "page", value });
  const journal = createPageJournal({ channel, key: KEY, context: contextFor, base: canonicalPageBytes(value) });
  const binding = createYPageBinding({
    store,
    setTimer: (fn) => { setTimeout(fn, 0); return 1; },
    clearTimer: (id) => clearTimeout(id),
    journal,
  });
  binding.ydoc.clientID = clientID;
  return { recovery, channel, store, journal, binding };
}

// What page.js does with an accepted save: prove it, retire what it covers, rebase.
async function save(tab) {
  const state = tab.store.value;
  const accepted = await tab.journal.context();
  const records = tab.journal.records();
  const proof = await pageProof({
    capture: "1",
    records,
    accepted,
    article: "<p>saved</p>",
    state,
    receipt: { file: "etag-1", pageState: await digestHex(canonicalPageBytes(state)) },
  });
  const answer = await tab.channel.checkpoint({ records, proof });
  expect(answer.ok).toBe(true);
  expect(answer.retired.length).toBeGreaterThan(0);
  tab.journal.retire(answer.retired);
  expect(tab.journal.records()).toEqual([]);
  await tab.journal.rebase?.(canonicalPageBytes(proof.state));
  return proof.state;
}

test.each([1, 3])("typing after %i saves is replayed into the page the last save left", async (saves) => {
  const factory = new IDBFactory();
  const value = { v: 1, g: 0, y: { ...seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]).y } };
  const tab = openTab({ factory, writerId: "w-1", value, clientID: 5 });
  await tab.journal.context();

  let saved = null;
  for (let i = 0; i < saves; i++) {
    tab.binding.ydoc.getText("flow").insert(2, "abc");
    await settled();
    saved = await save(tab);
  }

  tab.binding.ydoc.getText("flow").insert(4, "XYZ");
  await settled();
  const typed = textOf(tab.store.value);
  expect(typed).not.toBe(textOf(saved));

  // The tab dies here. Another one opens on the saved file and reads the journal.
  const listed = inRealm((await tab.channel.list()).records);
  const [entry] = capsulesOf(listed);
  expect(() => reconstructPage(entry)).not.toThrow();

  const next = openTab({ factory, writerId: "w-2", value: saved, clientID: 6 });
  const context = await next.journal.context();
  const outcome = replayJournals({ records: listed, current: { context, state: next.store.value }, into: next.binding.ydoc });
  expect(outcome.review).toEqual([]);
  expect(outcome.replayed).toHaveLength(1);
  next.binding.provider.settle();
  await settled();
  expect(textOf(next.store.value)).toBe(typed);

  tab.binding.dispose();
  next.binding.dispose();
});
