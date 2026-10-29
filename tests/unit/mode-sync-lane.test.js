/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import { bootFixture } from "./helpers/mode-harness.js";

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
  // The lane brings its edit chunk with it, before any frame: a view boot that starts
  // the live lane has the save code an edit boot would, and its first frame is not
  // what fetches it.
  expect(await until(() => editChunkLoads === 1)).toBe(true);
  expect(editChunkLoads).toBe(1);

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

// ---------------------------------------------------------------------------
// The controller's half, on a declared document: the loader handle a view boot
// leaves behind, the saved lane it already follows, and the transaction that takes
// that one lane over instead of opening a second stream.
// ---------------------------------------------------------------------------

const SYNC_PAGE = "document-sync.html";

const doc = (word) =>
  `<!DOCTYPE html><html><head><title>Sync</title></head><body><main data-id="main"><h1 data-id="title">Sync</h1><p data-id="p1">${word}</p></main></body></html>`;

const shown = () => document.querySelector('[data-id="p1"]')?.textContent ?? null;

// The stream a frame arrives on: the saved lane the reader opened, or the live lane the
// entry opened in its place. One frame per call, in the order the host sends them.
const deliver = (source, html, seq, etag) => source.onmessage({ data: JSON.stringify({ html, seq, etag, sender: "peer" }) });

// Every EventSource the cycles open, with how many stand open at once. A switch that
// opened a second stream beside the one it already had would show up here as a peak.
let opened = [];
let standing = 0;
let peak = 0;

class CountedEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    opened.push(this);
    standing++;
    peak = Math.max(peak, standing);
  }
  close() {
    if (!this.closed) standing--;
    this.closed = true;
    this.readyState = 2;
  }
}

// A view boot of the declared fixture: generic sync follows the saved lane, and the host
// answers its first frame. `booted` is the stream that boot opened, which the entry takes
// over; the cycle's own streams are counted from here on.
async function syncPage() {
  const boot = await bootFixture(SYNC_PAGE, { mode: "view", settle: 30 });
  const sync = (await import("../../src/sync/live-sync.js")).liveSync;
  const booted = sync.sse?._source ?? null;
  opened = [];
  standing = 0;
  peak = 0;
  if (booted && booted.readyState !== 2) {
    // The boot's own stream counts too: a switch that opened a second one beside it would
    // peak at two. Its class is the harness's, so its close is counted here by hand.
    standing = 1;
    peak = 1;
    const close = booted.close.bind(booted);
    booted.close = () => {
      if (booted.readyState !== 2) standing--;
      booted.closed = true;
      return close();
    };
  }
  globalThis.EventSource = window.EventSource = CountedEventSource;
  return { boot, sync, booted };
}

const openNow = (booted) => [booted, ...opened].filter((source) => source && source.readyState !== 2);

async function firstFile(sync, booted, { word = "disk1", seq = 5, etag = "E1" } = {}) {
  const bytes = doc(word);
  deliver(booted, bytes, seq, etag);
  expect(await until(() => sync._represented.bytes !== null)).toBe(true);
  expect(shown()).toBe(word);
  return { bytes, etag, seq };
}

test("a declared sync document switches 20 times with one stream open at any moment", async () => {
  const { boot, sync, booted } = await syncPage();
  try {
    await firstFile(sync, booted);

    for (let cycle = 0; cycle < 20; cycle++) {
      const entered = await window.clay.setMode("edit");
      expect({ cycle, entered }).toEqual({ cycle, entered: { ok: true, mode: "edit", changed: true } });
      expect({ cycle, lane: sync.lane }).toEqual({ cycle, lane: "live" });
      expect(await until(() => openNow(booted).length === 1)).toBe(true);
      expect({ cycle, open: openNow(booted).length }).toEqual({ cycle, open: 1 });
      expect(openNow(booted)[0].url).toContain("lane=live");

      const left = await window.clay.setMode("view");
      expect({ cycle, left }).toEqual({ cycle, left: { ok: true, mode: "view", changed: true } });
      expect({ cycle, lane: sync.lane }).toEqual({ cycle, lane: "saved" });
      expect(await until(() => openNow(booted).length === 1)).toBe(true);
      expect({ cycle, open: openNow(booted).length }).toEqual({ cycle, open: 1 });
      expect(openNow(booted)[0].url).toContain("lane=saved");
    }

    // Two streams were never open at once, across every cycle.
    expect(peak).toBeLessThanOrEqual(1);
  } finally {
    boot.stop();
  }
});

