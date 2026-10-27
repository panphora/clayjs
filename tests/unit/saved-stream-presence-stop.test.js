/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The reader's roster download is held open across the reader's own stop.
 *
 * `takePresence` imports the store and the roster chrome before it attaches the lease
 * that draws them. A stop while that download is in flight takes the stream away, and
 * the load that lands afterwards attaches nothing: no lease, no squares, and no claim
 * on a store another owner already holds. The roster module is the one held here, so
 * the frame is the only thing that asked for it.
 */
const realRoster = await import("../../src/sync/presence.js");
let gate = null;

jest.unstable_mockModule("../../src/sync/presence.js", async () => {
  if (gate) await gate.promise;
  return realRoster;
});

const PAGE = "http://localhost/index.html";

let sources;
let fetchCalls;
let metaAnswer;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    sources.push(this);
  }
  close() {
    this.closed = true;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await tick();
  await tick();
  await tick();
};

const response = (status, text) => ({ ok: status < 400, status, text: async () => text });
const presenceEvent = (data) => new MessageEvent("presence", { data: JSON.stringify(data) });
const ADA = { id: "p_ada", name: "Ada Lovelace", you: false };

let createSavedStream;
let resetHostMeta;
let presence;

beforeAll(async () => {
  sources = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ createSavedStream } = await import("../../src/sync/saved-stream.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
  ({ presence } = await import("../../src/sync/presence-store.js"));
});

beforeEach(() => {
  sources = [];
  metaAnswer = { spec: 1, extensions: ["sync", "presence"] };
  resetHostMeta();
  presence.clear();
  presence.owner?.detach();
  presence.explicit = false;
  realRoster.presence.clear();
  document.body.innerHTML = "";
  fetchCalls = [];
  global.fetch = jest.fn((url) => {
    fetchCalls.push({ url: String(url) });
    if (String(url).includes("/_/meta")) return Promise.resolve(response(200, JSON.stringify(metaAnswer)));
    return Promise.resolve(response(200, "<!DOCTYPE html><html><body><article data-page><p>one</p></article></body></html>"));
  });
});

afterEach(() => {
  delete global.fetch;
});

async function startReader() {
  const handle = createSavedStream({
    documentURL: "/index.html",
    onSnapshot: () => true,
  });
  handle.start();
  await handle.ready;
  const source = sources.at(-1);
  source.onopen?.();
  await settle();
  return { handle, source };
}

test("a roster download that lands after the reader stopped attaches no lease", async () => {
  let release;
  gate = { promise: new Promise((resolve) => { release = resolve; }) };
  const { handle, source } = await startReader();

  // An editor already owns the store: the roster the reader would draw is not its to take.
  const editor = presence.attachTransport({ send: async () => true });
  expect(presence.owner).toBe(editor);

  source.dispatchEvent(presenceEvent({ people: [ADA], anonymous: 0 }));
  await settle();
  expect(presence.owner).toBe(editor);
  expect(presence.getSnapshot().people).toEqual([]);
  expect(realRoster.presence.roster?.people ?? []).toEqual([]);

  handle.stop();
  await settle();

  release();
  gate = null;
  await settle();
  await settle();

  expect(presence.owner).toBe(editor);
  expect(editor.active).toBe(true);
  expect(presence.getSnapshot().people).toEqual([]);
  expect(realRoster.presence.roster?.people ?? []).toEqual([]);
  expect(document.querySelector("[data-clay-presence]")).toBeNull();
  expect(fetchCalls.filter((call) => call.url.includes("/_/presence"))).toHaveLength(0);

  editor.detach();
});
