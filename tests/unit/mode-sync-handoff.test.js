/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The saved reader's half of a live switch.
 *
 * A reader owns the saved lane: its transport's queue (a Document that opens its own
 * stream) or the frames generic sync applies to the page. Entering edit must not stop
 * that lane and open another: the switch is handed the same queue, with its pending
 * files and the repair it owes still in it, and the file it will be built from. So:
 *
 *   - preparation waits for an apply already in flight, and shows nothing while it
 *     holds the queue: two saved files arriving while the edit chunks load collapse
 *     to the newest one, which `reconcile` applies;
 *   - the receipt moves only onto bytes the article actually took. A file repeating
 *     the bytes on screen moves the stamp alone and repaints nothing, and the reader's
 *     receipt keeps that stamp instead of drifting from the transport's;
 *   - a live-lane frame is a preview of keystrokes nobody saved, whatever tag a sync
 *     implementation put on it, so a fed reader never paints one;
 *   - a refused handoff resumes the same owner with nothing lost, and a repair asked
 *     for while the switch held the queue still runs;
 *   - `commit` retires the lane only onto a receipt, so 100 entries and exits leave
 *     one owner, one stream and the same number of listeners.
 */

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
let fetchCalls = [];
let metaAnswer = { spec: 1, extensions: ["sync"] };
let docAnswer = () => null;

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

const response = (status, text) => ({
  ok: status < 400,
  status,
  statusText: String(status),
  headers: { get: () => null },
  text: async () => text,
});

const served = (stamp, body) =>
  `<!DOCTYPE html><html${stamp ? ` documentetag="${stamp}"` : ""}><head><title>Reader</title></head><body>${body}</body></html>`;

const FILE = (inner, { rev = "r1", title = "Reader" } = {}) =>
  `<!doctype html><html><head><title>${title}</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}" data-id="a">${inner}</article></body></html>`;

const ARTICLE = (word) => `<article data-page="1"><p data-id="a">${word}</p></article>`;

const text = () => document.querySelector('article [data-id="a"]')?.textContent ?? null;

const cursorEvent = (data) => new MessageEvent("cursor", { data: JSON.stringify(data) });
const frame = (data) => ({ data: JSON.stringify(data) });

const load = (html) => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  return document.querySelector("article[data-page]");
};

let startReader;
let claim;
let ownerOf;
let resetHostMeta;
let LiveSync;
let liveSync;
let pageView;
let facts;
let lifecycle;

beforeAll(async () => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = window.fetch = jest.fn((url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes("/_/meta")) return Promise.resolve(response(200, JSON.stringify(metaAnswer)));
    const answer = docAnswer(target);
    return Promise.resolve(answer ?? response(404, ""));
  });
  ({ start: startReader } = await import("../../src/page/view.js"));
  ({ claim, ownerOf } = await import("../../src/page/runtime-owner.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
  ({ LiveSync, liveSync } = await import("../../src/sync/live-sync.js"));
  liveSync.stop();
  pageView = await import("../../src/plugins/page-view.js");
  facts = await import("../../src/core/is-edit-mode.js");
  lifecycle = await import("../../src/core/mode-lifecycle.js");
});

beforeEach(() => {
  sources = [];
  fetchCalls = [];
  metaAnswer = { spec: 1, extensions: ["sync"] };
  docAnswer = () => null;
  resetHostMeta();
});

afterEach(() => {
  liveSync.stop();
  pageView?.stop();
  // The roster outlives a session by design: a participant this file queued for one test
  // is taken back here, so the next session starts from the same roster.
  for (const id of ["test:page", "test:page-fails"]) lifecycle?.forgetParticipant(id);
});

// The reader's own transport, started on an accepted file, and the host's end of it,
// so a test can deliver frames the way the host does.
async function openReader({ bytes, etag = "E1", seq = 1, documentURL = "/index.html" } = {}) {
  const file = bytes ?? FILE('<p data-id="a">A</p>');
  load(served(null, ARTICLE("served")));
  const reader = startReader({ represented: { bytes: file, etag, seq }, documentURL });
  await until(() => sources.length > 0);
  await flush();
  return { reader, source: sources.at(-1), bytes: file };
}

function statuses() {
  const seen = [];
  document.addEventListener("clay:reader-status", (event) => seen.push(event.detail));
  return seen;
}

