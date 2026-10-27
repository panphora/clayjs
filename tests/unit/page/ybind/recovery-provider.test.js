// Scenario: a Document journals every local edit before anything can lose it.
//
// The journal is installed before the editor is enabled and ahead of every guard that
// stops this tab from offering its work: a disconnected tab, a refused oversize update,
// a lost room and a refused write all still leave the keystroke on this device. A crash
// (the environment destroyed without a dispose) replays into the same authority and
// generation, a changed one goes to review instead of being merged, and only records a
// checkpoint proves are retired or compacted.

import { webcrypto } from "node:crypto";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";
import { createYPageBinding } from "../../../../src/page/ybind/binding.js";
import { docFromValue } from "../../../../src/page/ybind/provider.js";
import { canonicalPageBytes } from "../../../../src/page/ybind/recovery-proof.js";
import {
  COMPACT_BATCHES,
  createPageJournal,
  journalBase,
  openPageJournal,
  pageAuthority,
  pageJournalContext,
  replayInto,
  replayJournals,
} from "../../../../src/page/ybind/recovery-replay.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const AUTHORITY = { host: "https://fixture.test", documentId: "doc-1", principalId: "acct-1" };
const SEED = seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);
const valueOf = () => ({ v: 1, g: 0, y: { ...SEED.y } });
const textOf = (value) => {
  const doc = docFromValue(value);
  const text = doc.getText("flow").toString();
  doc.destroy();
  return text;
};

// One recovery store, as much of it as a journal touches: appends commit or refuse on
// demand, compaction folds named batches into their capsule, and nothing is retired that
// the caller did not name.
function fakeStore({ writer = "w-1", records = new Map() } = {}) {

  const appends = [];
  const compactions = [];
  const acknowledgements = [];
  const state = { fail: null, appendGate: null, compactGate: null };
  let seq = 0;

  const retire = (named) => {
    for (const item of named || []) records.delete(item?.id);
    return named || [];
  };

  const store = {
    channel: "page.yjs",
    version: 1,
    writer,
    records,
    appends,
    compactions,
    acknowledgements,
    state,
    batches: () => [...records.values()].filter((record) => record.kind === "binary-batch"),
    capsules: () => [...records.values()].filter((record) => record.kind === "binary"),
    async append({ key, context, update, origin = "local", base = null }) {
      const id = `${writer}-${++seq}`;
      const revision = seq;
      const capsuleId = `capsule:${writer}:${key}`;
      appends.push({ id, revision, origin, context, update: update.slice(), base: base && base.slice() });
      if (state.appendGate) await state.appendGate;
      if (state.fail) {
        const code = state.fail;
        state.fail = null;
        return { ok: false, code };
      }
      if (!records.has(capsuleId)) {
        records.set(capsuleId, {
          id: capsuleId,
          kind: "binary",
          revision: 0,
          context,
          payload: { base: base ? base.slice() : new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) },
        });
      }
      records.set(id, { id, kind: "binary-batch", revision, capsuleId, origin, context, payload: update.slice() });
      return { ok: true, id, revision };
    },
    async list() {
      return { ok: true, records: [...records.values()] };
    },
    async checkpoint({ records: named = [] } = {}) {
      return { ok: true, retired: retire(named) };
    },
    async compact({ records: named = [] } = {}) {
      compactions.push(named);
      if (state.compactGate) await state.compactGate;
      const batches = named.map(({ id }) => records.get(id)).filter(Boolean);
      const capsule = batches.length ? records.get(batches[0].capsuleId) : null;
      if (capsule) {
        const owned = [capsule.payload.owned, ...batches.filter((batch) => batch.origin !== "dependency").map((batch) => batch.payload)]
          .filter((bytes) => bytes && bytes.byteLength);
        const dependencies = [capsule.payload.dependencies, ...batches.filter((batch) => batch.origin === "dependency").map((batch) => batch.payload)]
          .filter((bytes) => bytes && bytes.byteLength);
        capsule.payload = {
          base: capsule.payload.base,
          dependencies: dependencies.length ? Y.mergeUpdatesV2(dependencies) : new Uint8Array(0),
          owned: owned.length ? Y.mergeUpdatesV2(owned) : new Uint8Array(0),
        };
      }
      return { ok: true, retired: retire(named) };
    },
    async markAcknowledged({ records: named = [], authority = null } = {}) {
      acknowledgements.push({ records: named, authority });
      return { ok: true, acknowledged: named.length };
    },
    async flush() {
      return { ok: true };
    },
  };
  return store;
}

