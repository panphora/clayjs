/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The one sync module a reader and an editor both load, as a lane that changes with
 * the committed mode instead of being fixed at construction.
 *
 * A reader follows the saved lane. An entry imports the edit plan while the mode is
 * still `view`, so live-sync's own import-time start must stay inert there — the
 * controller starts the lane once the mode has committed — and the same instance then
 * rides the live lane. An exit hands the saved lane back. So:
 *
 *   - an entry that imports this module opens nothing and fetches no edit chunk;
 *   - every start reads the lane from the committed mode unless the caller names one,
 *     and a start on another lane leaves exactly one stream open;
 *   - the participant's lease stops the saved lane, starts the live lane and disposes
 *     it, over as many cycles as an exit can run, never with two streams open;
 *   - a saved lane started from a receipt has it before any frame, so a re-entry does
 *     not wait for one and a frame repeating it changes nothing;
 *   - a live lane started after a view boot activates an incoming document exactly as
 *     an edit boot's does.
 *
 * The `editing-sender` module is the marker for "the edit chunk was fetched": it is a
 * static import of `sync/live-sync-edit.js`, which is the chunk, and nothing else in
 * this file reaches it.
 */

let editChunkLoads = 0;

jest.unstable_mockModule("../../src/sync/editing-sender.js", () => {
  editChunkLoads++;
  return {
    EditingSender: class {
      start() {}
      stop() {}
      roster() {}
    },
  };
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 6; i++) await sleep(0);
};
const until = async (predicate, ms = 2000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (predicate()) return true;
    await sleep(2);
  }
  return false;
};

let sources = [];

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
    this.readyState = 2;
  }
}

const openStreams = () => sources.filter((source) => !source.closed);
const notFound = () =>
  Promise.resolve({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "",
  });

// One fresh page: the mode facts are evaluated again, so a boot in view and a boot in
// edit are two different evaluations of the same module, exactly as they are in a
// browser. `phase` is committed before live-sync evaluates, which is the entry's state
// while its imports run.
async function boot({ edit = false, phase = null } = {}) {
  jest.resetModules();
  editChunkLoads = 0;
  sources = [];
  document.documentElement.removeAttribute("editmode");
  document.body.innerHTML = "";
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", "/index.html");
  if (edit) window.clayEditMode = true;
  else delete window.clayEditMode;
  const facts = await import("../../src/core/is-edit-mode.js");
  if (phase) facts.commitModeFacts({ phase });
  const mod = await import("../../src/sync/live-sync.js");
  return { facts, mod, sync: mod.liveSync };
}

const participantOf = async () => {
  const { supportFor } = await import("../../src/core/mode-support.js");
  return supportFor("sync/live-sync.js");
};

beforeAll(() => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = window.fetch = jest.fn(() => notFound());
});

afterEach(() => {
  delete window.clayEditMode;
});

test("a live entry's import opens nothing and fetches no edit chunk", async () => {
  const { sync } = await boot({ edit: true, phase: "entering" });
  await flush();

  expect(sources).toHaveLength(0);
  expect(editChunkLoads).toBe(0);
  expect(sync._ready).toBeNull();
});

test("an explicit edit boot still starts the live lane and loads its edit chunk", async () => {
  const { sync } = await boot({ edit: true });
  await flush();

  expect(sync.lane).toBe("live");
  expect(sources).toHaveLength(1);
  expect(sources[0].url).toContain("lane=live");
  expect(editChunkLoads).toBe(1);
});

test("a start reads the lane from the committed mode, and a named lane leaves one stream open", async () => {
  // A view boot: the lane this page started with is the saved one.
  const { facts, sync } = await boot();
  await flush();
  sync.stop();
  sources = [];
  expect(sync.lane).toBe("saved");

  sync.start("index.html");
  await sync._ready;
  expect(sync.lane).toBe("saved");
  expect(sources.at(-1).url).toContain("lane=saved");
  expect(openStreams()).toHaveLength(1);

  // The entry's commit, then a start that names no lane: the lane follows the mode,
  // not the one this instance was built with.
  facts.commitModeFacts({ mode: "edit", isEditMode: true });
  sync.start("index.html");
  await sync._ready;
  expect(sync.lane).toBe("live");
  expect(sources.at(-1).url).toContain("lane=live");
  expect(openStreams()).toHaveLength(1);

  sync.start("index.html", { lane: "saved" });
  await sync._ready;
  expect(sync.lane).toBe("saved");
  expect(sources.at(-1).url).toContain("lane=saved");
  expect(openStreams()).toHaveLength(1);

  // And an exit's commit takes a start with no option back to the saved lane.
  facts.commitModeFacts({ mode: "view", isEditMode: false });
  sync.start("index.html", { lane: "live" });
  await sync._ready;
  sync.start("index.html");
  await sync._ready;
  expect(sync.lane).toBe("saved");
  expect(openStreams()).toHaveLength(1);

  sync.stop();
  expect(openStreams()).toHaveLength(0);
});

