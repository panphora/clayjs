import { jest } from "@jest/globals";

/**
 * Regression tests for the stale-frame review fixes (TRIAGE T1 to T5, T7, and the
 * T8 gates that no test caught before). Each test asserts the FIXED behaviour.
 *
 * The meta-capable fetch mock is installed BEFORE the imports: save.js asks
 * discovery at import, and that answer is what makes this a stamping host.
 * Relay and save answers are programmable per test (`relayResponder`,
 * `saveResponse`), and either may return a promise to hold a response open.
 */

class FakeEventSource extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 0; }
  close() {}
}

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };
const relayPosts = [];
const savePosts = [];
let metaMode = "ok";
let saveResponse;
let relayResponder;

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

// A relay answer is a status, an Error (network failure), or a promise of either.
function relayAnswer(r) {
  if (r instanceof Error) return Promise.reject(r);
  if (r && typeof r.then === "function") return r.then(relayAnswer);
  return respond(r, { success: r < 400 });
}

let LiveSync, snapshot, gate, save, etag, autosaveState;

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) {
      if (metaMode === "network") return Promise.reject(new TypeError("Failed to fetch"));
      if (metaMode === "404") return respond(404, "");
      return respond(200, META);
    }
    if (method === "POST" && u.includes("/_/sync")) {
      const body = JSON.parse(options.body);
      relayPosts.push({ url: u, body });
      return relayAnswer(relayResponder(body));
    }
    if (method === "POST" && u.includes("/_/save")) {
      savePosts.push({ url: u, headers: options.headers });
      const r = saveResponse(options);
      if (r && typeof r.then === "function") return r.then((x) => respond(x.status, x.body));
      return respond(r.status, r.body);
    }
    return respond(404, "");
  });

  const m = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = m);
  m.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  autosaveState = await import("../../src/lib/autosave-state.js");
  await import("../../src/core/save-conflict-notice.js");
  await etag.seedEtag();
  // Past save.js's load-time settle, which writes savestatus on its own.
  await wait(3200);
}, 15000);

// The conflict notice builds its bar once and keeps it; replacing the body would
// detach it, so it is carried over.
let barEl = null;
function bar() {
  if (!barEl) barEl = document.querySelector("[data-clay-conflict]");
  return barEl;
}

const started = [];

beforeEach(async () => {
  metaMode = "ok";
  META.document.etag = "E0";
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  relayResponder = () => 200;
  autosaveState.setAutosaveActive(false);
  // A hold left by the previous test is released the way a person would: a
  // save that lands.
  if (save.isSaveConflicted()) await save.savePageForce();
  document.documentElement.setAttribute("savestatus", "saved");
  const keep = bar();
  document.body.innerHTML = "";
  if (keep) document.body.appendChild(keep);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  // Past the 1200 ms autosave throttle window, so a throttled save runs at once.
  await wait(1300);
  relayPosts.length = 0;
  savePosts.length = 0;
  etag.recordEtag("E0");
}, 10000);

afterEach(() => {
  while (started.length) started.pop().stop();
});

function makeSync(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  return sync;
}

async function startSync() {
  const sync = makeSync();
  sync.start("index.html");
  started.push(sync);
  await sync._ready;
  return sync;
}

const captureFrame = () =>
  snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));


