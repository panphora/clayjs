import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

/**
 * A conflict's losing text has to outlive the tab that saw it. The ledger keeps it
 * in memory, with the root the merge read as "mine" and the nodes its report named,
 * and a reload takes all of that away. So the ledger copies the material into the
 * shared recovery store before it releases anything: one serialized root per apply,
 * the conflicts as plain fields, and nothing a structured clone would refuse.
 *
 * These tests hold that promise: several hunks share one root, credentials and
 * runtime-only chrome never reach the store, no DOM node or function does either, a
 * read after a reload still has the losing text, a save clears nothing, an
 * acknowledgement clears only its own conflict, a refused write leaves the live
 * record exactly where it was, and the review rebuilt from records never replays a
 * path against today's tree.
 */

// jsdom has no structuredClone, and the test-only IndexedDB clones every value it
// stores with it. A real browser has it; this file supplies the same thing.
globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const PAGE =
  '<h2>Pricing</h2><p id="tp">$12 per seat per month.</p>' +
  '<p id="note">Walk by the river.</p><p id="other">Read a book.</p>';

// A factory whose writes fail on demand, so a quota can be refused without a browser
// that is actually full.
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

let factory;
let recovery;
let ledger;
let store;
let service;

function connect(recoveryApi, { indexedDB: idb = factory } = {}) {
  service = recoveryApi.createRecovery({ mode: "edit", indexedDB: idb });
  window.clay = { recovery: service, conflicts: ledger.conflicts };
  return service;
}

beforeEach(async () => {
  jest.resetModules();
  window.clayEditMode = true;
  localStorage.clear();
  document.body.innerHTML = PAGE;
  document.documentElement.removeAttribute("documentid");
  document.documentElement.removeAttribute("savetoken");
  factory = new IDBFactory();
  recovery = await import("../../src/core/recovery.js");
  ledger = await import("../../src/sync/conflicts.js");
  store = await import("../../src/recovery/conflicts.js");
  connect(recovery);
});

afterEach(() => {
  document.documentElement.removeAttribute("documentid");
  document.documentElement.removeAttribute("savetoken");
  delete window.clay;
});

/** A plain engine conflict, the shape a merge hands the ledger. */
function engineConflict(overrides = {}) {
  return {
    kind: "text",
    node: document.getElementById("note"),
    local: "Walk by the river.",
    remote: "Walk by the stream.",
    ...overrides,
  };
}

function startApply(overrides = {}) {
  return ledger.beginApply({
    source: "peer", seq: 3, etag: "E1", domain: "sync",
    root: document.documentElement.cloneNode(true),
    recoveryRoot: document.documentElement.cloneNode(true),
    ...overrides,
  });
}