const applied = (seen) => seen.filter((status) => status.state === "applied");

test("a handoff takes the transport's queue without stopping it, and commit retires it onto the receipt", async () => {
  const { reader, source, bytes } = await openReader();
  const seen = statuses();
  expect(text()).toBe("A");

  const handoff = await reader.prepareHandoff({});
  expect(handoff.represented).toEqual({ bytes, etag: "E1", seq: 1 });

  // A file arriving while the switch holds the queue is shown to nobody yet.
  const next = FILE('<p data-id="a">B</p>');
  source.onmessage(frame({ seq: 2, html: next, etag: "E2" }));
  expect(text()).toBe("A");
  expect(applied(seen)).toHaveLength(0);
  expect(source.closed).toBe(false);
  expect(ownerOf(document.querySelector("article[data-page]"))).toBe("reader");

  await handoff.reconcile();
  expect(text()).toBe("B");
  expect(handoff.represented).toEqual({ bytes: next, etag: "E2", seq: 2 });
  expect(applied(seen)).toHaveLength(1);

  expect(handoff.commit()).toBe(true);
  expect(ownerOf(document.querySelector("article[data-page]"))).toBe(null);
  expect(source.closed).toBe(true);
  expect(reader.stop()).toEqual({ bytes: next, etag: "E2", seq: 2 });
});

test("two saved files arriving while the edit chunks load collapse to the newest one", async () => {
  const { reader, source } = await openReader();
  const seen = statuses();
  const handoff = await reader.prepareHandoff({});

  const b = FILE('<p data-id="a">B</p>');
  const c = FILE('<p data-id="a">C</p>');
  source.onmessage(frame({ seq: 2, html: b, etag: "E2" }));
  source.onmessage(frame({ seq: 3, html: c, etag: "E3" }));
  // A replayed older file after the newest one is not a version anybody holds.
  source.onmessage(frame({ seq: 1, html: FILE('<p data-id="a">old</p>'), etag: "E0" }));
  expect(text()).toBe("A");

  await handoff.reconcile();
  expect(text()).toBe("C");
  expect(handoff.represented).toEqual({ bytes: c, etag: "E3", seq: 3 });
  expect(applied(seen)).toHaveLength(1);

  handoff.commit();
});

test("a file with the bytes on screen and a new stamp moves the receipt and repaints nothing", async () => {
  const { reader, source, bytes } = await openReader();
  const seen = statuses();

  source.onmessage(frame({ seq: 2, html: bytes, etag: "E2" }));
  expect(applied(seen)).toHaveLength(0);
  expect(reader.represented).toEqual({ bytes, etag: "E2", seq: 2 });

  const handoff = await reader.prepareHandoff({});
  source.onmessage(frame({ seq: 3, html: bytes, etag: "E3" }));
  await handoff.reconcile();
  expect(handoff.represented).toEqual({ bytes, etag: "E3", seq: 3 });
  expect(applied(seen)).toHaveLength(0);
  expect(reader.stop()).toEqual({ bytes, etag: "E3", seq: 3 });
});

test("a live-lane preview is not a saved file, and a fed reader keeps the saved one", async () => {
  liveSync.start("page.html");
  await liveSync._ready;
  load(served(null, ARTICLE("served")));
  const queued = [];
  liveSync._requestFrame = (cb) => {
    queued.push(cb);
    return queued.length;
  };
  liveSync._cancelFrame = () => {};
  const reader = startReader({ feed: document, documentURL: window.location.href });
  const source = sources.at(-1);

  // A preview of keystrokes nobody saved changes no file, so it reaches no receipt.
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", lane: "live", html: FILE('<p data-id="a">typing</p>'), seq: 2, etag: "E2" },
  }));
  expect(text()).toBe("served");
  expect(reader.represented).toEqual({ bytes: null, etag: null, seq: null });

  // The saved lane carries the file itself, and the engine's receipt names it.
  const saved = served("E7", ARTICLE("saved"));
  source.onmessage(frame({ seq: 3, html: saved, etag: "E7" }));
  while (queued.length) queued.shift()();
  expect(await until(() => text() === "saved")).toBe(true);
  expect(liveSync._represented).toEqual({ bytes: saved, etag: "E7", seq: 3 });

  // The same file with a new stamp: the receipt moves and nothing is morphed.
  source.onmessage(frame({ seq: 4, html: saved, etag: "E7b" }));
  expect(liveSync._represented).toEqual({ bytes: saved, etag: "E7b", seq: 4 });
  expect(queued).toHaveLength(0);
  expect(text()).toBe("saved");

  // Held while a switch prepares: the preview is dropped and the file is waited for.
  const handoff = await reader.prepareHandoff({});
  expect(handoff.represented).toEqual({ bytes: saved, etag: "E7b", seq: 4 });
  const newer = served("E8", ARTICLE("newer"));
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", lane: "live", html: FILE('<p data-id="a">typing</p>'), seq: 5 },
  }));
  source.onmessage(frame({ seq: 6, html: newer, etag: "E8" }));
  expect(text()).toBe("saved");
  await handoff.reconcile();
  expect(text()).toBe("newer");
  expect(handoff.represented).toEqual({ bytes: newer, etag: "E8", seq: 6 });

  expect(handoff.commit()).toBe(true);
  expect(ownerOf(document.querySelector("article[data-page]"))).toBe(null);
});