async function settle(body) {
  const keep = bar();
  document.body.innerHTML = body;
  if (keep) document.body.appendChild(keep);
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

function countEvents(...names) {
  const counts = Object.fromEntries(names.map((n) => [n, 0]));
  const handlers = names.map((n) => [n, () => counts[n]++]);
  for (const [n, h] of handlers) document.addEventListener(n, h);
  counts.stop = () => { for (const [n, h] of handlers) document.removeEventListener(n, h); };
  return counts;
}

const text = (id) => document.querySelector(`[data-id="${id}"]`).textContent;
const ifMatches = () => savePosts.map((p) => p.headers["If-Match"] ?? null);

const BOARD =
  '<div class="list" data-id="planning"><p class="card" data-id="one">One</p><p class="card" data-id="two">Two</p></div>' +
  '<div class="list" data-id="dev"><p class="card" data-id="three">Three</p></div>';

// ---------------------------------------------------------------------------
// T1 the hold is released by the version that refused the save, and only by it
// ---------------------------------------------------------------------------

test("T1a a 412 that arrives after this tab already merged the winner releases the hold on its own", async () => {
  await settle(BOARD);
  const sync = await startSync();
  const original = sync.lastHtml;
  const events = countEvents("clay:save-conflict", "clay:save-conflict-resolved", "clay:sync-applied");
  const reports = [];
  const onApplied = (e) => reports.push(e.detail.report);
  document.addEventListener("clay:sync-applied", onApplied);

  // Both tabs made the same edit. This tab's save is still on the wire when the
  // peer's landed save (E1) is relayed and merged.
  document.querySelector('[data-id="two"]').textContent = "Two SAME";
  await Promise.resolve();
  const response = deferred();
  saveResponse = () => response.promise;
  const inFlight = save.savePage();
  await tick();
  await sync._doApplyUpdate(original.replace(">Two<", ">Two SAME<"), 5, null, "E1");
  document.removeEventListener("clay:sync-applied", onApplied);
  expect(reports[0].localDiverged).toBe(false);
  expect(etag.lastSeenEtag()).toBe("E1");

  // The refusal names the stamp this tab already holds.
  response.resolve({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  expect((await inFlight).msgType).toBe("conflict");
  await tick();
  events.stop();

  expect(events["clay:save-conflict"]).toBe(1);
  expect(events["clay:save-conflict-resolved"]).toBe(1);
  expect(save.isSaveConflicted()).toBe(false);
  expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  expect(bar().style.display).toBe("none");

  // Autosave is running again, under the winner's stamp.
  document.querySelector('[data-id="one"]').textContent = "One later";
  await Promise.resolve();
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });
  const next = await save.savePageThrottled();
  expect(next.msg).not.toBe("Autosave suspended");
  expect(ifMatches()).toEqual(["E0", "E1"]);
});

test("T1b a frame whose stamp differs from the 412's (an older save arriving late) leaves the hold; the refusing version releases it", async () => {
  autosaveState.setAutosaveActive(true);
  await settle(BOARD);
  const original = captureFrame();
  const sync = makeSync();
  sync.lastHtml = original;
  const host = { etag: "E2" };
  saveResponse = (o) =>
    o.headers["If-Match"] === host.etag
      ? { status: 200, body: { msg: "Saved", etag: "E3" } }
      : { status: 412, body: { code: "conflict", changedBy: "another-tab", etag: host.etag } };
  const events = countEvents("clay:save-conflict-resolved");

  document.querySelector('[data-id="one"]').textContent = "One local";
  await Promise.resolve();
  expect((await save.savePage()).msgType).toBe("conflict");

  const frameE1 = original.replace(">Three<", ">Three E1<");
  await sync._doApplyUpdate(frameE1, 5, null, "E1");
  expect(save.isSaveConflicted()).toBe(true);
  expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
  expect(bar().style.display).toBe("flex");
  expect(events["clay:save-conflict-resolved"]).toBe(0);
  await wait(300);
  expect(ifMatches()).toEqual(["E0"]);

  await sync._doApplyUpdate(frameE1.replace(">Two<", ">Two E2<"), 6, null, "E2");
  expect(save.isSaveConflicted()).toBe(false);
  expect(events["clay:save-conflict-resolved"]).toBe(1);
  await wait(1500);
  events.stop();
  expect(ifMatches()).toEqual(["E0", "E2"]);
  expect([text("one"), text("two"), text("three")]).toEqual(["One local", "Two E2", "Three E1"]);
  expect(save.isSaveConflicted()).toBe(false);
});

// ---------------------------------------------------------------------------
// T2 a landed save is relayed even when its bytes equal the last relay
// ---------------------------------------------------------------------------

test("T2 Keep mine whose bytes equal this tab's last relay is still relayed, with its stamp", async () => {
  await settle(BOARD);
  const sync = await startSync();

  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  expect((await save.savePage()).ok).toBe(true);
  await wait(50);
  expect(relayPosts).toHaveLength(1);
  const x = relayPosts[0].body.snapshot;
  expect(sync.lastHtml).toBe(x);

  // A peer saved E2; this tab edits and is refused.
  document.querySelector('[data-id="two"]').textContent = "Two Y";
  await Promise.resolve();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E2" } });
  expect((await save.savePage()).msgType).toBe("conflict");

  // Undo back to what it last saved, then Keep mine: disk goes from E2 back to X.
  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  META.document.etag = "E2";
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  expect((await save.saveOverwritingConflict()).ok).toBe(true);
  expect(savePosts[2].headers["If-Match"]).toBe("E2");
  await wait(50);

  expect(relayPosts).toHaveLength(2);
  expect(relayPosts[1].body.snapshot).toBe(x);
  expect(relayPosts[1].body.etag).toBe("E1");
});

// ---------------------------------------------------------------------------
// T3 a stamp-only frame answers the refusal too
// ---------------------------------------------------------------------------

test("T3 a stamp-only frame (html equals lastHtml) under a hold releases it, and an autosave page saves under that stamp", async () => {
  autosaveState.setAutosaveActive(true);
  await settle(BOARD);
  const sync = await startSync();
  const seed = sync.lastHtml;

  document.querySelector('[data-id="one"]').textContent = "One local";
  await Promise.resolve();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  expect((await save.savePage()).msgType).toBe("conflict");
  await tick();
  expect(save.isSaveConflicted()).toBe(true);

  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });
  sync.sse.onmessage({ data: JSON.stringify({ html: seed, sender: "peer", seq: 50, etag: "E1" }) });
  expect(etag.lastSeenEtag()).toBe("E1");
  expect(save.isSaveConflicted()).toBe(false);
  await wait(200);
  expect(ifMatches()).toEqual(["E0", "E1"]);
  expect(etag.lastSeenEtag()).toBe("E2");
  expect(save.getLastSavedBytes()).toContain("One local");
});

