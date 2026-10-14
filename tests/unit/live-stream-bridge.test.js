import { jest } from "@jest/globals";

/**
 * The fast lane's plumbing: SyncStream forwards the three named events, live
 * sync reports open, events and close into the bridge, the data routes client
 * sends what the host expects, and setSaveHeader reaches the save request.
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
let bridge;

beforeAll(async () => {
  window.clayEditMode = true;
  eventSourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  bridge = await import("../../src/live/stream-bridge.js");
});

beforeEach(() => {
  eventSourceInstances = [];
  global.fetch = jest.fn(() => new Promise(() => {}));
  document.body.innerHTML = "";
});

async function started(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  sync.start("index.html");
  await sync._ready;
  return { sync, sse: eventSourceInstances.at(-1) };
}

describe("stream bridge", () => {
  test("open, the three events, error and stop reach a handler", async () => {
    const seen = [];
    const off = bridge.onStream({
      open: (info) => seen.push(["open", info]),
      close: () => seen.push(["close"]),
      event: (type, data) => seen.push([type, data]),
    });
    const { sync, sse } = await started();
    sse.onopen();
    sse.dispatchEvent(new MessageEvent("data", { data: JSON.stringify({ seq: 1 }) }));
    sse.dispatchEvent(new MessageEvent("data-state", { data: JSON.stringify({ epoch: "e" }) }));
    sse.dispatchEvent(new MessageEvent("data-writer", { data: JSON.stringify({ writer: "w" }) }));
    sse.dispatchEvent(new MessageEvent("data", { data: "{not json" }));
    expect(bridge.currentStream()).toEqual({ clientId: sync.clientId, lane: "live" });
    sse.onerror();
    expect(bridge.currentStream()).toBeNull();
    sse.onopen();
    sync.stop();
    off();
    expect(seen).toEqual([
      ["open", { clientId: sync.clientId, lane: "live" }],
      ["data", { seq: 1 }],
      ["data-state", { epoch: "e" }],
      ["data-writer", { writer: "w" }],
      ["close"],
      ["open", { clientId: sync.clientId, lane: "live" }],
      ["close"],
    ]);
  });

  test("a handler added while the stream is open hears about it at once; unsubscribe stops it", async () => {
    const { sync, sse } = await started();
    sse.onopen();
    const open = jest.fn();
    const event = jest.fn();
    const off = bridge.onStream({ open, event });
    expect(open).toHaveBeenCalledWith({ clientId: sync.clientId, lane: "live" });
    off();
    sse.dispatchEvent(new MessageEvent("data", { data: "{}" }));
    expect(event).not.toHaveBeenCalled();
    sync.stop();
  });

  test("a throwing handler does not stop the others", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const event = jest.fn();
    const offA = bridge.onStream({ event: () => { throw new Error("boom"); } });
    const offB = bridge.onStream({ event });
    bridge.streamEvent("data", { x: 1 });
    bridge.streamEvent("not-a-live-event", { x: 2 });
    expect(event).toHaveBeenCalledTimes(1);
    offA();
    offB();
    err.mockRestore();
  });
});

describe("server lane", () => {
  test("relayData posts the frame with client-id and Document-URL", async () => {
    const { relayData } = await import("../../src/live/server-lane.js");
    global.fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({ seq: 3, epoch: "e1" }),
      headers: { get: () => null },
    }));
    const result = await relayData("tab-1", { name: "game", n: 1, ops: [] });
    expect(result).toEqual({ status: 200, body: { seq: 3, epoch: "e1" }, retryAfter: 0 });
    const [url, init] = global.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/_/sync/data");
    expect(new URL(url).searchParams.get("client-id")).toBe("tab-1");
    expect(init.method).toBe("POST");
    expect(init.headers["Document-URL"]).toBe(window.location.href);
    expect(JSON.parse(init.body)).toEqual({ name: "game", n: 1, ops: [] });
  });

  test("relayData reports Retry-After, and status 0 when the request fails", async () => {
    const { relayData } = await import("../../src/live/server-lane.js");
    global.fetch = jest.fn(async () => ({ status: 429, json: async () => ({ code: "rate-limited" }), headers: { get: () => "1" } }));
    expect(await relayData("t", {})).toEqual({ status: 429, body: { code: "rate-limited" }, retryAfter: 1 });
    global.fetch = jest.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await relayData("t", {})).toEqual({ status: 0, body: null, retryAfter: 0 });
  });

  test("fetchLiveState returns the room, a refusal, or null", async () => {
    const { fetchLiveState } = await import("../../src/live/server-lane.js");
    const room = { epoch: "e", seq: 2, writer: null, stores: {} };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => room }));
    expect(await fetchLiveState()).toEqual(room);
    expect(global.fetch.mock.calls[0][1].headers["Document-URL"]).toBe(window.location.href);
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 }));
    expect(await fetchLiveState()).toEqual({ status: 401 });
    global.fetch = jest.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await fetchLiveState()).toBeNull();
  });
});

describe("setSaveHeader", () => {
  test("a header set is on the next save request, and removed with null", async () => {
    const saveCore = await import("../../src/core/save-core.js");
    const requests = [];
    global.fetch = jest.fn(async (url, init) => {
      requests.push(init);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => "" };
    });
    saveCore.setSaveHeader("Live-Epoch", "e7");
    await new Promise((resolve) => saveCore.saveHtml("<html><body>a</body></html>", resolve));
    saveCore.setSaveHeader("Live-Epoch", null);
    await new Promise((resolve) => saveCore.saveHtml("<html><body>b</body></html>", resolve));
    expect(requests).toHaveLength(2);
    expect(requests[0].headers["Live-Epoch"]).toBe("e7");
    expect(requests[1].headers["Live-Epoch"]).toBeUndefined();
  });
});