test("an apply in flight is the file the switch is handed", async () => {
  liveSync.start("page.html");
  await liveSync._ready;
  load(served(null, '<p data-id="a">A</p>'));
  const queued = [];
  liveSync._requestFrame = (cb) => {
    queued.push(cb);
    return queued.length;
  };
  liveSync._cancelFrame = () => {};

  const source = sources.at(-1);
  const one = served("E1", ARTICLE("B") + '<script src="/held.js"></script>');
  source.onmessage(frame({ seq: 2, html: one, etag: "E1" }));
  expect(queued).toHaveLength(1);
  queued.shift()();
  await flush();

  let prepared = null;
  liveSync.prepareHandoff({}).then((handoff) => { prepared = handoff; });
  await sleep(20);
  expect(prepared).toBe(null);

  document.querySelector('script[src="/held.js"]').dispatchEvent(new Event("load"));
  await until(() => prepared !== null);
  expect(prepared.represented).toEqual({ bytes: one, etag: "E1", seq: 2 });
  expect(text()).toBe("B");

  // Two files while the switch holds the lane: the slot keeps the newest.
  const two = served("E2", ARTICLE("C"));
  const three = served("E3", ARTICLE("D"));
  source.onmessage(frame({ seq: 3, html: two, etag: "E2" }));
  source.onmessage(frame({ seq: 4, html: three, etag: "E3" }));
  expect(text()).toBe("B");

  await prepared.reconcile();
  expect(text()).toBe("D");
  expect(prepared.represented).toEqual({ bytes: three, etag: "E3", seq: 4 });
  expect(prepared.commit()).toBe(true);
});

test("a refused reconcile leaves the reader where it was, and resume gives it the queue back", async () => {
  const { reader, source, bytes } = await openReader();
  const seen = statuses();
  const handoff = await reader.prepareHandoff({});

  // A file nobody can read as a page: no article in it.
  source.onmessage(frame({ seq: 2, html: "<html><body><p>no article</p></body></html>", etag: "E2" }));
  await expect(handoff.reconcile()).rejects.toMatchObject({ code: "load-failed" });
  expect(text()).toBe("A");
  expect(reader.represented).toEqual({ bytes, etag: "E1", seq: 1 });
  expect(applied(seen)).toHaveLength(0);

  handoff.resume();
  const next = FILE('<p data-id="a">Z</p>');
  source.onmessage(frame({ seq: 3, html: next, etag: "E3" }));
  expect(text()).toBe("Z");
  expect(reader.represented).toEqual({ bytes: next, etag: "E3", seq: 3 });
  expect(applied(seen)).toHaveLength(1);
  reader.stop();
});

