import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The conflict ledger, driven through live sync: what an incoming frame wins
 * over this tab's unsaved edits is kept in `clay.conflicts` and leaves only
 * through acknowledge(). No save, autosave, queued save, reconnect or later
 * frame removes a record, and the close warning holds while one is open. The
 * page's own bytes cannot say any of this: the merge replaced the text.
 *
 * The ledger is a module singleton, so every test acknowledges what it leaves
 * behind; a leaked record would keep the close warning on in every test after
 * it.
 *
 * jsdom ships no EventSource; the fake must be installed before importing
 * live-sync.js (its singleton auto-starts, and this file runs in edit mode).
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIXTURE = '<p data-id="a">budget is fine</p><p data-id="b">b0</p>';
const LOCAL_A = "budget is over by 20 percent";
const REMOTE_A = "budget is approved";
const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };
// The autosave save lane's shared throttle window, which every test in the run
// shares: a save scheduled inside it waits for the trailing edge.
const THROTTLE_MS = 1300;

let liveSyncModule;
let LiveSync;
let conflicts;
let snapshot;
let gate;
let save;
let etag;
let autosaveState;

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

// A conditional host that refuses this tab's writes: a 412 naming the version
// that beat it, which is what puts the save hold on.
let refusalEtag = "E1";
function refusingHost(url, options = {}) {
  const u = String(url);
  const method = (options.method || "GET").toUpperCase();
  if (u.includes("/_/meta")) return respond(200, META);
  if (method === "POST" && u.includes("/_/save")) {
    return respond(412, { code: "conflict", changedBy: "another-tab", etag: refusalEtag });
  }
  if (method === "POST" && u.includes("/_/sync")) return respond(200, { success: true });
  return respond(404, "");
}

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  // autosave.js decides at import whether to install its mutation feed.
  document.documentElement.setAttribute("autosave", "");

  liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");
  await import("../../src/core/autosave.js");

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  autosaveState = await import("../../src/lib/autosave-state.js");

  // A conditional host from here on, the same discovery the other live-sync
  // files run against. Discovery is memoized, so one answer serves the file.
  await etag.seedEtag();
});

beforeEach(async () => {
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/save")) return respond(200, { msg: "Saved" });
    if (method === "POST" && u.includes("/_/sync")) return respond(200, { success: true });
    return respond(404, "");
  });
  // A hold left by the previous test is released the way a person would: a
  // save that lands.
  if (save.isSaveConflicted()) await save.savePageForce();
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  autosaveState.setAutosaveActive(false);
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
  refusalEtag = "E1";
});

