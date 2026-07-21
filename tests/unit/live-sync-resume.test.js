import { jest } from "@jest/globals";

/**
 * Client half of the htmlclay SSE resume wire contract:
 *   - a fresh, bounded `resume-id` query parameter on the stream URL,
 *     minted per start() and NOT reused from the sender clientId;
 *   - an explicit stop/start replaces the resume-id (new stream, new baseline);
 *   - notification frames now carry `seq`, so the stale-sequence check and
 *     watermark advance run BEFORE the notification branch — a replayed
 *     notification produces no second toast and no older snapshot is applied.
 *
 * jsdom ships no EventSource; a fake captures constructed URLs + instances and
 * must be installed before importing live-sync.js (its singleton auto-starts).
 */

let eventSourceUrls;
let eventSourceInstances;
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    eventSourceUrls.push(url);
    eventSourceInstances.push(this);
  }
  close() {}
}

let LiveSync;

beforeAll(async () => {
  eventSourceUrls = [];
  eventSourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ LiveSync } = await import("../../src/sync/live-sync.js"));
});

beforeEach(() => {
  eventSourceUrls = [];
  eventSourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
});

afterEach(() => {
  delete window.toast;
});

const resumeIdOf = (url) =>
  new URL(url, "http://localhost").searchParams.get("resume-id");

test("stream URL carries a bounded, per-start resume-id distinct from clientId", () => {
  const sync = new LiveSync();
  sync.lane = "saved";
  sync.start("index.html");

  expect(eventSourceUrls).toHaveLength(1);
  const resumeId = resumeIdOf(eventSourceUrls[0]);
  expect(typeof resumeId).toBe("string");
  // 1–128 URL-safe bytes per the wire contract.
  expect(resumeId.length).toBeGreaterThanOrEqual(1);
  expect(resumeId.length).toBeLessThanOrEqual(128);
  expect(resumeId).toMatch(/^[A-Za-z0-9._~-]+$/);
  // Must NOT reuse the sender clientId.
  expect(resumeId).not.toBe(sync.clientId);

  sync.stop();
});

test("an explicit stop/start replaces the resume-id", () => {
  const sync = new LiveSync();
  sync.lane = "saved";

  sync.start("index.html");
  const first = resumeIdOf(eventSourceUrls[0]);

  sync.stop();
  sync.start("index.html");
  const second = resumeIdOf(eventSourceUrls[1]);

  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(second).not.toBe(first);

  sync.stop();
});

test("replayed notification with a stale seq is deduped: no second toast, no older snapshot", () => {
  const sync = new LiveSync();
  sync.lane = "live";
  sync.start("index.html");

  const applySpy = jest.spyOn(sync, "applyUpdate").mockImplementation(() => {});
  const toast = jest.fn();
  window.toast = toast;

  const sse = eventSourceInstances[0];
  const fire = (payload) => sse.onmessage({ data: JSON.stringify(payload) });

  // A peer data frame at seq=5 applies a snapshot and advances the watermark.
  fire({ html: "<html><body>v5</body></html>", sender: "peer", seq: 5 });
  expect(applySpy).toHaveBeenCalledTimes(1);

  // A notification at seq=8 toasts once and advances the watermark to 8.
  fire({ type: "notification", msgType: "info", msg: "hello", seq: 8 });
  expect(toast).toHaveBeenCalledTimes(1);

  // The SAME notification replayed (stale seq) must NOT toast again.
  fire({ type: "notification", msgType: "info", msg: "hello", seq: 8 });
  expect(toast).toHaveBeenCalledTimes(1);

  // A data frame replayed below the notification's watermark must NOT apply
  // an older snapshot.
  fire({ html: "<html><body>v6</body></html>", sender: "peer", seq: 6 });
  expect(applySpy).toHaveBeenCalledTimes(1);

  applySpy.mockRestore();
  sync.stop();
});
