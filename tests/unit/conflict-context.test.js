import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

/**
 * `clay.conflicts.registerContext(resolver)`: the page can name a conflict — a record
 * id, a label, a field — without taking the conflict over. The notice keeps its
 * generic Keep, Revert and Download actions; the resolver only supplies a name and an
 * optional way to open the thing. A document that registers nothing keeps today's
 * generic wording exactly.
 *
 * Naming has to survive two records looking alike and it has to survive a reload, so
 * an identity comes from the record's own stable id and never from what today's route
 * shows. Only the serializable part is stored: an `open` function bound to this page's
 * tree is not.
 */

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const PAGE =
  '<section id="entries">' +
  '<article data-id="e-1"><h3>Morning</h3><pre><code class="entry-body">Walk by the river.</code></pre></article>' +
  '<article data-id="e-2"><h3>Morning</h3><pre><code class="entry-body">Walk by the pond.</code></pre></article>' +
  "</section>";

let ledger;
let store;
let service;

const article = (id) => document.querySelector(`article[data-id="${id}"]`);
const bodyOf = (id) => article(id).querySelector(".entry-body");

beforeEach(async () => {
  jest.resetModules();
  window.clayEditMode = true;
  localStorage.clear();
  document.body.innerHTML = PAGE;
  ledger = await import("../../src/sync/conflicts.js");
  store = await import("../../src/recovery/conflicts.js");
  window.clay = { conflicts: ledger.conflicts };
});

afterEach(() => {
  delete window.clay;
});

function engineConflict(id, overrides = {}) {
  return {
    kind: "text",
    node: bodyOf(id),
    local: bodyOf(id).textContent,
    remote: `${bodyOf(id).textContent} Edited elsewhere.`,
    ...overrides,
  };
}

function applyWith(conflicts) {
  const applyId = ledger.beginApply({
    source: "peer", seq: 1, etag: "E1", domain: "sync",
    root: document.documentElement.cloneNode(true),
  });
  return ledger.completeApply(applyId, conflicts, { ticket: 1 });
}

/** Journal's resolver, in the shape the plan gives: id from the record's own nodes. */
const entryResolver = () => (record) => {
  const el = record.node?.closest?.("article[data-id]");
  if (!el) return null;
  return {
    kind: "entry",
    id: el.dataset.id,
    label: el.querySelector("h3").textContent,
    field: "body",
    open: () => el.scrollIntoView(),
  };
};

async function until(check, tries = 300) {
  for (let at = 0; at < tries; at++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
}

test("two entries named the same still resolve by their own id", () => {
  ledger.conflicts.registerContext(entryResolver());
  const [first, second] = applyWith([engineConflict("e-1"), engineConflict("e-2")]);

  const a = ledger.conflicts.get(first).context;
  const b = ledger.conflicts.get(second).context;
  expect(a.label).toBe("Morning");
  expect(b.label).toBe("Morning");
  expect(a.id).toBe("e-1");
  expect(b.id).toBe("e-2");
  expect(a.field).toBe("body");
  expect(a.kind).toBe("entry");
});

test("a conflict nothing can name keeps the generic context", () => {
  ledger.conflicts.registerContext(entryResolver());
  const [id] = applyWith([engineConflict("e-1", { node: document.createElement("span") })]);

  expect(ledger.conflicts.get(id).context).toBeNull();
  expect(store.storedContext(ledger.conflicts.get(id).context)).toBeNull();
});

test("a document with no resolver is exactly as generic as before", () => {
  const [id] = applyWith([engineConflict("e-1")]);
  const record = ledger.conflicts.get(id);

  expect(record.context).toBeNull();
  expect(record.claimedBy).toBeNull();
  expect(record.kind).toBe("text");
  expect(ledger.conflicts.recoveryOf(id)).not.toBeNull();
});

test("unregistering stops the naming", () => {
  const unregister = ledger.conflicts.registerContext(entryResolver());
  const [first] = applyWith([engineConflict("e-1")]);
  expect(ledger.conflicts.get(first).context.id).toBe("e-1");

  expect(typeof unregister).toBe("function");
  unregister();
  const [second] = applyWith([engineConflict("e-2")]);
  expect(ledger.conflicts.get(second).context).toBeNull();
});

test("the newest resolver answers first", () => {
  ledger.conflicts.registerContext(entryResolver());
  ledger.conflicts.registerContext((record) => ({ kind: "entry", id: "renamed", label: "Renamed" }));
  const [id] = applyWith([engineConflict("e-1")]);
  expect(ledger.conflicts.get(id).context).toMatchObject({ id: "renamed", label: "Renamed" });
});

test("a resolver that throws leaves the conflict generic instead of losing it", () => {
  ledger.conflicts.registerContext(() => {
    throw new Error("resolver failed");
  });
  const [id] = applyWith([engineConflict("e-1")]);
  expect(id).toBeTruthy();
  expect(ledger.conflicts.get(id).context).toBeNull();
  expect(ledger.conflicts.size).toBe(1);
});

test("context names a conflict without claiming it or removing the generic actions", () => {
  ledger.conflicts.registerContext(entryResolver());
  const [id] = applyWith([engineConflict("e-1")]);
  const record = ledger.conflicts.get(id);

  expect(record.claimedBy).toBeNull();
  expect(typeof record.context.open).toBe("function");
  expect(ledger.conflicts.list().map((r) => r.id)).toEqual([id]);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);

  const claimed = ledger.conflicts.claim([id], { owner: "someone-else" });
  expect(record.claimedBy).toBe("someone-else");
  claimed.release();
  expect(record.claimedBy).toBeNull();

  const receipt = ledger.conflicts.acknowledge([id], { reason: "reconciled" });
  expect(receipt.removedIds).toEqual([id]);
});

test("a stored context keeps the identity, the label and the field, never the function", async () => {
  const factory = new IDBFactory();
  const recovery = await import("../../src/core/recovery.js");
  service = recovery.createRecovery({ mode: "edit", indexedDB: factory });
  window.clay = { conflicts: ledger.conflicts, recovery: service };

  ledger.conflicts.registerContext(entryResolver());
  applyWith([engineConflict("e-1"), engineConflict("e-2")]);

  expect(await until(async () => (await store.listConflicts()).records.length === 1)).toBe(true);
  const [record] = (await store.listConflicts()).records;
  const contexts = record.conflicts.map((entry) => entry.context);

  expect(contexts).toEqual([
    { kind: "entry", id: "e-1", label: "Morning", field: "body" },
    { kind: "entry", id: "e-2", label: "Morning", field: "body" },
  ]);
  expect(contexts[0]).not.toHaveProperty("open");
  expect(JSON.stringify(record)).not.toContain("scrollIntoView");
});