afterEach(() => {
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
  delete window.clay;
  document.documentElement.removeAttribute("autosave");
  autosaveState.setAutosaveActive(false);
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

// A tab as it stands after boot, with the stream's discovery out of the way.
function startSync() {
  const sync = makeSync();
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

function onApplied() {
  const seen = [];
  const handler = (e) => seen.push(e.detail);
  document.addEventListener("clay:sync-applied", handler);
  seen.stop = () => document.removeEventListener("clay:sync-applied", handler);
  return seen;
}

async function settle(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

function closeWarns() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await wait(25);
  }
}

const saveCalls = () =>
  global.fetch.mock.calls.filter(([url]) => String(url).includes("/_/save"));
const saveBodies = () => saveCalls().map(([, options]) => String(options?.body || ""));

const diskDoc = (inner) =>
  `<!DOCTYPE html><html><head></head><body>${inner}</body></html>`;

// A frame whose apply awaits: an external script the test releases by hand.
function scriptFrame(html, src) {
  return html.replace("</body>", `<script src="${src}"></script></body>`);
}
function releaseScript(src) {
  document.querySelector(`script[src="${src}"]`).dispatchEvent(new Event("load"));
}

/** The standard loss: this tab typed a, the frame replaced it. */
async function loseA(sync) {
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();
  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace("budget is fine", REMOTE_A), 5, null);
  seen.stop();
  expect(seen[0].conflictIds).toHaveLength(1);
  expect(conflicts.size).toBe(1);
  return seen[0].conflictIds[0];
}

// ---------------------------------------------------------------------------
// the record itself
// ---------------------------------------------------------------------------

test("a dirty merge records the loss with the text the frame replaced", async () => {
  const sync = makeSync();
  await settle(FIXTURE);

  const id = await loseA(sync);

  const record = conflicts.get(id);
  expect(record).not.toBeNull();
  expect(record.local).toContain("over by 20 percent");
  const recovery = conflicts.recoveryOf(id);
  expect(recovery).not.toBeNull();
  expect(recovery.root.textContent).toContain("over by 20 percent");
  expect(recovery.root.textContent).not.toContain("approved");
  expect(document.querySelector('[data-id="a"]').textContent).toBe(REMOTE_A);
  sync.stop();
});

// ---------------------------------------------------------------------------
// nothing but acknowledge() removes a record
// ---------------------------------------------------------------------------

test("autosave does not acknowledge a record", async () => {
  document.documentElement.setAttribute("autosave", "");
  autosaveState.setAutosaveActive(true);
  await settle(FIXTURE);
  const sync = startSync();

  await loseA(sync);

  const before = saveCalls().length;
  document.querySelector('[data-id="b"]').textContent = "b local";
  await waitFor(() => saveCalls().length > before);

  expect(saveCalls().length).toBeGreaterThan(before);
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("Cmd+S does not acknowledge a record", async () => {
  await settle(FIXTURE);
  const sync = startSync();

  await loseA(sync);

  // The shortcut's save, called directly: jsdom cannot mint a trusted keydown.
  expect((await save.savePageForce()).ok).toBe(true);

  expect(saveCalls().length).toBeGreaterThan(0);
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("a queued save drained after the loss does not acknowledge it", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  let release;
  const held = new Promise((r) => { release = r; });
  let first = true;
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (method === "POST" && u.includes("/_/save")) {
      if (first) {
        first = false;
        return held.then(() => respond(200, { msg: "Saved" }));
      }
      return respond(200, { msg: "Saved" });
    }
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/sync")) return respond(200, { success: true });
    return respond(404, "");
  });

  const saving = save.savePageForce();
  await wait(0);

  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace("budget is fine", REMOTE_A), 5, null);
  seen.stop();
  expect(seen[0].conflictIds).toHaveLength(1);

  // The save captured before the loss is still on the wire, so this one waits.
  expect((await save.savePage()).msgType).toBe("skipped");

  release();
  expect((await saving).ok).toBe(true);
  await waitFor(() => saveCalls().length === 2);
  await wait(25);

  expect(saveCalls()).toHaveLength(2);
  expect(conflicts.size).toBe(1);
  sync.stop();
});

test("a reconnect does not acknowledge a record, and a new loss takes a new id", async () => {
  await settle(FIXTURE);
  const sync = startSync();

  const firstId = await loseA(sync);

  sync.cleanup();
  sync.start("index.html");

  expect(conflicts.size).toBe(1);
  expect(conflicts.get(firstId)).not.toBeNull();

  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = "budget is over by 30 percent";
  await Promise.resolve();
  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace(REMOTE_A, "budget is frozen"), 6, null);
  seen.stop();

  expect(seen[0].conflictIds).toHaveLength(1);
  expect(seen[0].conflictIds[0]).not.toBe(firstId);
  expect(conflicts.size).toBe(2);
  sync.stop();
});