const gate = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function openTab({ channel, value = valueOf(), generation = null, authority = AUTHORITY, clientID = 5 } = {}) {
  const store = createStore({ name: "page", value });
  const binding = createYPageBinding({
    store,
    setTimer: (fn) => { setTimeout(fn, 0); return 1; },
    clearTimer: (id) => clearTimeout(id),
    journal: createPageJournal({
      channel,
      key: `${authority.host}:${authority.documentId}`,
      context: (base) => pageJournalContext({ authority, generation, base }),
      base: canonicalPageBytes(value),
    }),
  });
  binding.ydoc.clientID = clientID;
  const ready = async () => {
    const context = await binding.journal.context();
    await tick();
    return context;
  };
  const settled = async () => {
    for (let i = 0; i < 4; i++) await tick();
  };
  return { store, binding, channel, ready, settled };
}

const replay = async (tab, { context } = {}) => {
  const resolved = context ?? (await tab.binding.journal.context());
  const listed = await tab.channel.list();
  const outcome = replayJournals({
    records: listed.records,
    current: { context: resolved, state: tab.store.value },
    into: tab.binding.ydoc,
  });
  if (outcome.replayed.length) tab.binding.provider.settle();
  await tab.settled();
  return outcome;
};

test("input while disconnected and after an oversize refusal is journaled", async () => {
  const channel = fakeStore();
  const tab = openTab({ channel });
  await tab.ready();

  tab.binding.ydoc.getText("flow").insert(2, "x");
  await tab.settled();
  expect(channel.appends.length).toBe(1);
  expect(channel.appends[0].origin).toBe("local");
  expect(channel.batches()).toHaveLength(1);

  tab.store.deliver({ phase: "refused", code: "too-large" });
  expect(tab.binding.provider.stopped).toBe("too-large");
  expect(Object.keys(tab.store.value.y).filter((key) => key[0] === "u")).toEqual([]);

  tab.binding.ydoc.getText("flow").insert(3, "y");
  await tab.settled();
  expect(channel.appends.length).toBe(2);
  expect(channel.appends[1].origin).toBe("local");
  expect(channel.batches()).toHaveLength(2);
  tab.binding.dispose();
});

test("a crash after a committed append restores the text on a same-authority reopen", async () => {
  const channel = fakeStore({ writer: "w-1" });
  const first = openTab({ channel, clientID: 5 });
  await first.ready();
  first.binding.ydoc.getText("flow").insert(2, "abc");
  const typed = first.binding.ydoc.getText("flow").toString();
  await first.settled();
  expect(channel.batches()).toHaveLength(1);

  // The environment is destroyed without a dispose: nothing is offered, nothing is saved.
  const reopened = fakeStore({ writer: "w-2", records: channel.records });
  const second = openTab({ channel: reopened, clientID: 6 });
  await second.ready();

  const outcome = await replay(second);
  expect(outcome.review).toEqual([]);
  expect(outcome.replayed).toHaveLength(1);
  expect(second.binding.ydoc.getText("flow").toString()).toBe(typed);
  second.binding.dispose();
});

test("a changed authority or generation goes to review and is never merged", async () => {
  const channel = fakeStore({ writer: "w-1" });
  const first = openTab({ channel });
  await first.ready();
  first.binding.ydoc.getText("flow").insert(2, "abc");
  await first.settled();
  const before = first.store.value;

  const otherDocument = openTab({
    channel,
    clientID: 6,
    authority: { ...AUTHORITY, documentId: "doc-2" },
  });
  await otherDocument.ready();
  const foreign = await replay(otherDocument);
  expect(foreign.replayed).toEqual([]);
  expect(foreign.review.map((entry) => entry.code)).toEqual(["foreign-authority"]);
  expect(otherDocument.binding.ydoc.getText("flow").toString()).toBe(textOf(valueOf()));
  expect(textOf(before)).not.toBe(textOf(valueOf()));

  const otherGeneration = openTab({ channel, clientID: 7, generation: "generation-2" });
  await otherGeneration.ready();
  const stale = await replay(otherGeneration);
  expect(stale.replayed).toEqual([]);
  expect(stale.review.map((entry) => entry.code)).toEqual(["foreign-generation"]);
  otherDocument.binding.dispose();
  otherGeneration.binding.dispose();
  first.binding.dispose();
});

test("two tabs keep each other's journaled work", async () => {
  const records = new Map();
  const a = fakeStore({ writer: "w-a", records });
  const b = fakeStore({ writer: "w-b", records });
  const tabA = openTab({ channel: a, clientID: 5 });
  const tabB = openTab({ channel: b, clientID: 6 });
  await Promise.all([tabA.ready(), tabB.ready()]);
  tabA.binding.ydoc.getText("flow").insert(2, "A");
  tabB.binding.ydoc.getText("flow").insert(3, "B");
  await Promise.all([tabA.settled(), tabB.settled()]);

  expect(tabA.binding.journal.names()).toHaveLength(1);
  expect(tabB.binding.journal.names()).toHaveLength(1);
  expect(tabA.binding.journal.names()[0].id).not.toBe(tabB.binding.journal.names()[0].id);

  await tabA.binding.journal.compact();
  expect(a.compactions).toHaveLength(1);
  expect(b.batches()).toHaveLength(1);
  expect(tabB.binding.journal.names()).toHaveLength(1);
  tabA.binding.dispose();
  tabB.binding.dispose();
});

