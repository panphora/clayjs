/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/journal.html"}
 */
import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

// Scenario: a recovery copy is removed only when a confirmed save provably holds
// it.
//
// The store already refuses to lose writing; this file is about the other half of
// that promise, which is deleting the right thing. Every test drives the REAL save
// lane — the same capture, the same bytes, the same result — with a host whose
// answers are delayed or refused on demand. A save may clear only the revision its
// own accepted bytes cover: not the newest one, not one that merely looks similar,
// and never on a skip, a refusal, an error or an unknown outcome.

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const ORIGIN = "https://example.com";

const FIXTURE = `
  <div id="entries">
    <article class="entry" cms-template data-id="seed"><div class="entry-body">seed</div></article>
    <article class="entry" data-id="e1" data-date="2026-01-02" data-created="c1" data-updated="u1">
      <div class="entry-body">A</div>
    </article>
    <article class="entry" data-id="e2" data-date="2026-01-03">
      <div class="entry-body">second</div>
    </article>
  </div>
`;

const readEntry = (el) => ({
  id: el.dataset.id || "",
  date: el.dataset.date || "",
  created: el.dataset.created || "",
  updated: el.dataset.updated || "",
  deletedAt: el.dataset.deletedAt || "",
  pinned: el.dataset.pinned === "true" ? "true" : "",
  body: el.querySelector(".entry-body")?.textContent ?? ""
});

// One implementation for the live DOM and for the saved bytes, exactly as the
// journal adapter does it. `parses` counts the work a capture asks of an adapter.
let parses = 0;

function readSaved(html) {
  parses += 1;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return new Map(
    [...doc.querySelectorAll("#entries > article.entry:not([cms-template])")].map((el) => [el.dataset.id, readEntry(el)])
  );
}

const liveEntry = (id) => readEntry(document.querySelector(`article.entry[data-id="${id}"]`));
const setBody = (id, text) => {
  document.querySelector(`article.entry[data-id="${id}"] .entry-body`).textContent = text;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Imported once edit mode is on: the mode is decided at module evaluation, so the
// flag has to be set before anything that reads it is loaded.
let saveMod;
let createRecovery;
let createStore;
let addDocumentTransform;
let factory;
let recovery;
let entries;
let opened;
let calls;
let respond;
let rewriteForSave = false;
let marker = 0;

// A host whose answer the test decides, including one that arrives seconds after
// the capture was taken.
function installRouter() {
  calls = { save: [], meta: [] };
  respond = () => ({ body: { msg: "Saved", etag: "stored-1" } });
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      const record = { url: target, options };
      calls.save.push(record);
      const answer = await respond(calls.save.length, record);
      const status = answer.status ?? 200;
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: { get: () => null },
        text: async () => JSON.stringify(answer.body ?? {}),
        json: async () => answer.body ?? {}
      };
    }
    calls.meta.push(target);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      text: async () => JSON.stringify({ spec: 1, document: { etag: "base-1" } }),
      json: async () => ({ spec: 1, document: { etag: "base-1" } })
    };
  });
}

// A database whose writes fail on demand, so a quota failure can be recovered from
// without a browser that is actually full.
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
      }
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
      }
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
      }
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
        }
      });
    }
  };
}

async function useRecovery({ mode = "edit", database = factory, writerId = "writer-1" } = {}) {
  recovery = createRecovery({ indexedDB: database, mode, writerId });
  entries = recovery.register({ channel: "journal.entries", version: 1, readSaved });
  opened.push(entries);
  return entries;
}

const staged = async (id) => entries.stage({ key: id, payload: liveEntry(id) });
const records = async () => (await entries.list()).records;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = FIXTURE;
  ({ createRecovery } = await import("../../src/core/recovery.js"));
  ({ createStore } = await import("../../src/recovery/store.js"));
  ({ addDocumentTransform } = await import("../../src/core/snapshot.js"));
  saveMod = await import("../../src/core/save.js");
  addDocumentTransform((clone) => {
    if (!rewriteForSave) return;
    const body = clone.querySelector('article.entry[data-id="e1"] .entry-body');
    if (body) body.textContent = "rewritten by the save";
  });
});

beforeEach(() => {
  document.documentElement.setAttribute("documentid", "doc-1");
  document.body.innerHTML = FIXTURE;
  // A save removes nothing on a page whose bytes have not moved, and this file keeps
  // one save lane across tests. A fresh marker per test makes each first attempt a
  // real one.
  document.body.insertAdjacentHTML("beforeend", `<div id="test-marker">${++marker}</div>`);
  factory = new IDBFactory();
  opened = [];
  parses = 0;
  rewriteForSave = false;
  installRouter();
  global.fetch.mockClear();
});

afterEach(async () => {
  for (const handle of opened) await handle.dispose();
  document.documentElement.removeAttribute("documentid");
});

// ---------------------------------------------------------------- acknowledgements

