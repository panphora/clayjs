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

const roomState = (room) => ({ epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0, stores: clone(room.stores) });

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

  const extensions = ["page", "sync"];
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

  const { live, storeOf } = await import("../../../src/plugins/live.js");
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

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
  delete window.clayEditMode;
});

test("importing the plugin in view starts no editor, takes no claim and writes nothing", async () => {
  const { page, ownerOf, saves, sent } = await load();
  await flush();

  expect(page.ready).toBe(null);
  expect(page.view).toBe(null);
  expect(document.querySelector(".page-shell")).toBe(null);
  expect(ownerOf(article())).toBe(null);
  expect(saves).toHaveLength(0);
  expect(sent).toHaveLength(0);
});

test("preparation stages the represented page without input, and the commit opens it", async () => {
  const harness = await load();
  const bytes = FILE(articleHtml());
  const reader = await harness.openReader(bytes);
  const handoff = await reader.prepareHandoff({});
  expect(handoff.represented.bytes).toBe(bytes);

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;

    // Staged: the editor is mounted over the article the reader gave up, no input is
    // open and nothing has been written.
    expect(harness.page.view).toBeTruthy();
    expect(harness.page.view.editable).toBe(false);
    expect(harness.page.view.dom.closest(".page-shell").inert).toBe(true);
    expect(inputReady()).toHaveLength(0);
    expect(harness.ownerOf(article())).toBe("editor");
    expect(harness.saves).toHaveLength(0);
    expect(harness.storeOf("page").value).toEqual(seedPageFromArticle(articleOf(bytes)));

    lease.enable();
    expect(harness.page.view.editable).toBe(true);
    expect(harness.page.view.dom.closest(".page-shell").inert).toBe(false);
    expect(inputReady()).toHaveLength(1);
    expect(harness.page.status).toMatchObject({ phase: "ready" });
    expect(harness.saves).toHaveLength(0);
  } finally {
    lease.dispose();
  }
});

test("a clean prepare, commit and exit writes nothing, opens no stream and takes no writer claim", async () => {
  const harness = await load();
  const reader = await harness.openReader(FILE(articleHtml()));
  const handoff = await reader.prepareHandoff({});
  const streamsBefore = harness.sources.length;

  for (let cycle = 0; cycle < 2; cycle++) {
    const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
    await lease.ready;
    lease.enable();
    lease.quiesce();
    lease.resume();
    lease.quiesce();
    lease.dispose();
    await tick();
    expect(harness.page.view).toBe(null);
    expect(article().textContent).toContain("Hello");
  }

  expect(harness.saves).toHaveLength(0);
  expect(harness.sent).toHaveLength(0);
  expect(harness.room.writer).toBe(null);
  expect(harness.sources).toHaveLength(streamsBefore);
});

test("a real edit after a second preparation saves the page once", async () => {
  const harness = await load();
  const facts = await import("../../../src/core/is-edit-mode.js");
  const reader = await harness.openReader(FILE(articleHtml()));

  const first = await reader.prepareHandoff({});
  const one = harness.pageParticipant().prepare(context({ represented: first.represented, reader: first }));
  await one.ready;
  one.enable();
  one.dispose();
  await tick();
  expect(harness.saves).toHaveLength(0);

  const second = await reader.prepareHandoff({});
  const two = harness.pageParticipant().prepare(context({ represented: second.represented, reader: second }));
  try {
    await two.ready;
    // The controller's commit, which is what makes a save admissible: the mode facts
    // first, then the lease's own enable.
    facts.commitModeFacts({ mode: "edit", isEditMode: true });
    // The entry baseline is the represented file, so the page's own boot churn is not
    // read as an edit and a checkpoint is admissible.
    const { adoptEntryBaseline } = await import("../../../src/core/save.js");
    expect(adoptEntryBaseline({ represented: second.represented })).toEqual({ ok: true });
    two.enable();

    const view = harness.page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    const result = await harness.page.flush();
    expect(result?.ok).toBe(true);
    expect(await until(() => harness.saves.length > 0)).toBe(true);
    await tick(80);
    expect(harness.saves).toHaveLength(1);
    expect(blocksFromYValue(harness.storeOf("page").value).p.c).toBe("Hello there");
  } finally {
    two.dispose();
    facts.commitModeFacts({ mode: "view", isEditMode: false });
  }
});

