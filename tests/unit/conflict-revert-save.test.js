import { jest } from "@jest/globals";

/**
 * Revert to mine, the whole command: several batches over one spot, the click race,
 * Download then Revert, every way a save can go wrong, the stampless repeat, two tabs,
 * and the notice's button. Records come from real merges through a real LiveSync
 * apply; the notice is the real one, driven through its buttons.
 *
 * The fetch mock records every save and relay POST and is installed before the
 * imports: save.js asks discovery at import, and that answer is what makes this a
 * stamping host until a test says otherwise.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };
const relayPosts = [];
const savePosts = [];
let saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });

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

let LiveSync;
let conflicts;
let beginApply;
let completeApply;
let snapshot;
let gate;
let save;
let etag;
let autosaveState;
let revert;
let downloadRecovery;
let notice;

beforeAll(async () => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  document.documentElement.setAttribute("autosave", "");
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/sync")) {
      relayPosts.push(JSON.parse(options.body));
      return respond(200, { success: true });
    }
    if (method === "POST" && u.includes("/_/save")) {
      savePosts.push(String(options.body || ""));
      const r = saveResponse(options);
      if (r && typeof r.then === "function") return r.then((x) => respond(x.status, x.body));
      return respond(r.status, r.body);
    }
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  ({ beginApply, completeApply } = await import("../../src/sync/conflicts.js"));

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/admin-contenteditable.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");
  await import("../../src/core/autosave.js");

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  autosaveState = await import("../../src/lib/autosave-state.js");
  revert = await import("../../src/sync/conflict-revert.js");
  ({ downloadRecovery } = await import("../../src/core/conflict-download.js"));
  notice = await import("../../src/core/conflict-notice.js");
  await etag.seedEtag();
});

beforeEach(async () => {
  relayPosts.length = 0;
  savePosts.length = 0;
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  if (save.isSaveConflicted()) await save.savePageForce();
  window.clay = { conflicts };
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  autosaveState.setAutosaveActive(false);
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
});

const started = [];

afterEach(async () => {
  while (started.length) started.pop().stop();
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
  await frame();
  delete window.clay;
  document.documentElement.removeAttribute("autosave");
  autosaveState.setAutosaveActive(false);
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  started.push(sync);
  return sync;
}

// A tab as it stands after boot: discovery done, so a landed save relays.
async function startSync() {
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  return sync;
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
const tick = () => new Promise((r) => setTimeout(r, 0));
// The old 5 ms, then let pending promise work schedule its render and wait out that frame.
const frame = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 5));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The page without the notice's own root, which lives in the body and saves nothing.
function body() {
  const clone = document.body.cloneNode(true);
  clone.querySelector("[data-clay-conflict]")?.remove();
  return clone.innerHTML;
}

async function waitFor(predicate, timeout = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (predicate()) return;
    await wait(25);
  }
}

async function settle(html) {
  document.body.innerHTML = html;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

async function lose(sync, base, local, remote, seq = 5) {
  await settle(base);
  sync.lastHtml = captureFrame();
  document.body.innerHTML = local;
  await Promise.resolve();
  const frameHtml = sync.lastHtml.replace(`<body>${base}</body>`, `<body>${remote}</body>`);
  expect(frameHtml).not.toBe(sync.lastHtml);
  const before = new Set(conflicts.list().map((r) => r.id));
  await sync._doApplyUpdate(frameHtml, seq, null);
  const ids = conflicts.list().map((r) => r.id).filter((id) => !before.has(id));
  expect(ids.length).toBeGreaterThan(0);
  expect(body()).toBe(remote);
  return ids;
}

// A second loss on a page that already holds one: this tab edits the merged page
// and a newer frame, built on what the page shows, replaces that edit too.
async function loseAgain(sync, local, remote, seq) {
  sync.lastHtml = captureFrame();
  document.body.innerHTML = local;
  await Promise.resolve();
  const current = sync.lastHtml;
  const frameHtml = current.replace(/<body>[\s\S]*<\/body>/, `<body>${remote}</body>`);
  expect(frameHtml).not.toBe(current);
  const before = new Set(conflicts.list().map((r) => r.id));
  await sync._doApplyUpdate(frameHtml, seq, null);
  const ids = conflicts.list().map((r) => r.id).filter((id) => !before.has(id));
  expect(ids.length).toBeGreaterThan(0);
  expect(body()).toBe(remote);
  return ids;
}

function closeWarns() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const root = () => document.querySelector("[data-clay-conflict]");
const buttons = () => (root() ? [...root().querySelectorAll("button")] : []);
const buttonSaying = (re) => buttons().find((b) => re.test(b.textContent));
const shown = () => (root() ? root().textContent : "");

const T1 = [`<p id="p">One quick fox sleeps.</p><p id="q">q0</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">q0</p>`];

// ---------------------------------------------------------------------------
// R11, R12: several batches over one spot
// ---------------------------------------------------------------------------

test("R11 the click race: a newer unselected loss on the spot blocks the selected one; a disjoint one still restores", async () => {
  const sync = makeSync();
  const [A, C] = await lose(sync, `<p id="p">One quick fox sleeps.</p><p id="q">quick</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">slow</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">fast</p>`);
  // The notice drew A and C; before the click, this tab typed over the spot again
  // and another frame replaced that too.
  const [B] = await loseAgain(sync, `<p id="p">One slower fox sleeps.</p><p id="q">fast</p>`, `<p id="p">One faster fox sleeps.</p><p id="q">fast</p>`, 6);
  expect(conflicts.recoveryOf(B).ticket).toBeGreaterThan(conflicts.recoveryOf(A).ticket);

  const result = await revert.revertConflicts([A, C]);

  expect(result.revertedIds).toEqual([C]);
  expect(result.blockedIds).toEqual([A]);
  expect(body()).toBe(`<p id="p">One faster fox sleeps.</p><p id="q">slow</p>`);
  expect(conflicts.list().map((r) => r.id).sort()).toEqual([A, B].sort());
  expect(savePosts).toHaveLength(1);
});

test("R12 the same spot lost twice: selecting both restores the newest intention; the older alone, with the newer unseen, changes nothing", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, ...T1);
  const [B] = await loseAgain(sync, `<p id="p">One slower fox sleeps.</p><p id="q">q0</p>`, `<p id="p">One faster fox sleeps.</p><p id="q">q0</p>`, 6);

  const alone = await revert.revertConflicts([A]);
  expect(alone).toEqual({ revertedIds: [], blockedIds: [A], saveResult: null });
  expect(body()).toBe(`<p id="p">One faster fox sleeps.</p><p id="q">q0</p>`);
  expect(conflicts.size).toBe(2);

  const both = await revert.revertConflicts([A, B]);
  expect([...both.revertedIds].sort()).toEqual([A, B].sort());
  expect(both.blockedIds).toEqual([]);
  expect(body()).toBe(`<p id="p">One slower fox sleeps.</p><p id="q">q0</p>`);
  expect(conflicts.size).toBe(0);
  expect(savePosts).toHaveLength(1);
});

test("a newer loss inside a section this tab deleted blocks the deletion and restores itself", async () => {
  const sync = makeSync();
  const [del] = await lose(sync, `<section id="s"><p id="k">old words</p></section><p id="n">n</p>`, `<p id="n">n</p>`, `<section id="s"><p id="k">new words</p></section><p id="n">n</p>`);
  const [text] = await loseAgain(sync, `<section id="s"><p id="k">my words</p></section><p id="n">n</p>`, `<section id="s"><p id="k">their words</p></section><p id="n">n</p>`, 6);

  const result = await revert.revertConflicts([del, text]);

  expect(result.revertedIds).toEqual([text]);
  expect(result.blockedIds).toEqual([del]);
  expect(body()).toBe(`<section id="s"><p id="k">my words</p></section><p id="n">n</p>`);
});

// ---------------------------------------------------------------------------
// R13: Download my copy first
// ---------------------------------------------------------------------------

test("R13 Download then Revert: the copy is built and the payload still restores", async () => {
  const sync = makeSync();
  const ids = await lose(
    sync,
    `<p id="t">One quick fox.</p><div id="a"><p id="mp">P</p></div><div id="b"></div><div id="c"></div><section id="s"><h2>FAQ</h2></section><p id="n">n</p><div id="i"></div>`,
    `<p id="t">One slow fox.</p><div id="a"></div><div id="b"><p id="mp">P</p></div><div id="c"></div><p id="n">n</p><div id="i"><p id="ip">LOCAL</p></div>`,
    `<p id="t">One fast fox.</p><div id="a"></div><div id="b"></div><div id="c"><p id="mp">P</p></div><section id="s"><h2>FAQ!</h2></section><p id="n">n</p><div id="i"><p id="ip">REMOTE</p></div>`
  );
  expect(ids).toHaveLength(4);
  const create = jest.fn(() => "blob:revert");
  URL.createObjectURL = create;
  URL.revokeObjectURL = jest.fn();
  expect(downloadRecovery(ids.map((id) => conflicts.get(id)))).toBe(true);
  expect(create).toHaveBeenCalledTimes(1);
  expect(conflicts.size).toBe(4);

  const result = await revert.revertConflicts(ids);

  expect([...result.revertedIds].sort()).toEqual([...ids].sort());
  expect(body()).toBe(`<p id="t">One slow fox.</p><div id="a"></div><div id="b"><p id="mp">P</p></div><div id="c"></div><p id="n">n</p><div id="i"><p id="ip">LOCAL</p></div>`);
  expect(conflicts.size).toBe(0);
});

// ---------------------------------------------------------------------------
// R14: the save goes wrong
// ---------------------------------------------------------------------------

test("R14 a failed save leaves the restored page in place, dirty and warned about, ids acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  saveResponse = () => ({ status: 500, body: "boom" });

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.saveResult.ok).toBeFalsy();
  expect(result.saveResult.msgType).toBe("error");
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`);
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(closeWarns()).toBe(true);
  expect(conflicts.size).toBe(0);
  expect(savePosts).toHaveLength(1);
});

test("R14 a 412 puts the refused state on; nothing overwrites by itself", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E9" } });

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.saveResult.msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`);
  expect(savePosts).toHaveLength(1);
  await frame();
  expect(shown()).toContain("This page changed in another tab. Your edits here are safe.");
  save.conflictResolvedBySync("E9");
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
});

test("R14 a save already on the wire queues the revert, and the drain sends the restored bytes", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  document.getElementById("q").textContent = "q1";
  await Promise.resolve();
  let release;
  saveResponse = () => new Promise((r) => { release = () => r({ status: 200, body: { msg: "Saved", etag: "E1" } }); });
  const first = save.savePage();
  await tick();
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.saveResult.msgType).toBe("skipped");
  expect(result.saveResult.msg).toBe("Save already in progress");
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q1</p>`);
  expect(conflicts.size).toBe(0);

  release();
  expect((await first).ok).toBe(true);
  await waitFor(() => savePosts.length === 2);
  await frame();
  expect(savePosts).toHaveLength(2);
  expect(savePosts[1]).toContain("One slow fox sleeps.");
});

test("R14 a manual-save page still sends exactly one requested save", async () => {
  const sync = makeSync();
  expect(document.documentElement.hasAttribute("autosave")).toBe(false);
  const [id] = await lose(sync, ...T1);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.saveResult.ok).toBe(true);
  expect(savePosts).toHaveLength(1);
  expect(savePosts[0]).toContain("One slow fox sleeps.");
  await wait(50);
  expect(savePosts).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// R15: the stampless repeat
// ---------------------------------------------------------------------------

test("R15 unstamped host: a revert whose bytes equal the peer base sends nothing; one that changes bytes relays once", async () => {
  const sync = await startSync();
  etag.recordEtag(null);
  saveResponse = () => ({ status: 200, body: { msg: "Saved" } });
  const [id] = await lose(sync, ...T1);
  // A later clean frame brings this tab's word back: the page and the base now
  // hold what the revert would write.
  await sync._doApplyUpdate(sync.lastHtml.replace("One fast fox sleeps.", "One slow fox sleeps."), 6, null);
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`);
  expect(gate.pageMaybeDirty()).toBe(false);
  const base = sync.lastHtml;
  expect(base).toContain("One slow fox sleeps.");

  const repeat = await revert.revertConflicts([id]);

  expect(repeat.revertedIds).toEqual([id]);
  expect(repeat.saveResult.msg).toBe("No changes to save");
  expect(savePosts).toHaveLength(0);
  expect(relayPosts).toHaveLength(0);
  expect(sync.lastHtml).toBe(base);

  const [second] = await lose(sync, ...T1, 7);
  const changed = await revert.revertConflicts([second]);
  await tick();

  expect(changed.revertedIds).toEqual([second]);
  expect(changed.saveResult.ok).toBe(true);
  expect(savePosts).toHaveLength(1);
  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].etag).toBeUndefined();
  expect(relayPosts[0].snapshot).toContain("One slow fox sleeps.");
  expect(sync.lastHtml).toBe(relayPosts[0].snapshot);
});

// ---------------------------------------------------------------------------
// R16: two tabs
// ---------------------------------------------------------------------------

test("R16 tab A reverts and its save relays; dirty tab B merges that frame and records its own loss", async () => {
  const A = await startSync();
  const [lost] = await lose(A, ...T1);
  const frameA = A.lastHtml;

  const result = await revert.revertConflicts([lost]);
  await tick();

  expect(result.revertedIds).toEqual([lost]);
  expect(savePosts).toHaveLength(1);
  expect(relayPosts).toHaveLength(1);
  const relayed = relayPosts[0];
  expect(relayed.snapshot).toContain("One slow fox sleeps.");
  expect(relayed.etag).toBe("E1");
  A.stop();

  // Tab B: holds the frame both tabs descended from, and has typed over the same
  // word since. A's relay lands on it.
  await settle(`<p id="p">One fast fox sleeps.</p><p id="q">q0</p>`);
  const B = makeSync();
  B.lastHtml = frameA;
  document.getElementById("p").firstChild.data = "One faster fox sleeps.";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);

  await B._doApplyUpdate(relayed.snapshot, 9, relayed.identityMap || null, relayed.etag);

  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`);
  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(records[0].recovery.text.local.fragment).toBe("faster");
  expect(records[0].recovery.text.merged.fragment).toBe("slow");
});

// ---------------------------------------------------------------------------
// the notice's button
// ---------------------------------------------------------------------------

test("the panel offers Revert to mine between Download and Accept; pressing it puts the edits back, says so, and redraws", async () => {
  const sync = makeSync();
  const ids = await lose(sync, `<p id="p">One quick fox sleeps.</p><a id="a" href="/a">Go</a>`, `<p id="p">One slow fox sleeps.</p><a id="a" href="/mine">Go</a>`, `<p id="p">One fast fox sleeps.</p><a id="a" href="/theirs">Go</a>`);
  expect(ids).toHaveLength(2);
  await frame();
  expect(shown()).toContain("Another edit replaced 2 changes.");
  buttonSaying(/Review/).click();
  const labels = buttons().map((b) => b.textContent).filter(Boolean);
  expect(labels.indexOf("Download my copy")).toBeLessThan(labels.indexOf("Revert to mine"));
  expect(labels.indexOf("Revert to mine")).toBeLessThan(labels.indexOf("Accept theirs"));

  buttonSaying(/Revert to mine/).click();
  expect(buttonSaying(/Putting back…/)).toBeDefined();
  await waitFor(() => conflicts.size === 0);
  await frame();

  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><a id="a" href="/mine">Go</a>`);
  expect(shown()).toBe("Put back 2 changes. Saving.");
  expect(root().firstElementChild.getAttribute("role")).toBe("status");
  expect(savePosts).toHaveLength(1);
  expect(notice._test.state().view).toBe("hidden");

  // Let the toast expire before the next test builds a notice in this root.
  await wait(4100);
  await frame();
}, 10000);

test("a blocked id keeps its row, with the reason under it, and the toast counts only what went back", async () => {
  const sync = makeSync();
  const [A, C] = await lose(sync, `<p id="p">One quick fox sleeps.</p><p id="q">quick</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">slow</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">fast</p>`);
  await frame();
  buttonSaying(/Review/).click();
  expect(notice._test.state().renderedIds.sort()).toEqual([A, C].sort());
  // Before the click, this tab types over the lost spot, across its edge: that spot
  // is no longer the record's.
  document.getElementById("p").firstChild.data = "OnXst fox sleeps.";

  buttonSaying(/Revert to mine/).click();
  await waitFor(() => !conflicts.get(C));
  await frame();

  expect(body()).toBe(`<p id="p">OnXst fox sleeps.</p><p id="q">slow</p>`);
  expect(shown()).toBe("Put back 1 change. Saving.");
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);
  await wait(4100);
  await frame();
  expect(shown()).toContain("Another edit replaced 1 change.");
  buttonSaying(/Review/).click();
  buttonSaying(/See the edits/).click();
  const text = shown();
  expect(text.split("This spot changed again. Review the latest edit or download your copy.").length - 1).toBe(1);

  conflicts.acknowledge([A], { reason: "accepted" });
  await frame();
  expect(shown()).not.toContain("This spot changed again.");
}, 10000);

test("while an apply is pending the button is disabled and says so; it comes back when the apply lands", async () => {
  const sync = makeSync();
  await lose(sync, ...T1);
  await frame();
  buttonSaying(/Review/).click();
  expect(buttonSaying(/Revert to mine/).getAttribute("aria-disabled")).toBeNull();

  const applyId = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  await frame();
  const pending = buttonSaying(/Finishing the incoming edit…/);
  expect(pending).toBeDefined();
  expect(pending.getAttribute("aria-disabled")).toBe("true");
  pending.click();
  await frame();
  expect(conflicts.size).toBe(1);
  expect(savePosts).toHaveLength(0);

  completeApply(applyId, [], { ticket: 8 });
  await frame();
  expect(buttonSaying(/Revert to mine/).getAttribute("aria-disabled")).toBeNull();
  expect(buttonSaying(/Finishing the incoming edit…/)).toBeUndefined();
});

test("Revert acknowledges only what it put back; Accept and Download stay what they were", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  await frame();
  buttonSaying(/Review/).click();
  const acknowledged = [];
  document.addEventListener("clay:sync-conflicts-changed", (e) => { if (e.detail.reason) acknowledged.push([e.detail.reason, ...e.detail.removedIds]); }, { once: true });

  buttonSaying(/Revert to mine/).click();
  await waitFor(() => conflicts.size === 0);

  expect(acknowledged).toEqual([["reverted", id]]);
  await wait(4100);
  await frame();
}, 10000);

test("O5 a refused save shows the refusal at once, no toast, and the restored id is acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  await frame();
  buttonSaying(/Review/).click();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E9" } });

  buttonSaying(/Revert to mine/).click();
  await waitFor(() => conflicts.size === 0);
  await frame();
  expect(shown()).not.toContain("Put back");
  expect(save.isSaveConflicted()).toBe(true);
  expect(notice._test.state().view).toBe("bar");
  expect(savePosts).toHaveLength(1);
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p><p id="q">q0</p>`);

  save.conflictResolvedBySync("E9");
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
  await frame();
});

test("C12 a partial revert hands focus to Review once the toast has gone", async () => {
  const sync = makeSync();
  const [A, C] = await lose(sync, `<p id="p">One quick fox sleeps.</p><p id="q">quick</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">slow</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">fast</p>`);
  await frame();
  buttonSaying(/Review/).click();
  document.getElementById("p").firstChild.data = "OnXst fox sleeps.";
  const put = buttonSaying(/Revert to mine/);
  put.focus();
  expect(document.activeElement).toBe(put);

  put.click();
  await waitFor(() => !conflicts.get(C));
  await frame();
  expect(shown()).toBe("Put back 1 change. Saving.");
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);
  await wait(4100);
  await frame();
  expect(document.activeElement).toBe(buttonSaying(/Review/));
}, 10000);

// ---------------------------------------------------------------------------
// round 2: the notice during and after the toast
// ---------------------------------------------------------------------------

test("N7 C11 the person clicks into the page during the toast: focus stays there once the toast has gone", async () => {
  const sync = makeSync();
  const [A, C] = await lose(sync, `<p id="p">One quick fox sleeps.</p><p id="q">quick</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">slow</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">fast</p>`);
  await frame();
  buttonSaying(/Review/).click();
  document.getElementById("p").firstChild.data = "OnXst fox sleeps.";
  const put = buttonSaying(/Revert to mine/);
  put.focus();
  put.click();
  await waitFor(() => !conflicts.get(C));
  await frame();
  expect(shown()).toBe("Put back 1 change. Saving.");
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);

  const input = document.createElement("input");
  input.id = "continued-editing";
  document.body.append(input);
  input.focus();
  expect(document.activeElement).toBe(input);
  await wait(4100);
  await frame();
  expect(shown()).toContain("Another edit replaced 1 change.");
  expect(document.activeElement).toBe(input);
  input.remove();
}, 10000);

test("C12 a revert queued behind a save on the wire whose drained save is refused: the refusal replaces the toast at once", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, ...T1);
  await frame();
  buttonSaying(/Review/).click();
  document.getElementById("q").textContent = "q1";
  await Promise.resolve();
  let release;
  saveResponse = () => new Promise((r) => { release = () => r({ status: 200, body: { msg: "Saved", etag: "E1" } }); });
  const first = save.savePage();
  await tick();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E9" } });

  buttonSaying(/Revert to mine/).click();
  await waitFor(() => conflicts.size === 0);
  await frame();
  expect(shown()).toBe("Put back 1 change. Saving.");
  expect(conflicts.get(id)).toBeNull();

  release();
  await first;
  await waitFor(() => save.isSaveConflicted());
  await frame();
  expect(shown()).not.toContain("Put back");
  expect(notice._test.state().refused).toBeTruthy();
  expect(notice._test.state().view).toBe("bar");
  expect(savePosts).toHaveLength(2);

  save.conflictResolvedBySync("E9");
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
  await frame();
}, 10000);

// ---------------------------------------------------------------------------
// round 3: focus through the save wait, and undo
// ---------------------------------------------------------------------------

test("C9 the person moves focus into the page while the revert's save is on the wire: focus stays there once the toast has gone", async () => {
  const sync = makeSync();
  const [A, C] = await lose(sync, `<p id="p">One quick fox sleeps.</p><p id="q">quick</p>`, `<p id="p">One slow fox sleeps.</p><p id="q">slow</p>`, `<p id="p">One fast fox sleeps.</p><p id="q">fast</p>`);
  await frame();
  buttonSaying(/Review/).click();
  document.getElementById("p").firstChild.data = "OnXst fox sleeps.";
  let release;
  saveResponse = () => new Promise((r) => { release = () => r({ status: 200, body: { msg: "Saved", etag: "E1" } }); });
  const put = buttonSaying(/Revert to mine/);
  put.focus();
  put.click();
  await waitFor(() => !!release);

  const input = document.createElement("input");
  input.id = "continued-editing";
  document.body.append(input);
  input.focus();
  expect(document.activeElement).toBe(input);
  release();
  await frame();
  await frame();
  expect(shown()).toBe("Put back 1 change. Saving.");
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);
  expect(conflicts.get(C)).toBeNull();
  await wait(4100);
  await frame();
  expect(shown()).toContain("Another edit replaced 1 change.");
  expect(document.activeElement).toBe(input);
  input.remove();
}, 10000);

// The undo plugin as the loader wires it: the hub is published on clay.Mutation
// before the plugin starts, the plugin starts the recorder with its keys bound, and
// the loader attaches it as clay.undo.
async function withUndo() {
  window.clay.Mutation = window.__clayMutation;
  const { undo } = await import("../../src/plugins/undo.js");
  undo.stop();
  undo.start({ bindKeys: true });
  window.clay.undo = undo;
  return undo;
}

const ctrlZ = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));

test("O5 C4 with the undo plugin loaded, a revert is one undo entry: Ctrl+Z puts the other side's text back", async () => {
  const undo = await withUndo();
  try {
    const sync = makeSync();
    const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
    await tick();
    undo.flush();
    undo.clear();

    expect((await revert.revertConflicts([id])).revertedIds).toEqual([id]);
    await tick();
    undo.flush();
    expect(body()).toBe(`<p id="p">One slow fox sleeps.</p>`);
    expect(undo.history.map((h) => h.label)).toEqual(["Revert to mine"]);

    ctrlZ();
    expect(body()).toBe(`<p id="p">One fast fox sleeps.</p>`);
    expect(undo.canUndo).toBe(false);
  } finally {
    undo.stop();
  }
});

test("O5 C4 with the undo plugin loaded, a revert that rolls back leaves no undo entry: Ctrl+Z changes nothing", async () => {
  const undo = await withUndo();
  try {
    const sync = makeSync();
    const page = (word) => `<p id="p">One ${word} fox</p><p id="q"><i id="x">x</i></p>`;
    const ids = await lose(sync, page("quick"), page(`<i id="x">slow</i>`), page("fast"));
    await tick();
    undo.flush();
    undo.clear();
    const html = document.documentElement.outerHTML;

    expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
    await tick();
    undo.flush();
    expect(undo.history).toEqual([]);

    ctrlZ();
    expect(document.documentElement.outerHTML).toBe(html);
  } finally {
    undo.stop();
  }
});

test("O5 a revert that writes one text node twice (a mark this tab added) leaves no undo entry rather than one that deletes the word", async () => {
  const undo = await withUndo();
  try {
    const sync = makeSync();
    const [id] = await lose(sync, `<p id="p">One quick fox</p>`, `<p id="p">One <b>slow</b> fox</p>`, `<p id="p">One fast fox</p>`);
    await tick();
    undo.flush();
    undo.clear();

    expect((await revert.revertConflicts([id])).revertedIds).toEqual([id]);
    await tick();
    undo.flush();
    expect(body()).toBe(`<p id="p">One <b>slow</b> fox</p>`);
    expect(undo.history).toEqual([]);

    ctrlZ();
    expect(body()).toBe(`<p id="p">One <b>slow</b> fox</p>`);
  } finally {
    undo.stop();
  }
});