// ---------------------------------------------------------------------------
// T4 the relay of a landed save survives a transient failure
// ---------------------------------------------------------------------------

test("T4 a relay that fails with a network error, then a 5xx, is retried with its stamp and lands", async () => {
  await settle(BOARD);
  const sync = await startSync();
  const answers = [new TypeError("Failed to fetch"), 503, 200];
  relayResponder = () => answers.shift() ?? 200;

  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  expect((await save.savePage()).ok).toBe(true);
  await wait(1900);

  expect(relayPosts).toHaveLength(3);
  expect(relayPosts.map((p) => p.body.etag)).toEqual(["E1", "E1", "E1"]);
  expect(new Set(relayPosts.map((p) => p.body.snapshot)).size).toBe(1);
  expect(relayPosts[0].body.snapshot).toContain("Two X");
  expect(sync.lastHtml).toBe(relayPosts[0].body.snapshot);
});

// ---------------------------------------------------------------------------
// T7 only a save's own capture sets what its relay carries
// ---------------------------------------------------------------------------

test("T7 a public captureForSave() between a save's capture and its response does not change what is relayed", async () => {
  await settle(BOARD);
  await startSync();

  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  const response = deferred();
  saveResponse = () => response.promise;
  const inFlight = save.savePage();
  await tick();

  document.querySelector('[data-id="two"]').textContent = "Two Y";
  await Promise.resolve();
  snapshot.captureForSave();

  response.resolve({ status: 200, body: { msg: "Saved", etag: "E1" } });
  expect((await inFlight).ok).toBe(true);
  await wait(50);

  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.etag).toBe("E1");
  expect(relayPosts[0].body.snapshot).toContain("Two X");
  expect(relayPosts[0].body.snapshot).not.toContain("Two Y");
});

// ---------------------------------------------------------------------------
// T8 gates
// ---------------------------------------------------------------------------