test("an immediate re-entry after an exit commits on the receipt the exit handed back, with no new frame", async () => {
  const { boot, sync, booted } = await syncPage();
  try {
    const file = await firstFile(sync, booted);
    await window.clay.setMode("edit");
    await window.clay.setMode("view");

    // The exit starts the saved lane from the file the session was built from, so it has
    // a receipt before the host says anything.
    expect(sync._represented).toEqual(file);

    const entered = await window.clay.setMode("edit");
    expect(entered).toEqual({ ok: true, mode: "edit", changed: true });
    expect(sync.lane).toBe("live");
    expect(shown()).toBe("disk1");
  } finally {
    boot.stop();
  }
});

test("a frame that arrives while the entry imports is reconciled before the baseline", async () => {
  const { boot, sync, booted } = await syncPage();
  const logic = await import("../../src/loader-logic.js");
  const save = await import("../../src/core/save.js");
  const thunk = logic.MODULES["core/save.js"];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await firstFile(sync, booted);
    // One edit-core import is held, so the entry is inside importPlan when the host sends
    // its next file: the reader holds it, and the session is built from it.
    logic.MODULES["core/save.js"] = (...args) => gate.then(() => thunk(...args));

    const entry = window.clay.setMode("edit");
    expect(await until(() => sync._handoffHeld)).toBe(true);
    deliver(booted, doc("disk2"), 6, "E2");
    release();

    expect(await entry).toEqual({ ok: true, mode: "edit", changed: true });
    expect(shown()).toBe("disk2");
    expect(save.getLastSavedContents()).toContain("disk2");
  } finally {
    logic.MODULES["core/save.js"] = thunk;
    release();
    boot.stop();
  }
});

test("a file newer than the represented one, applied after reconcile, refuses stale-document and leaves the saved lane running", async () => {
  const { boot, sync, booted } = await syncPage();
  try {
    await firstFile(sync, booted);

    // A participant prepared after the reader reconciled asks the lane for one more file:
    // it applies, and the session was built from the older one.
    window.clay.modeLifecycle.register({
      id: "test:newer-file",
      order: 900,
      async prepare() {
        deliver(booted, doc("disk9"), 9, "E9");
        await sync._runPending();
        return null;
      },
    });

    const refused = await window.clay.setMode("edit");
    expect(refused).toMatchObject({ ok: false, mode: "view", code: "stale-document" });

    // The article went back to the reader with the file it now holds, and the lane it
    // never stopped still delivers.
    expect(sync.lane).toBe("saved");
    expect(shown()).toBe("disk9");
    expect(openNow(booted)).toHaveLength(1);
    deliver(sync.sse._source, doc("later"), 10, "E10");
    expect(await until(() => shown() === "later")).toBe(true);
    expect(shown()).toBe("later");
  } finally {
    boot.stop();
  }
});

test("the first frame after an exit leaves the page as the session left it", async () => {
  const { boot, sync, booted } = await syncPage();
  try {
    const file = await firstFile(sync, booted);
    await window.clay.setMode("edit");
    await window.clay.setMode("view");
    expect(shown()).toBe("disk1");
    // The lane this exit started holds the file the session left, so the host's re-send
    // is its own bytes and nothing has to be applied for it.
    expect(sync._represented).toEqual(file);

    // The host re-sends that file: the lane moves its stamp and paints
    // nothing, and the page is not dirty afterwards.
    deliver(sync.sse._source, file.bytes, 8, "E8");
    await sleep(50);
    expect(shown()).toBe("disk1");
    expect(window.clay.hasUnsavedChanges()).toBe(false);
  } finally {
    boot.stop();
  }
});
