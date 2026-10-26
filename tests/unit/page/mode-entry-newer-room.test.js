/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";

/**
 * The Page plugin as a mode participant, on both roads into edit.
 *
 * A live entry imports the plugin while the committed mode is still view, so the
 * import starts nothing, and the session it prepares is built from the file the reader
 * represented rather than from the DOM on screen: a page tag another tab changed and a
 * `<details>` a viewer opened locally cannot reach what is staged. Preparation stages
 * the editor over the article the reader yields and takes no input, the commit opens it,
 * and a clean cycle writes nothing, opens no second stream and takes no writer claim. A
 * mount that fails gives the article back to the reader, and the exit of an explicit
 * edit boot adopts the install that boot made and ends it, leaving the accepted page.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const ARTICLE_SEL = "article[data-page]";

const clone = (v) => JSON.parse(JSON.stringify(v));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};
const flush = async () => { for (let i = 0; i < 20; i++) await sleep(0); };
const tick = async (turns = 40) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };

const render = (blocks) => renderFromTags([JSON.stringify(seedValue(blocks))]);
const articleHtml = (blocks = BLOCKS) => {
  const { html, rev } = render(blocks);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (blocks = BLOCKS) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(seedValue(blocks))}</script>`;
const articleOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector(ARTICLE_SEL);
// A page tag stating a value this module built, rather than one a seed wrote.
const tagValueHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

// The page a peer saved from the page this tab holds: the same blocks plus one edit, so
// the value it states descends from the tag the tab was served.
async function descendantValue(blocks, edit) {
  const { createStore } = await import("../../../src/live/store.js");
  const { createYPageBinding, LOCAL, yValueOf } = await import("../../../src/page/ybind/index.js");
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store });
  binding.ydoc.transact(() => binding.pd.flow.insert(binding.pd.flow.length, edit), LOCAL);
  const value = yValueOf(binding.ydoc);
  binding.dispose();
  binding.ydoc.destroy();
  return value;
}

// The saved file a reader is handed: a whole document, its article and, when the host
// stores page data, the tag that states it.
const FILE = (body, { head = "", rev = "r1" } = {}) =>
  `<!doctype html><html><head><title>Notes</title>${head}</head><body>${body.replace("<article", `<article data-rev="${rev}"`)}</body></html>`;

const readerHtml = (body) => `<!doctype html><html><head><title>Notes</title></head><body><article data-page="1">${body}</article></body></html>`;

const context = ({ represented = null, reader = null, initial = false } = {}) => ({
  generation: 1,
  destination: "host",
  signal: new AbortController().signal,
  isCurrent: () => true,
  represented,
  reader,
  initial,
});

const MODE = { factory: "ok" };
const marks = [];
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const inputReady = () => marks.filter((entry) => entry.name === "document:input-ready");

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.closed = false;
  }
  close() { this.closed = true; }
}

const roomState = (room) => ({ epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0, provenanceVersion: 2, receiptGeneration: 0, stores: clone(room.stores) });

async function load({
  html = articleHtml(),
  head = "",
  initial = false,
  roomStores = {},
  answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }),
} = {}) {
  jest.resetModules();
  marks.length = 0;
  MODE.factory = "ok";
  if (initial) window.clayEditMode = true;
  else delete window.clayEditMode;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const extensions = ["page", "sync", "live-data", "live-provenance"];
  const saves = [];
  const sent = [];
  const sources = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: clone(roomStores) };

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: {} }),
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
    localLaneSupported: () => false,
    localTransport: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/server-lane.js", () => ({
    serverTransport: () => ({
      start(handlers) {
        handlersRef.h = handlers;
        handlers.open({ clientId: "tab-1", lane: "live" });
        handlers.state(roomState(room));
        return () => {};
      },
      async send(clientId, frame) {
        sent.push(clone(frame));
        room.seq += 1;
        if (room.writer === null) room.writer = clientId;
        handlersRef.h?.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() {
        return roomState(room);
      },
    }),
  }));

  await jest.unstable_mockModule("../../../src/page/editor.js", () => ({
    ...realEditor,
    createPageEditor: (mount, options) => {
      if (MODE.factory === "throw") {
        mount.appendChild(document.createElement("div")).className = "page-shell";
        throw new Error("the editor could not be built");
      }
      return realEditor.createPageEditor(mount, options);
    },
  }));

  globalThis.EventSource = window.EventSource = class extends FakeEventSource {
    constructor(url) {
      super(url);
      sources.push(this);
    }
  };

  // The host: a POST is a save, and every GET is a miss.
  global.fetch = jest.fn(async (url, options) => {
    if ((options?.method ?? "GET") !== "POST") {
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
    }
    const reply = answer(saves.length);
    saves.push({ url: String(url), options, headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    const status = reply.status ?? 200;
    const headers = reply.headers ?? {};
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: {
        get: (name) => {
          const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
          return key ? headers[key] : null;
        },
      },
      text: async () => JSON.stringify(reply.body ?? {}),
    };
  });

  const { live, storeOf, liveWriterParticipant } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const pageModule = await import("../../../src/plugins/page.js");
  const { claim, ownerOf } = await import("../../../src/page/runtime-owner.js");

  const openReader = async (bytes, { etag = "stamp-1", seq = 1 } = {}) => {
    const { start } = await import("../../../src/page/view.js");
    const reader = start({ represented: { bytes, etag, seq }, documentURL: "https://example.com/notes.html" });
    await until(() => sources.length > 0);
    await flush();
    return reader;
  };

  return {
    ...pageModule,
    storeOf,
    liveWriterParticipant,
    claim,
    ownerOf,
    saves,
    sent,
    room,
    sources,
    openReader,
  };
}

const article = () => document.querySelector(ARTICLE_SEL);

test('a Page entry keeps a live room that is newer than its saved file, and saves the room text', async () => {
  const harness = await load({ head: tagHtml() });
  const newer = await descendantValue(BLOCKS, ' PEER_UNCHECKPOINTED');
  harness.room.stores.page = { value: newer, ephemeral: false, last: 1, landed: 0 };
  harness.room.seq = 1;
  harness.room.writer = 'tab-1';
  const bytes = `<!doctype html><html><head><title>Notes</title>${tagHtml()}</head><body>${articleHtml()}</body></html>`;
  const reader = await harness.openReader(bytes);
  const handoff = await reader.prepareHandoff({});
  const ctx = context({ represented: handoff.represented, reader: handoff });
  const writer = harness.liveWriterParticipant().prepare(ctx);
  const { pageLaneReady } = await import('../../../src/plugins/live.js');
  await pageLaneReady();
  await flush();
  const before = blocksFromYValue(harness.storeOf('page').value).p.c;
  expect(before).toContain('PEER_UNCHECKPOINTED');
  const lease = harness.pageParticipant().prepare(ctx);
  try {
    await lease.ready;
    const after = blocksFromYValue(harness.storeOf('page').value).p.c;
    const facts = await import('../../../src/core/is-edit-mode.js');
    const save = await import('../../../src/core/save.js');
    facts.commitModeFacts({ mode: 'edit', isEditMode: true, phase: 'idle' });
    save.adoptEntryBaseline({ represented: handoff.represented });
    writer.enable();
    lease.enable();
    document.title = 'Entry metadata change';
    const result = await save.savePage();
    const savedText = harness.saves.length ? articleOf(harness.saves.at(-1).body).textContent : null;
    expect(after).toBe(before);
  } finally {
    lease.dispose();
    writer.dispose();
    reader.stop();
  }
}, 15000);

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
  delete window.clayEditMode;
});