test("the participant's lease never has two streams open, and ends with none", async () => {
  const { mod, sync } = await boot();
  await flush();
  sync.stop();
  sources = [];

  sync.start("index.html");
  await sync._ready;
  expect(sync.lane).toBe("saved");

  const participant = await (await participantOf())(mod);
  expect(participant.id).toBe("clay:sync");
  expect(participant.order).toBe(50);

  for (let cycle = 0; cycle < 20; cycle++) {
    const lease = await participant.prepare({ initial: false, isCurrent: () => true });
    lease.enable();
    expect(sync.lane).toBe("live");
    await until(() => openStreams().length === 1);
    expect({ cycle, open: openStreams().length }).toEqual({ cycle, open: 1 });
    expect(openStreams()[0].url).toContain("lane=live");
    lease.dispose();
    expect({ cycle, open: openStreams().length }).toEqual({ cycle, open: 0 });
  }
  expect(openStreams()).toHaveLength(0);
});

const FILE = (word) =>
  `<!doctype html><html><head><title>Reader</title></head><body><article data-page="1"><p data-id="a">${word}</p></article></body></html>`;

const articleText = () => document.querySelector('article [data-id="a"]')?.textContent ?? null;

test("a saved lane started from a receipt has it before any frame, and a frame repeating it changes nothing", async () => {
  const { sync } = await boot();
  await flush();
  sync.stop();
  sources = [];

  document.body.innerHTML = '<article data-page="1"><p data-id="a">local</p></article>';
  const bytes = FILE("disk");

  sync.start("index.html", { lane: "saved", represented: { bytes, etag: "E1", seq: 7 } });
  expect(sync._represented).toEqual({ bytes, etag: "E1", seq: 7 });
  expect(sync.lastHtml).toBeNull();

  await sync._ready;
  // The frame's drain, run by hand: a queued frame would otherwise still be waiting for
  // an animation frame when the assertion runs, and "nothing changed" would be true of
  // any frame at all.
  sync._requestFrame = () => null;
  sync.sse.onmessage({ data: JSON.stringify({ html: bytes, seq: 8, sender: "peer", etag: "E1" }) });
  await sync._runPending();
  await flush();

  expect(articleText()).toBe("local");
  expect(sync._represented).toEqual({ bytes, etag: "E1", seq: 8 });
  sync.stop();
});

function diskDoc(bodyInner) {
  return `<!DOCTYPE html><html><head></head><body>${bodyInner}</body></html>`;
}

test("a live lane started after a view boot activates an incoming document", async () => {
  const { sync } = await boot();
  await flush();
  sync.stop();
  sources = [];

  const snapshot = await import("../../src/core/snapshot.js");
  const gate = await import("../../src/lib/dirty-gate.js");
  const save = await import("../../src/core/save.js");

  document.body.innerHTML = '<section data-id="b"><p>v1</p></section>';
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  // No connection: this test is about the frame, not the wire.
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html", { lane: "live" });
  expect(sync.lane).toBe("live");
  expect(sync._diskBase).toContain("v1");

  await sync._doApplyExternal(
    diskDoc(
      '<section data-id="b"><p>v2-from-disk</p></section>' +
        '<div data-id="ed" editmode:contenteditable inert-contenteditable="true">x</div>'
    ),
    20
  );

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("v2-from-disk");
  const ed = document.querySelector('[data-id="ed"]');
  expect(ed.getAttribute("contenteditable")).toBe("true");
  expect(ed.hasAttribute("inert-contenteditable")).toBe(false);
  sync.stop();
});

test("adoption of an initial edit's live lane starts nothing new", async () => {
  const { mod, sync } = await boot({ edit: true });
  await flush();
  expect(sync.lane).toBe("live");
  expect(openStreams()).toHaveLength(1);
  const opened = sources.length;

  const lease = await (await participantOf())(mod).then((participant) =>
    participant.prepare({ initial: true, isCurrent: () => true })
  );
  await flush();

  expect(sources).toHaveLength(opened);
  expect(openStreams()).toHaveLength(1);
  expect(editChunkLoads).toBe(1);
  // Nothing to enable: the lane is already running, and a lease that offered an enable
  // would restart what the boot started.
  expect(lease.enable).toBeUndefined();

  lease.dispose();
  expect(openStreams()).toHaveLength(0);
});