test("a details the reader opened locally does not change the staged page", async () => {
  const TOGGLE = [
    { id: "d", t: "toggle", text: "More", open: false },
    { id: "p", t: "paragraph", text: "inside" },
  ];
  const bytes = FILE(articleHtml(TOGGLE));
  const harness = await load({ html: articleHtml([{ id: "p", t: "paragraph", text: "served" }]) });
  const reader = await harness.openReader(bytes);
  const handoff = await reader.prepareHandoff({});

  // The viewer opens the block on screen: that is their view of the file, not the file.
  const details = article().querySelector("details");
  expect(details).toBeTruthy();
  expect(details.hasAttribute("open")).toBe(false);
  details.open = true;
  await flush();
  expect(article().querySelector("details").hasAttribute("open")).toBe(true);

  const fromReceipt = seedPageFromArticle(articleOf(bytes));
  const fromDom = seedPageFromArticle(article());
  expect(fromDom).not.toEqual(fromReceipt);

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;
    expect(harness.storeOf("page").value).toEqual(fromReceipt);
  } finally {
    lease.dispose();
  }
});

test("a page tag another tab changed is replaced by the receipt's tag", async () => {
  // Another tab saved this page at a version of the format this tab cannot read. The
  // reader paints the file it represented onto the article and its tag, so the page a
  // session opens from the DOM is the one the reader holds.
  const served = '<script type="application/json" merge="page" clay="live">{"v":2,"y":{}}</script>';
  const harness = await load({ html: articleHtml(), head: served });
  const bytes = FILE(articleHtml(), { head: tagHtml(BLOCKS) });
  const reader = await harness.openReader(bytes);
  const handoff = await reader.prepareHandoff({});
  expect(document.querySelector(TAG_SEL).textContent).toBe(JSON.stringify(seedValue(BLOCKS)));

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    // The served tag is not a page this release reads, and reading it would refuse the
    // session before any editor: the file the reader holds is what the page is built
    // from, so preparation stages and the commit opens input.
    await lease.ready;
    expect(harness.page.view).toBeTruthy();
    expect(harness.page.view.editable).toBe(false);
    expect(harness.saves).toHaveLength(0);
    lease.enable();
    expect(inputReady()).toHaveLength(1);
    expect(harness.page.view.editable).toBe(true);
  } finally {
    lease.dispose();
  }
});

// The page another tab has since saved: the same two blocks, newer text.
const OTHER = [
  { id: "h", t: "heading", text: "Other V2" },
  { id: "p", t: "paragraph", text: "Newer V2" },
];

test("the first entry after another tab saved mounts that file and stages its page", async () => {
  // This tab loaded the page at one version; another tab saved over it while this one was
  // in view, and the reader is handed that newer file. The reader keeps the live tag at
  // that file, so the page the session opens is the newer one and the person's next save
  // extends it instead of printing the older version back over it.
  const harness = await load({ head: tagHtml() });
  const bytes = FILE(articleHtml(OTHER), { head: tagHtml(OTHER) });
  const reader = await harness.openReader(bytes, { etag: "stamp-2", seq: 2 });
  const handoff = await reader.prepareHandoff({});
  expect(document.querySelector(TAG_SEL).textContent).toBe(JSON.stringify(seedValue(OTHER)));

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;
    expect(harness.storeOf("page").value).toEqual(seedValue(OTHER));
    expect(article().textContent).toContain("Newer V2");
    expect(article().textContent).not.toContain("Hello");
    lease.enable();
    expect(article().textContent).toContain("Newer V2");
    expect(harness.saves).toHaveLength(0);
  } finally {
    lease.dispose();
  }
});

test("an edit, a view and another tab's save: the next entry mounts that save", async () => {
  const harness = await load({ head: tagHtml() });
  const reader = await harness.openReader(FILE(articleHtml(), { head: tagHtml() }), { etag: "stamp-1", seq: 1 });
  const first = await reader.prepareHandoff({});
  const one = harness.pageParticipant().prepare(context({ represented: first.represented, reader: first }));
  await one.ready;
  one.enable();
  one.dispose();
  await tick();
  expect(harness.saves).toHaveLength(0);
  expect(harness.storeOf("page")).toBe(null);

  // The reader keeps the file through the exit; another tab saves over it while this one
  // is in view, so the file the next entry is handed is that save.
  reader.stop();
  const newer = await harness.openReader(FILE(articleHtml(OTHER), { head: tagHtml(OTHER) }), { etag: "stamp-2", seq: 2 });
  const second = await newer.prepareHandoff({});
  const two = harness.pageParticipant().prepare(context({ represented: second.represented, reader: newer }));
  try {
    await two.ready;
    expect(harness.storeOf("page").value).toEqual(seedValue(OTHER));
    expect(article().textContent).toContain("Newer V2");
    expect(harness.saves).toHaveLength(0);
  } finally {
    two.dispose();
  }
});