test("the convergence save runs over an open loss", async () => {
  autosaveState.setAutosaveActive(true);
  await settle('<p id="p">budget is fine</p><p id="q">q0</p>');
  const sync = startSync();
  document.querySelector("#p").textContent = "budget is over";
  document.querySelector("#q").textContent = "q local";
  await Promise.resolve();
  // Past the shared throttle window, so the save the merge owes runs at once.
  await wait(THROTTLE_MS);

  const seen = onApplied();
  await sync._doApplyExternal(diskDoc('<p id="p">budget is approved</p><p id="q">q0</p>'), 1);
  seen.stop();
  expect(seen[0].conflictIds).toHaveLength(1);
  await waitFor(() => saveBodies().some((body) => body.includes("approved")));
  await wait(25);

  const body = saveBodies().at(-1);
  expect(body).toContain("q local");
  expect(body).toContain("approved");
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("a clean frame after a loss advances the baseline and leaves the record", async () => {
  const sync = makeSync();
  await settle(FIXTURE);
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace("budget is fine", REMOTE_A), 5, null);
  expect(seen[0].conflictIds).toHaveLength(1);

  await sync._doApplyUpdate(sync.lastHtml.replace("b0", "b-peer"), 6, null);
  seen.stop();

  // The loss lives in the ledger now, so a frame nothing of this tab's
  // survived can settle the page and move the baselines.
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(save.getLastSavedContents()).toContain("b-peer");
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("only acknowledge clears a record", async () => {
  await settle(FIXTURE);
  const sync = startSync();

  const id = await loseA(sync);

  // The frame that won the whole edit left the page holding its bytes, so the
  // record is all the close warning has left to hold.
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);

  const contents = save.getLastSavedContents();
  const fetches = saveCalls().length;

  conflicts.acknowledge([id], { reason: "accepted" });

  expect(conflicts.size).toBe(0);
  expect(closeWarns()).toBe(false);
  expect(saveCalls().length).toBe(fetches);
  expect(save.getLastSavedContents()).toBe(contents);
  sync.stop();
});

// ---------------------------------------------------------------------------
// accepting a loss the frame won outright asks for nothing back
// ---------------------------------------------------------------------------

// The frame replaced every word of this tab's edit, so the page now holds the
// bytes that won: the accept has no work to write, and the warning goes out
// with the record.
test("accepting a pure loss clears the warning without a save", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace("budget is fine", REMOTE_A), 5, null);
  seen.stop();
  expect(seen[0].report.localDiverged).toBe(false);
  expect(seen[0].conflictIds).toHaveLength(1);
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(closeWarns()).toBe(true);

  const saves = saveCalls().length;
  conflicts.acknowledge(seen[0].conflictIds, { reason: "accepted" });

  expect(conflicts.size).toBe(0);
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(closeWarns()).toBe(false);
  expect(saveCalls().length).toBe(saves);
  sync.stop();
});

test("the disk lane clears the warning on the accept without a save", async () => {
  await settle('<p id="p">budget is fine</p><p id="q">q0</p>');
  const sync = startSync();
  document.querySelector("#p").textContent = "budget is over";
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyExternal(diskDoc('<p id="p">budget is approved</p><p id="q">q0</p>'), 1, "E1");
  seen.stop();
  expect(seen[0].report.localDiverged).toBe(false);
  expect(seen[0].conflictIds).toHaveLength(1);
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(closeWarns()).toBe(true);

  const saves = saveCalls().length;
  conflicts.acknowledge(seen[0].conflictIds, { reason: "accepted" });

  expect(conflicts.size).toBe(0);
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(closeWarns()).toBe(false);
  expect(saveCalls().length).toBe(saves);
  sync.stop();
});

