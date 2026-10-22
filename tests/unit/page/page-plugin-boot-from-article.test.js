/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
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

test("a page with one article and no tag boots from its article and gains the tag before it", async () => {
  const html = pageHtml();
  const expected = expectedTagText(html);
  const { page, storeOf } = await load({ html });

  await page.ready;

  expect(page.view).toBeTruthy();
  expect(page.view.editable).toBe(true);
  const tag = pageTag();
  expect(tag).toBeTruthy();
  expect(tag.getAttribute("clay")).toBe("live");
  expect(tag.textContent).toBe(expected);
  expect(tag.nextElementSibling).toBe(document.querySelector("article[data-page]"));
  // The rebuilt state is the article's own: the editor shows the saved blocks.
  expect(storeOf("page").value.v).toBe(1);
  expect(page.view.dom.textContent).toContain("Hello");
});

test("two boots of the same file write identical tag text", async () => {
  const html = pageHtml();
  const first = await load({ html });
  await first.page.ready;
  const firstText = pageTag().textContent;

  const second = await load({ html });
  await second.page.ready;
  const secondText = pageTag().textContent;

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

  expect(pageTag()).toBeTruthy();
  // The tag the plugin added is in no comparison domain, so it cannot be the
  // reason a page reads dirty.
  expect(snapshot.captureForDirtyCheck()).not.toContain('merge="page"');
  expect(warning.hasUnsavedChanges()).toBe(false);
});

test("a live-data host gets one conditional save with the tag before the page store opens", async () => {
  const html = pageHtml();
  const { page, order, saves } = await load({ html, liveData: true });
  const warning = await import("../../../src/core/unsaved-warning.js");
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await flushAsync();
  await settle(save);
  expect(warning.hasUnsavedChanges()).toBe(false);

  expect(page.view).toBeTruthy();
  expect(saves).toHaveLength(1);
  expect(saves[0].headers["If-Match"]).toBe("stamp-1");
  expect(order.indexOf("save")).toBeGreaterThanOrEqual(0);
  expect(order.indexOf("save")).toBeLessThan(order.indexOf("live:page"));
  const saved = new DOMParser().parseFromString(saves[0].body, "text/html");
  const tag = saved.querySelector(TAG_SEL);
  expect(tag).toBeTruthy();
  expect(tag.textContent).toBe(expectedTagText(html));
  expect(tag.nextElementSibling).toBe(saved.querySelector("article[data-page]"));
});

test("a 412 on the initial write reloads once to compose the tab that won", async () => {
  const reload = jest.fn();
  const realLocation = window.location;
  Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
  try {
    const { page, saves } = await load({
      liveData: true,
      answer: () => ({ status: 412, body: { msg: "This document changed since you last loaded it.", code: "conflict" } }),
    });

    await page.ready;
    await flushAsync();

    expect(saves).toHaveLength(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(page.view).toBe(null);
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }
});

test("any other refusal of the initial write shows the blocked notice and stops", async () => {
  const { page, saves } = await load({
    liveData: true,
    answer: () => ({ status: 409, body: { msg: "This document is not accepting that write.", code: "save-id-reused" } }),
  });
  const states = [];
  const onState = (event) => states.push(event.detail);

  try {
    document.addEventListener("clay:page-save-state", onState);
    await page.ready;
    await flushAsync();

    expect(saves).toHaveLength(1);
    expect(page.view).toBe(null);
    expect(states.at(-1)).toEqual({ state: "blocked", code: "save-id-reused", message: "This document is not accepting that write." });
  } finally {
    document.removeEventListener("clay:page-save-state", onState);
  }
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
