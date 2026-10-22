/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * A page tab whose page was replaced. A host keeps the page editor's merge state
 * beside the file and composes it back only while it still belongs to the article,
 * so a document with no page tag and a new article rev is a page this tab no
 * longer edits. It stops sending page edits, stops saving, and says so. A tagless
 * document whose article rev is unchanged is an outside edit to something else and
 * is ignored, as today; a tag-bearing document is handled as today. A room that
 * answers the page store's frames with unknown-store is the same news.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const TOOLS_SEL = 'script[type="application/json"][merge="page.tools"][clay~="live"]';
const REPLACED_TEXT = "This page was changed outside the editor. Reload to see it.";
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (value, { name = "page" } = {}) =>
  `<script type="application/json" merge="${name}" clay="live">${JSON.stringify(value)}</script>`;
const revOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector("article[data-page]").getAttribute("data-rev");
const docOf = (head, body) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const toastText = () => document.querySelector("[data-clay-toast]")?.textContent ?? "";
const toastActions = () => [...(document.querySelector("[data-clay-toast]")?.querySelectorAll("button") ?? [])]
  .filter((b) => b.textContent).map((b) => b.textContent);

const roomState = (room) => ({
  epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
  stores: clone(room.stores),
});

let current = null;

async function load({ html = pageHtml(), head = "", answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }) } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions: ["page"], document: { etag: "stamp-1" } }),
    hostSupports: async (name) => name === "page",
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

  global.fetch = jest.fn(async (url, options) => {
    const reply = answer(saves.length);
    saves.push({ url: String(url), headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: { get: () => null },
      text: async () => JSON.stringify(reply.body ?? {}),
    };
  });

  const { live, storeOf } = await import("../../../src/plugins/live.js");
  window.clay = { live };
  const { page } = await import("../../../src/plugins/page.js");
  current = page;
  return { page, storeOf, saves, sent, room };
}

afterEach(() => {
  try { current?.dispose(); } catch {}
  current = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("a tagless incoming document with a new article rev stops the tab and offers reload and download", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf, saves, sent } = await load({ html, head: tagHtml(value) });

  await page.ready;
  expect(page.view).toBeTruthy();
  const store = storeOf("page");
  const before = JSON.stringify(store.value);

  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf("", pageHtml(seedValue([{ id: "p", t: "paragraph", text: "Replaced" }]))) },
  }));

  expect(toastText()).toContain(REPLACED_TEXT);
  expect(toastActions()).toEqual(["Reload", "Download your copy"]);
  expect(page.view.editable).toBe(false);

  // The editor is read-only and detached: a local edit makes no page frame and
  // changes nothing the next save could carry.
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(JSON.stringify(store.value)).toBe(before);
  expect(sent.filter((frame) => frame.name === "page")).toHaveLength(0);

  // And no save leaves the tab, even one asked for explicitly.
  const save = await import("../../../src/core/save.js");
  await expect(save.savePageForce()).resolves.toMatchObject({ ok: false, msgType: "skipped" });
  expect(saves).toHaveLength(0);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a tagless incoming document with the same article rev is an outside edit elsewhere: editing continues", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const rev = revOf(html);
  const { page, storeOf, saves } = await load({ html, head: tagHtml(value) });

  await page.ready;
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf("", `<main><article data-page="1" data-rev="${rev}"><h1 data-id="h">Notes</h1><p data-id="p">Hello</p></article><footer>Footer</footer></main>`) },
  }));

  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);

  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");
  expect(saves).toHaveLength(0);
});

test("an incoming document that carries the page tag is handled as today: no notice", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const other = seedValue([{ id: "p", t: "paragraph", text: "Elsewhere" }]);
  const { page } = await load({ html, head: tagHtml(value) });

  await page.ready;
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf(tagHtml(other), pageHtml(other)) },
  }));

  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);
});

test("an unknown-store refusal of the page store's frames shows the notice", async () => {
  const value = seedValue(BLOCKS);
  const { page, storeOf } = await load({ html: pageHtml(value), head: tagHtml(value) });

  await page.ready;
  storeOf("page").deliver({ phase: "left", code: "no-store", n: 1 });

  expect(toastText()).toContain(REPLACED_TEXT);
  expect(toastActions()).toEqual(["Reload", "Download your copy"]);
  expect(page.view.editable).toBe(false);
});

test("a downloaded copy carries no page merge state, and keeps the article and the tool store", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page } = await load({ html, head: tagHtml(value) + tagHtml({}, { name: "page.tools" }) });

  await page.ready;
  expect(document.querySelector(TAG_SEL)).toBeTruthy();

  const blobs = [];
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  URL.createObjectURL = jest.fn((blob) => { blobs.push(blob); return "blob:page-copy"; });
  URL.revokeObjectURL = jest.fn();
  try {
    const { downloadPageCopy } = await import("../../../src/page/save-states.js");
    expect(downloadPageCopy()).toBe(true);
    expect(blobs).toHaveLength(1);

    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    const copy = new DOMParser().parseFromString(text, "text/html");
    expect(copy.querySelector(TAG_SEL)).toBe(null);
    expect(text).not.toContain('merge="page"');
    expect(copy.querySelector(TOOLS_SEL)).toBeTruthy();
    expect(copy.querySelector("article[data-page]").innerHTML).toContain("Hello");
  } finally {
    click.mockRestore();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});
