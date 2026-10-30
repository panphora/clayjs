// Scenario: the work a Document's journal holds but may not replay.
//
// Step 5 puts a capsule this page may not replay in `inst.recoveryReview` and applies
// nothing of it. This session proves the person still gets it back: the review reads the
// page the capsule reconstructs, offers a download, and recovers it as a copy through the
// page's own document command with fresh block ids — never a blind merge of a changed
// lineage. The source capsule survives until a checkpoint covers the destination, and
// text typed during a composition that never became a transaction is offered as text.

import { webcrypto } from "node:crypto";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { createStore } from "../../../src/live/store.js";
import { seedFrom, seedValue } from "../../../src/page/ybind/seed.js";
import { createYPageBinding } from "../../../src/page/ybind/binding.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { docFromBlocks } from "../../../src/page/model.js";
import { canonicalPageBytes } from "../../../src/page/ybind/recovery-proof.js";
import {
  copyState,
  coversText,
  createPageJournal,
  describeReview,
  imeEntries,
  markerFor,
  openImeShadow,
  pageChannel,
  pageCopyChannel,
  pageImeChannel,
  pageJournalContext,
  reconstructPage,
  recoverAsCopy,
  replayJournals,
} from "../../../src/page/ybind/recovery-replay.js";
import { copyBlocks, createRecoveryReview, insertCopy } from "../../../src/page/recovery-ui.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const AUTHORITY = { host: "https://fixture.test", documentId: "doc-1", principalId: "acct-1" };

const valueOf = (blocks) => ({ v: 1, g: 0, y: { ...seedValue(blocks).y } });
const world = () => valueOf([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);

const orderedIds = (blocks) =>
  Object.keys(blocks).sort((a, b) => (blocks[a].pos < blocks[b].pos ? -1 : blocks[a].pos > blocks[b].pos ? 1 : 0));

// The page's own text, block by block, read back through the strict decoder.
const textOfValue = (value) => {
  const blocks = blocksFromYValue(value);
  return orderedIds(blocks).map((id) => blocks[id].c ?? "").join("|");
};

// One recovery service, as much of it as this step touches: text records staged and
// dismissed at their own revision, and the binary batches a page journals.
const keyOf = (id) => (Array.isArray(id) ? JSON.stringify(id) : String(id));

function fakeService({ writer = "w-1", records = new Map() } = {}) {
  const state = { fail: null, appendGate: null };
  let seq = 0;

  // Text records are keyed by channel, key and writer, as the store keys them: staging
  // the same block twice replaces its shadow rather than keeping two.
  const put = (record) => records.set(keyOf(record.id), record);
  const get = (id) => records.get(keyOf(id));
  const drop = (id) => records.delete(keyOf(id));

  const retire = (named) => {
    for (const item of named || []) drop(item?.id);
    return named || [];
  };

  const channelFor = (name, version) => ({
    channel: name,
    version,
    stage({ key, kind = "text", payload = null } = {}) {
      const revision = ++seq;
      const id = kind === "text" ? [name, String(key), writer] : `rec-${revision}`;
      put({ id, kind, channel: name, version, writerId: writer, key: String(key), revision, payload });
      return { id, revision };
    },
    async flush() {
      return { ok: true };
    },
    async list() {
      return {
        ok: true,
        records: [...records.values()]
          .filter((record) => record.channel === name)
          .map((record) => ({ ...record, supported: record.version === version })),
      };
    },
    async dismiss(id, { revision } = {}) {
      const record = get(id);
      if (!record) return { ok: true };
      if (revision !== undefined && record.revision !== revision) return { ok: false, code: "stale" };
      drop(id);
      return { ok: true };
    },
    async append({ key, context, update, origin = "local", base = null } = {}) {
      const revision = ++seq;
      const id = `${writer}-${revision}`;
      const capsuleId = `capsule:${writer}:${key}`;
      if (state.appendGate) await state.appendGate;
      if (state.fail) {
        const code = state.fail;
        state.fail = null;
        return { ok: false, code };
      }
      if (!get(capsuleId)) {
        put({
          id: capsuleId,
          kind: "binary",
          channel: name,
          version,
          writerId: writer,
          revision: 0,
          context,
          payload: { base: base ? base.slice() : new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) },
        });
      }
      put({ id, kind: "binary-batch", channel: name, version, writerId: writer, revision, capsuleId, origin, context, payload: update.slice() });
      return { ok: true, id, revision };
    },
    async markAcknowledged() {
      return { ok: true, acknowledged: 0 };
    },
    async checkpoint({ records: named = [] } = {}) {
      return { ok: true, retired: retire(named) };
    },
    async compact({ records: named = [] } = {}) {
      const batches = named.map(({ id }) => get(id)).filter(Boolean);
      const capsule = batches.length ? get(batches[0].capsuleId) : null;
      if (capsule) {
        const owned = [capsule.payload.owned, ...batches.filter((batch) => batch.origin !== "dependency").map((batch) => batch.payload)].filter((bytes) => bytes && bytes.byteLength);
        const dependencies = [capsule.payload.dependencies, ...batches.filter((batch) => batch.origin === "dependency").map((batch) => batch.payload)].filter((bytes) => bytes && bytes.byteLength);
        capsule.payload = {
          base: capsule.payload.base,
          dependencies: dependencies.length ? Y.mergeUpdatesV2(dependencies) : new Uint8Array(0),
          owned: owned.length ? Y.mergeUpdatesV2(owned) : new Uint8Array(0),
        };
      }
      return { ok: true, retired: retire(named) };
    },
    subscribe() {
      return () => {};
    },
    async dispose() {
      return { ok: true };
    },
  });

  return {
    state,
    records,
    register({ channel, version = 1 } = {}) {
      return channelFor(channel, version);
    },
  };
}

