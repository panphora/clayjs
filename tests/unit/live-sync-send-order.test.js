import { jest } from "@jest/globals";

/**
 * Two defects in one lane:
 *   - a duplicated tab inherited the original's sender id through sessionStorage,
 *     so each treated the other's edits as its own echo and they stopped syncing;
 *   - concurrent sends raced, and a last-write-wins server could store the OLDER
 *     snapshot for every peer.
 */

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;

beforeAll(async () => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ LiveSync } = await import("../../src/sync/live-sync.js"));
});

afterEach(() => {
  delete global.fetch;
});

test("a duplicated tab does not inherit the original's sender id", () => {
  // What tab duplication actually does: the copy starts with the original's
  // sessionStorage already populated.
  sessionStorage.setItem("livesync-client-id", "inherited-id");

  const original = new LiveSync();
  const duplicate = new LiveSync();

  expect(original.clientId).not.toBe(duplicate.clientId);
  expect(original.clientId).not.toBe("inherited-id");
  expect(duplicate.clientId).not.toBe("inherited-id");
});

test("one POST in flight at a time, and the newest queued payload wins", async () => {
  const settle = [];
  global.fetch = jest.fn(
    () => new Promise((resolve) => settle.push(() => resolve({ ok: true })))
  );

  const sync = new LiveSync();

  sync._enqueueSend("<html>A</html>", null);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  // Both land while A is still on the wire; C must replace B in the one slot.
  sync._enqueueSend("<html>B</html>", null);
  sync._enqueueSend("<html>C</html>", null);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  settle[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body).html).toBe("<html>C</html>");
});
