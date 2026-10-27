import { jest } from "@jest/globals";

/**
 * Two defects in one lane:
 *   - a duplicated tab inherited the original's sender id through sessionStorage,
 *     so each treated the other's edits as its own echo and they stopped syncing;
 *   - concurrent sends raced, and a last-write-wins server could store the OLDER
 *     snapshot for every peer.
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
  // Discovery is a precondition of sending, not the thing under test: the client
  // must know which wire it is on before it can address a relay. This mock host
  // answers /_/meta with something unparseable, which is the legacy verdict.
  await sync._resolveProfile();
  expect(sync._profile.name).toBe("legacy");
  global.fetch.mockClear();

  sync._enqueueSend("<html>A</html>", null);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  // Both land while A is still on the wire; C must replace B in the one slot.
  sync._enqueueSend("<html>B</html>", null);
  sync._enqueueSend("<html>C</html>", null);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  settle[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(global.fetch).toHaveBeenCalledTimes(2);
  // `html` is the legacy artifact key; a host announcing `sync` gets `snapshot`.
  expect(JSON.parse(global.fetch.mock.calls[1][1].body).html).toBe("<html>C</html>");
});

// ------------------------------------------------------------ the relay body

// jsdom 20's Blob has no `text()`, so the bytes are read back the way this environment
// can: through FileReader, which decodes them as UTF-8 exactly as `text()` would.
const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const readBody = async (body) => (typeof body === "string" ? body : await blobText(body));

// Over the relay body threshold (the save body's), and the same one the request is built
// against: `RELAY_BODY_BLOB_MIN_BYTES` in live-sync.js.
const MIN = 1024 * 1024;
const LARGE = `<html>${"x".repeat(MIN)}</html>`;

async function relayBodies(html, identityMap, etag = null) {
  const settle = [];
  global.fetch = jest.fn(() => new Promise((resolve) => settle.push(() => resolve({ ok: true }))));
  const sync = new LiveSync();
  await sync._resolveProfile();
  global.fetch.mockClear();
  sync._enqueueSend(html, identityMap, etag);
  const [url, options] = global.fetch.mock.calls[0];
  settle[0]();
  return { url: String(url), options, sender: sync.clientId };
}

test("a small relay body is the string it always was", async () => {
  const html = "<html>small</html>";
  const { url, options, sender } = await relayBodies(html, { a: "b" }, "E1");

  expect(url).toContain("/_/live-sync/save");
  expect(options.headers["Content-Type"]).toBe("application/json");
  expect(typeof options.body).toBe("string");
  // Byte for byte what the object form of this body has always produced.
  expect(options.body).toBe(JSON.stringify({ html, sender, identityMap: { a: "b" }, etag: "E1" }));
});

test("a large relay body is a Blob of those exact bytes", async () => {
  const identityMap = { "data-id=a": "b" };
  const { options, sender } = await relayBodies(LARGE, identityMap, "E2");

  expect(options.body).toBeInstanceOf(Blob);
  expect(options.body.type.toLowerCase()).toBe("application/json");
  // The header, not the Blob's own type, is what describes these bytes on the wire.
  expect(options.headers["Content-Type"]).toBe("application/json");
  expect(options.body.size).toBe(JSON.stringify({ html: LARGE, sender, identityMap, etag: "E2" }).length);
  expect(await readBody(options.body)).toBe(JSON.stringify({ html: LARGE, sender, identityMap, etag: "E2" }));
  // And it is still one parsed document with the fields a host reads.
  const parsed = JSON.parse(await readBody(options.body));
  expect(parsed.html).toBe(LARGE);
  expect(parsed.identityMap).toEqual(identityMap);
  expect(parsed.etag).toBe("E2");
});

test("a large relay body without a stamp carries no etag key, as before", async () => {
  const { options, sender } = await relayBodies(LARGE, null);

  expect(await readBody(options.body)).toBe(JSON.stringify({ html: LARGE, sender, identityMap: null }));
});

test("a large relay body with no identity map leaves the key out, as the object form does", async () => {
  const { options, sender } = await relayBodies(LARGE, undefined);

  // `JSON.stringify` drops a key whose value is undefined, and this body must not write
  // one out as the token `undefined` instead.
  expect(await readBody(options.body)).toBe(JSON.stringify({ html: LARGE, sender }));
});