test("a switch cancelled while an apply is on the wire loses neither the frame nor the lane", async () => {
  liveSync.start("page.html");
  await liveSync._ready;
  load(served(null, '<p data-id="a">A</p>'));
  const queued = [];
  liveSync._requestFrame = (cb) => {
    queued.push(cb);
    return queued.length;
  };
  liveSync._cancelFrame = () => {};

  const source = sources.at(-1);
  const one = served("E1", ARTICLE("B") + '<script src="/slow.js"></script>');
  source.onmessage(frame({ seq: 2, html: one, etag: "E1" }));
  queued.shift()();
  await flush();

  const controller = new AbortController();
  const preparing = liveSync.prepareHandoff({ signal: controller.signal });
  controller.abort();
  await expect(preparing).rejects.toMatchObject({ code: "aborted" });

  document.querySelector('script[src="/slow.js"]').dispatchEvent(new Event("load"));
  await flush();
  expect(text()).toBe("B");

  // The lane was never held: the next file applies without another prepare.
  const two = served("E2", ARTICLE("C"));
  source.onmessage(frame({ seq: 3, html: two, etag: "E2" }));
  await until(() => queued.length > 0 || text() === "C");
  while (queued.length) queued.shift()();
  await until(() => text() === "C");
  expect(text()).toBe("C");
});

test("a repair owed while the switch holds the queue still runs", async () => {
  const { reader, source } = await openReader();
  const handoff = await reader.prepareHandoff({});

  docAnswer = () => response(200, served("E9", ARTICLE("repaired")));
  source.dispatchEvent(cursorEvent({ seq: 9, resync: true }));
  await flush();

  expect(fetchCalls.filter((url) => url.endsWith("/index.html"))).toHaveLength(1);
  expect(text()).toBe("A");

  handoff.resume();
  await until(() => text() === "repaired");
  expect(text()).toBe("repaired");
  expect(reader.represented).toEqual({ bytes: served("E9", ARTICLE("repaired")), etag: "E9", seq: 9 });
  reader.stop();
});

test("no receipt, no handoff: the reader keeps the article and its claim", async () => {
  docAnswer = () => response(500, "");
  load(served(null, ARTICLE("served")));
  const reader = startReader({ documentURL: "/index.html" });
  await flush();
  const article = document.querySelector("article[data-page]");
  const handoff = await reader.prepareHandoff({});
  expect(handoff.commit()).toBe(false);
  expect(ownerOf(article)).toBe("reader");
  // A refused commit retires nothing: the transport this reader opened still runs.
  expect(sources.at(-1).closed).toBe(false);
  expect(reader.stop()).toEqual({ bytes: null, etag: null, seq: null });
});

test("one owner, one stream and no extra listeners across 100 entries and exits", async () => {
  const bytes = FILE('<p data-id="a">A</p>');
  load(served(null, ARTICLE("served")));
  const article = document.querySelector("article[data-page]");
  const add = jest.spyOn(document, "addEventListener");
  const remove = jest.spyOn(document, "removeEventListener");

  for (let cycle = 0; cycle < 100; cycle++) {
    const reader = startReader({ represented: { bytes, etag: `E${cycle}`, seq: cycle }, documentURL: "/index.html" });
    expect(ownerOf(article)).toBe("reader");
    expect(await until(() => sources.length === cycle + 1)).toBe(true);
    const handoff = await reader.prepareHandoff({});
    expect(await handoff.commit()).toBe(true);
    expect(sources.at(-1).closed).toBe(true);
    expect(ownerOf(article)).toBe(null);
    const release = claim(article, "editor");
    expect(ownerOf(article)).toBe("editor");
    release();
  }

  const added = add.mock.calls.filter(([type]) => type === "toggle");
  const removed = remove.mock.calls.filter(([type]) => type === "toggle");
  add.mockRestore();
  remove.mockRestore();

  expect(sources).toHaveLength(100);
  expect(sources.filter((source) => !source.closed)).toHaveLength(0);
  expect(added).toHaveLength(100);
  // Exactly the subscription that was made: same target, same handler, same capture.
  expect(removed).toHaveLength(100);
  expect(removed.every(([, handler, options], at) => handler === added[at][1] && options === true)).toBe(true);
  expect(text()).toBe("A");
});

// A tool whose mount leaves a mark on its own root, so a test can see a mount come
// back after it was disposed.
const toolArtifact = {
  title: "Live",
  html: '<p data-live-tool="html">live</p>',
  css: "",
  javascript: "function mount(tool) { tool.root.setAttribute('data-live-tool', 'on'); return () => tool.root.removeAttribute('data-live-tool'); }",
  fallbackHtml: '<p data-live-tool="fallback">fallback</p>',
  summary: "Live",
};