async function until(check, tries = 300) {
  for (let at = 0; at < tries; at++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
}

const stored = () => store.listConflicts();

test("several hunks of one apply are stored with one recovery root", async () => {
  const applyId = startApply();
  const ids = ledger.completeApply(applyId, [
    engineConflict(),
    engineConflict({ node: document.getElementById("other"), local: "Read a book.", remote: "Read a long book." }),
  ], { ticket: 1 });

  expect(ids).toHaveLength(2);
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [record] = (await stored()).records;

  expect(record.root).toEqual(expect.stringContaining("Walk by the river."));
  expect(record.root).toEqual(expect.stringContaining("Read a book."));
  expect(record.conflicts.map((entry) => entry.id)).toEqual(ids);
  expect(record.conflicts.map((entry) => entry.yours)).toEqual(["Walk by the river.", "Read a book."]);
  expect(record.conflicts.map((entry) => entry.now)).toEqual(["Walk by the stream.", "Read a long book."]);
  expect(record.apply.id).toBe(applyId);
  expect(store.pendingConflicts()).toBe(2);
});

test("no DOM node and no function reaches the record", async () => {
  const applyId = startApply();
  ledger.completeApply(applyId, [engineConflict()], { ticket: 2 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [record] = (await stored()).records;

  const raw = JSON.parse(JSON.stringify(record));
  expect(JSON.stringify(raw)).not.toContain("[object ");
  const walk = (value) => {
    expect(typeof value === "function").toBe(false);
    expect(value?.nodeType).toBeUndefined();
    if (value && typeof value === "object") for (const item of Object.values(value)) walk(item);
  };
  walk(raw);
  expect(Object.keys(record.conflicts[0]).sort()).toEqual(
    ["context", "dropped", "id", "key", "kind", "name", "now", "sentence", "yours"]
  );
});

test("an uncloneable field is named and dropped, and the rest of the record is kept", async () => {
  const [staged] = store.recordConflicts({
    apply: { id: "a1", source: "peer", domain: "sync" },
    root: "<html></html>",
    conflicts: [{
      id: "c1",
      yours: "Walk by the river.",
      el: document.getElementById("note"),
      reports: [{ node: document.body }],
      open: () => {},
    }],
  });
  expect(staged.revision).toBeGreaterThan(0);
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [record] = (await stored()).records;

  expect(record.conflicts[0].yours).toBe("Walk by the river.");
  expect(record.conflicts[0].dropped).toEqual(
    expect.arrayContaining(["el", "open", "reports[0].node"])
  );
  expect(record.conflicts[0].el).toBeUndefined();
});

test("a stored root carries no save token, no file id and no runtime-only chrome", async () => {
  document.documentElement.setAttribute("savetoken", "SECRET-TOKEN");
  document.documentElement.setAttribute("documentid", "doc-hidden");
  document.body.insertAdjacentHTML("beforeend", '<div clay="no-save" id="chrome">runtime only</div>');

  const applyId = startApply();
  ledger.completeApply(applyId, [engineConflict()], { ticket: 3 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [record] = (await stored()).records;

  expect(record.root).toEqual(expect.stringContaining("Walk by the river."));
  expect(record.root).not.toContain("SECRET-TOKEN");
  expect(record.root).not.toContain("doc-hidden");
  expect(record.root).not.toContain("runtime only");
});

test("a reload finds the losing text in the store, without the live ledger", async () => {
  const applyId = startApply();
  ledger.completeApply(applyId, [engineConflict()], { ticket: 4 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);

  jest.resetModules();
  document.body.innerHTML = PAGE;
  ledger = await import("../../src/sync/conflicts.js");
  recovery = await import("../../src/core/recovery.js");
  store = await import("../../src/recovery/conflicts.js");
  connect(recovery);

  expect(ledger.conflicts.size).toBe(0);
  expect(ledger.conflicts.list()).toEqual([]);

  const listed = await stored();
  expect(listed.ok).toBe(true);
  expect(listed.records).toHaveLength(1);
  const [entry] = listed.records[0].conflicts;
  expect(entry.yours).toBe("Walk by the river.");
  expect(entry.now).toBe("Walk by the stream.");
  expect(listed.records[0].root).toEqual(expect.stringContaining("Walk by the river."));
  expect(await ledger.conflicts.recoveryOf(entry.id)).toBeNull();
});

test("a normal save does not clear a stored conflict", async () => {
  const applyId = startApply();
  ledger.completeApply(applyId, [engineConflict()], { ticket: 5 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);

  recovery.noteRecoveryCapture({ captureId: 11, html: document.documentElement.outerHTML });
  recovery.noteRecoverySettled({ captureId: 11, ok: true, etag: "E2" });
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { etag: "E2" } }));
  await new Promise((r) => setTimeout(r, 20));

  const listed = await stored();
  expect(listed.records).toHaveLength(1);
  expect(listed.records[0].conflicts[0].yours).toBe("Walk by the river.");
  expect(store.pendingConflicts()).toBe(1);
});

test("acknowledging one conflict leaves the other one's text, and its root", async () => {
  const applyId = startApply();
  const [first, second] = ledger.completeApply(applyId, [
    engineConflict(),
    engineConflict({ node: document.getElementById("other"), local: "Read a book.", remote: "Read a long book." }),
  ], { ticket: 6 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);

  ledger.conflicts.acknowledge([first], { reason: "accepted" });

  expect(await until(async () => {
    const listed = await stored();
    return listed.records.length === 1 && listed.records[0].conflicts.length === 1;
  })).toBe(true);
  const [record] = (await stored()).records;
  expect(record.conflicts.map((entry) => entry.id)).toEqual([second]);
  expect(record.conflicts[0].yours).toBe("Read a book.");
  expect(record.root).toEqual(expect.stringContaining("Walk by the river."));
  expect(ledger.conflicts.size).toBe(1);

  ledger.conflicts.acknowledge([second], { reason: "reverted" });
  expect(await until(async () => (await stored()).records.length === 0)).toBe(true);
  expect(store.pendingConflicts()).toBe(0);
});

test("acknowledging one apply's conflict does not clear another apply's", async () => {
  const firstApply = startApply();
  const [first] = ledger.completeApply(firstApply, [engineConflict()], { ticket: 7 });
  const secondApply = startApply();
  const [second] = ledger.completeApply(secondApply, [
    engineConflict({ node: document.getElementById("other"), local: "Read a book.", remote: "Read a long book." }),
  ], { ticket: 8 });
  expect(await until(async () => (await stored()).records.length === 2)).toBe(true);

  ledger.conflicts.acknowledge([first], { reason: "accepted" });

  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [record] = (await stored()).records;
  expect(record.conflicts.map((entry) => entry.id)).toEqual([second]);
  expect(record.conflicts[0].yours).toBe("Read a book.");
});

test("a refused write leaves the live conflict and its material exactly where they were", async () => {
  const guarded = guardedFactory(new IDBFactory(), () => new DOMException("full", "QuotaExceededError"));
  jest.resetModules();
  recovery = await import("../../src/core/recovery.js");
  ledger = await import("../../src/sync/conflicts.js");
  store = await import("../../src/recovery/conflicts.js");
  connect(recovery, { indexedDB: guarded });

  const applyId = startApply();
  const [id] = ledger.completeApply(applyId, [engineConflict()], { ticket: 9 });

  expect(ledger.conflicts.size).toBe(1);
  const record = ledger.conflicts.get(id);
  expect(record.kind).toBe("text");
  expect(record.rawReports).toHaveLength(1);
  const apply = ledger.conflicts.recoveryOf(id);
  expect(apply).not.toBeNull();
  expect(apply.root.textContent).toEqual(expect.stringContaining("Walk by the river."));

  expect(await until(async () => {
    const listed = await stored();
    return listed.ok === false || listed.records.length === 0;
  })).toBe(true);
  expect(store.pendingConflicts()).toBe(0);
});

test("a claimed conflict stays in the store until it is acknowledged", async () => {
  const applyId = startApply();
  const [id] = ledger.completeApply(applyId, [engineConflict()], { ticket: 12 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);

  const claim = ledger.conflicts.claim([id], { owner: "writer" });
  await new Promise((r) => setTimeout(r, 20));
  expect((await stored()).records).toHaveLength(1);

  claim.release();
  await new Promise((r) => setTimeout(r, 20));
  expect((await stored()).records).toHaveLength(1);
  expect(ledger.conflicts.get(id).claimedBy).toBeNull();
});

test("a stored conflict has no live target to replay", async () => {
  const applyId = startApply();
  ledger.completeApply(applyId, [engineConflict()], { ticket: 10 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);
  const [entry] = (await stored()).records[0].conflicts;

  expect(entry).not.toHaveProperty("target");
  expect(entry).not.toHaveProperty("node");
  expect(entry.kind).toBe("text");
  expect(entry.name).toBe("Paragraph under Pricing");
});

test("the notice draws a reloaded conflict from the store, and dismisses only that one", async () => {
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.innerWidth = 900;
  const applyId = startApply();
  const [first, second] = ledger.completeApply(applyId, [
    engineConflict(),
    engineConflict({ node: document.getElementById("other"), local: "Read a book.", remote: "Read a long book." }),
  ], { ticket: 11 });
  expect(await until(async () => (await stored()).records.length === 1)).toBe(true);

  jest.resetModules();
  document.body.innerHTML = PAGE;
  ledger = await import("../../src/sync/conflicts.js");
  recovery = await import("../../src/core/recovery.js");
  store = await import("../../src/recovery/conflicts.js");
  connect(recovery);
  window.clay.save = { overwrite: jest.fn().mockResolvedValue({ ok: true }) };
  const notice = await import("../../src/core/conflict-notice-ui.js");

  const frame = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 0));
  notice.start(null);
  expect(await until(() => document.querySelector("[data-clay-conflict]") !== null)).toBe(true);
  await frame();

  const root = () => document.querySelector("[data-clay-conflict]");
  expect(root().textContent).toEqual(expect.stringContaining("2 changes replaced before this page loaded"));
  expect(root().style.display).toBe("flex");

  const review = [...root().querySelectorAll("button")].find((b) => b.textContent === "Review");
  review.click();
  await frame();

  const panel = () => document.querySelector('[data-clay-conflict] [role="dialog"]');
  expect(panel()).not.toBeNull();
  expect(panel().textContent).toEqual(expect.stringContaining("Walk by the river."));
  expect(panel().textContent).toEqual(expect.stringContaining("Read a book."));
  // No live tree to point at and no Revert path to run against today's page.
  expect(panel().querySelectorAll('[aria-label^="Show"]')).toHaveLength(0);
  expect(panel().textContent).not.toContain("Revert to mine");

  const copy = [...panel().querySelectorAll("button")].find((b) => b.textContent === "Copy");
  navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  copy.click();
  await frame();
  await frame();
  expect(navigator.clipboard.writeText).toHaveBeenCalled();
  expect(panel().textContent).toEqual(expect.stringContaining("Copied"));
  expect((await stored()).records[0].conflicts).toHaveLength(2);

  const dismiss = [...panel().querySelectorAll("button")].filter((b) => b.textContent === "Dismiss")[0];
  dismiss.click();
  expect(await until(async () => (await stored()).records[0]?.conflicts.length === 1)).toBe(true);
  expect((await stored()).records[0].conflicts[0].id).toBe(second);
  expect(store.pendingConflicts()).toBe(1);
  expect(ledger.conflicts.size).toBe(0);
  expect(first).toBeTruthy();
});
