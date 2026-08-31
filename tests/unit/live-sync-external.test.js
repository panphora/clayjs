import { jest } from "@jest/globals";

/**
 * The disk lane of scoped live sync, end to end inside LiveSync:
 *
 *   - routing: external-change notifications are consumed silently (no toast),
 *     embedded HTML enqueues, content-less forms (size cap, old servers) fall
 *     back to a token-free fetch of the served page;
 *   - ordering: replayed seqs drop, an own landed save discards queued disk
 *     frames (save epoch), the two pending slots drain in seq order;
 *   - apply: a clean tab morphs the disk doc (edit-mode ACTIVATED first) and
 *     advances the save baseline; a dirty tab keeps its edited section, takes
 *     the rest of the disk frame, and converges via an explicit save.
 *
 * jsdom ships no EventSource; the fake must be installed before importing
 * live-sync.js (its singleton auto-starts, and this file runs in edit mode).
 */

let eventSourceInstances;
class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    eventSourceInstances.push(this);
  }
  close() {}
}

let LiveSync;
let save;
let snapshot;
let gate;
let etag;

beforeAll(async () => {
  window.clayEditMode = true;
  eventSourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  // The singleton auto-started on import; detach it so its snapshot listener
  // can't react to the saves these tests trigger.
  liveSyncModule.liveSync.stop();

  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  etag = await import("../../src/core/etag.js");
});

beforeEach(async () => {
  eventSourceInstances = [];
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.body.innerHTML = "";
  await Promise.resolve(); // let the innerHTML MutationRecord land
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.toast;
  delete window.clay;
});

const DISK_MSG = "index.html changed on disk outside this tab";

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  // Suppress the automatic ~16ms rAF drain. These tests inspect the pending
  // slots between steps and call _runPending() themselves when they want one
  // drained; left live, the frame races their setTimeout(0) ticks and empties
  // a slot mid-assertion whenever the machine is loaded.
  sync._requestFrame = () => null;
  return sync;
}

test("an external-change notification with embedded html enqueues silently", async () => {
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  window.toast = jest.fn();

  const sse = eventSourceInstances.at(-1);
  sse.onmessage({
    data: JSON.stringify({
      type: "notification",
      msgType: "warning",
      msg: DISK_MSG,
      seq: 10,
      data: { kind: "external-change", html: "<html><body>disk</body></html>" },
    }),
  });

  expect(window.toast).not.toHaveBeenCalled();
  expect(sync._pendingExternal).toEqual({
    html: "<html><body>disk</body></html>",
    seq: 10,
    saveEpoch: 0,
    etag: null,
  });
  expect(sync._lastExternalSeq).toBe(10);
  sync.stop();
});

test("an external-change notification without html falls back to a no-store fetch", async () => {
  const sync = makeSync();
  let resolveFetch;
  global.fetch = jest.fn(
    () => new Promise((resolve) => { resolveFetch = resolve; })
  );

  const consumed = sync._maybeAcceptExternalChange({
    type: "notification",
    msg: DISK_MSG,
    seq: 4,
    data: { kind: "external-change" }, // size cap exceeded: html omitted
  });
  expect(consumed).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1]).toEqual({ cache: "no-store" });

  resolveFetch({ ok: true, text: async () => "<html><body>fetched</body></html>" });
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal).toEqual({
    html: "<html><body>fetched</body></html>",
    seq: 4,
    saveEpoch: 0,
    etag: null,
  });
  sync.stop();
});

test("an old server's bare warning message is sniffed and consumed", () => {
  const sync = makeSync();
  global.fetch = jest.fn(() => new Promise(() => {}));
  window.toast = jest.fn();

  const consumed = sync._maybeAcceptExternalChange({
    type: "notification",
    msgType: "warning",
    msg: DISK_MSG,
    seq: 7,
  });
  expect(consumed).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(window.toast).not.toHaveBeenCalled();
  sync.stop();
});

test("the saved lane never intercepts external-change notifications", () => {
  const sync = new LiveSync();
  sync.lane = "saved";
  const consumed = sync._maybeAcceptExternalChange({
    type: "notification",
    msg: DISK_MSG,
    seq: 3,
    data: { kind: "external-change", html: "<html></html>" },
  });
  expect(consumed).toBe(false);
  expect(sync._pendingExternal).toBeNull();
});

test("replayed or reordered external seqs are dropped", () => {
  const sync = makeSync();
  sync._enqueueExternal("<html>v10</html>", 10);
  sync._enqueueExternal("<html>v9-replay</html>", 9);
  expect(sync._pendingExternal.html).toBe("<html>v10</html>");
  sync._enqueueExternal("<html>v11</html>", 11);
  expect(sync._pendingExternal.html).toBe("<html>v11</html>");
  sync.stop();
});

