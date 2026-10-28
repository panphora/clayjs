import { jest } from "@jest/globals";

/**
 * The editing marker on the wire, from the roster frame to the request.
 *
 * The sender is only ever built on a host that announces `presence-editing`
 * (spec §5: capabilities are announced, never probed), and only in edit mode.
 * Everything else here follows from what the host does with the request: it runs
 * its full state chain and keeps the path on the connection, so the tab must
 * send the block once someone else is named, send it again after every stream
 * open, and stop sending when the run is torn down.
 */

const ME = { id: "p_me", name: "Grace Hopper", canEdit: true, you: true };
const OTHER = { id: "p_ada", name: "Ada Lovelace", canEdit: true, you: false };

let sources = [];
let syncs = [];

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    sources.push(this);
  }
  close() {}
}

let LiveSync;
let resetHostMeta;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;

  const module = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = module);
  // The singleton wires itself up on import and would open a second stream.
  module.liveSync.stop();
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  resetHostMeta();
  sources = [];
  syncs = [];
  document.body.innerHTML = "";
});

afterEach(() => {
  syncs.splice(0).forEach((sync) => sync.stop());
  delete global.fetch;
});

// `/_/meta` answers first; everything after it is a relay or the marker.
function host(extensions) {
  return jest.fn((url) => {
    if (String(url).includes("/_/meta")) {
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ spec: 1, extensions, document: null }),
      });
    }
    return Promise.resolve({ ok: true });
  });
}

// The block the person is working in, first in body so its path is "0".
function page() {
  document.body.innerHTML = '<div id="block" contenteditable="true">the block</div>';
  return document.getElementById("block");
}

async function startedAgainst(fetchImpl, lane) {
  global.fetch = fetchImpl;
  const sync = new LiveSync();
  syncs.push(sync);
  if (lane) sync.lane = lane;
  sync.start("index.html");
  await sync._ready;
  // The sender is built behind a second discovery answer, which this is the only
  // thing left to settle.
  await turn(20);
  return sync;
}

const open = (source) => source.onopen();
const roster = (source, people) =>
  source.dispatchEvent(new MessageEvent("presence", { data: JSON.stringify({ people, anonymous: 0 }) }));
const sentTo = (fetchImpl, path) =>
  fetchImpl.mock.calls.filter(([url]) => String(url).includes(path));

const turn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The marker takes two chained zero-delay timers (the poke that reads the settled
// caret, then the send it schedules), and a resend waits out the rate limit the
// first send started. Waiting on the condition rather than on the clock keeps a
// busy machine out of the result.
async function until(check, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await turn(10);
}

test("a presence-editing host is told the block under the caret", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  const sync = await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await until(() => sentTo(fetchImpl, "/_/presence").length === 1);

  expect(sync._editing).not.toBeNull();
  const calls = sentTo(fetchImpl, "/_/presence");
  expect(calls).toHaveLength(1);

  const [url, init] = calls[0];
  expect(String(url)).toBe(`http://localhost/_/presence?client-id=${sync.clientId}`);
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({
    "Content-Type": "application/json",
    "Document-URL": window.location.href,
  });
  expect(JSON.parse(init.body)).toEqual({ editing: "0" });
});

test("a host that does not announce presence-editing is never told", async () => {
  const fetchImpl = host(["sync", "presence"]);
  const block = page();
  const sync = await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await turn(100);

  expect(sync._editing).toBeNull();
  expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(0);
});

test("a view-mode tab is never told", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  const sync = await startedAgainst(fetchImpl, "saved");

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await turn(100);

  expect(sync._editing).toBeNull();
  expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(0);
});

test("a stream opening again reports the block again", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await until(() => sentTo(fetchImpl, "/_/presence").length === 1);

  open(sources[0]);
  await until(() => sentTo(fetchImpl, "/_/presence").length === 2);

  const calls = sentTo(fetchImpl, "/_/presence");
  expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[1][1].body)).toEqual({ editing: "0" });
});

test("a stopped tab reports nothing more", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  const sync = await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await until(() => sentTo(fetchImpl, "/_/presence").length === 1);

  sync.stop();
  const second = document.createElement("div");
  second.setAttribute("contenteditable", "true");
  document.body.appendChild(second);
  second.focus();
  await turn(100);

  expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(1);
});

// jsdom measures nothing, so the block the outline is drawn around needs a size.
const RECT = { top: 100, left: 20, width: 300, height: 40, bottom: 140, right: 320 };

test("a presence frame naming another person's block draws the outline", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  block.getBoundingClientRect = () => RECT;
  await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, { ...OTHER, editing: "0" }]);
  await until(() => document.querySelector("[data-clay-editing-marker]"));

  expect(document.querySelectorAll("[data-clay-editing-marker]").length).toBe(1);
  expect(document.querySelector("[data-clay-editing-chip]").textContent).toBe("Ada Lovelace");
  expect(document.querySelector("[data-clay-editing]")).not.toBeNull();
});

test("a stopped tab takes the outline down with the stream", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  block.getBoundingClientRect = () => RECT;
  const sync = await startedAgainst(fetchImpl);

  open(sources[0]);
  roster(sources[0], [ME, { ...OTHER, editing: "0" }]);
  await until(() => document.querySelector("[data-clay-editing-marker]"));
  expect(document.querySelector("[data-clay-editing]")).not.toBeNull();

  sync.stop();

  expect(document.querySelector("[data-clay-editing]")).toBeNull();
});

test("a sender discovered during the exit barrier says nothing until resume", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const block = page();
  global.fetch = fetchImpl;
  const sync = new LiveSync();
  syncs.push(sync);
  const { syncParticipant } = await import("../../src/sync/live-sync-edit.js");
  const participant = await syncParticipant(sync).prepare({});

  // The barrier is up before discovery answers, so the sender it builds is one
  // the exit never started.
  sync.start("index.html");
  expect(participant.quiesce()).toEqual({ ok: true });
  await sync._ready;
  await turn(20);
  expect(sync._editing).not.toBeNull();

  open(sources[0]);
  roster(sources[0], [ME, OTHER]);
  block.focus();
  await turn(600);

  expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(0);

  participant.resume();
  await until(() => sentTo(fetchImpl, "/_/presence").length === 1);
  expect(JSON.parse(sentTo(fetchImpl, "/_/presence")[0][1].body)).toEqual({ editing: "0" });
});

test("the relay posts the document exactly as it did", async () => {
  const fetchImpl = host(["sync", "presence", "presence-editing"]);
  const sync = await startedAgainst(fetchImpl);

  sync._postUpdate("<html>x</html>", null);

  const calls = sentTo(fetchImpl, "/_/sync");
  expect(calls).toHaveLength(1);
  const [url, init] = calls[0];
  expect(String(url)).toContain("/_/sync");
  expect(init.headers["Document-URL"]).toBeTruthy();
  expect(JSON.parse(init.body).snapshot).toBe("<html>x</html>");
  expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(0);
});
