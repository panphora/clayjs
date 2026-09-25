import { jest } from "@jest/globals";

/**
 * The peer lane of scoped live sync inside _doApplyUpdate:
 *
 *   - clean tab: a peer frame full-morphs, nothing is protected;
 *   - dirty tab: a three-way merge keeps this tab's edits and takes the peer's;
 *   - lastHtml stays the RAW incoming frame after a protected apply — the
 *     two-frame burst here is the regression: a patched lastHtml would make
 *     frame two's diff read the protected section as clean and clobber it;
 *   - no baseline: the whole frame holds.
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

let LiveSync;
let snapshot;
let gate;
let save;
let etag;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
});

beforeEach(async () => {
  // Convergence saves in these tests go to the wire; fail them fast so the
  // gate stays dirty across a burst, exactly like a save racing two frames.
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  return sync;
}

// A peer-domain frame of the CURRENT page state: exactly what this tab would
// have sent (and stored as lastHtml) a moment ago.
function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

test("clean tab: a peer frame full-morphs, including sections this tab last touched", async () => {
  const sync = makeSync();
  document.body.innerHTML =
    '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h0</p></section>';
  sync.lastHtml = captureFrame();
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  const frame = sync.lastHtml.replace("b0", "b1-peer").replace("h0", "h1-peer");
  await sync._doApplyUpdate(frame, 5, null);

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b1-peer");
  expect(document.querySelector('[data-id="h"] p').textContent).toBe("h1-peer");
  expect(sync.lastHtml).toBe(frame);
  // Cross-lane: a verified-clean peer apply also advances the DISK baseline,
  // so a later dirty disk apply cannot misread this frame's content as
  // unsaved local edits and splice stale bytes over newer disk state.
  expect(save.getLastSavedContents()).toBe(
    snapshot.captureForComparison({ flushUndo: false })
  );
  sync.stop();
});

test("dirty tab, two-frame burst: the edited section survives BOTH frames (raw lastHtml)", async () => {
  const sync = makeSync();
  document.body.innerHTML =
    '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h0</p></section>';
  const baseHtml = captureFrame();
  sync.lastHtml = baseHtml;

  document.querySelector('[data-id="b"] p').textContent = "b-local-edit";
  await Promise.resolve(); // MutationRecord lands: gate goes dirty
  expect(gate.pageMaybeDirty()).toBe(true);

  const frame1 = baseHtml.replace("h0", "h1-peer");
  await sync._doApplyUpdate(frame1, 5, null);

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b-local-edit");
  expect(document.querySelector('[data-id="h"] p').textContent).toBe("h1-peer");
  // THE pin: raw incoming frame, not the patched serialization. A patched
  // lastHtml would contain b-local-edit, so frame two's diff would find
  // nothing dirty and the morph would clobber the edit.
  expect(sync.lastHtml).toBe(frame1);
  expect(sync.lastHtml).not.toContain("b-local-edit");

  // The convergence save failed (mock wire), so the tab is still dirty when
  // the peer's second frame lands milliseconds later.
  await new Promise((r) => setTimeout(r, 5));
  expect(gate.pageMaybeDirty()).toBe(true);

  const frame2 = baseHtml.replace("h0", "h2-peer");
  await sync._doApplyUpdate(frame2, 6, null);

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b-local-edit");
  expect(document.querySelector('[data-id="h"] p').textContent).toBe("h2-peer");
  expect(sync.lastHtml).toBe(frame2);
  sync.stop();
});

test("dirty tab with no baseline yet: the frame holds, nothing morphs", async () => {
  const sync = makeSync();
  document.body.innerHTML = '<section data-id="b"><p>local-edit-pending</p></section>';
  sync.lastHtml = null; // first frame of a fresh connection

  document.querySelector("p").textContent = "local-edit";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);

  await sync._doApplyUpdate(
    '<html><head></head><body><section data-id="b"><p>peer</p></section></body></html>',
    3,
    null
  );

  expect(document.querySelector("p").textContent).toBe("local-edit");
  expect(sync.lastHtml).toBeNull();
  sync.stop();
});

test("dirty tab: keyless edits to different paragraphs both survive", async () => {
  const sync = makeSync();
  document.body.innerHTML = "<main><p>one</p><p>two</p></main>";
  sync.lastHtml = captureFrame();
  const lastBefore = sync.lastHtml;

  document.querySelector("main p").textContent = "one-local";
  await Promise.resolve();

  const frame = lastBefore.replace("two", "two-peer");
  await sync._doApplyUpdate(frame, 9, null);

  const ps = [...document.querySelectorAll("main p")].map((p) => p.textContent);
  expect(ps).toEqual(["one-local", "two-peer"]);
  expect(sync.lastHtml).toBe(frame);
  expect(sync._holdRetryPeer).toBeNull();
  sync.stop();
});

test("dirty tab: both rewrote the same word, the peer's version wins and it is reported", async () => {
  const sync = makeSync();
  document.body.innerHTML = "<main><p>orig</p></main>";
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("orig", "peer-edit");

  document.querySelector("main p").textContent = "local-edit";
  await Promise.resolve();

  let detail = null;
  const onApplied = (e) => { detail = e.detail; };
  document.addEventListener("clay:sync-applied", onApplied);
  try {
    await sync._doApplyUpdate(frame, 9, null);
  } finally {
    document.removeEventListener("clay:sync-applied", onApplied);
  }

  expect(document.querySelector("main p").textContent).toBe("peer-edit");
  expect(detail.report.conflicts.length).toBeGreaterThan(0);
  sync.stop();
});

// Spec §6: a version stamp rides ON a peer frame and is adopted only if that frame
// merges. The pair below is the whole rule, and it is here rather than beside the
// queue tests because only this harness runs the real merge.
//
// A stamp says "disk is at this version". Taking it says, additionally, "and I hold
// those bytes". The first is the host's news; the second is what makes the next save
// safe, and only a clean apply establishes it.
describe("the stamp a peer frame carries", () => {
  test("is taken once the frame has merged: this tab now holds what disk holds", async () => {
    const sync = makeSync();
    document.body.innerHTML = '<section data-id="b"><p>b0</p></section>';
    sync.lastHtml = captureFrame();
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    etag.recordEtag("stamp-before");

    await sync._doApplyUpdate(sync.lastHtml.replace("b0", "b1-peer"), 5, null, "stamp-after");

    expect(document.querySelector('[data-id="b"] p').textContent).toBe("b1-peer");
    expect(etag.lastSeenEtag()).toBe("stamp-after");
    sync.stop();
  });

  // The case the whole guard exists for. A held tab kept its own version of a
  // section it could not merge, so it is knowingly missing what disk holds. Taking
  // the stamp there would let its next save pass If-Match and replace that change
  // with nobody told. Refusing it turns the same event into a conflict somebody sees.
  test("is refused when the frame holds, so the overwrite becomes a conflict instead", async () => {
    const sync = makeSync();
    document.body.innerHTML = "<main><p>orig</p></main>";
    sync.lastHtml = null; // no baseline yet: the one case that still holds
    const frame = '<html><head></head><body><main><p>peer-edit</p></main></body></html>';

    document.querySelector("main p").textContent = "local-edit";
    await Promise.resolve();
    etag.recordEtag("stamp-before");

    await sync._doApplyUpdate(frame, 9, null, "stamp-after");

    expect(document.body.innerHTML).not.toContain("peer-edit");
    expect(etag.lastSeenEtag()).toBe("stamp-before");
    sync.stop();
  });

  test("a frame with no stamp leaves the one this tab holds alone", async () => {
    const sync = makeSync();
    document.body.innerHTML = '<section data-id="b"><p>b0</p></section>';
    sync.lastHtml = captureFrame();
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    etag.recordEtag("stamp-before");

    await sync._doApplyUpdate(sync.lastHtml.replace("b0", "b1-peer"), 5, null, undefined);

    expect(etag.lastSeenEtag()).toBe("stamp-before");
    sync.stop();
  });
});