const TOOL = `<section data-type="tool" data-id="tool-1" data-rev="r1"><script type="application/json" data-tool>${JSON.stringify({ artifact: toolArtifact, rev: "r1", state: {} })}</script>${toolArtifact.fallbackHtml}</section>`;

test("a yielded reader gives the claim up and keeps the files the lane delivers", async () => {
  const { reader, source, bytes } = await openReader();
  const article = document.querySelector("article[data-page]");
  const handoff = await reader.prepareHandoff({});

  expect(handoff.yieldArticle()).toBe(true);
  expect(ownerOf(article)).toBe(null);
  // Only because the claim is gone can the switch take the article it mounts over.
  const release = claim(article, "editor");
  expect(ownerOf(article)).toBe("editor");
  release();

  // A file arriving while the switch is up is kept, not painted, and no receipt
  // moves onto bytes the article never took.
  const newer = FILE('<p data-id="a">B</p>');
  source.onmessage(frame({ seq: 2, html: newer, etag: "E2" }));
  expect(text()).toBe("A");
  expect(reader.represented).toEqual({ bytes, etag: "E1", seq: 1 });
  expect(handoff.yieldArticle()).toBe(false);

  reader.stop();
});

test("reclaim repaints the receipt, re-claims, and resume applies the file held meanwhile", async () => {
  const bytes = FILE(`${TOOL}<details data-id="d1"><summary>More</summary><p data-id="d2">inside</p></details><p data-id="a">A</p>`);
  load(served(null, ARTICLE("served")));
  const reader = startReader({ represented: { bytes, etag: "E1", seq: 1 }, documentURL: "/index.html" });
  const article = document.querySelector("article[data-page]");
  expect(await until(() => sources.length > 0)).toBe(true);
  expect(await until(() => article.querySelector('[data-live-tool="on"]'))).toBe(true);
  const source = sources.at(-1);

  // The reader opens a toggle the file says is closed: that state is the reader's,
  // not the file's, and it survives what the switch does to the article.
  const details = article.querySelector('details[data-id="d1"]');
  details.open = true;
  details.dispatchEvent(new Event("toggle"));

  const handoff = await reader.prepareHandoff({});
  expect(handoff.yieldArticle()).toBe(true);
  expect(article.querySelector('[data-live-tool="on"]')).toBe(null);
  expect(ownerOf(article)).toBe(null);

  // The switch's editor replaces what it finds, and a newer file arrives meanwhile.
  article.innerHTML = '<p data-id="a">editor</p>';
  const newer = FILE('<p data-id="a">Z</p>');
  source.onmessage(frame({ seq: 3, html: newer, etag: "E3" }));
  expect(text()).toBe("editor");

  // Refused: the article comes back exactly as the receipt the reader holds says.
  expect(handoff.reclaimArticle()).toBe(true);
  expect(text()).toBe("A");
  expect(article.querySelector('details[data-id="d1"]').open).toBe(true);
  expect(await until(() => article.querySelector('[data-live-tool="on"]'))).toBe(true);
  expect(ownerOf(article)).toBe("reader");
  expect(() => claim(article, "editor")).toThrow(/already has a reader runtime/);
  expect(reader.represented).toEqual({ bytes, etag: "E1", seq: 1 });
  expect(handoff.reclaimArticle()).toBe(false);

  handoff.resume();
  expect(text()).toBe("Z");
  expect(reader.represented).toEqual({ bytes: newer, etag: "E3", seq: 3 });
  reader.stop();
});

test("a commit after a yield paints nothing and releases no claim it does not hold", async () => {
  const { reader, source, bytes } = await openReader();
  const article = document.querySelector("article[data-page]");
  const handoff = await reader.prepareHandoff({});

  handoff.yieldArticle();
  const release = claim(article, "editor");
  article.querySelector('[data-id="a"]').textContent = "editor wrote this";

  const newer = FILE('<p data-id="a">B</p>');
  source.onmessage(frame({ seq: 2, html: newer, etag: "E2" }));

  expect(handoff.commit()).toBe(true);
  // The switch reconciled and refused the file itself: nothing staged is painted
  // over the article it owns, and retiring the reader leaves that claim alone.
  expect(text()).toBe("editor wrote this");
  expect(ownerOf(article)).toBe("editor");
  expect(sources.at(-1).closed).toBe(true);
  expect(reader.stop()).toEqual({ bytes, etag: "E1", seq: 1 });
  expect(ownerOf(article)).toBe("editor");
  release();
});

