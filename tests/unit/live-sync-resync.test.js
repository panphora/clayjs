import { jest } from "@jest/globals";

/**
 * The client half of the server's resync flag.
 *
 * The cursor frame is a NAMED SSE event, so it never reaches onmessage and never
 * looks like data: without an explicit listener it is invisible. Its `resync`
 * flag is how the server says it could not retain everything between where this
 * client resumed and the baseline it is now sending, which means what the page
 * holds is stale in a way no replay will fix.
 *
 * The repair is the token-free fetch of the served document this class already
 * runs for a change too large to send. It must be _fetchServedDocument and not
 * _fetchExternalChange: the latter drops a fetch whose seq is at or below the
 * external watermark, and the cursor baseline routinely is, so the page would
 * skip its own repair for being "already seen" and stay stale forever.
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
let gate;

beforeAll(async () => {
  window.clayEditMode = true;
  eventSourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop(); // the singleton auto-started on import

  gate = await import("../../src/lib/dirty-gate.js");
});

beforeEach(async () => {
  eventSourceInstances = [];
  global.fetch = jest.fn(() => new Promise(() => {}));
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

async function started(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  sync.start("index.html");
  await sync._ready;
  return { sync, sse: eventSourceInstances.at(-1) };
}

function cursor(sse, data) {
  sse.dispatchEvent(new MessageEvent("cursor", { data }));
}

test("a resync cursor refetches the served document at the server's baseline", async () => {
  const { sync, sse } = await started();
  const refetch = jest.spyOn(sync, "_fetchServedDocument").mockImplementation(() => {});
  cursor(sse, JSON.stringify({ seq: 42, resync: true }));
  expect(refetch).toHaveBeenCalledWith(42, { repair: true });
  sync.stop();
});

test("an ordinary cursor refetches nothing", async () => {
  const { sync, sse } = await started();
  const refetch = jest.spyOn(sync, "_fetchServedDocument").mockImplementation(() => {});
  cursor(sse, JSON.stringify({ seq: 42 }));
  cursor(sse, JSON.stringify({ seq: 43, resync: false }));
  expect(refetch).not.toHaveBeenCalled();
  sync.stop();
});

test("a resync without a seq still repairs the page", async () => {
  const { sync, sse } = await started();
  const refetch = jest.spyOn(sync, "_fetchServedDocument").mockImplementation(() => {});
  cursor(sse, JSON.stringify({ resync: true }));
  expect(refetch).toHaveBeenCalledWith(undefined, { repair: true });
  sync.stop();
});

test("a malformed cursor frame is ignored, not thrown", async () => {
  const { sync, sse } = await started();
  const refetch = jest.spyOn(sync, "_fetchServedDocument").mockImplementation(() => {});
  expect(() => cursor(sse, "{not json")).not.toThrow();
  expect(refetch).not.toHaveBeenCalled();
  sync.stop();
});

// The case that separates the two fetch paths. A cursor baseline the page has
// already seen is the NORMAL case, since our own last applied change reached the
// server's high-water mark: _fetchExternalChange returns early on it and repairs
// nothing, while the repair fetches whatever disk holds now and queues it.
//
// The watermark is set AFTER start(), which resets it to 0 — set before, this
// test would run against a watermark of 0 and pass on either fetch path.
test("a baseline the page has already seen still repairs it", async () => {
  const { sync, sse } = await started();
  sync._lastExternalSeq = 12;

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, text: async () => "<html>disk-now</html>" })
  );
  cursor(sse, JSON.stringify({ seq: 12, resync: true }));

  await new Promise((r) => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1]).toEqual({ cache: "no-store" });
  expect(sync._pendingExternal).toEqual({
    html: "<html>disk-now</html>",
    seq: 12,
    saveEpoch: 0,
    etag: null,
  });
  sync.stop();
});

// A newer external change can advance the watermark while the repair's GET is on
// the wire. An ordinary fetch defers to it and drops, which is right: that
// change's own fetch will queue a body. A repair has nothing to defer to — it
// exists because replay cannot fix this page — so it fetches again.
test("a repair overtaken by a newer change refetches instead of dropping", async () => {
  const { sync } = await started();
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

  sync._fetchServedDocument(5, { repair: true });
  sync._lastExternalSeq = 9; // a newer external change landed mid-flight
  resolveFetch({ ok: true, text: async () => "<html>stale</html>" });
  await new Promise((r) => setTimeout(r, 0));

  expect(sync._pendingExternal).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(2); // the repair went round again
  sync.stop();
});

test("an ordinary fetch overtaken by a newer change drops and does not refetch", async () => {
  const { sync } = await started();
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

  sync._fetchServedDocument(5);
  sync._lastExternalSeq = 9;
  resolveFetch({ ok: true, text: async () => "<html>stale</html>" });
  await new Promise((r) => setTimeout(r, 0));

  expect(sync._pendingExternal).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  sync.stop();
});

// The repair is the only thing that routes a view-mode tab into the external
// apply path. There is no save baseline in view mode, so the dirty protection
// could only ever refuse, and the frame would hold, retry in 3s, and hold again
// forever: the page would stay permanently stale, which is the exact failure the
// resync flag exists to report.
test("a view-mode tab applies the repair instead of holding it forever", async () => {
  const { sync } = await started("saved");
  document.body.innerHTML =
    '<input persist type="text" value="saved"><p data-id="t">v1</p>';
  await Promise.resolve();
  // A visitor typed into a persist field: the probe reads the live DOM and does
  // not care that the gate was never started in view mode.
  document.querySelector("input").value = "a visitor typed this";
  expect(gate.pageMaybeDirty()).toBe(true);

  await sync._doApplyExternal(
    '<!DOCTYPE html><html><head></head><body>' +
      '<input persist type="text" value="saved"><p data-id="t">v2-from-disk</p>' +
      '</body></html>',
    5
  );

  expect(document.querySelector('[data-id="t"]').textContent).toBe("v2-from-disk");
  expect(sync._holdRetryExt).toBeFalsy();
  sync.stop();
});
