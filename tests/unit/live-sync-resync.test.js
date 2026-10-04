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
let resetHostMeta;

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
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
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
  expect(refetch).toHaveBeenCalledWith(42, { repair: true, startup: false });
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
  expect(refetch).toHaveBeenCalledWith(undefined, { repair: true, startup: false });
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
    by: null,
    fetchOptions: { repair: true, startup: false, attempt: 0, versionCheck: false },
    startGen: sync._startGen,
    seenSeq: 0,
    applyGen: sync._applyGen,
    fetchId: sync._servedFetchId,
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
  resolveFetch({ ok: true, text: async () => "<html>fresh</html>" });
  await new Promise((r) => setTimeout(r, 0));
  expect(sync._pendingExternal).toMatchObject({ html: "<html>fresh</html>", seq: 9 });
  sync.stop();
});

test("a repair without a cursor cannot overwrite a newer disk update", async () => {
  const { sync } = await started();
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise(resolve => { resolveFetch = resolve; }));
  sync._fetchServedDocument(undefined, { repair: true });
  sync._enqueueExternal("<html>new disk</html>", 42, "disk42");
  resolveFetch({ ok: true, text: async () => "<html>stale</html>" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(sync._pendingExternal).toMatchObject({ html: "<html>new disk</html>", seq: 42 });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  resolveFetch({ ok: true, text: async () => "<html>fresh</html>" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(sync._pendingExternal).toMatchObject({ html: "<html>fresh</html>", seq: 42 });
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

// The opening subscription is not a repair by itself. This host named no version
// in the response that served the page, so the first subscription has nothing to
// compare the file against: pulling the document would mean morphing a page
// without knowing whether it changed at all, which is the unconditional startup
// repair the version stamp exists to avoid. Discovery reporting an ETag does not
// create provenance — its answer describes a later moment than this page. An
// explicit resync still fetches, above.
test.each(["live", "saved"])(
  "the first subscription asks for nothing on a host that named no version (%s lane)",
  async (lane) => {
    document.body.innerHTML = '<p id="startup-value">Before subscription</p>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    gate.gateClearIfUnchanged(gate.gateCaptureToken());

    // start() opens no stream until discovery answers, the answer is memoized
    // against whichever fetch was installed when it was asked for, and this
    // file's default fetch never settles: a test that applied a frame before
    // this one leaves that memo holding a request nothing will answer. Ask again
    // here, so the stream this test needs is the one it gets.
    resetHostMeta();
    global.fetch = jest.fn((url) =>
      String(url).includes("/_/meta")
        ? Promise.resolve({
            ok: true,
            text: async () =>
              JSON.stringify({
                spec: 1,
                extensions: ["conditional"],
                document: { etag: "disk-B" },
              }),
          })
        : Promise.resolve({
            ok: true,
            text: async () =>
              "<!DOCTYPE html><html><head></head><body>" +
              '<p id="startup-value">Changed before subscription</p>' +
              "</body></html>",
          })
    );

    const { sync, sse } = await started(lane);
    try {
      sse.onopen();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await sync._runPending();
      expect(
        global.fetch.mock.calls.filter(([url]) => !String(url).includes("/_/meta"))
      ).toHaveLength(0);
      expect(sync._pendingExternal).toBeNull();
      expect(document.querySelector("#startup-value").textContent).toBe(
        "Before subscription"
      );
    } finally {
      sync.stop();
    }
  }
);