// ---------------------------------------------------------------------------
// The controller's half on a Document: the page-view reader owns the article, and the
// Page gives that claim up for the session and takes it back when the session is refused.
// ---------------------------------------------------------------------------

// The loader handle a view boot of a Document leaves: the reader is loaded and running,
// nothing of the edit plan is, and the only thing an exit has to import is already here.
const viewHandle = () => ({
  loaded: { "plugins/page-view.js": pageView },
  edit: { core: [], plugins: [], late: [] },
  view: { plugins: ["plugins/page-view.js"], late: [] },
  modules: {},
  attach() {},
  attachEditCore() {},
  loadEditHints: null,
  late: Promise.resolve(),
  announce() {},
});

// A view boot's reader, started from the file it represents: exactly what a reader that
// has already read its lane hands a switch.
async function documentPage() {
  facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle", canEdit: true, reason: null });
  load(served(null, ARTICLE("served")));
  const bytes = FILE('\u003cp data-id="a"\u003eA\u003c/p\u003e');
  pageView.restart({ represented: { bytes, etag: "E1", seq: 1 } });
  const receipt = await pageView.acquired;
  return { bytes, receipt };
}

test("an entry gives the Page the reader\u0027s file, and the reader\u0027s article goes with it", async () => {
  const { bytes, receipt } = await documentPage();
  const article = document.querySelector("article[data-page]");
  const seen = {};
  facts.registerModeParticipant({
    id: "test:page",
    order: 400,
    prepare(context) {
      seen.represented = context.represented;
      seen.reader = context.reader;
      seen.yielded = context.reader?.yieldArticle();
      return null;
    },
  });

  const result = await lifecycle.requestMode("edit", viewHandle());

  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  // The session is built from the file the reader represents, not from the served page.
  expect(seen.represented).toEqual(receipt);
  expect(seen.represented.bytes).toBe(bytes);
  expect(seen.reader).not.toBe(null);
  // The Page mounts only over an article nobody else claims.
  expect(seen.yielded).toBe(true);
  expect(ownerOf(article)).toBe(null);
});

test("a Page that throws after the yield leaves the reader holding the article again, and painting", async () => {
  await documentPage();
  const article = document.querySelector("article[data-page]");
  facts.registerModeParticipant({
    id: "test:page-fails",
    order: 400,
    prepare(context) {
      context.reader?.yieldArticle();
      article.querySelector('[data-id="a"]').textContent = "half-mounted editor";
      throw Object.assign(new Error("the editor could not mount"), { code: "blocked-mount" });
    },
  });

  const result = await lifecycle.requestMode("edit", viewHandle());

  expect(result).toMatchObject({ ok: false, mode: "view", code: "blocked-mount" });
  // The article is the reader\u0027s again, painted from the file it still represents, so the
  // editor an entry would mount cannot take it.
  expect(text()).toBe("A");
  expect(ownerOf(article)).toBe("reader");
  expect(() => claim(article, "editor")).toThrow(/already has a reader runtime/);
});

test("an exit starts the page-view reader from the accepted receipt and fetches nothing", async () => {
  const { bytes, receipt } = await documentPage();
  const article = document.querySelector("article[data-page]");
  facts.registerModeParticipant({
    id: "test:page",
    order: 400,
    prepare(context) {
      context.reader?.yieldArticle();
      return null;
    },
  });

  expect(await lifecycle.requestMode("edit", viewHandle())).toEqual({ ok: true, mode: "edit", changed: true });
  const before = fetchCalls.length;

  expect(await lifecycle.requestMode("view", viewHandle())).toEqual({ ok: true, mode: "view", changed: true });

  // The reader this exit starts paints the file the session left, so it asks the host for
  // nothing: no acquisition GET, and the article is the reader\u0027s again.
  expect(await pageView.acquired).toEqual(receipt);
  expect(text()).toBe("A");
  expect(sources.filter((source) => !source.closed)).toHaveLength(1);
  expect(ownerOf(article)).toBe("reader");
  expect(fetchCalls.length).toBe(before);
  expect(bytes).toBe(receipt.bytes);
});
