/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { projectInto, renderFromTags } from "../../../src/page/save-projection.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { serializeLive } from "../../../src/live/ops.js";

/**
 * A page saved without its merge state (HTML Clay stores nothing, an outside edit
 * leaves the article and its record disagreeing, a download carries neither) has
 * one article and no page tag. The plugin rebuilds the merge state from the
 * article, puts the tag before it, and boots exactly as if it had been saved with
 * one. A server room opened from such a document holds no page store, so the tab
 * sends one conditional save first; losing that race reloads to compose the winner.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};

const TABLE = {
  id: "tbl",
  t: "table",
  attrs: {
    cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Rate", kind: "number" } },
    rows: { r1: { pos: "1", cells: { c1: "A", c2: "1" } }, r2: { pos: "2", cells: { c1: "", c2: "2" } } },
  },
};
// A table the store holds with no columns: the projection writes a header row with
// no cells and an empty body, and a boot from that article must still mount.
const BLANK_TABLE = { id: "blank", t: "table", attrs: { cols: {}, rows: {} } };

// The article a save writes: the page tags projected onto the article by the real
// save transform, with the tag then dropped so the file carries none.
const savedArticle = (value = seedValue([...BLOCKS, TABLE, BLANK_TABLE])) => {
  const doc = new DOMParser().parseFromString('<article data-page="1"></article>', "text/html");
  const tag = doc.createElement("script");
  tag.setAttribute("type", "application/json");
  tag.setAttribute("merge", "page");
  tag.setAttribute("clay", "live");
  tag.textContent = JSON.stringify(value);
  doc.body.append(tag);
  projectInto(doc);
  return doc.querySelector("article[data-page]").outerHTML;
};

const articleOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector("article[data-page]");
const expectedTagText = (html) => serializeLive(seedPageFromArticle(articleOf(html)));
const pageTag = () => document.querySelector(TAG_SEL);

// The load-time settle the autosave baseline waits for: the boot's own churn
// (injected styles, the editor mounting) is absorbed here, not by a save.
const settle = async (save, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!save.baselineSettled() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

const roomState = (room) => ({
  epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
  stores: clone(room.stores),
});

async function load({ html = pageHtml(), head = "", liveData = false, answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }) } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  if (liveData) document.documentElement.setAttribute("documentetag", "stamp-1");
  else document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const extensions = liveData ? ["page", "live-data", "conditional"] : ["page"];
  const saves = [];
  const order = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: { etag: "stamp-1" } }),
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

  // The host's answer to a save. A host that keeps a room admits the document's
  // first write as the page store's initial value, exactly as it reads it out of
  // the body.
  global.fetch = jest.fn(async (url, options) => {
    const reply = answer(saves.length);
    saves.push({ url: String(url), options, headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    order.push("save");
    const doc = new DOMParser().parseFromString(String(options?.body ?? ""), "text/html");
    const tag = doc.querySelector(TAG_SEL);
    if (tag) room.stores.page = { value: JSON.parse(tag.textContent), ephemeral: false, last: 0, landed: 0 };
    const status = reply.status ?? 200;
    const headers = reply.headers ?? {};
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: {
        get: (name) => {
          const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
          return key === undefined ? null : headers[key];
        },
      },
      text: async () => JSON.stringify(reply.body ?? {}),
    };
  });

  if (liveData) {
    const etag = await import("../../../src/core/etag.js");
    await etag.seedEtag();
  }

  const { live, storeOf } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => { order.push(`live:${name}`); return live(name); } };
  const { page } = await import("../../../src/plugins/page.js");
  return { page, storeOf, saves, order, sent, room };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
});

test("a page with one article and no tag boots from its article, holding its seed and no tag", async () => {
  const html = pageHtml();
  const expected = expectedTagText(html);
  const { page, storeOf } = await load({ html });

  await page.ready;

  expect(page.view).toBeTruthy();
  expect(page.view.editable).toBe(true);
  // The seed is a value in memory: the document gains no tag, so no boot can read
  // one back as a page the file already has.
  expect(pageTag()).toBe(null);
  expect(serializeLive(storeOf("page").value)).toBe(expected);
  expect(page.view.dom.textContent).toContain("Hello");
});

test("a tagless page whose article holds a table boots with its rows and cells", async () => {
  const html = savedArticle();
  const { page } = await load({ html });

  await page.ready;

  expect(page.view).toBeTruthy();
  const table = page.view.dom.querySelector('[data-id="tbl"] table');
  expect(table).toBeTruthy();
  expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(table.querySelectorAll("tbody tr:first-child td")).toHaveLength(2);
  expect(table.textContent).toContain("A");

  // The table the store holds with no columns and no rows stays exactly that: the rebuild
  // invents no row for it, so the next save writes none back into the file.
  const snapshot = await import("../../../src/core/snapshot.js");
  const { forSave } = snapshot.captureForSaveAndComparison({ flushUndo: false, emitForSync: false });
  const saved = new DOMParser().parseFromString(forSave, "text/html");
  const blank = saved.querySelector('table[data-id="blank"]');
  expect(blank).toBeTruthy();
  expect(blank.querySelectorAll("tr[data-id]")).toHaveLength(0);
});

test("two boots of the same file carry identical tag text into a save", async () => {
  const html = pageHtml();
  const captured = async () => {
    const boot = await load({ html });
    await boot.page.ready;
    const snapshot = await import("../../../src/core/snapshot.js");
    const { forSave } = snapshot.captureForSaveAndComparison({ flushUndo: false, emitForSync: false });
    return new DOMParser().parseFromString(forSave, "text/html").querySelector(TAG_SEL).textContent;
  };
  const firstText = await captured();
  const secondText = await captured();

  expect(firstText).toBe(secondText);
  expect(firstText).toBe(expectedTagText(html));
});

test("an untouched page booted from its article does not read as unsaved", async () => {
  const { page } = await load();
  const warning = await import("../../../src/core/unsaved-warning.js");
  const snapshot = await import("../../../src/core/snapshot.js");
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await settle(save);

  expect(pageTag()).toBe(null);
  // The staged store is in no comparison domain, so it cannot be the reason a page
  // reads dirty.
  expect(snapshot.captureForDirtyCheck()).not.toContain('merge="page"');
  expect(warning.hasUnsavedChanges()).toBe(false);
});

test("a live-data host makes no write when the page is opened, and no room is joined", async () => {
  const html = pageHtml();
  const { page, order, saves, sent, room } = await load({ html, liveData: true });
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await flushAsync();
  await settle(save);

  expect(page.view).toBeTruthy();
  expect(saves).toHaveLength(0);
  expect(sent).toHaveLength(0);
  expect(room.writer).toBe(null);
  expect(order).not.toContain("live:page");
  expect(pageTag()).toBe(null);
});

test("two articles and no tag are still abandoned, with no tag inserted", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({ html: pageHtml() + pageHtml() });

    await page.ready;

    expect(page.view).toBe(null);
    expect(document.querySelectorAll("article[data-page]")).toHaveLength(2);
    expect(pageTag()).toBe(null);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});

test("a page that already has its tag keeps it untouched", async () => {
  const value = seedValue(BLOCKS);
  const authored = JSON.stringify(value, null, 2);
  const tag = `<script type="application/json" merge="page" clay="live">${authored}</script>`;
  const { page } = await load({ html: pageHtml(value), head: tag });

  await page.ready;
  await flushAsync();

  expect(page.view).toBeTruthy();
  expect(pageTag().textContent).toBe(authored);
  expect(pageTag().textContent).not.toBe(serializeLive(value));
});
