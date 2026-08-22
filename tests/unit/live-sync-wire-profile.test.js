import { jest } from "@jest/globals";

/**
 * Which live-sync wire the client speaks, and how it decides.
 *
 * Spec §10 puts both halves on `/_/sync`, but not every host serves that address
 * and the ones that do not cannot be upgraded on our schedule. So the client knows
 * both wires and picks one from `/_/meta` (§5), never by probing: an EventSource
 * reports a 404, an auth refusal and an offline browser through the same error
 * path, so a failed connection cannot say which address was wrong.
 *
 * The invariant that matters most is the last test. Sending on one wire while
 * receiving on the other is the exact defect this replaces.
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
let resetHostMeta;

beforeAll(async () => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ LiveSync } = await import("../../src/sync/live-sync.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  resetHostMeta();
});

afterEach(() => {
  delete global.fetch;
});

// `/_/meta` answers first; everything after it is the relay.
function host({ meta, relay = { ok: true } }) {
  return jest.fn((url) => {
    if (String(url).includes("/_/meta")) {
      return Promise.resolve({
        ok: meta !== 404,
        text: () => Promise.resolve(meta === 404 ? "" : JSON.stringify(meta)),
      });
    }
    return Promise.resolve(relay);
  });
}

async function startedAgainst(fetchImpl) {
  global.fetch = fetchImpl;
  const sync = new LiveSync();
  sync.start("index.html");
  await sync._ready;
  return sync;
}

test("a host announcing sync gets the spec wire on both halves", async () => {
  const sync = await startedAgainst(host({ meta: { spec: 1, extensions: ["sync", "upload"] } }));

  expect(sync._profile.name).toBe("spec");
  expect(sync.sse.url).toContain("/_/sync?document-url=");

  sync._postUpdate("<html>x</html>", null);
  const [url, init] = global.fetch.mock.calls.at(-1);
  expect(String(url)).toContain("/_/sync");
  expect(init.headers["Document-URL"]).toBeTruthy();
  expect(JSON.parse(init.body).snapshot).toBe("<html>x</html>");
});

test("a host that does not announce sync gets the legacy wire on both halves", async () => {
  const sync = await startedAgainst(host({ meta: { spec: 1, extensions: ["upload"] } }));

  expect(sync._profile.name).toBe("legacy");
  expect(sync.sse.url).toContain("/_/live-sync/stream?page-url=");

  sync._postUpdate("<html>x</html>", null);
  const [url, init] = global.fetch.mock.calls.at(-1);
  expect(String(url)).toContain("/_/live-sync/save");
  expect(init.headers["Page-URL"]).toBeTruthy();
  expect(JSON.parse(init.body).html).toBe("<html>x</html>");
});

// A bare core host with no discovery at all. Absence selects legacy rather than
// disabling sync, because both first-party hosts ran live sync for years without
// advertising it and refusing them would regress every published version.
test("a host with no /_/meta at all falls back to the legacy wire", async () => {
  const sync = await startedAgainst(host({ meta: 404 }));

  expect(sync._profile.name).toBe("legacy");
  expect(sync.sse.url).toContain("/_/live-sync/stream");
});

test("a snapshot produced while discovery is in flight is sent, not dropped", async () => {
  let release;
  global.fetch = jest.fn((url) => {
    if (String(url).includes("/_/meta")) {
      return new Promise((resolve) => {
        release = () => resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ spec: 1, extensions: ["sync"] })),
        });
      });
    }
    return Promise.resolve({ ok: true });
  });

  const sync = new LiveSync();
  sync._enqueueSend("<html>early</html>", null);

  // Nothing has been posted: the client will not guess an address.
  expect(global.fetch.mock.calls.filter((c) => !String(c[0]).includes("/_/meta"))).toHaveLength(0);

  release();
  await sync._resolveProfile();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const relayCalls = global.fetch.mock.calls.filter((c) => !String(c[0]).includes("/_/meta"));
  expect(relayCalls).toHaveLength(1);
  expect(JSON.parse(relayCalls[0][1].body).snapshot).toBe("<html>early</html>");
});

// The defect this design replaces: the client posted to the spec address while
// streaming from the legacy one, so it worked on no host at all.
test("send and receive never end up on different wires", async () => {
  for (const extensions of [["sync"], ["upload"], []]) {
    resetHostMeta();
    const sync = await startedAgainst(host({ meta: { spec: 1, extensions } }));

    sync._postUpdate("<html>x</html>", null);
    const relayUrl = String(global.fetch.mock.calls.at(-1)[0]);
    const streamIsSpec = sync.sse.url.includes("/_/sync?");
    const relayIsSpec = relayUrl.endsWith("/_/sync");

    expect(relayIsSpec).toBe(streamIsSpec);
  }
});