test("a confirmed save clears the copy whose exact bytes it accepted", async () => {
  await useRecovery();
  await staged("e1");
  expect((await entries.flush()).ok).toBe(true);
  expect(await records()).toHaveLength(1);

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);
  await entries.flush();

  expect(await records()).toEqual([]);
});

// The force lane takes its own capture and settles through the same place, so its
// confirmed result acknowledges exactly the same way.
test("a force save acknowledges the capture it wrote", async () => {
  await useRecovery();
  await staged("e1");
  await entries.flush();

  const result = await saveMod.savePageForce();
  expect(result.ok).toBe(true);
  await entries.flush();

  expect(await records()).toEqual([]);
});

// A host that accepts a local draft answers with no ETag. The capture still
// matched exactly, so the copy is still covered, and no stamp is invented.
test("a confirmed success with no ETag still acknowledges an exact capture", async () => {
  await useRecovery();
  respond = () => ({ body: { msg: "Saved" } });
  await staged("e1");
  await entries.flush();

  const seen = [];
  const onSaved = (event) => seen.push(event.detail);
  document.addEventListener("clay:save-saved", onSaved);
  const result = await saveMod.savePage();
  document.removeEventListener("clay:save-saved", onSaved);
  await entries.flush();

  expect(result.ok).toBe(true);
  expect(seen[0].etag).toBeNull();
  expect(typeof seen[0].captureId).toBe("number");
  expect(await records()).toEqual([]);
});

test("a saved event reports the accepted ETag beside its capture", async () => {
  await useRecovery();
  respond = () => ({ body: { msg: "Saved", etag: "stored-9" } });
  await staged("e1");
  await entries.flush();

  const seen = [];
  const onSaved = (event) => seen.push(event.detail);
  document.addEventListener("clay:save-saved", onSaved);
  await saveMod.savePage();
  document.removeEventListener("clay:save-saved", onSaved);

  expect(seen[0]).toMatchObject({ etag: "stored-9" });
  expect(typeof seen[0].captureId).toBe("number");
});

// --------------------------------------------------------------------------- races

test("a capture / B typing race keeps B and clears only what A held", async () => {
  await useRecovery();
  await staged("e1");
  expect((await entries.flush()).ok).toBe(true);

  let answer;
  respond = () => new Promise((resolve) => { answer = resolve; });
  const saving = saveMod.savePage();
  await tick();
  expect(calls.save).toHaveLength(1);

  // B is typed while A is still on the wire, and is staged as its own revision.
  setBody("e1", "B");
  await staged("e1");
  answer({ body: { msg: "Saved", etag: "stored-2" } });

  const result = await saving;
  expect(result.ok).toBe(true);
  await entries.flush();

  const kept = await records();
  expect(kept).toHaveLength(1);
  expect(kept[0].payload.body).toBe("B");
  expect(kept[0].payload).toEqual(liveEntry("e1"));
});

test("a copy that reaches the database after its acknowledgement is refused", async () => {
  await useRecovery();
  await staged("e1");

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);

  // The put is attempted only now, after the acknowledgement has been committed. A
  // late write must not resurrect writing the save has already proved it holds.
  const flushed = await entries.flush();
  expect(flushed).toEqual({ ok: true, stored: [] });
  expect(await records()).toEqual([]);
});

// ------------------------------------------------------------------- exact bytes

test("a before-save transform that changes the body leaves the copy available", async () => {
  await useRecovery();
  await staged("e1");
  await entries.flush();

  rewriteForSave = true;
  const result = await saveMod.savePage();
  rewriteForSave = false;
  await entries.flush();

  expect(result.ok).toBe(true);
  expect(calls.save[0].options.body).toContain("rewritten by the save");
  const kept = await records();
  expect(kept).toHaveLength(1);
  expect(kept[0].payload.body).toBe("A");
});

test("a staged copy for an entry the capture does not contain is kept", async () => {
  await useRecovery();
  entries.stage({ key: "e9", payload: { ...liveEntry("e2"), id: "e9", body: "a new entry, not saved yet" } });
  await entries.flush();

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);
  await entries.flush();

  const kept = await records();
  expect(kept.map((record) => record.key)).toEqual(["e9"]);
  expect(kept[0].payload.body).toBe("a new entry, not saved yet");
});

test("a save that lands without the staged text acknowledges nothing", async () => {
  await useRecovery();
  setBody("e1", "typed but not yet staged");
  await staged("e1");
  await entries.flush();

  // The host stores what the page held a moment earlier.
  setBody("e1", "A");
  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);
  await entries.flush();

  const kept = await records();
  expect(kept).toHaveLength(1);
  expect(kept[0].payload.body).toBe("typed but not yet staged");
});

// ---------------------------------------------------------------- other outcomes

