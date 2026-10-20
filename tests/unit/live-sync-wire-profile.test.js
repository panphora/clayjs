import { jest } from "@jest/globals";
import { onStream } from '../../src/live/stream-bridge.js';

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
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ LiveSync } = await import("../../src/sync/live-sync.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

afterAll(() => { delete window.clayEditMode; });

beforeEach(() => {
  resetHostMeta();
});

afterEach(() => {
  delete global.fetch;
  delete global.SharedWorker;
});

test.each([
  [['sync', 'sync-worker'], 'v1'],
  [['sync', 'live-data', 'sync-worker-data'], 'v2'],
  [['sync', 'live-data', 'sync-worker-data', 'presence'], 'direct'],
  [['sync', 'live-data', 'sync-worker'], 'direct'],
  [['sync', 'sync-worker-data'], 'direct'],
  [['live-data', 'sync-worker-data'], 'direct'],
  [['sync'], 'direct'],
  [['sync', 'sync-worker', 'presence'], 'direct'],
  [['sync-worker'], 'direct'],
])('shared-worker discovery %j selects the compatible transport', async (extensions, transport) => {
  const workers = [];
  global.SharedWorker = class {
    constructor(url, name) {
      this.url = url; this.name = name;
      this.port = { start() {}, close() {}, postMessage: jest.fn() };
      workers.push(this);
    }
  };
  const sync = await startedAgainst(host({ meta: { spec: 1, extensions } }));
  try {
    expect(workers).toHaveLength(transport === 'direct' ? 0 : 1);
    if (transport !== 'direct') {
      expect(workers[0].url).toBe(`http://localhost/_/sync/${transport === 'v2' ? 'data-worker.js' : 'worker.js'}`);
      expect(workers[0].name).toBe(transport === 'v2' ? 'clay-sync-data' : 'clay-sync');
      const subscribe = workers[0].port.postMessage.mock.calls[1][0];
      expect(subscribe).toEqual({
        v: transport === 'v2' ? 2 : 1, type: 'subscribe', document: window.location.href,
        lane: sync.lane, since: 0,
        ...(transport === 'v2' && sync.lane === 'live' ? { clientId: sync.clientId } : {}),
      });
      const apply = jest.spyOn(sync, 'applyUpdate').mockImplementation(() => {});
      const send = data => workers[0].port.onmessage({ data: { v: transport === 'v2' ? 2 : 1, ...data } });
      if (transport === 'v2') send({ type: 'hello', features: ['live-data'] });
      send({ type: 'cursor', seq: 42, resync: false });
      send({ type: 'frame', data: JSON.stringify({ seq: 42, html: 'peer', sender: 'peer' }) });
      expect(apply).toHaveBeenCalledTimes(1);
      send({ type: 'frame', data: JSON.stringify({ seq: 43, html: 'own', sender: sync.clientId }) });
      expect(apply).toHaveBeenCalledTimes(1);
      expect(sync.lastSeenSeq).toBe(43);
    } else {
      expect(new URL(sync.sse.url).searchParams.get('client-id')).toBe(sync.clientId);
      expect(new URL(sync.sse.url).searchParams.get('resume-id')).toBe(sync.resumeId);
    }
  } finally { sync.stop(); }
});

test('v2 live stream delivers readiness and parsed room events through the real bridge', async () => {
  let worker;
  global.SharedWorker = class {
    constructor() {
      worker = this;
      this.port = { start() {}, close() {}, postMessage: jest.fn() };
    }
  };
  const sync = await startedAgainst(host({ meta: { spec: 1, extensions: ['sync', 'live-data', 'sync-worker-data'] } }));
  expect(sync.lane).toBe('live');
  const opened = jest.fn(), closed = jest.fn(), event = jest.fn();
  const unsubscribe = onStream({ open: opened, close: closed, event });
  const send = data => worker.port.onmessage({ data: { v: 2, ...data } });
  try {
    send({ type: 'hello', features: ['live-data'] });
    send({ type: 'status', state: 'open' });
    expect(opened).toHaveBeenCalledWith({ clientId: sync.clientId, lane: sync.lane });
    const payloads = [
      ['data', { seq: 900, op: { kind: 'set' } }],
      ['data-state', { seen: { [sync.clientId]: 7 }, saved: { [sync.clientId]: 5 }, pageTransition: 'stable' }],
      ['data-writer', { clientId: sync.clientId, conn: 'proof' }],
    ];
    for (const [name, data] of payloads) send({ type: 'event', event: name, data });
    expect(event.mock.calls).toEqual(payloads.map(([name, data]) => [name, data]));
    send({ type: 'status', state: 'connecting' });
    expect(closed).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    sync.stop();
  }
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
  expect(sync._sharedSync).toBe(false);
  expect(sync._sharedData).toBe(false);
  expect(sync._liveData).toBe(false);
  sync.stop();
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

// The host reads `?client-id=` at admission to tell one tab from another — two
// tabs of a guest whose cookie was refused are otherwise one participant. It is
// the same value every outbound frame carries as `sender`, so the connection the
// host names and the frames it sees are joined by one string.
test("both wires carry the tab's client id, and it is the sender its frames use", async () => {
  for (const [extensions, wire] of [[["sync"], "spec"], [["upload"], "legacy"]]) {
    resetHostMeta();
    const sync = await startedAgainst(host({ meta: { spec: 1, extensions } }));
    expect(sync._profile.name).toBe(wire);

    const sent = new URL(sync.sse.url).searchParams.get("client-id");
    expect(sent).toBe(sync.clientId);
    expect(sent).toBeTruthy();

    sync._postUpdate("<html>x</html>", null);
    expect(JSON.parse(global.fetch.mock.calls.at(-1)[1].body).sender).toBe(sent);
  }
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