const gate = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function openTab({ service, value = world(), generation = null, authority = AUTHORITY, clientID = 5 } = {}) {
  const store = createStore({ name: "page", value });
  const binding = createYPageBinding({
    store,
    setTimer: (fn) => { setTimeout(fn, 0); return 1; },
    clearTimer: (id) => clearTimeout(id),
    journal: createPageJournal({
      channel: pageChannel(service),
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
  return { store, binding, service, ready, settled };
}

const replay = async (tab) => {
  const context = await tab.binding.journal.context();
  const listed = await tab.binding.journal.channel.list();
  const outcome = replayJournals({ records: listed.records, current: { context, state: tab.store.value }, into: tab.binding.ydoc });
  if (outcome.replayed.length) tab.binding.provider.settle();
  for (let i = 0; i < 4; i++) await tick();
  return outcome;
};

// A tab that typed and then died: its work is in the store and nowhere else.
async function crashWith(typed = "abc") {
  const records = new Map();
  const service = fakeService({ writer: "w-1", records });
  const tab = openTab({ service, clientID: 5 });
  await tab.ready();
  tab.binding.ydoc.getText("flow").insert(2, typed);
  await tab.settled();
  expect(tab.binding.journal.records()).toHaveLength(1);
  return { records, text: textOfValue(tab.store.value) };
}

// The editor a copy is inserted into, over the page as it stands.
function fakeView(value) {
  let current = pmState.EditorState.create({ schema, doc: docFromBlocks(schema, blocksFromYValue(value)) });
  return {
    get state() { return current; },
    dispatch(tr) { current = current.apply(tr); },
  };
}

const idsOf = (doc) => {
  const out = [];
  doc.forEach((node) => out.push(node.attrs.id));
  return out;
};

// The page command a copy goes in through, with the fresh ids `copyBlocks` gave it.
const seedOf = (blocks) =>
  copyBlocks(blocks).map((block) => ({
    id: block.id,
    t: block.t,
    text: typeof block.c === "string" ? block.c : "",
    attrs: { parent: block.parent },
  }));

test("same-lineage replay is idempotent", async () => {
  const { records, text } = await crashWith("abc");

  const tab = openTab({ service: fakeService({ writer: "w-2", records }), clientID: 6 });
  await tab.ready();
  const once = await replay(tab);
  expect(once.review).toEqual([]);
  expect(once.replayed).toHaveLength(1);
  expect(textOfValue(tab.store.value)).toBe(text);
  const blocks = idsOf(fakeView(tab.store.value).state.doc);

  // The same records, replayed again into the same page, add nothing: Yjs merges by
  // operation identity, so a second pass is not a second page.
  const twice = await replay(tab);
  expect(twice.replayed).toHaveLength(1);
  expect(textOfValue(tab.store.value)).toBe(text);
  expect(idsOf(fakeView(tab.store.value).state.doc)).toEqual(blocks);
  tab.binding.dispose();
});

test("a foreign document is refused and its work is still readable", async () => {
  const { records, text } = await crashWith("abc");

  const other = openTab({
    service: fakeService({ writer: "w-2", records }),
    clientID: 6,
    authority: { ...AUTHORITY, documentId: "doc-2" },
  });
  await other.ready();
  const outcome = await replay(other);
  expect(outcome.replayed).toEqual([]);
  expect(outcome.review.map((entry) => entry.code)).toEqual(["foreign-authority"]);
  expect(textOfValue(other.store.value)).toBe("hello|world");

  const rows = describeReview(outcome.review);
  expect(rows).toHaveLength(1);
  expect(rows[0].message).toMatch(/another document/);
  expect(rows[0].text).toBe(text.split("|").join("\n"));
  other.binding.dispose();
});

test("a newer external file goes to review instead of being merged", async () => {
  const { records, text } = await crashWith("abc");

  // The host serves a page replaced outside this tab, under its own generation.
  const tab = openTab({
    service: fakeService({ writer: "w-2", records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await tab.ready();
  const outcome = await replay(tab);
  expect(outcome.replayed).toEqual([]);
  expect(outcome.review.map((entry) => entry.code)).toEqual(["foreign-generation"]);
  expect(textOfValue(tab.store.value)).toBe("rewritten elsewhere");

  const rows = describeReview(outcome.review);
  expect(rows[0].text).toBe(text.split("|").join("\n"));
  expect(rows[0].capsule).toBeTruthy();
  tab.binding.dispose();
});

// The copy itself: one reconstructed page, fresh ids, no merge of its operations.
test("Recover as a copy inserts the reviewed page with fresh block ids", async () => {
  const { rows } = await reviewOfCrashedPage();
  const destination = world();
  const view = fakeView(destination);
  const before = idsOf(view.state.doc);

  const blocks = reconstructPage({ capsule: rows[0].capsule, batches: rows[0].batches });
  const inserted = insertCopy(view, blocks);

  expect(inserted.ok).toBe(true);
  const after = idsOf(view.state.doc);
  const added = after.filter((id) => !before.includes(id));
  expect(added).toEqual(inserted.ids);
  expect(added).toHaveLength(Object.keys(blocks).length);
  // Fresh ids: not one of the capsule's own block ids is reused.
  expect(added).not.toContain("p");
  expect(added).not.toContain("q");
  expect(view.state.doc.textContent).toBe(`${textOfValue(destination).split("|").join("")}${rows[0].text.split("\n").join("")}`);
});

// Two tabs offered the same recovery: the first copy names its destination, and the
// second is refused because that destination is still on this device.
test("a copy already made is never made twice", async () => {
  const { rows, crash } = await reviewOfCrashedPage();
  const records = crash.records;
  expect(crash.text).toBe(rows[0].text.split("\n").join("|"));
  const first = openTab({
    service: fakeService({ writer: "w-2", records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  const second = openTab({
    service: fakeService({ writer: "w-3", records }),
    clientID: 7,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await Promise.all([first.ready(), second.ready()]);
  const source = (tab) => ({ key: tab.binding.journal.key, id: rows[0].id, revision: rows[0].revision });

  const copied = await recoverAsCopy({
    channel: first.binding.journal.channel,
    copies: pageCopyChannel(first.service),
    source: source(first),
    insert: insertInto(first, rows[0]),
  });
  expect(copied.ok).toBe(true);
  expect(copied.destination.revision).toBeGreaterThan(0);

  const twice = await recoverAsCopy({
    channel: first.binding.journal.channel,
    copies: pageCopyChannel(first.service),
    source: source(first),
    insert: insertInto(first, rows[0]),
  });
  expect(twice.ok).toBe(false);
  expect(twice.code).toBe("already-copied");

  // Another tab, offered the same recovery, sees the same destination and refuses too.
  const other = await recoverAsCopy({
    channel: second.binding.journal.channel,
    copies: pageCopyChannel(second.service),
    source: source(second),
    insert: insertInto(second, rows[0]),
  });
  expect(other.code).toBe("already-copied");

  // The copy is in the page once, and the source capsule is still there for review.
  expect(textOfValue(first.store.value)).toBe(`rewritten elsewhere|${crash.text}`);
  expect(markerFor({ records: [...records.values()], source: source(first) })).toBeTruthy();
  first.binding.dispose();
  second.binding.dispose();
});

test("a failed destination save keeps the source", async () => {
  const { rows, crash } = await reviewOfCrashedPage();
  const tab = openTab({
    service: fakeService({ writer: "w-2", records: crash.records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await tab.ready();
  tab.service.state.fail = "over-budget";

  const source = { key: tab.binding.journal.key, id: rows[0].id, revision: rows[0].revision };
  const result = await recoverAsCopy({
    channel: tab.binding.journal.channel,
    copies: pageCopyChannel(tab.service),
    source,
    insert: insertInto(tab, rows[0]),
  });

  expect(result.ok).toBe(false);
  expect(result.code).toBe("insert-failed");
  // No marker was written, and the capsule it came from is untouched.
  expect(markerFor({ records: [...crash.records.values()], source })).toBe(null);
  const listed = await tab.binding.journal.channel.list();
  expect(listed.records.some((record) => record.id === source.id)).toBe(true);
  tab.binding.dispose();
});

test("a deleted destination leaves the source in review", async () => {
  const { rows, crash } = await reviewOfCrashedPage();
  const tab = openTab({
    service: fakeService({ writer: "w-2", records: crash.records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await tab.ready();
  const source = { key: tab.binding.journal.key, id: rows[0].id, revision: rows[0].revision };
  const copies = pageCopyChannel(tab.service);
  const channel = tab.binding.journal.channel;

  const copied = await recoverAsCopy({ channel, copies, source, insert: insertInto(tab, rows[0]) });
  expect(copied.ok).toBe(true);
  const marker = markerFor({ records: [...crash.records.values()], source });
  const listed = await channel.list();
  expect(copyState({ marker, records: listed.records })).toBe("copied");

  // The destination is deleted: its journal record is gone, and no checkpoint covered it.
  await channel.dismiss(copied.destination.id, { revision: copied.destination.revision });
  const after = await channel.list();
  expect(copyState({ marker, records: after.records })).toBe("covered");

  const again = await recoverAsCopy({ channel, copies, source, insert: insertInto(tab, rows[0]) });
  expect(again.ok).toBe(false);
  expect(again.code).toBe("covered");
  // Nothing of the source was retired: it is still the only copy of that work.
  expect(after.records.some((record) => record.id === source.id)).toBe(true);
  tab.binding.dispose();
});

test("composition text with no transaction is offered as text", async () => {
  const records = new Map();
  const tab = openTab({ service: fakeService({ writer: "w-1", records }), clientID: 5 });
  await tab.ready();
  // A composition that never became a transaction: the page keeps exactly what it had.
  const shadow = openImeShadow({ channel: pageImeChannel(tab.service), key: tab.binding.journal.key });
  const kept = shadow.keep({ blockId: "p", text: "hello there" });
  expect(kept.revision).toBeGreaterThan(0);
  await tab.settled();

  expect(textOfValue(tab.store.value)).toBe("hello|world");
  expect(tab.binding.journal.records()).toEqual([]);
  const listed = await shadow.channel.list();
  expect(imeEntries(listed.records)).toEqual([{ id: kept.id, revision: kept.revision, blockId: "p", text: "hello there" }]);

  // Composition end without a journaled update carrying that text keeps it.
  const uncleared = await shadow.clear({ blockId: "p", text: "hello there", covered: tab.binding.journal.covers("p", "hello there") });
  expect(uncleared.code).toBe("not-covered");
  expect(imeEntries((await shadow.channel.list()).records)).toHaveLength(1);

  // An update the journal holds, carrying the same text, is what retires it.
  tab.binding.ydoc.getText("flow").insert(6, "!");
  await tab.settled();
  expect(textOfValue(tab.store.value)).toBe("hello!|world");
  expect(tab.binding.journal.covers("p", "hello!")).toBe(true);
  expect(coversText([...records.values()], "p", "hello!")).toBe(true);
  expect(tab.binding.journal.covers("p", "hello there")).toBe(false);
  const cleared = await shadow.clear({ blockId: "p", text: "hello!", covered: tab.binding.journal.covers("p", "hello!") });
  expect(cleared.ok).toBe(true);
  expect(imeEntries((await shadow.channel.list()).records)).toEqual([]);
  tab.binding.dispose();
});

test("a composition in a block is kept as text without a transaction", async () => {
  const records = new Map();
  const tab = openTab({ service: fakeService({ writer: "w-1", records }), clientID: 5 });
  await tab.ready();

  const mount = document.createElement("div");
  const surface = document.createElement("div");
  surface.innerHTML = '<p data-id="p">hello</p>';
  mount.append(surface);
  document.body.append(mount);
  const review = createRecoveryReview({ mount, getJournal: () => tab.binding.journal, service: tab.service });
  const detach = review.watch(surface);

  const block = surface.querySelector('[data-id="p"]');
  block.textContent = "hello \u3053\u3093\u306b\u3061";
  block.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  block.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
  // Composition end cannot retire it: no journaled update carries that text yet.
  block.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  await tab.settled();
  await review.refresh();

  expect(review.count).toBe(1);
  expect(review.journaled[0].blockId).toBe("p");
  expect(review.journaled[0].text).toBe("hello \u3053\u3093\u306b\u3061");
  // Nothing of it became a transaction, and the page is exactly as it was.
  expect(tab.binding.journal.records()).toEqual([]);
  expect(textOfValue(tab.store.value)).toBe("hello|world");
  detach();
  review.destroy();
  mount.remove();
  tab.binding.dispose();
});

test("mode exit during a recovery await inserts nothing", async () => {
  const { rows, crash } = await reviewOfCrashedPage();
  const tab = openTab({
    service: fakeService({ writer: "w-2", records: crash.records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await tab.ready();

  const mount = document.createElement("div");
  document.body.append(mount);
  const view = fakeView(tab.store.value);
  let current = true;
  let copied = 0;
  const review = createRecoveryReview({
    mount,
    getView: () => view,
    getJournal: () => tab.binding.journal,
    service: tab.service,
    isCurrent: () => current,
    onCopied: () => { copied += 1; },
  });
  review.update({ rows });
  expect(review.count).toBe(1);
  review.open();
  const panelText = mount.querySelector('clay-editor-ui[data-clay-ui="page-recovery"]').shadowRoot.textContent;
  for (const line of rows[0].text.split("\n")) expect(panelText).toContain(line);

  // The mode leaves while the copy is still being decided.
  const slow = gate();
  tab.service.state.appendGate = slow.promise;
  const running = review.recover(rows[0]);
  current = false;
  slow.release();
  const result = await running;

  expect(result.ok).toBe(false);
  expect(result.code).toBe("stale");
  expect(copied).toBe(1 - 1);
  expect(idsOf(view.state.doc)).toEqual(idsOf(fakeView(tab.store.value).state.doc));
  expect(tab.binding.journal.records()).toEqual([]);
  review.destroy();
  mount.remove();
  tab.binding.dispose();
});

// The review one page draws for a crashed tab's capsule: the rows, and the crash the
// records came from.
async function reviewOfCrashedPage() {
  const crash = await crashWith("abc");
  const tab = openTab({
    service: fakeService({ writer: "w-2", records: crash.records }),
    clientID: 6,
    value: valueOf([{ id: "r", text: "rewritten elsewhere" }]),
    generation: "generation-2",
  });
  await tab.ready();
  const outcome = await replay(tab);
  tab.binding.dispose();
  const rows = describeReview(outcome.review);
  expect(rows).toHaveLength(1);
  return { rows, crash };
}

// The page command a copy goes in through, and the destination record it commits.
function insertInto(tab, row) {
  return async () => {
    const journal = tab.binding.journal;
    const waiting = journal.next();
    seedFrom(tab.binding.pd, seedOf(reconstructPage({ capsule: row.capsule, batches: row.batches })));
    const record = await waiting;
    if (!record) throw new Error("not-stored");
    return { key: journal.key, id: record.id, revision: record.revision };
  };
}
