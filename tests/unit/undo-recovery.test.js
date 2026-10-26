/**
 * @jest-environment jsdom
 */

/**
 * A refused undo step survives the reload.
 *
 * The history is this tab's and this session's: a reload starts with nothing to replay.
 * What it does not take away is the step a person tried to take back, so a refusal is
 * staged on the internal `clay.undo` channel of the shared recovery service as plain
 * data — the label, the direction, why it was refused, the targets with the page's own
 * names, and every step's endpoints. Nothing here is a save: a normal page save covers
 * nothing on this channel, and a record leaves only when a person dismisses it at the
 * revision they were looking at.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const FIXTURE = `
  <article id="card">
    <p id="text" data-id="card">authored</p>
  </article>
`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.getElementById("text");

const setText = (el, value) => {
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.data = value;
  else el.textContent = value;
};

// A factory whose writes fail on demand, so quota is refused without a full browser.
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

async function until(check, tries = 400) {
  for (let at = 0; at < tries; at++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}

let factory;
let plugin;
let undo;
let kept = [];
let refused = [];
const leases = [];

const onKept = (event) => kept.push(event.detail);
const onRefused = (event) => refused.push(event.detail);

// A fresh page load over the same store: new modules, a new page-load writer and the
// same document scope.
async function boot({ indexedDB = factory, service = null } = {}) {
  jest.resetModules();
  const recovery = await import("../../src/core/recovery.js");
  window.clay = { recovery: service || recovery.createRecovery({ mode: "edit", indexedDB }) };
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
  window.clay.undo = undo;
  return window.clay.recovery;
}

async function enter() {
  const lease = await plugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  leases.push(lease);
  return lease;
}

const edit = async (value) => {
  setText(text(), value);
  await settle();
  undo.flush();
};

const peerWrite = (write) => {
  undo.pause();
  try {
    write();
  } finally {
    undo.resume();
  }
};

// One recorded edit, then a peer write over it, then the refusal itself.
async function refuse() {
  await enter();
  await edit("typed");
  peerWrite(() => setText(text(), "peer"));
  await settle();
  undo.flush();
  const receipt = undo.undo();
  expect(receipt.ok).toBe(false);
  await until(() => kept.length > 0);
  return receipt;
}

const nextKept = async () => {
  await until(() => kept.length > 0);
  return kept.at(-1);
};

const records = async () => {
  const listed = await undo.kept();
  expect(listed.ok).toBe(true);
  return listed.records;
};

beforeEach(async () => {
  factory = new IDBFactory();
  kept = [];
  refused = [];
  document.body.innerHTML = FIXTURE;
  document.documentElement.removeAttribute("documentid");
  window.clayEditMode = true;
  localStorage.clear();
  document.addEventListener("clay:undo-kept", onKept);
  document.addEventListener("clay:undo-refused", onRefused);
  await boot();
  await enter();
});

afterEach(() => {
  document.removeEventListener("clay:undo-kept", onKept);
  document.removeEventListener("clay:undo-refused", onRefused);
  while (leases.length) leases.pop().dispose();
  window.clay = undefined;
});

test("a refusal keeps one record with the steps and the page's own context", async () => {
  // The page's own resolver, registered once for both records: it names a refused
  // step's target from the element that id finds today.
  const ledger = await import("../../src/sync/conflicts.js");
  window.clay.conflicts = ledger.conflicts;
  ledger.conflicts.registerContext((subject) =>
    subject?.source === "undo" && subject.element
      ? { kind: "card", id: subject.id, label: subject.element.textContent.trim(), field: "text" }
      : null
  );

  const receipt = await refuse();
  const detail = await nextKept();

  expect(detail).toEqual({ ok: true, entryId: receipt.entryId, direction: "undo" });
  const [record] = await records();
  expect(record.channel).toBe("clay.undo");
  expect(record.version).toBe(1);
  expect(record.kind).toBe("conflict");
  expect(record.key).toBe(`refused:${receipt.entryId}:undo`);
  expect(record.payload.label).toBe("Edit");
  expect(record.payload.direction).toBe("undo");
  expect(record.payload.code).toBe("content-changed");
  expect(record.payload.targets).toEqual([{ id: "card", kind: expect.any(String) }]);
  expect(record.payload.context).toEqual([{ kind: "card", id: "card", label: "peer", field: "text" }]);
  expect(record.payload.steps).toEqual([
    { kind: "text", target: { id: "card" }, before: "authored", after: "typed" },
  ]);
  expect(JSON.parse(JSON.stringify(record.payload))).toEqual(record.payload);
  // A refusal is not a save: no save token, no host stamp claimed as ours.
  expect(JSON.stringify(record)).not.toContain("save-token");
});

test("refusing the same step twice keeps one record", async () => {
  const receipt = await refuse();
  expect(await records()).toHaveLength(1);

  const again = undo.undo();
  expect(again.code).toBe("content-changed");
  await until(() => kept.length > 1);
  await settle();
  await undo.kept();

  const listed = await records();
  expect(listed).toHaveLength(1);
  expect(listed[0].key).toBe(`refused:${receipt.entryId}:undo`);
});

test("a store that refuses the write keeps the durable copy and the in-memory one", async () => {
  let failures = 0;
  const flaky = guardedFactory(factory, () => (failures-- > 0 ? new DOMException("full", "QuotaExceededError") : null));
  await boot({ indexedDB: flaky });
  await enter();

  await refuse();
  expect(await records()).toHaveLength(1);

  const counts = [];
  window.clay.recovery.subscribe((detail) => counts.push(detail.count));

  failures = 1;
  const receipt = undo.undo();
  expect(receipt.code).toBe("content-changed");
  await until(() => kept.length > 1);
  const detail = kept.at(-1);

  expect(detail).toEqual({ ok: false, code: "quota", entryId: receipt.entryId, direction: "undo" });
  expect(counts).toContain(1);
  const listed = await records();
  expect(listed).toHaveLength(1);
  expect(listed[0].payload.label).toBe("Edit");
});

test("a store that cannot be opened reports ok:false", async () => {
  const recovery = await import("../../src/core/recovery.js");
  const unavailable = recovery.createRecovery({ mode: "edit", indexedDB: null });
  await boot({ service: unavailable });
  await enter();

  await edit("typed");
  peerWrite(() => setText(text(), "peer"));
  await settle();
  undo.flush();
  expect(undo.undo().code).toBe("content-changed");
  await until(() => kept.length > 0);

  expect(kept.at(-1)).toMatchObject({ ok: false, code: "unavailable", direction: "undo" });
  expect((await undo.kept()).ok).toBe(false);
});

test("a normal save dismisses nothing on this channel", async () => {
  await refuse();
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "kept by the app" } });
  const before = await records();
  expect(before).toHaveLength(2);

  const recovery = await import("../../src/core/recovery.js");
  recovery.noteRecoveryCapture({ captureId: "save-1", html: "<html><body></body></html>" });
  recovery.noteRecoverySettled({ captureId: "save-1", ok: true, etag: "E1" });
  await settle();

  const after = await records();
  expect(after.map((record) => record.key).sort()).toEqual(before.map((record) => record.key).sort());
});

test("a kept record outlives the tab and lists on the next edit session", async () => {
  const receipt = await refuse();
  const [stored] = await records();

  await boot({ indexedDB: factory });
  await enter();

  const listed = await records();
  expect(listed).toHaveLength(1);
  expect(listed[0].id).toEqual(stored.id);
  expect(listed[0].key).toBe(`refused:${receipt.entryId}:undo`);
  expect(listed[0].payload.direction).toBe("undo");
});

test("dismissing at a stale revision refuses and leaves the record", async () => {
  await refuse();
  const [stored] = await records();

  const stale = await undo.dismissKept(stored.id, { revision: stored.revision - 1 });
  expect(stale).toEqual({ ok: false, code: "stale" });
  expect(await records()).toHaveLength(1);

  const done = await undo.dismissKept(stored.id, { revision: stored.revision });
  expect(done.ok).toBe(true);
  expect(await records()).toHaveLength(0);
});

test("keeping app text makes no host write", async () => {
  const host = jest.fn(() => Promise.resolve({ ok: true }));
  globalThis.fetch = host;
  window.fetch = host;

  const written = await undo.keep({ key: "note", label: "Unsent note", payload: { text: "kept by the app" } });

  expect(written.ok).toBe(true);
  expect(host).not.toHaveBeenCalled();
  const [record] = await records();
  expect(record.kind).toBe("text");
  expect(record.key).toBe("app:note");
  expect(record.payload).toEqual({ text: "kept by the app", label: "Unsent note", context: null });
});

test("a refused step with no registered resolver keeps only the target's own id", async () => {
  await refuse();
  const [record] = await records();

  // The fallback context is the generic shape, and the store's sanitizer drops the
  // empty fields: what survives is the identity the entry itself carried.
  expect(record.payload.context).toEqual([{ id: "card" }]);
  expect(record.payload.code).toBe("content-changed");
});
