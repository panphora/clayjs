/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * A reader's presence over the stream it already follows (Document 10 Step 5).
 *
 * A reader has one connection and no write half. The roster arrives as a named
 * `presence` frame on that same saved stream, so who is present costs no second
 * EventSource, no durable room and no writable join. A roster frame is not a file:
 * it moves no receipt, no resume cursor and no selection.
 */

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
const frame = (data) => ({ data: JSON.stringify(data) });

const posts = () => fetchCalls.filter((call) => call.init.method === "POST");
const metaCalls = () => fetchCalls.filter((call) => call.url.includes("/_/meta"));

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
  presence.explicit = false;
  presence.owner?.detach();
  global.fetch = jest.fn((url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    if (String(url).includes("/_/meta")) return Promise.resolve(response(200, JSON.stringify(metaAnswer)));
    return Promise.resolve(response(200, "<!DOCTYPE html><html><body><article data-page><p>one</p></article></body></html>"));
  });
  fetchCalls = [];
});

afterEach(() => {
  delete global.fetch;
});

async function startReader() {
  const snapshots = [];
  const statuses = [];
  const handle = createSavedStream({
    documentURL: "/index.html",
    onSnapshot: (candidate) => {
      snapshots.push(candidate);
      return true;
    },
    onStatus: (status) => statuses.push(status),
  });
  handle.start();
  await handle.ready;
  const source = sources.at(-1);
  source.onopen?.();
  await settle();
  return { handle, snapshots, statuses, source };
}

test("a reader takes the roster from the stream it already follows", async () => {
  const { source } = await startReader();
  expect(sources).toHaveLength(1);

  source.dispatchEvent(presenceEvent({
    people: [{ id: "p_ada", name: "Ada Lovelace", you: false, canEdit: true }],
    anonymous: 1,
  }));
  await settle();

  expect(sources).toHaveLength(1);
  const snapshot = presence.getSnapshot();
  expect(snapshot.people.map((person) => person.name)).toEqual(["Ada Lovelace"]);
  expect(snapshot.anonymous).toBe(1);
  expect(posts()).toHaveLength(0);
  expect(metaCalls().map((call) => call.url)).toEqual([PAGE.replace("index.html", "_/meta")]);
});

test("a roster frame moves no receipt, no resume cursor and no file", async () => {
  const { handle, snapshots, statuses, source } = await startReader();
  const before = handle.represented;
  const applied = snapshots.length;
  const fetches = fetchCalls.length;

  source.dispatchEvent(presenceEvent({ people: [{ id: "p_ada", name: "Ada", you: false }], anonymous: 0 }));
  await settle();

  expect(handle.represented).toBe(before);
  expect(snapshots).toHaveLength(applied);
  expect(statuses.map((status) => status.state)).not.toContain("recoverable");
  // Presence is not a reason to refetch the file or to open anything new.
  expect(fetchCalls).toHaveLength(fetches);
  expect(sources).toHaveLength(1);
});

test("a reader joins no durable room and publishes no target", async () => {
  const { source } = await startReader();
  source.dispatchEvent(presenceEvent({ people: [], anonymous: 2 }));
  await settle();

  // View mode marks a page target the way a page would; a reader's transport has
  // no write half, so nothing leaves and nothing is asked of the relay.
  expect(presence.setTarget({
    kind: "page",
    v: 1,
    epoch: "room-7",
    generation: 0,
    selection: { kind: "blocks", ids: ["p1"] },
  })).toBe(true);
  await settle();

  expect(posts()).toHaveLength(0);
  expect(fetchCalls.filter((call) => call.url.includes("/_/presence"))).toHaveLength(0);
  expect(sources).toHaveLength(1);
  expect(sources[0].url).toContain("lane=saved");
});

test("a failed editor activation leaves the reader's roster working", async () => {
  const { source } = await startReader();
  source.dispatchEvent(presenceEvent({ people: [{ id: "p_ada", name: "Ada", you: false }], anonymous: 0 }));
  await settle();
  expect(presence.getSnapshot().people).toHaveLength(1);

  // The activation's own discovery fails: no transport is attached, no target is
  // published, and the reader keeps the roster it already had.
  metaAnswer = null;
  global.fetch = jest.fn((url) => {
    if (String(url).includes("/_/meta")) return Promise.resolve(response(503, ""));
    return Promise.resolve(response(200, ""));
  });
  resetHostMeta();
  expect(await presence.connect({ send: async () => true })).toBeNull();

  expect(presence.getSnapshot().people.map((person) => person.name)).toEqual(["Ada"]);
  source.dispatchEvent(presenceEvent({ people: [{ id: "p_ada", name: "Ada", you: false }], anonymous: 1 }));
  await settle();
  expect(presence.getSnapshot().anonymous).toBe(1);
});

test("a stopped reader takes its roster with it, and a newer owner keeps its own", async () => {
  const { handle, source } = await startReader();
  source.dispatchEvent(presenceEvent({ people: [{ id: "p_ada", name: "Ada", you: false }], anonymous: 0 }));
  await settle();
  expect(presence.getSnapshot().people).toHaveLength(1);

  // The editor that takes the document over attaches first; the reader giving its
  // own lease back afterwards cannot clear the newer owner's roster.
  const editor = presence.attachTransport({ send: async () => true });
  handle.stop();
  await settle();

  expect(editor.active).toBe(true);
  expect(presence.getSnapshot().people).toHaveLength(1);

  editor.detach();
  expect(presence.getSnapshot().people).toEqual([]);
});