test("clay:save-saved bumps the save epoch on the live lane", async () => {
  const sync = makeSync();
  sync.start("index.html");
  await sync._ready;
  expect(sync._saveEpoch).toBe(0);
  document.dispatchEvent(new CustomEvent("clay:save-saved"));
  expect(sync._saveEpoch).toBe(1);
  sync.stop();
});

test("a queued disk frame older than an own landed save is refetched at drain, never applied as-is", async () => {
  // Save-response order does not prove disk-write order: the queued frame
  // may still be newer than the save, so the drain fetches what disk holds
  // NOW instead of applying the possibly-stale body or dropping the change.
  const sync = makeSync();
  const applyExternal = jest
    .spyOn(sync, "_doApplyExternal")
    .mockImplementation(async () => {});
  let resolveFetch;
  global.fetch = jest.fn(
    () => new Promise((resolve) => { resolveFetch = resolve; })
  );

  sync._enqueueExternal("<html>stale</html>", 5); // saveEpoch captured: 0
  sync._saveEpoch++; // our own save landed while it was queued
  await sync._runPending();

  expect(applyExternal).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1]).toEqual({ cache: "no-store" });

  resolveFetch({ ok: true, text: async () => "<html>disk-now</html>" });
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal).toEqual({
    html: "<html>disk-now</html>",
    seq: 5,
    saveEpoch: 1,
    etag: null,
  });
  sync.stop();
});

test("a failed fallback fetch rolls the seq watermark back so a replay can redeliver", async () => {
  const sync = makeSync();
  global.fetch = jest.fn(() => Promise.reject(new Error("server gone")));

  sync._fetchExternalChange(5);
  expect(sync._lastExternalSeq).toBe(5);
  await new Promise((r) => setTimeout(r, 0));
  // Without the rollback, seq 5 would be dropped forever on redelivery.
  expect(sync._lastExternalSeq).toBe(4);

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, text: async () => "<html>recovered</html>" })
  );
  sync._fetchExternalChange(5);
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal.html).toBe("<html>recovered</html>");
  sync.stop();
});

test("a fetch fallback result is dropped when a save or newer change lands mid-flight", async () => {
  const sync = makeSync();
  let resolveFetch;
  global.fetch = jest.fn(
    () => new Promise((resolve) => { resolveFetch = resolve; })
  );

  sync._fetchExternalChange(5);
  sync._saveEpoch++; // save landed while the fetch was on the wire
  resolveFetch({ ok: true, text: async () => "<html>stale</html>" });
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal).toBeNull();

  sync._fetchExternalChange(6);
  sync._enqueueExternal("<html>newer</html>", 7); // newer disk frame overtook it
  resolveFetch({ ok: true, text: async () => "<html>stale-6</html>" });
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal.html).toBe("<html>newer</html>");
  sync.stop();
});

test("when both slots are pending, the lower seq applies first", async () => {
  const sync = makeSync();
  const order = [];
  jest.spyOn(sync, "_doApplyExternal").mockImplementation(async () => {
    order.push("external");
  });
  jest.spyOn(sync, "_doApplyUpdate").mockImplementation(async () => {
    order.push("peer");
  });

  // Disk frame seq 5, peer frame seq 8: disk first.
  sync._pendingExternal = { html: "<html>d</html>", seq: 5, saveEpoch: 0 };
  sync._pendingHtml = "<html>p</html>";
  sync._pendingSeq = 8;
  await sync._runPending();
  await sync._runPending();
  expect(order).toEqual(["external", "peer"]);

  // Peer frame seq 5, disk frame seq 8: peer first.
  order.length = 0;
  sync._lastExternalSeq = 0;
  sync._pendingExternal = { html: "<html>d</html>", seq: 8, saveEpoch: 0 };
  sync._pendingHtml = "<html>p</html>";
  sync._pendingSeq = 5;
  await sync._runPending();
  await sync._runPending();
  expect(order).toEqual(["peer", "external"]);
  sync.stop();
});