test("a refused save retains the copy", async () => {
  await useRecovery();
  respond = () => ({ status: 412, body: { msg: "This document changed.", code: "conflict", etag: "peer-base" } });
  await staged("e1");
  await entries.flush();

  const result = await saveMod.savePage();
  expect(result.msgType).toBe("conflict");
  await entries.flush();

  expect(await records()).toHaveLength(1);
});

test("a failed save retains the copy", async () => {
  await useRecovery();
  respond = () => ({ status: 500, body: { msg: "boom", code: "server" } });
  await staged("e1");
  await entries.flush();

  const result = await saveMod.savePage();
  expect(result.ok).toBe(false);
  await entries.flush();

  expect(await records()).toHaveLength(1);
});

test("a save whose fate is unknown retains the copy", async () => {
  await useRecovery();
  respond = () => {
    throw Object.assign(new Error("network down"), { name: "TypeError" });
  };
  await staged("e1");
  await entries.flush();

  const result = await saveMod.savePage();
  expect(result.ok).toBe(false);
  await entries.flush();

  expect(await records()).toHaveLength(1);
});

test("a skipped save clears nothing even when the bytes would match", async () => {
  await useRecovery();
  await staged("e1");
  await entries.flush();

  const first = await saveMod.savePage();
  expect(first.ok).toBe(true);
  await entries.flush();
  expect(await records()).toEqual([]);

  // The same text staged again, on a page that has not changed since the save: the
  // attempt is skipped, so nothing is sent and nothing may be acknowledged.
  await staged("e1");
  await entries.flush();
  const skipped = await saveMod.savePage();
  expect(skipped.msgType).toBe("skipped");
  await entries.flush();

  const kept = await records();
  expect(kept).toHaveLength(1);
  expect(kept[0].payload.body).toBe("A");
});

test("a retry's own capture supersedes only what it contains", async () => {
  await useRecovery();
  respond = () => ({ status: 412, body: { msg: "This document changed.", code: "conflict", etag: "peer-base" } });
  await staged("e1");
  await entries.flush();

  expect((await saveMod.savePage()).msgType).toBe("conflict");

  // The retry stages the same text again, and one entry the retry cannot carry.
  respond = () => ({ body: { msg: "Saved", etag: "stored-4" } });
  await staged("e1");
  entries.stage({ key: "e9", payload: { ...liveEntry("e2"), id: "e9", body: "still only in this browser" } });
  await entries.flush();

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);
  await entries.flush();

  const kept = await records();
  expect(kept.map((record) => record.key)).toEqual(["e9"]);
});

// ------------------------------------------------------------------ failed writes

test("a copy whose write failed cannot be resurrected by a later save", async () => {
  let failures = 1;
  const database = guardedFactory(factory, () => (failures-- > 0 ? new DOMException("full", "QuotaExceededError") : null));
  await useRecovery({ database });

  await staged("e1");
  expect(await entries.flush()).toEqual({ ok: false, code: "quota" });

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);

  // The retried write meets the watermark the acknowledgement wrote, so the copy the
  // save already holds never reaches the database at all.
  const flushed = await entries.flush();
  expect(flushed).toEqual({ ok: true, stored: [] });
  expect(await records()).toEqual([]);
});

// ------------------------------------------------------------------------- scopes

test("a draft's acknowledgement stays inside the draft scope", async () => {
  const draft = await useRecovery({ mode: "draft" });
  draft.stage({ key: "e1", payload: liveEntry("e1") });
  await draft.flush();

  // The same key and the same text, filed by this browser's edit scope.
  const editStore = createStore({ scope: [ORIGIN, "documentid", "doc-1", "edit"], indexedDB: factory });
  const editCopy = {
    id: ["journal.entries", "e1", "writer-9"],
    kind: "text",
    channel: "journal.entries",
    version: 1,
    key: "e1",
    writerId: "writer-9",
    revision: 1,
    status: "journaled",
    baseEtag: null,
    base: null,
    payload: liveEntry("e1"),
    lineage: null,
    created: 1,
    updated: 1
  };
  expect((await editStore.put(editCopy)).ok).toBe(true);

  const result = await saveMod.savePage();
  expect(result.ok).toBe(true);
  await draft.flush();

  expect((await draft.list()).records).toEqual([]);
  const untouched = await editStore.get(["journal.entries", "e1", "writer-9"]);
  expect(untouched.ok).toBe(true);
  expect(untouched.record.payload.body).toBe("A");
});

// ---------------------------------------------------------------------- no work

test("a save with no staged copy does no parsing", async () => {
  await useRecovery();
  const result = await saveMod.savePage();

  expect(result.ok).toBe(true);
  expect(parses).toBe(0);
});

test("a page with no recovery channel does no recovery work", async () => {
  // No service, no channel, nothing registered: the save lane is the only thing
  // that runs, and the recovery hooks cost it one loop over an empty set.
  const result = await saveMod.savePage();

  expect(result.ok).toBe(true);
  expect(parses).toBe(0);
});
