import { jest } from "@jest/globals";

/**
 * The peer lane's merge base advances when the HOST ACCEPTS a save, not when the
 * relay's POST happens to return.
 *
 * Between an accepted save and its relay's response a peer frame built on that
 * save used to merge against a stale base: this tab's own saved bytes read as a
 * local edit, and the frame's copy of them was spliced in again (Writer
 * duplicated a letter; a plain page reported a phantom conflict).
 *
 * The base now moves in `_relayCommit`, from the capture that save stored, dated
 * with the ticket `_saveTicket` took at snapshot-ready. `_setPeerBase` is the one
 * writer and keeps the newest moment, so both directions hold:
 *
 *   - a save that lands while an earlier relay is in flight is the base at once,
 *     and the relay's late return cannot rewind it;
 *   - a frame whose morph ran AFTER a save's capture keeps the base, and a frame
 *     whose morph ran BEFORE it keeps nothing, even though the frame installs its
 *     base only after its resource wait.
 *
 * The meta-capable fetch mock is installed BEFORE the imports: save.js asks
 * discovery at import, and that answer is what makes this a stamping host.
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
// One resolver per /_/sync POST the test has chosen to hold open.
const pendingRelays = [];
let saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
let relayResponder = () => 200;
let metaResponder = null;

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

function relayAnswer(r) {
  if (r instanceof Error) return Promise.reject(r);
  if (r && typeof r.then === "function") return r;
  return respond(r, { success: r < 400 });
}

// Hold every relay on the wire, so the test can decide when a POST returns.
function holdRelay() {
  relayResponder = () => new Promise((resolve) => pendingRelays.push(resolve));
}

function releaseRelay(index = 0, status = 200) {
  const resolve = pendingRelays[index];
  if (!resolve) throw new Error(`no relay is held open at ${index}`);
  resolve(respond(status, { success: status < 400 }));
}

let LiveSync;
let WIRE_PROFILES;
let resetHostMeta;
let snapshot;
let gate;
let save;
let etag;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return metaResponder ? metaResponder() : respond(200, META);
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

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, WIRE_PROFILES } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  await import("../../src/core/save-conflict-notice.js");
  // Let discovery land: from here the host stamps saves.
  await etag.seedEtag();
});

beforeEach(async () => {
  // A hold left by the previous test is released the way a person would: a save
  // that lands (and a manual-save page's notice stays until one does).
  if (save.isSaveConflicted()) await save.savePageForce();
  relayPosts.length = 0;
  savePosts.length = 0;
  pendingRelays.length = 0;
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  relayResponder = () => 200;
  metaResponder = null;
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
});

const started = [];

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
  started.push(sync);
  sync.start("index.html");
  await sync._ready;
  return sync;
}

async function settle(body) {
  document.body.innerHTML = body;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// What a save's own snapshot-ready dispatch does, through the real listener:
// sets _saveTicket and _savedSnapshot. Returns the snapshot it stored.
function capture(sync) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:snapshot-ready", { detail: { documentElement: clone, forSave: true } }));
  return sync._savedSnapshot;
}

function lands() {
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
}

// A frame whose apply awaits: an external script the test releases by hand.
// hyper-morph runs the morph synchronously and returns a promise that resolves
// on the script's load, which is exactly a frame's resource wait.
function scriptFrame(html, src) {
  return html.replace("</body>", `<script src="${src}"></script></body>`);
}

function releaseScript(src) {
  document.querySelector(`script[src="${src}"]`).dispatchEvent(new Event("load"));
}

const BOARD =
  '<div class="list" data-id="planning"><p class="card" data-id="one">One</p><p class="card" data-id="two">Two</p></div>' +
  '<div class="list" data-id="dev"><p class="card" data-id="three">Three</p></div>';

const PAGE =
  '<p data-id="p" contenteditable="true">The quick fox.</p><p data-id="q" contenteditable="true">q0</p><p data-id="d">d0</p>';

function heldSave(etagOut = "E1") {
  let release;
  saveResponse = () => new Promise((r) => { release = () => r({ status: 200, body: { msg: "Saved", etag: etagOut } }); });
  return () => release();
}

// A save held open while an external disk frame applies and the person keeps
// typing: the tab is dirty at the acceptance, so the merge reads the base.
async function dirtyDiskScenario({ edit = ["The quick fox.", "The quick brown fox."], peer }) {
  await settle(PAGE);
  const sync = await startSync();
  const seed = sync.lastHtml;
  const releaseSave = heldSave("E1");

  document.querySelector('[data-id="p"]').firstChild.data = edit[1];
  await Promise.resolve();
  const saving = save.savePage();
  await tick();
  const S = sync._savedSnapshot;
  expect(S && S.html).toContain(edit[1]);

  document.querySelector('[data-id="q"]').firstChild.data = "q1";
  await Promise.resolve();

  // An external disk change (content-less fetch fallback: no stamp) applies while
  // the save is on the wire. The tab is dirty, the merge keeps its edits.
  await sync._doApplyExternal(sync._diskBase.replace(">d0<", ">d1<"), 3, null);
  expect(sync.lastHtml).toBe(seed);

  releaseSave();
  expect((await saving).ok).toBe(true);
  await wait(20);
  expect(sync.lastHtml).toBe(S.html);

  // A peer built on the save it received (the relay of S), and it also took the
  // disk change; it edits the sentence this tab's save wrote.
  const P = peer(S.html).replace(">d0<", ">d1<");
  await sync._doApplyUpdate(P, 9, null, "E3");

  return {
    p: document.querySelector('[data-id="p"]').textContent,
    q: document.querySelector('[data-id="q"]').textContent,
    d: document.querySelector('[data-id="d"]').textContent,
    unresolved: sync.unresolvedConflicts.map((c) => ({ local: c.local, remote: c.remote })),
  };
}

// The boot settle is a one-time event per save.js instance, and this suite's
// own baseline settles about half a second in, so the case that needs an
// unsettled page runs first. It dispatches the settle itself rather than waiting
// for it: the guard is the same either way.
test("14 the boot settle does not strand a frame's stamp", async () => {
  expect(save.baselineSettled()).toBe(false);
  await settle('<p data-id="p">a0</p>');
  const sync = await startSync();

  const frame = scriptFrame(sync.lastHtml.replace(">a0<", ">peer<"), "/accepted-base-settle-stamp.js");
  const applying = sync._doApplyUpdate(frame, 5, null, "E2");
  await tick();
  try {
    expect(document.querySelector('[data-id="p"]').textContent).toBe("peer");
    expect(sync.isPaused).toBe(true);
    // The frame's morph has run and its script load is still pending when the
    // settle fires.
    document.dispatchEvent(new CustomEvent("clay:baseline-settled"));
  } finally {
    releaseScript("/accepted-base-settle-stamp.js");
    await applying;
  }

  document.querySelector('[data-id="p"]').textContent = "local after peer";
  await tick();
  expect((await save.savePage()).ok).toBe(true);
  expect(savePosts.at(-1).headers["If-Match"]).toBe("E2");
});

test("1 a landed save is the base before its relay returns", async () => {
  await settle(BOARD);
  const sync = await startSync();
  holdRelay();

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const captured = capture(sync);
  etag.recordEtag("E1");
  lands();

  // The host took these bytes; the relay has not answered.
  expect(relayPosts).toHaveLength(1);
  expect(pendingRelays).toHaveLength(1);
  expect(sync.lastHtml).toBe(captured.html);
  expect(sync._lastIdentityMap).toBe(captured.identityMap);

  releaseRelay();
  await wait(20);

  expect(sync.lastHtml).toBe(captured.html);
  expect(sync._lastIdentityMap).toBe(captured.identityMap);
});

test("2 a second save that lands while the first relay is in flight is the base", async () => {
  await settle(BOARD);
  const sync = await startSync();
  holdRelay();

  document.querySelector('[data-id="two"]').textContent = "Two ONE";
  const first = capture(sync);
  etag.recordEtag("E1");
  lands();
  expect(relayPosts).toHaveLength(1);
  expect(sync.lastHtml).toBe(first.html);

  document.querySelector('[data-id="two"]').textContent = "Two TWO";
  const second = capture(sync);
  etag.recordEtag("E2");
  lands();

  expect(sync.lastHtml).toBe(second.html);
  expect(relayPosts).toHaveLength(1);

  releaseRelay();
  await wait(20);

  expect(relayPosts).toHaveLength(2);
  expect(relayPosts[1].body.snapshot).toBe(second.html);
  expect(relayPosts[1].body.etag).toBe("E2");
  expect(sync.lastHtml).toBe(second.html);
});

test("3 unstamped host: a repeat sends nothing and keeps the base; a change sends without a stamp", async () => {
  await settle(BOARD);
  const sync = await startSync();
  etag.recordEtag(null);
  const seed = sync.lastHtml;

  const repeat = capture(sync);
  expect(repeat.html).toBe(seed);
  lands();
  await tick();

  expect(relayPosts).toHaveLength(0);
  expect(sync.lastHtml).toBe(seed);

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const changed = capture(sync);
  lands();
  await tick();

  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.etag).toBeUndefined();
  expect(relayPosts[0].body.snapshot).toBe(changed.html);
  expect(sync.lastHtml).toBe(changed.html);
});

test("4 a failed relay retries the same bytes and the base stays advanced", async () => {
  await settle(BOARD);
  const sync = await startSync();
  const answers = [503, 503, 200];
  relayResponder = () => answers.shift() ?? 200;

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const captured = capture(sync);
  etag.recordEtag("E1");
  lands();
  await tick();

  expect(relayPosts).toHaveLength(1);
  expect(sync.lastHtml).toBe(captured.html);

  await wait(700);
  expect(relayPosts).toHaveLength(2);
  expect(sync.lastHtml).toBe(captured.html);

  await wait(1200);
  expect(relayPosts).toHaveLength(3);
  expect(new Set(relayPosts.map((p) => p.body.snapshot))).toEqual(new Set([captured.html]));
  expect(relayPosts.map((p) => p.body.etag)).toEqual(["E1", "E1", "E1"]);
  expect(sync.lastHtml).toBe(captured.html);
});

test("5 a rejected save leaves the base alone", async () => {
  await settle(BOARD);
  const sync = await startSync();
  const seed = sync.lastHtml;

  document.querySelector('[data-id="one"]').textContent = "One local";
  await Promise.resolve();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  const refused = await save.savePage();

  expect(refused.msgType).toBe("conflict");
  expect(savePosts[0].headers["If-Match"]).toBe("E0");
  expect(relayPosts).toHaveLength(0);
  expect(sync.lastHtml).toBe(seed);
  expect(save.isSaveConflicted()).toBe(true);
});

test("6 a late relay response after a newer apply does not rewind the base", async () => {
  await settle(BOARD);
  const sync = await startSync();
  holdRelay();

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const captured = capture(sync);
  etag.recordEtag("E1");
  lands();
  expect(sync.lastHtml).toBe(captured.html);

  // A frame descended from the save this tab just made.
  const frame = captured.html.replace(">One<", ">One EDITED<");
  await sync._doApplyUpdate(frame, 7, null, "E2");
  expect(sync.lastHtml).toBe(frame);

  releaseRelay();
  await wait(20);

  expect(sync.lastHtml).toBe(frame);
});

test("7 a save that lands before the wire profile resolves advances the base and relays once discovery lands", async () => {
  await settle(BOARD);
  resetHostMeta();
  let releaseMeta = null;
  metaResponder = () => new Promise((resolve) => {
    releaseMeta = () => resolve(respond(200, META));
  });

  const sync = makeSync();
  started.push(sync);
  try {
    sync.start("index.html");
    expect(sync._profile).toBeNull();

    document.querySelector('[data-id="two"]').textContent = "Two EDITED";
    const captured = capture(sync);
    etag.recordEtag("E1");
    lands();

    expect(sync.lastHtml).toBe(captured.html);
    expect(relayPosts).toHaveLength(0);

    releaseMeta();
    await sync._ready;
    await wait(20);

    expect(sync._profile).toBe(WIRE_PROFILES.spec);
    expect(relayPosts).toHaveLength(1);
    expect(relayPosts[0].body.snapshot).toBe(captured.html);
    expect(sync.lastHtml).toBe(captured.html);
  } finally {
    // The memoized discovery answer is held by this test alone: never leave it
    // pending for the next one, whatever happened above.
    releaseMeta();
    await sync._ready;
    resetHostMeta();
  }
});

test("8 a peer frame built on this tab's landed save merges without a phantom conflict", async () => {
  await settle('<p data-id="p" contenteditable="true">The quick fox.</p>');
  const sync = await startSync();
  holdRelay();

  document.querySelector('[data-id="p"]').firstChild.data = "The quick brown fox.";
  await Promise.resolve();
  const saved = await save.savePage();
  expect(saved.ok).toBe(true);

  expect(relayPosts).toHaveLength(1);
  const base = relayPosts[0].body.snapshot;
  expect(base).toContain("The quick brown fox.");
  expect(sync.lastHtml).toBe(base);

  // The peer's frame descends from that save and changes the same sentence.
  const frame = base.replace("fox.", "fox jumps.");
  await sync._doApplyUpdate(frame, 9, null, "E2");

  expect(document.querySelector('[data-id="p"]').textContent).toBe("The quick brown fox jumps.");
  expect(sync.unresolvedConflicts).toHaveLength(0);
});

// P1: a frame whose morph ran BEFORE a save captured, and still awaits its
// resources when that save is accepted, installs its own base once it settles.
test("9 a frame older than an accepted save keeps the base when it settles", async () => {
  await settle('<p data-id="p">a0</p><p data-id="q">b0</p>');
  const sync = await startSync();
  const seed = sync.lastHtml;

  document.querySelector('[data-id="q"]').textContent = "b1";
  const captured = capture(sync);
  const map = captured.identityMap;

  const frame = scriptFrame(seed.replace("a0", "a1"), "/accepted-base-newer-frame.js");
  const applying = sync._doApplyUpdate(frame, 5, map, "E2");
  await tick();
  try {
    // The morph has run; the apply is still waiting on the frame's script.
    expect(sync.isPaused).toBe(true);
    expect(sync._peerBaseTicket).toBeLessThan(captured.ticket);
    etag.recordEtag("E1");
    lands();
  } finally {
    releaseScript("/accepted-base-newer-frame.js");
    await applying;
  }

  expect(sync.lastHtml).toBe(frame);
  expect(sync._lastIdentityMap).toBe(map);
  // The frame's moment is the newest one, so the older save cannot rewind it.
  expect(sync._setPeerBase(captured.html, map, captured.ticket)).toBe(false);
  expect(sync.lastHtml).toBe(frame);
});

test("10 a save captured during a frame's resource wait wins", async () => {
  await settle('<p data-id="p">a0</p><p data-id="q">b0</p>');
  const sync = await startSync();
  holdRelay();

  const applying = sync._doApplyUpdate(scriptFrame(sync.lastHtml.replace("a0", "a1"), "/accepted-base-wait.js"), 5, null, "E2");
  await tick();

  // The morph has run; the apply is still waiting on the frame's script.
  expect(document.querySelector('[data-id="p"]').textContent).toBe("a1");
  expect(sync.isPaused).toBe(true);

  document.querySelector('[data-id="q"]').textContent = "b1";
  const captured = capture(sync);
  etag.recordEtag("E1");
  lands();
  expect(sync.lastHtml).toBe(captured.html);

  releaseScript("/accepted-base-wait.js");
  await applying;

  expect(sync.lastHtml).toBe(captured.html);
  expect(etag.lastSeenEtag()).toBe("E1");
});

// P2: an actual frame completion from the run before a restart, landing after a
// restart on a dirty page (no seed to date it against).
test("11 a late completion from a stopped lifecycle installs nothing", async () => {
  await settle('<p data-id="p">a0</p><p data-id="q">b0</p>');
  const sync = await startSync();

  const frame = scriptFrame(sync.lastHtml.replace("a0", "a1"), "/accepted-base-old-frame.js");
  const applying = sync._doApplyUpdate(frame, 5, null, "OLD");
  await tick();
  const script = document.querySelector('script[src="/accepted-base-old-frame.js"]');

  sync.stop();
  document.body.innerHTML = '<p data-id="fresh">fresh unsaved</p>';
  gate.gateMarkDirty();

  // start() after stop() is the restart, on the one instance that took the old
  // frame.
  sync.start("index.html");
  await sync._ready;
  expect(sync.lastHtml).toBeNull();

  etag.recordEtag("NEW");
  script.dispatchEvent(new Event("load"));
  await applying;

  expect(sync.lastHtml).toBeNull();
  expect(sync._lastIdentityMap).toBeNull();
});

// PE: the dirty disk apply must not stop the accepted save from being the base,
// or the peer's revert reads as this tab's own older bytes.
test("12 a dirty disk frame does not block an accepted save from being the base", async () => {
  const result = await dirtyDiskScenario({
    edit: ["The quick fox.", "The slow fox."],
    peer: (h) => h.replace("The slow fox.", "The quick fox."),
  });
  expect(result.p).toBe("The quick fox.");
  expect(result.unresolved).toHaveLength(0);
  expect(result.q).toBe("q1");
  expect(result.d).toBe("d1");
});

// PC: the same shape with the peer building on this tab's edit rather than
// reverting it.
test("13 a dirty disk frame does not stop a peer extending the accepted save", async () => {
  const result = await dirtyDiskScenario({
    edit: ["The quick fox.", "The slow fox."],
    peer: (h) => h.replace("The slow fox.", "The slower fox."),
  });
  expect(result.p).toBe("The slower fox.");
  expect(result.unresolved).toHaveLength(0);
  expect(result.q).toBe("q1");
});

// P7: a landed save is news even when its bytes equal the base, so the stamp
// travels.
test("15 a stamped repeat still relays", async () => {
  await settle('<p data-id="p">a0</p>');
  const sync = await startSync();
  const seed = sync.lastHtml;

  expect((await save.savePageForce()).ok).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.snapshot).toBe(seed);
  expect(relayPosts[0].body.etag).toBe("E1");
});

// 8b: the same frame as test 8, merged while this tab is still dirty, so the
// peer lane's base is the one that decides.
test("16 a peer frame built on this tab's landed save, merged while this tab is dirty", async () => {
  await settle('<p data-id="p" contenteditable="true">The quick fox.</p><p data-id="r" contenteditable="true">R0</p>');
  const sync = await startSync();
  holdRelay();

  document.querySelector('[data-id="p"]').firstChild.data = "The quick brown fox.";
  await Promise.resolve();
  const releaseSave = heldSave("E1");
  const saving = save.savePage();

  document.querySelector('[data-id="r"]').firstChild.data = "R typed";
  await Promise.resolve();
  releaseSave();
  expect((await saving).ok).toBe(true);
  expect(relayPosts).toHaveLength(1);
  expect(gate.pageMaybeDirty()).toBe(true);

  const frame = relayPosts[0].body.snapshot.replace("quick brown fox", "quick red fox");
  await sync._doApplyUpdate(frame, 9, relayPosts[0].body.identityMap, "E2");

  expect(document.querySelector('[data-id="p"]').textContent).toBe("The quick red fox.");
  expect(document.querySelector('[data-id="r"]').textContent).toBe("R typed");
  expect(sync.unresolvedConflicts).toHaveLength(0);
});

// P4: a save whose response lands after a restart must not install into the new
// run.
test("17 a save completion from before a restart installs nothing", async () => {
  await settle('<p data-id="p">a0</p>');
  const sync = await startSync();

  document.querySelector('[data-id="p"]').textContent = "a1";
  let releaseSave;
  saveResponse = () => new Promise((r) => { releaseSave = r; });
  const pending = save.savePage();
  await tick();
  expect(savePosts).toHaveLength(1);

  sync.stop();
  await settle('<p data-id="fresh">fresh seed</p>');
  sync.start("index.html");
  await sync._ready;
  const seed = sync.lastHtml;
  expect(seed).toContain("fresh seed");

  releaseSave({ status: 200, body: { msg: "Saved", etag: "OLD" } });
  expect((await pending).ok).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  expect(relayPosts).toHaveLength(0);
});
