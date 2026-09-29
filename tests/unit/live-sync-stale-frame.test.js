import { jest } from "@jest/globals";

/**
 * Stale frames (browser pass item 1): a tab's pre-save snapshot relay reached its
 * peers whether or not the save landed, and a peer that had just saved merged it
 * against its own state, so the peer's saved edit read as a remote revert.
 *
 *   - a save's capture relays nothing; the LANDED save relays once, with its stamp,
 *     and that relay is what advances the peer-lane base;
 *   - a landed save on a host that returns no stamp still relays;
 *   - the tab whose save was refused merges the peer's stamped frame against the
 *     seed, keeps both edits, takes the stamp, and leaves the conflict hold;
 *   - on a host that stamps saves, a live-lane frame with no stamp is not applied.
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
let saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });

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

let LiveSync;
let WIRE_PROFILES;
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
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/sync")) {
      relayPosts.push({ url: u, body: JSON.parse(options.body) });
      return respond(200, { success: true });
    }
    if (method === "POST" && u.includes("/_/save")) {
      savePosts.push({ url: u, headers: options.headers });
      const r = saveResponse(options);
      return respond(r.status, r.body);
    }
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, WIRE_PROFILES } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  await import("../../src/core/conflict-notice.js");
  // Let discovery land: from here the host stamps saves.
  await etag.seedEtag();
});

beforeEach(async () => {
  relayPosts.length = 0;
  savePosts.length = 0;
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
});

function makeSync(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
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

const BOARD =
  '<div class="list" data-id="planning"><p class="card" data-id="one">One</p><p class="card" data-id="two">Two</p></div>' +
  '<div class="list" data-id="dev"><p class="card" data-id="three">Three</p></div>';

function moveTwoToDev(html) {
  return html
    .replace('<p class="card" data-id="two">Two</p>', "")
    .replace(
      '<p class="card" data-id="three">Three</p>',
      '<p class="card" data-id="three">Three</p><p class="card" data-id="two">Two</p>'
    );
}

test("a save's capture relays nothing; the landed save relays once, with its stamp, and advances the base", async () => {
  await settle(BOARD);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  expect(sync._profile).toBe(WIRE_PROFILES.spec);
  const seed = sync.lastHtml;

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  const saved = snapshot.serializeForSync(clone);
  document.dispatchEvent(new CustomEvent("clay:snapshot-ready", { detail: { documentElement: clone, forSave: true } }));
  await wait(250);
  expect(relayPosts).toHaveLength(0);
  expect(sync.lastHtml).toBe(seed);

  etag.recordEtag("E1");
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
  await tick();

  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.snapshot).toBe(saved);
  expect(relayPosts[0].body.etag).toBe("E1");
  expect(relayPosts[0].body.sender).toBe(sync.clientId);
  expect(sync.lastHtml).toBe(saved);
  sync.stop();
});

test("a landed save on a host that returns no stamp still relays, without one", async () => {
  await settle(BOARD);
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;

  document.querySelector('[data-id="two"]').textContent = "Two EDITED";
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  document.dispatchEvent(new CustomEvent("clay:snapshot-ready", { detail: { documentElement: clone, forSave: true } }));
  etag.recordEtag(null);
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
  await Promise.resolve();
  await Promise.resolve();

  expect(relayPosts).toHaveLength(1);
  expect(relayPosts[0].body.snapshot).toContain("Two EDITED");
  expect(relayPosts[0].body.etag).toBeUndefined();
  sync.stop();
});

test("the refused tab merges the peer's stamped frame against the seed, keeps both edits, and leaves the conflict hold", async () => {
  await settle(BOARD);
  const original = captureFrame();
  const sync = makeSync();
  sync.lastHtml = original;

  // This tab moves card two; the peer retitled it and saved first.
  const two = document.querySelector('[data-id="two"]');
  document.querySelector('[data-id="dev"]').appendChild(two);
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);

  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy: "another-tab", etag: "E1" } });
  const refused = await save.savePage();
  expect(refused.msgType).toBe("conflict");
  expect(savePosts[0].headers["If-Match"]).toBe("E0");
  expect(save.isSaveConflicted()).toBe(true);
  expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
  await wait(30);
  const bar = document.querySelector("[data-clay-conflict]");
  expect(bar.style.display).toBe("flex");

  // The peer's landed save, relayed with its stamp. Under the old sender it
  // would have been preceded by this tab's own pre-save snapshot, which would
  // have moved lastHtml to this tab's unsaved state; nothing moves it now.
  const frameB = original.replace(">Two<", ">Two EDITED<");
  await sync._doApplyUpdate(frameB, 5, null, "E1");

  const after = document.querySelector('[data-id="two"]');
  expect(after.parentElement.getAttribute("data-id")).toBe("dev");
  expect(after.textContent).toBe("Two EDITED");
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(etag.lastSeenEtag()).toBe("E1");
  expect(save.isSaveConflicted()).toBe(false);
  // A manual-save page: nothing has been written yet, so the root stays in
  // 'conflict' until the person saves, but the refusal is answered and the
  // notice lets it go.
  expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
  await wait(30);
  expect(bar.style.display).toBe("none");

  // The convergence save answers the version the host refused this tab over.
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });
  const landed = await save.savePage();
  expect(landed.ok).toBe(true);
  expect(savePosts[1].headers["If-Match"]).toBe("E1");
  expect(etag.lastSeenEtag()).toBe("E2");
  expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  await wait(30);
  expect(bar.style.display).toBe("none");
  sync.stop();
});

test("on a stamping host a live-lane frame with no stamp is not applied; a stamped one is; the saved lane is untouched", async () => {
  await settle(BOARD);
  expect(etag.conditionalSaves()).toBe(true);

  const live = makeSync("live");
  live.start("index.html");
  await live._ready;
  live.applyUpdate = jest.fn();
  const frame = captureFrame().replace(">Two<", ">Two EDITED<");

  live.sse.onmessage({ data: JSON.stringify({ html: frame, sender: "peer", seq: 10 }) });
  expect(live.applyUpdate).not.toHaveBeenCalled();

  live.sse.onmessage({ data: JSON.stringify({ html: frame, sender: "peer", seq: 11, etag: "E1" }) });
  expect(live.applyUpdate).toHaveBeenCalledTimes(1);
  live.stop();

  const viewer = makeSync("saved");
  viewer.start("index.html");
  await viewer._ready;
  viewer.applyUpdate = jest.fn();
  viewer.sse.onmessage({ data: JSON.stringify({ html: frame, sender: "server-save", seq: 12 }) });
  expect(viewer.applyUpdate).toHaveBeenCalledTimes(1);
  viewer.stop();
});
