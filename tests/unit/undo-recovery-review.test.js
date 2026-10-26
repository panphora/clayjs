/**
 * @jest-environment jsdom
 */

/**
 * The recovery panel shows the step an undo could not take back.
 *
 * A refused step is kept as plain data on the internal `clay.undo` channel, and this is
 * what a person sees: the same panel the conflicts notice already draws, with the step's
 * name, why it was not applied, what it would have written and what the page says there
 * now. Copy and Download take the copy away, Dismiss removes it at the revision the row
 * was drawn at, and an action the page supplies (Kanban's Keep as new) becomes a button
 * on its row. A reload lists them on the next edit session from the cheap count hint,
 * never from a reader boot.
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
let ledger;
let storage;
let kept = [];
let refused = [];
let leases = [];
// Everything this test started that listens on the document: a notice draws on a
// frame, and an armed shell outlives the test that made it unless it is taken back.
let open = [];

const onKept = (event) => kept.push(event.detail);
const onRefused = (event) => refused.push(event.detail);

// One page load over the given store: new modules, a new page-load writer and the same
// document scope. The page's own resolver names a refused step's target the way a
// template does, from the element that id finds today.
async function boot({ indexedDB = factory, service = null, resolver = true } = {}) {
  jest.resetModules();
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  const recovery = await import("../../src/core/recovery.js");
  window.clay = { recovery: service || recovery.createRecovery({ mode: "edit", indexedDB }) };
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
  window.clay.undo = undo;
  ledger = await import("../../src/sync/conflicts.js");
  window.clay.conflicts = ledger.conflicts;
  if (resolver) {
    ledger.conflicts.registerContext((subject) =>
      subject?.source === "undo" && subject.element
        ? { kind: "card", id: subject.id, label: subject.element.textContent.trim(), field: "text" }
        : null
    );
  }
  storage = (await import("../../src/lib/doc-storage.js")).storage;
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
async function refuseStep() {
  await edit("typed");
  peerWrite(() => setText(text(), "peer"));
  await settle();
  undo.flush();
  const receipt = undo.undo();
  expect(receipt.code).toBe("content-changed");
  expect(await until(() => kept.length > 0)).toBe(true);
  return receipt;
}

const records = async () => {
  const listed = await undo.kept();
  expect(listed.ok).toBe(true);
  return listed.records;
};

const root = () => document.querySelector("[data-clay-conflict]");
const panel = () => document.querySelector('[data-clay-conflict] [role="dialog"]');
const panelText = () => (panel() ? panel().textContent : "");
const buttons = () => (root() ? [...root().querySelectorAll("button")] : []);
const buttonSaying = (re) => buttons().find((b) => re.test(b.textContent));

// Every row in the list ends with Copy and Dismiss, so a row is the box those sit in.
const rows = () => {
  const button = buttonSaying(/^(Copy|Copied|Dismiss)$/);
  const row = button?.parentElement?.parentElement;
  return row ? [...row.parentElement.children] : [];
};

const rowSaying = (needle) => rows().find((row) => row.textContent.includes(needle)) ?? null;

const values = (row) => {
  const out = [];
  for (const span of row.querySelectorAll("span")) {
    if (span.textContent !== "Yours" && span.textContent !== "Now") continue;
    out.push(span.textContent, span.nextElementSibling?.textContent);
  }
  return out;
};

// The notice, as a boot hands it the event that asked for it.
async function openNotice(trigger = null) {
  const notice = await import("../../src/core/conflict-notice-ui.js");
  open.push(() => notice.stop());
  notice.start(trigger);
  expect(await until(() => buttonSaying(/^Review$/) !== undefined || panel() !== null)).toBe(true);
  return notice;
}

// The shell the loader arms on an edit boot, with nothing stored yet.
async function openShell() {
  const shell = await import("../../src/core/conflict-notice.js");
  const lease = shell.conflictNoticeParticipant().prepare({});
  open.push(() => lease.dispose());
  await settle();
  return shell;
}

async function review() {
  const review = buttonSaying(/^Review$/);
  expect(review).toBeDefined();
  review.click();
  expect(await until(() => panel() !== null)).toBe(true);
}

beforeEach(async () => {
  factory = new IDBFactory();
  kept = [];
  refused = [];
  open = [];
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
  while (open.length) {
    try {
      open.pop()();
    } catch (_) {}
  }
  document.removeEventListener("clay:undo-kept", onKept);
  document.removeEventListener("clay:undo-refused", onRefused);
  while (leases.length) leases.pop().dispose();
  window.clay = undefined;
});

test("a refused step is a row naming the spot, why it was refused, and both sides", async () => {
  await refuseStep();
  await openNotice();
  await review();

  const row = rowSaying("not applied");
  expect(row).not.toBeNull();
  expect(row.textContent).toContain('The undo of "peer" was not applied because the page changed there.');
  // What the step would have written, and the page's text there now.
  expect(values(row)).toEqual(["Yours", "authored", "Now", "peer"]);
  expect(row.textContent).not.toContain("Revert to mine");
});

test("copy takes the person's writing out as plain text", async () => {
  await refuseStep();
  await openNotice();
  await review();

  navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  buttonSaying(/^Copy$/).click();

  expect(await until(() => buttonSaying(/^Copied$/))).toBe(true);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("authored");
  expect(await records()).toHaveLength(1);
});

test("download my copy carries the kept step as JSON", async () => {
  await refuseStep();
  await openNotice();
  await review();

  let blob = null;
  URL.createObjectURL = jest.fn((value) => { blob = value; return "blob:review"; });
  URL.revokeObjectURL = jest.fn();

  buttonSaying(/^Download my copy$/).click();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

  const html = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  const block = html.match(/<script type="application\/json" id="clay-lost-edits"[^>]*>(.*?)<\/script>/s);
  expect(block).not.toBeNull();
  const data = JSON.parse(block[1].replace(/\\u003c/g, "<"));
  expect(data.edits).toHaveLength(1);
  expect(data.edits[0]).toMatchObject({ name: "peer", yours: "authored", now: "peer" });
  expect(data.edits[0].sentence).toContain("was not applied");
  expect(await records()).toHaveLength(1);
});

test("dismiss removes the kept step", async () => {
  await refuseStep();
  await openNotice();
  await review();

  buttonSaying(/^Dismiss$/).click();
  expect(await until(async () => (await records()).length === 0)).toBe(true);
  expect(await until(() => rows().length === 0)).toBe(true);
  // A store with nothing left for review no longer asks the next boot for the notice.
  expect(storage.local.get("undo")).toBeUndefined();
});

test("a revision that moved refuses to dismiss", async () => {
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "first" } });
  await openNotice();
  await review();
  expect(rowSaying("Unsent note")).not.toBeNull();

  // The same writer replaced the copy under the row the person is looking at.
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "second" } });

  buttonSaying(/^Dismiss$/).click();
  expect(await until(() => (root()?.textContent ?? "").includes("That copy could not be dismissed."))).toBe(true);
  const remaining = await records();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].payload.text).toBe("second");
});

test("an app action that says ok and dismiss takes the row away", async () => {
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "kept by the app" } });
  const [record] = await records();

  const seen = [];
  const off = undo.reviewActions((entry) => [
    { label: "Keep as new", run: async (copy) => { seen.push(copy.key); return { ok: true, dismiss: true }; } },
  ]);
  expect(undo.reviewActionsFor(record).map((item) => item.label)).toEqual(["Keep as new"]);

  await openNotice();
  await review();
  const row = rowSaying("Unsent note");
  expect(row.textContent).toContain("kept by the app");

  buttonSaying(/^Keep as new$/).click();
  expect(await until(async () => (await records()).length === 0)).toBe(true);
  expect(seen).toEqual(["app:note"]);

  off();
  expect(undo.reviewActionsFor(record)).toEqual([]);
});

test("an action that throws leaves the row and says so", async () => {
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "kept by the app" } });

  undo.reviewActions(() => [
    { label: "Keep as new", run: () => { throw new Error("no"); } },
  ]);

  await openNotice();
  await review();
  buttonSaying(/^Keep as new$/).click();

  expect(await until(() => panelText().includes("That action did not run. The copy is still here."))).toBe(true);
  expect(await records()).toHaveLength(1);
  expect(rowSaying("Unsent note")).not.toBeNull();
});

test("an action that answers ok:false leaves the row too", async () => {
  await undo.keep({ key: "note", label: "Unsent note", payload: { text: "kept by the app" } });

  undo.reviewActions(() => [
    { label: "Keep as new", run: async () => ({ ok: false }) },
  ]);

  await openNotice();
  await review();
  buttonSaying(/^Keep as new$/).click();

  expect(await until(() => panelText().includes("That action did not run."))).toBe(true);
  expect(await records()).toHaveLength(1);
});

test("a kept refusal offers review the moment it is kept", async () => {
  // The shell, as the loader arms it on an edit boot with nothing stored yet.
  await openShell();

  await refuseStep();

  expect(await until(() => buttonSaying(/^Review$/) !== undefined)).toBe(true);
  await review();
  expect(panelText()).toContain('The undo of "peer" was not applied');
});

test("a reload lists the kept step on the next edit session, and a view boot opens no database", async () => {
  await refuseStep();
  expect(storage.local.get("undo")?.count).toBe(1);
  while (leases.length) leases.pop().dispose();

  // A reader boot: no notice, no recovery module, no database.
  jest.resetModules();
  window.clayEditMode = false;
  window.clay = undefined;
  const opened = [];
  const counting = {
    open(name, version) {
      opened.push(name);
      return factory.open(name, version);
    },
  };
  globalThis.indexedDB = counting;
  window.indexedDB = counting;
  await openShell();
  await settle();
  expect(opened).toEqual([]);
  expect(root()).toBeNull();

  // The next edit session: the hint is enough for the shell to fetch the notice, and
  // the notice reads the store for the row.
  jest.resetModules();
  window.clayEditMode = true;
  const recovery = await import("../../src/core/recovery.js");
  window.clay = { recovery: recovery.createRecovery({ mode: "edit", indexedDB: factory }) };
  const fresh = await import("../../src/plugins/undo.js");
  window.clay.undo = fresh.undo;
  const freshLedger = await import("../../src/sync/conflicts.js");
  window.clay.conflicts = freshLedger.conflicts;
  freshLedger.conflicts.registerContext((subject) =>
    subject?.source === "undo" && subject.element
      ? { kind: "card", id: subject.id, label: subject.element.textContent.trim(), field: "text" }
      : null
  );

  await openShell();
  expect(await until(() => buttonSaying(/^Review$/) !== undefined)).toBe(true);
  await review();
  const row = rowSaying("not applied");
  expect(row).not.toBeNull();
  expect(values(row)).toEqual(["Yours", "authored", "Now", "peer"]);

  const [stored] = await fresh.undo.kept().then((listed) => listed.records);
  expect(stored.key).toMatch(/^refused:/);
  expect(storage.local.get("undo")?.count).toBe(1);
});
