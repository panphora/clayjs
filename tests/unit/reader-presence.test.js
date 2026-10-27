/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The roster chrome a reader draws is a first-use download of its own, counted here
 * so a boot that receives no frame can be shown to fetch none of it. The real
 * singleton is handed back once it is asked for, so the squares below are the ones
 * a person sees.
 */
const realRoster = await import("../../src/sync/presence.js");
const rosterLoads = { count: 0 };

jest.unstable_mockModule("../../src/sync/presence.js", () => {
  rosterLoads.count += 1;
  return realRoster;
});

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

const ADA = { id: "p_ada", name: "Ada Lovelace", you: false };
const GRACE = { id: "p_grace", name: "Grace Hopper", you: true };

const stack = () => document.querySelector("[data-clay-presence]");
const avatars = () => [...document.querySelectorAll("[data-clay-presence-avatar]")];
const chip = () => document.querySelector("[data-clay-presence-count]");
const tip = () => document.querySelector("[data-clay-presence-tip]");

async function until(check, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await tick();
}
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
  realRoster.presence.clear();
  document.body.innerHTML = "";
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

// =============================================================================
// The roster chrome is a first-use download (Document 10 Step 7a)
// =============================================================================
//
// These two run before any other boot in this file: the chrome module is counted as
// it is imported, and the registry answers a second request from its cache.

test("a reader that receives no frame never downloads the roster chrome", async () => {
  const { handle } = await startReader();
  await settle();

  expect(rosterLoads.count).toBe(0);
  expect(stack()).toBeNull();
  expect(document.body.children).toHaveLength(0);

  handle.stop();
});

test("the roster chrome arrives once, with the first frame", async () => {
  const { source } = await startReader();
  expect(rosterLoads.count).toBe(0);

  source.dispatchEvent(presenceEvent({ people: [ADA, GRACE], anonymous: 0 }));
  await until(() => avatars().length === 2);
  expect(avatars()).toHaveLength(2);
  expect(rosterLoads.count).toBe(1);

  // A frame after the download draws into the chrome that is already there.
  source.dispatchEvent(presenceEvent({ people: [ADA], anonymous: 1 }));
  await until(() => avatars().length === 1);
  expect(rosterLoads.count).toBe(1);
});

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

// =============================================================================
// The roster a reader is shown (Document 10 Step 7a)
// =============================================================================

test("a reader draws the same roster an editor sees, from the frame it already follows", async () => {
  const { source } = await startReader();

  source.dispatchEvent(presenceEvent({ people: [ADA, GRACE], anonymous: 1 }));
  await until(() => avatars().length === 2);

  // The roster's own chrome, built where the store said who is there.
  expect(stack()).not.toBeNull();
  expect(stack().style.display).toBe("flex");
  expect(avatars().map((el) => el.textContent)).toEqual(["AL", "GH"]);
  expect(chip().textContent).toBe("+1 viewing");

  // A name reaches the page as text, and only while a pointer is on the square.
  avatars()[0].dispatchEvent(new MouseEvent("mouseenter"));
  expect(tip().textContent).toBe(ADA.name);

  // The chrome alone: a reader draws no caret marker and opens no second stream.
  expect(document.querySelector("[data-clay-editing]")).toBeNull();
  expect(sources).toHaveLength(1);
});

test("a second roster frame updates what the reader is shown", async () => {
  const { source } = await startReader();

  source.dispatchEvent(presenceEvent({ people: [ADA, GRACE], anonymous: 0 }));
  await until(() => avatars().length === 2);

  source.dispatchEvent(presenceEvent({ people: [ADA], anonymous: 2 }));
  await until(() => avatars().length === 1);

  expect(avatars().map((el) => el.textContent)).toEqual(["AL"]);
  expect(chip().textContent).toBe("+2 viewing");
});

test("closing the stream clears the roster a reader draws", async () => {
  const { handle, source } = await startReader();

  source.dispatchEvent(presenceEvent({ people: [ADA, GRACE], anonymous: 0 }));
  await until(() => avatars().length === 2);

  handle.stop();
  await settle();

  // Nothing stands in the corner saying who is here once nobody is listening.
  expect(stack()).toBeNull();
  expect(presence.getSnapshot().people).toEqual([]);
});