test("an acknowledgement keeps every byte and a lost room retires nothing", async () => {
  const channel = fakeStore();
  const tab = openTab({ channel });
  await tab.ready();
  tab.binding.ydoc.getText("flow").insert(2, "x");
  await tab.settled();
  const names = tab.binding.journal.names();
  expect(names).toHaveLength(1);

  await tab.binding.journal.acknowledged();
  expect(channel.acknowledgements).toHaveLength(1);
  expect(channel.acknowledgements[0].records).toEqual(names);
  expect(channel.acknowledgements[0].authority).toEqual(AUTHORITY);
  expect(channel.records.size).toBe(2);

  tab.store.deliver({ phase: "refused", code: "too-large" });
  tab.binding.ydoc.getText("flow").insert(3, "y");
  await tab.settled();
  expect(channel.records.size).toBe(3);
  expect(tab.binding.journal.names()).toHaveLength(2);
  tab.binding.dispose();
});

test("storage full keeps the model and the bytes, and the next write resumes", async () => {
  const channel = fakeStore();
  const tab = openTab({ channel });
  await tab.ready();
  channel.state.fail = "over-budget";
  tab.binding.ydoc.getText("flow").insert(2, "x");
  const typed = tab.binding.ydoc.getText("flow").toString();
  await tab.settled();

  expect(tab.binding.journal.failure).toBe("over-budget");
  expect(tab.binding.journal.pending()).toBeGreaterThan(0);
  expect(channel.batches()).toHaveLength(0);
  expect(tab.binding.ydoc.getText("flow").toString()).toBe(typed);
  expect(Object.keys(tab.store.value.y).filter((key) => key[0] === "u")).toHaveLength(1);

  tab.binding.ydoc.getText("flow").insert(3, "y");
  await tab.settled();
  expect(tab.binding.journal.failure).toBe(null);
  expect(tab.binding.journal.pending()).toBe(0);
  expect(tab.binding.journal.names()).toHaveLength(1);
  tab.binding.dispose();
});

test("compaction racing an append and a checkpoint retires only what it named", async () => {
  const channel = fakeStore();
  const tab = openTab({ channel });
  await tab.ready();

  const slow = gate();
  channel.state.appendGate = slow.promise;
  for (let i = 0; i < COMPACT_BATCHES - 1; i++) tab.binding.ydoc.getText("flow").insert(2 + i, "x");
  const last = tab.binding.ydoc.getText("flow").insert(2 + COMPACT_BATCHES, "z");
  await tick();
  expect(last).toBeUndefined();
  expect(channel.compactions).toHaveLength(0);

  // The last append commits, which crosses the threshold; a further edit arrives while
  // the compaction is still swapping.
  const swapping = gate();
  channel.state.compactGate = swapping.promise;
  channel.state.appendGate = null;
  slow.release();
  await tick();
  expect(channel.compactions).toHaveLength(1);
  const named = channel.compactions[0].map((entry) => entry.id);
  expect(named).toHaveLength(COMPACT_BATCHES);

  tab.binding.ydoc.getText("flow").insert(2, "w");
  await tick();
  const later = tab.binding.journal.names().filter((entry) => !named.includes(entry.id));
  expect(later.length).toBeGreaterThan(0);
  // A checkpoint that retires one of those named records is not undone by the swap.
  const retired = tab.binding.journal.names()[0];
  tab.binding.journal.retire([retired]);
  swapping.release();
  await tab.settled();

  expect(channel.compactions[0].map((entry) => entry.id)).not.toContain(later[0].id);
  expect(tab.binding.journal.names().map((entry) => entry.id)).not.toContain(retired.id);
  expect(tab.binding.journal.names().map((entry) => entry.id)).toContain(later[0].id);
  expect(channel.batches()).toHaveLength(later.length);
  tab.binding.dispose();
});