test("a store the app opened itself survives the session's release", async () => {
  const harness = await load({ head: tagHtml() });
  const app = window.clay.live("page");
  const reader = await harness.openReader(FILE(articleHtml(), { head: tagHtml() }));
  const handoff = await reader.prepareHandoff({});
  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;
  } finally {
    lease.dispose();
  }
  await tick();
  expect(harness.storeOf("page")).toBeTruthy();
  expect(window.clay.live("page")).toBe(app);
});

test("a represented file without the page tag seeds from its article", async () => {
  // The served page states its page in a tag; the file the reader holds states it in the
  // article alone, because the edit that wrote it left no tag behind. The file is the page
  // this session edits, so its article is what the seed is rebuilt from.
  const harness = await load({ head: tagHtml() });
  const bytes = FILE(articleHtml(OTHER));
  const reader = await harness.openReader(bytes, { etag: "stamp-2", seq: 2 });
  const handoff = await reader.prepareHandoff({});

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;
    expect(harness.storeOf("page").value).toEqual(seedPageFromArticle(articleOf(bytes)));
    expect(article().textContent).toContain("Newer V2");
  } finally {
    lease.dispose();
  }
});

test("a represented file that states a page tag stages that tag's page", async () => {
  // The served page has no tag; the file the reader holds gained one, and a tag is the
  // page, so the reader adds it and that is what this session edits.
  const harness = await load();
  const bytes = FILE(articleHtml(OTHER), { head: tagHtml(OTHER) });
  const reader = await harness.openReader(bytes, { etag: "stamp-2", seq: 2 });
  const handoff = await reader.prepareHandoff({});
  expect(document.querySelector(TAG_SEL).textContent).toBe(JSON.stringify(seedValue(OTHER)));

  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await lease.ready;
    expect(harness.storeOf("page").value).toEqual(seedValue(OTHER));
    expect(article().textContent).toContain("Newer V2");
  } finally {
    lease.dispose();
  }
});

test("a mount that fails gives the article back to the reader", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const body = '<p data-id="p">From the file</p>';
  const harness = await load({ html: readerHtml('<p data-id="p">served</p>') });
  const bytes = readerHtml(body);
  const reader = await harness.openReader(bytes);
  const handoff = await reader.prepareHandoff({});

  MODE.factory = "throw";
  const lease = harness.pageParticipant().prepare(context({ represented: handoff.represented, reader: handoff }));
  try {
    await expect(lease.ready).rejects.toMatchObject({ code: "mount-failed" });
    await tick();
    expect(harness.page.view).toBe(null);

    // The reader owns the article again and painted the file it represented.
    expect(harness.ownerOf(article())).toBe("reader");
    expect(() => harness.claim(article(), "editor")).toThrow();
    expect(article().textContent).toContain("From the file");
    expect(harness.saves).toHaveLength(0);
  } finally {
    lease.dispose();
    quiet.mockRestore();
  }
});

test("the exit of an explicit edit boot adopts its install and ends the editor", async () => {
  const harness = await load({ initial: true });
  await harness.page.ready;
  expect(harness.page.view).toBeTruthy();
  expect(harness.page.view.editable).toBe(true);

  const view = harness.page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  const result = await harness.page.flush();
  expect(result?.ok).toBe(true);
  expect(await until(() => harness.saves.length > 0)).toBe(true);
  const savesBefore = harness.saves.length;
  const streamsBefore = harness.sources.length;

  const participant = harness.pageParticipant();
  expect(participant.order).toBe(400);
  const lease = participant.prepare(context({ reader: null, initial: true }));
  try {
    // Adopted: the very session the boot started, and nothing new.
    expect(harness.page.view).toBe(view);
    expect(harness.saves).toHaveLength(savesBefore);
    expect(harness.sources).toHaveLength(streamsBefore);
    expect(inputReady()).toHaveLength(1);
  } finally {
    lease.dispose();
  }

  expect(harness.page.view).toBe(null);
  expect(document.querySelector(".page-shell")).toBe(null);
  // The accepted page is what the exit leaves: the article the save wrote.
  expect(article().textContent).toContain("Hello there");
  expect(harness.ownerOf(article())).toBe(null);
});