test("G1 a merge that loses this tab's text keeps the hold, the bar, and autosave off", async () => {
  autosaveState.setAutosaveActive(true);
  await settle('<p data-id="a">budget is fine</p><p data-id="b">b0</p>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  const remote = sync.lastHtml.replace("budget is fine", "budget is approved");

  document.querySelector('[data-id="a"]').textContent = "budget is over by 20 percent";
  await Promise.resolve();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  expect((await save.savePage()).msgType).toBe("conflict");

  await sync._doApplyUpdate(remote, 5, null, "E1");
  expect(sync.unresolvedConflicts.length).toBeGreaterThan(0);
  expect(save.isSaveConflicted()).toBe(true);
  expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
  expect(bar().style.display).toBe("flex");
  await wait(1500);
  expect(ifMatches()).toEqual(["E0"]);
});

test("G2 an unstamped merge does not release a hold, even one whose 412 named no stamp; a stamped merge does", async () => {
  await settle(BOARD);
  const original = captureFrame();
  const sync = makeSync();
  sync.lastHtml = original;

  document.querySelector('[data-id="one"]').textContent = "One local";
  await Promise.resolve();
  // A proxy's 412 with no body: nothing says which version refused the save.
  saveResponse = () => ({ status: 412, body: "" });
  expect((await save.savePage()).msgType).toBe("conflict");

  const frame = original.replace(">Three<", ">Three remote<");
  await sync._doApplyUpdate(frame, 5, null, null);
  expect(text("three")).toBe("Three remote");
  expect(save.isSaveConflicted()).toBe(true);

  await sync._doApplyUpdate(frame.replace(">Two<", ">Two remote<"), 6, null, "E1");
  expect(save.isSaveConflicted()).toBe(false);
});

test("G3 disk lane: the stamped external frame that refused the save releases the hold, both edits kept, and the merge is saved", async () => {
  autosaveState.setAutosaveActive(true);
  await settle(BOARD);
  const sync = makeSync();
  sync._diskBase = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;

  document.querySelector('[data-id="one"]').textContent = "One local";
  await Promise.resolve();
  saveResponse = (o) =>
    o.headers["If-Match"] === "E1"
      ? { status: 200, body: { msg: "Saved", etag: "E2" } }
      : { status: 412, body: { code: "conflict", changedBy: "an-agent", etag: "E1" } };
  expect((await save.savePage()).msgType).toBe("conflict");

  await sync._doApplyExternal(sync._diskBase.replace(">Three<", ">Three disk<"), 7, "E1");
  expect(text("one")).toBe("One local");
  expect(text("three")).toBe("Three disk");
  expect(save.isSaveConflicted()).toBe(false);
  expect(document.documentElement.getAttribute("savestatus")).not.toBe("conflict");
  await wait(300);
  expect(ifMatches()).toEqual(["E0", "E1"]);
  expect(save.getLastSavedBytes()).toContain("One local");
  expect(save.getLastSavedBytes()).toContain("Three disk");
});

test("G4 on an autosave page the refused tab converges by itself: no explicit save after the merge", async () => {
  autosaveState.setAutosaveActive(true);
  await settle(BOARD);
  const original = captureFrame();
  const sync = makeSync();
  sync.lastHtml = original;

  document.querySelector('[data-id="dev"]').appendChild(document.querySelector('[data-id="two"]'));
  await Promise.resolve();
  saveResponse = (o) =>
    o.headers["If-Match"] === "E1"
      ? { status: 200, body: { msg: "Saved", etag: "E2" } }
      : { status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } };
  expect((await save.savePage()).msgType).toBe("conflict");

  await sync._doApplyUpdate(original.replace(">Two<", ">Two EDITED<"), 5, null, "E1");
  await wait(300);
  expect(ifMatches()).toEqual(["E0", "E1"]);
  expect(save.isSaveConflicted()).toBe(false);
  expect(save.getLastSavedBytes()).toContain("Two EDITED");
  const two = document.querySelector('[data-id="two"]');
  expect(two.parentElement.getAttribute("data-id")).toBe("dev");
  expect(two.textContent).toBe("Two EDITED");
});