test("a recovered page is offered to the room without new recovery records", async () => {
  const channel = fakeStore({ writer: "w-1" });
  const first = openTab({ channel, clientID: 5 });
  await first.ready();
  first.binding.ydoc.getText("flow").insert(2, "abc");
  const typed = first.binding.ydoc.getText("flow").toString();
  await first.settled();

  const reopened = fakeStore({ writer: "w-2", records: channel.records });
  const second = openTab({ channel: reopened, clientID: 6 });
  await second.ready();
  expect(Object.keys(second.store.value.y).filter((key) => key[0] === "u")).toHaveLength(0);
  const outcome = await replay(second);

  expect(outcome.replayed).toHaveLength(1);
  expect(reopened.appends).toHaveLength(0);
  expect(second.binding.journal.records()).toEqual([]);
  // Offered to the room like any other edit, under a key this tab wrote.
  expect(Object.keys(second.store.value.y).filter((key) => key[0] === "u")).toHaveLength(1);
  expect(textOf(second.store.value)).toBe(typed);
  second.binding.dispose();
  first.binding.dispose();
});

test("remote-only traffic and post-dispose updates create no owned work", async () => {
  const channel = fakeStore();
  const tab = openTab({ channel });
  await tab.ready();

  const peer = new Y.Doc();
  peer.clientID = 9;
  let update;
  peer.on("updateV2", (bytes) => { update = bytes; });
  peer.getText("flow").insert(2, "peer");
  const value = { v: 1, g: 0, y: { ...SEED.y, "u9-0": Y.toBase64(update) } };
  const frame = { ops: [{ op: "set", path: ["y", "u9-0"], value: Y.toBase64(update) }] };
  tab.store.rebase(value, { source: "remote", frame });
  await tab.settled();
  expect(tab.binding.ydoc.getText("flow").toString()).toContain("peer");
  expect(channel.appends).toHaveLength(0);
  expect(tab.binding.journal.records()).toEqual([]);

  tab.binding.dispose();
  tab.binding.ydoc.getText("flow").insert(2, "late");
  await tab.settled();
  expect(channel.appends).toHaveLength(0);
  expect(tab.binding.journal.records()).toEqual([]);
});

test("view, edit, view, edit keeps one journal observer", async () => {
  const channel = fakeStore();
  const first = openTab({ channel });
  await first.ready();
  first.binding.ydoc.getText("flow").insert(2, "x");
  await first.settled();
  expect(channel.appends).toHaveLength(1);
  first.binding.dispose();

  const second = openTab({ channel, clientID: 6 });
  await second.ready();
  second.binding.ydoc.getText("flow").insert(3, "y");
  await second.settled();
  expect(channel.appends).toHaveLength(2);
  expect(second.binding.journal.names()).toHaveLength(1);
  second.binding.dispose();
});

test("the authority is pinned from host metadata, never from a guess", () => {
  expect(pageAuthority({ meta: { document: {} }, location: { origin: "https://host.test", pathname: "/doc" }, root: null })).toEqual({
    host: "https://host.test",
    documentId: "/doc",
    principalId: "/doc",
    scope: "path",
  });
  expect(
    pageAuthority({
      meta: { document: { people: { me: { id: "person-1" } } } },
      location: { origin: "https://host.test", pathname: "/doc" },
      root: null,
    }),
  ).toEqual({ host: "https://host.test", documentId: "/doc", principalId: "person-1", scope: "path" });
  // A host that names people but cannot say who this is has no principal: no journal.
  expect(
    pageAuthority({ meta: { document: { people: { me: null } } }, location: { origin: "https://host.test", pathname: "/doc" }, root: null }),
  ).toBe(null);
  expect(pageAuthority({ meta: { document: {} }, location: null, root: null })).toBe(null);
});

test("the page opens its journal from the host answer, once per service", async () => {
  const registrations = [];
  const service = {
    register(spec) {
      registrations.push(spec);
      return fakeStore({ writer: `w-${registrations.length}` });
    },
  };
  const meta = { extensions: [], document: { people: { me: { id: "person-1" } } } };
  const where = { origin: "https://host.test", pathname: "/doc" };
  const base = journalBase(valueOf());

  expect(openPageJournal({ meta, service: null, base, location: where, root: null })).toBe(null);
  expect(openPageJournal({ meta: { document: { people: {} } }, service, base, location: where, root: null })).toBe(null);
  expect(registrations).toHaveLength(0);

  const journal = openPageJournal({ meta, service, base, location: where, root: null });
  const again = openPageJournal({ meta, service, base, location: where, root: null });
  expect(registrations).toHaveLength(1);
  expect(registrations[0]).toMatchObject({ channel: "page.yjs", version: 1 });
  expect(journal.channel).toBe(again.channel);
  expect(journal.key).toBe("https://host.test:/doc");
  const context = await journal.context();
  expect(context.authority).toEqual({ host: "https://host.test", documentId: "/doc", principalId: "person-1", scope: "path" });
  expect(context.lineage.generation).toBe(await canonicalDigest(base));
  expect(context.lineage.baseDigest).toBe(await canonicalDigest(base));
});

const canonicalDigest = async (bytes) => {
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};