// Spec §10: a stamp is adopted only as part of applying the content it
// describes. The disk lane's stamp rides on the frame for that reason, and the
// alternative it replaced (apply the frame, then ask the host for a stamp) is
// the exact shape the rule forbids: the host answers about whatever is on disk
// by the time it builds the answer, which may be a later write this tab has
// never seen, and adopting that makes the next save overwrite it silently.
describe("the disk frame's stamp", () => {
  test("is adopted as part of applying the frame, without asking the host", async () => {
    const sync = makeSync();
    etag.recordEtag("before-the-frame");
    const metaCallsBefore = global.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/_/meta")
    ).length;

    await sync._doApplyExternal(diskDoc("<p>from disk</p>"), 31, "disk-42");

    expect(etag.lastSeenEtag()).toBe("disk-42");
    const metaCallsAfter = global.fetch.mock.calls.filter((c) =>
      String(c[0]).includes("/_/meta")
    ).length;
    expect(metaCallsAfter).toBe(metaCallsBefore);
    sync.stop();
  });

  test("falls back to asking the host only when the frame carried none", async () => {
    const sync = makeSync();
    etag.recordEtag("before-the-frame");

    await sync._doApplyExternal(diskDoc("<p>from an old host</p>"), 32);

    // forgetEtag ran: an unstamped disk change must not leave this tab holding
    // a stamp for bytes it no longer has.
    expect(etag.lastSeenEtag()).toBe(null);
    sync.stop();
  });

  test("rides from the notification onto the queued frame", () => {
    const sync = makeSync();
    const consumed = sync._maybeAcceptExternalChange({
      seq: 40,
      data: { kind: "external-change", html: diskDoc("<p>x</p>"), etag: "disk-7" },
    });

    expect(consumed).toBe(true);
    expect(sync._pendingExternal.etag).toBe("disk-7");
    sync.stop();
  });
});

function diskDoc(bodyInner) {
  return `<!DOCTYPE html><html><head></head><body>${bodyInner}</body></html>`;
}

test("clean tab: disk frame morphs in activated, token survives, baseline advances", async () => {
  const sync = makeSync();
  document.documentElement.setAttribute("htmlclaytoken", "mine");
  document.body.innerHTML = '<section data-id="b"><p>v1</p></section>';
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  const applied = [];
  const onApplied = (e) => applied.push(e.detail.seq);
  document.addEventListener("clay:sync-applied", onApplied);

  await sync._doApplyExternal(
    diskDoc(
      '<section data-id="b"><p>v2-from-disk</p></section>' +
        '<div data-id="ed" editmode:contenteditable inert-contenteditable="true">x</div>'
    ),
    20
  );
  document.removeEventListener("clay:sync-applied", onApplied);

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("v2-from-disk");
  // Root token: the morph's veto keeps this tab's own host attrs.
  expect(document.documentElement.getAttribute("htmlclaytoken")).toBe("mine");
  // The inert disk form arrived ACTIVATED, exactly as boot would have made it.
  const ed = document.querySelector('[data-id="ed"]');
  expect(ed.getAttribute("contenteditable")).toBe("true");
  expect(ed.hasAttribute("inert-contenteditable")).toBe(false);
  // Baseline advanced to the post-morph local capture: next no-op save skips.
  expect(save.getLastSavedContents()).toBe(
    snapshot.captureForComparison({ flushUndo: false })
  );
  expect(save.getUnsavedChanges()).toBe(false);
  // Cross-lane: the peer diff base now tracks the applied disk state, so a
  // later dirty peer apply cannot misread it as unsaved local edits.
  expect(sync.lastHtml).toContain("v2-from-disk");
  expect(applied).toEqual([20]);
  sync.stop();
  document.documentElement.removeAttribute("htmlclaytoken");
});

test("dirty tab: the edited section survives, the rest applies, and the merge converges via save", async () => {
  window.clay = { testMode: true }; // saveHtml short-circuits the network
  const sync = makeSync();
  document.body.innerHTML =
    '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h0</p></section>';
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  document.querySelector('[data-id="b"] p').textContent = "b-local-edit";
  await Promise.resolve(); // let the MutationRecord land: gate goes dirty
  expect(gate.pageMaybeDirty()).toBe(true);

  await sync._doApplyExternal(
    diskDoc(
      '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h1-from-disk</p></section>'
    ),
    30
  );

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b-local-edit");
  expect(document.querySelector('[data-id="h"] p').textContent).toBe("h1-from-disk");

  // Convergence: the merged state was pushed out by savePageThrottled.
  await new Promise((r) => setTimeout(r, 20));
  expect(save.getUnsavedChanges()).toBe(false);
  expect(save.getLastSavedContents()).toContain("b-local-edit");
  expect(save.getLastSavedContents()).toContain("h1-from-disk");
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

test("dirty tab with an unmergeable (keyless) edit holds the whole disk frame", async () => {
  const sync = makeSync();
  document.body.innerHTML = "<main><p>orig</p></main>";
  save.setLastSavedContents(snapshot.captureForComparison());
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  document.querySelector("main p").textContent = "local-edit";
  await Promise.resolve();
  const baselineBefore = save.getLastSavedContents();

  await sync._doApplyExternal(diskDoc("<main><p>disk-edit</p></main>"), 40);

  // Nothing applied, nothing lost: the local edit stands, and a retry is
  // scheduled so the frame still applies if the blocking edit is undone.
  expect(document.querySelector("main p").textContent).toBe("local-edit");
  expect(document.body.innerHTML).not.toContain("disk-edit");
  expect(save.getLastSavedContents()).toBe(baselineBefore);
  expect(sync._holdRetryExt).not.toBeNull();
  sync.stop();
});