test("G5 a relay queued behind one in flight keeps its own stamp", async () => {
  await settle(BOARD);
  await startSync();
  const first = deferred();
  let calls = 0;
  relayResponder = () => (calls++ === 0 ? first.promise : 200);

  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  expect((await save.savePage()).ok).toBe(true);
  await tick();
  expect(relayPosts).toHaveLength(1);

  document.querySelector('[data-id="two"]').textContent = "Two Y";
  await Promise.resolve();
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });
  expect((await save.savePage()).ok).toBe(true);
  await tick();
  expect(relayPosts).toHaveLength(1);

  first.resolve(200);
  await wait(50);
  expect(relayPosts).toHaveLength(2);
  expect(relayPosts[0].body.etag).toBe("E1");
  expect(relayPosts[1].body.etag).toBe("E2");
  expect(relayPosts[1].body.snapshot).toContain("Two Y");
});

test("G6 a save captured during a frame's apply window is still relayed once it lands", async () => {
  await settle(BOARD);
  const sync = await startSync();
  const original = sync.lastHtml;

  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  const applying = sync._doApplyUpdate(original.replace(">Three<", ">Three remote<"), 5, null, null);
  expect(sync.isPaused).toBe(true);
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  const saving = save.savePage();
  await applying;
  expect((await saving).ok).toBe(true);
  await wait(50);

  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.etag).toBe("E1");
  expect(relayPosts[0].body.snapshot).toContain("Two X");
  expect(relayPosts[0].body.snapshot).toContain("Three remote");
});

test("G7 a release whose merge left nothing to write sends no save, even with a missed autosave pending", async () => {
  autosaveState.setAutosaveActive(true);
  await settle(BOARD);
  const original = captureFrame();
  const sync = makeSync();
  sync.lastHtml = original;

  document.querySelector('[data-id="two"]').textContent = "Two SAME";
  await Promise.resolve();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  expect((await save.savePage()).msgType).toBe("conflict");
  expect((await save.savePageThrottled()).msg).toBe("Autosave suspended");

  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  await sync._doApplyUpdate(original.replace(">Two<", ">Two SAME<"), 5, null, "E1");
  expect(save.isSaveConflicted()).toBe(false);
  await wait(1500);
  expect(ifMatches()).toEqual(["E0"]);
  expect(gate.pageMaybeDirty()).toBe(false);
});

// ---------------------------------------------------------------------------
// T5 last: it replaces the memoized discovery answer and restores it.
// ---------------------------------------------------------------------------

test("T5 a failed fresh /_/meta (network error or 404, a bare host) keeps conditional saves on", async () => {
  expect(etag.conditionalSaves()).toBe(true);

  metaMode = "network";
  await etag.seedEtag({ fresh: true, clearIfMissing: false });
  expect(etag.conditionalSaves()).toBe(true);

  metaMode = "404";
  await etag.seedEtag({ fresh: true, clearIfMissing: false });
  expect(etag.conditionalSaves()).toBe(true);

  await settle(BOARD);
  document.querySelector('[data-id="two"]').textContent = "Two X";
  await Promise.resolve();
  expect((await save.savePage()).ok).toBe(true);
  expect(savePosts[0].headers["If-Match"]).toBe("E0");

  metaMode = "ok";
  await etag.seedEtag({ fresh: true });
  expect(etag.conditionalSaves()).toBe(true);
});

test("T7b a public captureForSave() during a save does not move its ticket, so a conflict from a later frame survives the save", async () => {
  await settle('<p data-id="a">budget is fine</p><p data-id="b">b0</p>');
  const sync = await startSync();
  const remote = sync.lastHtml.replace("budget is fine", "budget is approved");
  document.querySelector('[data-id="a"]').textContent = "budget is over";
  await Promise.resolve();
  const response = deferred();
  saveResponse = () => response.promise;
  const saving = save.savePage();
  await tick();
  await sync._doApplyUpdate(remote, 1, null, null);
  const lost = sync.unresolvedConflicts.length;
  expect(lost).toBeGreaterThan(0);
  snapshot.captureForSave();
  response.resolve({ status: 200, body: { msg: "Saved", etag: "E1" } });
  expect((await saving).ok).toBe(true);
  expect(sync.unresolvedConflicts).toHaveLength(lost);
});