// Typing during the awaited apply is work the frame never saw, so the gate has
// to stay dirty past the clear the merge asks for, and past the accept.
test("typing during the wait keeps the page dirty through the accept", async () => {
  await settle('<p data-id="a">budget is fine</p><p data-id="b" contenteditable="true">b0</p>');
  const sync = startSync();
  sync.lastHtml = captureFrame();
  const frame = scriptFrame(
    sync.lastHtml.replace("budget is fine", REMOTE_A),
    "typed-conflict-resource.js"
  );
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  const seen = onApplied();
  const applying = sync._doApplyUpdate(frame, 5, null);
  await wait(0);

  const b = document.querySelector('[data-id="b"]');
  Object.defineProperty(b, "isContentEditable", { value: true, configurable: true });
  b.firstChild.data = "b typed during the wait";
  b.dispatchEvent(new Event("input", { bubbles: true }));

  releaseScript("typed-conflict-resource.js");
  await applying;
  seen.stop();

  expect(seen[0].conflictIds).toHaveLength(1);
  expect(gate.pageMaybeDirty()).toBe(true);

  conflicts.acknowledge(seen[0].conflictIds, { reason: "accepted" });

  expect(conflicts.size).toBe(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

// ---------------------------------------------------------------------------
// the save hold is released by the frame that answers it, loss or no loss
// ---------------------------------------------------------------------------

test("a stamped peer frame that also conflicts releases the hold over the loss", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  global.fetch = jest.fn(refusingHost);
  expect((await save.savePage()).msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);

  const seen = onApplied();
  await sync._doApplyUpdate(sync.lastHtml.replace("budget is fine", REMOTE_A), 5, null, "E1");
  seen.stop();

  expect(seen[0].conflictIds).toHaveLength(1);
  expect(conflicts.size).toBe(1);
  expect(save.isSaveConflicted()).toBe(false);
  sync.stop();
});

test("the equal-HTML branch releases the hold over the loss it keeps", async () => {
  await settle(FIXTURE);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  const frame = sync.lastHtml.replace("budget is fine", REMOTE_A);
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  global.fetch = jest.fn(refusingHost);
  expect((await save.savePage()).msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 5, null, "E1");
  seen.stop();
  expect(seen[0].conflictIds).toHaveLength(1);
  expect(conflicts.size).toBe(1);
  expect(save.isSaveConflicted()).toBe(false);

  // The frame left the page holding exactly the bytes the host is at, so an
  // ordinary save has nothing to send and can never be refused again: the
  // forced write is what puts a second hold on with no unsaved work behind it.
  refusalEtag = "E2";
  global.fetch = jest.fn(refusingHost);
  expect((await save.savePageForce()).msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);

  // The peer relays the version that refused this tab, and this tab already
  // holds those bytes: the stamp alone answers the refusal.
  sync.sse.onmessage({
    data: JSON.stringify({ html: sync.lastHtml, sender: "peer", seq: 9, etag: "E2" }),
  });

  expect(save.isSaveConflicted()).toBe(false);
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("the disk lane releases the hold over the loss it keeps", async () => {
  await settle('<p id="p">budget is fine</p><p id="q">q0</p>');
  const sync = startSync();
  document.querySelector("#p").textContent = "budget is over";
  await Promise.resolve();

  global.fetch = jest.fn(refusingHost);
  expect((await save.savePage()).msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);

  const seen = onApplied();
  await sync._doApplyExternal(diskDoc('<p id="p">budget is approved</p><p id="q">q0</p>'), 1, "E1");
  seen.stop();

  expect(seen[0].conflictIds).toHaveLength(1);
  expect(conflicts.size).toBe(1);
  expect(save.isSaveConflicted()).toBe(false);
  sync.stop();
});

// ---------------------------------------------------------------------------
// an apply in flight and an apply that failed
// ---------------------------------------------------------------------------

test("the warning holds across a resource wait, save or no save", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  const frame = scriptFrame(
    sync.lastHtml.replace("budget is fine", REMOTE_A),
    "held-conflict-resource.js"
  );
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  const seen = onApplied();
  const applying = sync._doApplyUpdate(frame, 5, null);
  await wait(0);

  // The merge has already won the text but its record is not installed yet,
  // so the apply itself has to hold the close warning up.
  expect((await save.savePageForce()).ok).toBe(true);
  expect(closeWarns()).toBe(true);

  releaseScript("held-conflict-resource.js");
  await applying;
  seen.stop();

  expect(seen[0].conflictIds).toHaveLength(1);
  expect(conflicts.size).toBe(1);
  expect(closeWarns()).toBe(true);
  sync.stop();
});

test("a failed apply keeps a record, and acknowledging it clears the warning", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  etag.recordEtag("E9-parent");
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  // The merge touches the page and then throws. The engine's merge-tag
  // recognizers are the seam the three-way harness can reach: the vendor
  // exports `HyperMorph` as a frozen namespace, so mergeDocument itself cannot
  // be replaced from here.
  const { mergeTagRecognizers } = await import("../../src/sync/merge-tags.js");
  let mutated = false;
  const throwing = {
    match: (el) => {
      document.querySelector('[data-id="b"]').textContent = "b mutated";
      mutated = true;
      throw new Error("morph threw after mutating");
    },
    identity: () => null,
    parse: () => "",
  };
  mergeTagRecognizers.unshift(throwing);
  const frame = sync.lastHtml.replace(
    "</body>",
    '<script data-merge-fail="1"></script></body>'
  );
  try {
    await expect(sync._doApplyUpdate(frame.replace("budget is fine", REMOTE_A), 5, null, "E9"))
      .rejects.toThrow("morph threw after mutating");
  } finally {
    mergeTagRecognizers.shift(throwing);
  }

  expect(mutated).toBe(true);
  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(records[0].kind).toBe("apply-incomplete");
  expect(etag.lastSeenEtag()).toBe("E9-parent");
  expect(closeWarns()).toBe(true);

  // With the page's bytes written, the record is all the warning has left.
  expect((await save.savePageForce()).ok).toBe(true);
  expect(closeWarns()).toBe(true);

  conflicts.acknowledge([records[0].id], { reason: "reconciled" });

  expect(conflicts.size).toBe(0);
  expect(closeWarns()).toBe(false);
  sync.stop();
});

// The engine settles its returned promise on the frame's resource waits, and
// every load it watches resolves on `load` and on `error` alike, so a failing
// script cannot reject it. A listener registration that throws inside that
// promise is the one way the wait rejects with the apply already done, which is
// the gap the await catch exists for.
test("a merge that rejects at the await keeps a record of the page it landed on", async () => {
  await settle(FIXTURE);
  const sync = startSync();
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"]').textContent = LOCAL_A;
  await Promise.resolve();

  const realAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this.localName === "script" && this.getAttribute("src") === "rejected-conflict-resource.js") {
      throw new Error("resource wait rejected");
    }
    return realAdd.call(this, type, listener, options);
  };
  const frame = scriptFrame(
    sync.lastHtml.replace("budget is fine", REMOTE_A),
    "rejected-conflict-resource.js"
  );
  try {
    await expect(sync._doApplyUpdate(frame, 5, null)).rejects.toThrow("resource wait rejected");
  } finally {
    EventTarget.prototype.addEventListener = realAdd;
  }

  // The apply landed before it rejected: the frame's bytes are in the page,
  // and the record is what holds the text they replaced.
  expect(document.querySelector('[data-id="a"]').textContent).toBe(REMOTE_A);
  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(records[0].kind).toBe("apply-incomplete");
  const recovery = conflicts.recoveryOf(records[0].id);
  expect(recovery.root.textContent).toContain("over by 20 percent");
  expect(recovery.root.textContent).not.toContain(REMOTE_A);
  expect(conflicts.hasPendingApply()).toBe(false);

  // Live sync resumed: the next frame still merges.
  await sync._doApplyUpdate(captureFrame().replace("b0", "b1-peer"), 6, null);
  expect(document.querySelector('[data-id="b"]').textContent).toBe("b1-peer");

  expect((await save.savePageForce()).ok).toBe(true);
  expect(closeWarns()).toBe(true);

  conflicts.acknowledge([records[0].id], { reason: "reconciled" });

  expect(conflicts.size).toBe(0);
  expect(closeWarns()).toBe(false);
  sync.stop();
});

// ---------------------------------------------------------------------------
// the loader publishes the ledger
// ---------------------------------------------------------------------------

// attachPluginMember is not exported, so its source is lifted out of loader.js
// and the real function is called, the pattern loader-shape.test.js reads the
// loader's other branches with.
test("the loader attaches the ledger to clay.conflicts", async () => {
  const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
  const found = source.match(/^function attachPluginMember\(path, mod\) \{[\s\S]*?\n\}$/m);
  expect(found).not.toBeNull();
  const attachPluginMember = new Function(`${found[0]}\nreturn attachPluginMember;`)();

  window.clay = window.clay || {};
  attachPluginMember("sync/live-sync.js", liveSyncModule);

  expect(window.clay.conflicts).toBe(liveSyncModule.conflicts);
});
