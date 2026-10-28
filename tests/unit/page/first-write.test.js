/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { serializeLive } from "../../../src/live/ops.js";
import { seedLineage, valueClients } from "../../../src/page/ybind/lineage.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { docFromValue, enc } from "../../../src/page/ybind/provider.js";

/**
 * A page saved without its merge state is staged, not seeded: entering edit opens its
 * deterministic seed in memory and writes nothing, so a clean enter and exit makes no
 * request at all. The first genuine edit is what makes the store pending, and the first
 * save then carries seed plus that edit, projected, conditional on the version the tab
 * staged from, and declared with `Page-Write: v1`. Only a write the host accepts opens
 * the room; a refusal keeps the typed text in this tab.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const clone = (v) => JSON.parse(JSON.stringify(v));

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};

const articleOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector("article[data-page]");
const expectedTagValue = (html) => seedPageFromArticle(articleOf(html));
const pageTag = () => document.querySelector(TAG_SEL);

const peerValue = (html) => {
  const initial = expectedTagValue(html);
  const doc = docFromValue(initial);
  doc.clientID = 8123456;
  const before = Y.encodeStateVector(doc);
  const flow = doc.getText("flow");
  flow.insert(flow.length, " peer");
  const value = { ...initial, y: { ...initial.y, "u8123456-0": enc(Y.encodeStateAsUpdateV2(doc, before)) } };
  doc.destroy();
  return value;
};
const taggedPage = (value) => pageHtml(value) + `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

const settle = async (save, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!save.baselineSettled() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

const until = async (predicate, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  return predicate();
};

const roomState = (room) => ({
  epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
  stores: clone(room.stores),
});

async function load({ html = pageHtml(), liveData = true, storedState = null, stateStatus = 200, answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }) } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  if (liveData || storedState) document.documentElement.setAttribute("documentetag", "stamp-1");
  else document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = "";
  document.body.innerHTML = html;

  const extensions = liveData ? ["page", "live-data", "conditional"] : ["page"];
  if (storedState) extensions.push("page-recovery-v1");
  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: storedState ? { etag: "stamp-1", pageState: { href: "/_/page-state" } } : { etag: "stamp-1" } }),
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

  // The host's answer to a save. A host that keeps a room holds the document's page
  // store as it reads it out of the body it accepted.
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith("/_/page-state")) {
      return {
        ok: stateStatus < 400,
        status: stateStatus,
        statusText: "",
        headers: { get: () => null },
        text: async () => JSON.stringify({ version: 1, documentId: "doc", generation: "1".repeat(32), etag: "stamp-1", stateHash: "a".repeat(64), tag: JSON.stringify(storedState) }),
      };
    }
    const reply = answer(saves.length);
    saves.push({ url: String(url), options, headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    const doc = new DOMParser().parseFromString(String(options?.body ?? ""), "text/html");
    const tag = doc.querySelector(TAG_SEL);
    const status = reply.status ?? 200;
    const headers = reply.headers ?? {};
    if (status < 400 && tag) room.stores.page = { value: JSON.parse(tag.textContent), ephemeral: false, last: 0, landed: 0 };
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

  if (liveData) {
    const etag = await import("../../../src/core/etag.js");
    await etag.seedEtag();
  }

  const { live, storeOf, stageStore, checkpointWithin } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const { page } = await import("../../../src/plugins/page.js");
  return { page, storeOf, stageStore, checkpointWithin, saves, sent, room };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
});

test("a tagless page stages its seed in memory: no tag, no request, no room", async () => {
  const html = pageHtml();
  const { page, storeOf, saves, sent, room } = await load({ html });
  const save = await import("../../../src/core/save.js");
  const warning = await import("../../../src/core/unsaved-warning.js");

  await page.ready;
  await settle(save);

  expect(page.view).toBeTruthy();
  expect(page.view.editable).toBe(true);
  expect(page.view.dom.textContent).toContain("Hello");
  // The seed is the article's own, and it is held as a value only.
  expect(storeOf("page").value).toEqual(expectedTagValue(html));
  expect(pageTag()).toBe(null);
  expect(saves).toHaveLength(0);
  expect(sent).toHaveLength(0);
  expect(room.writer).toBe(null);
  expect(warning.hasUnsavedChanges()).toBe(false);

  // A clean enter and exit performs zero writes: the exit flush has nothing to send.
  await expect(page.flush()).resolves.toEqual({ ok: true });
  expect(saves).toHaveLength(0);
  expect(sent).toHaveLength(0);
});

test("the first edit saves seed plus that edit against the version it staged from and opens the room", async () => {
  const html = pageHtml();
  const { page, storeOf, checkpointWithin, saves, sent, room } = await load({ html });
  const save = await import("../../../src/core/save.js");
  const { stageStore } = await import("../../../src/plugins/live.js");

  await page.ready;
  await settle(save);
  const staged = stageStore ? null : null;
  expect(staged).toBe(null);
  expect(saves).toHaveLength(0);

  const view = page.view;
  const end = view.state.doc.content.size - 1;
  view.dispatch(view.state.tr.insertText(" there", end));
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there");

  checkpointWithin(0);
  expect(await until(() => saves.length > 0)).toBe(true);

  // One conditional save, declared as a page write, carrying the seed's own client.
  expect(saves).toHaveLength(1);
  expect(saves[0].headers["If-Match"]).toBe("stamp-1");
  expect(saves[0].headers["Page-Write"]).toBe("v1");
  const saved = new DOMParser().parseFromString(saves[0].body, "text/html");
  const tag = saved.querySelector(TAG_SEL);
  const value = JSON.parse(tag.textContent);
  expect(blocksFromYValue(value).p.c).toBe("Hello there");
  // The seed the article states is carried intact beside the edit, so the host's own
  // lineage check finds the stored article's seed client in the value.
  expect(value.v).toBe(1);
  const client = seedLineage(articleOf(html)).client;
  expect(valueClients(value).has(client)).toBe(true);
  // The article in the body is the projection of that value.
  const projected = renderFromTags([tag.textContent]);
  expect(saved.querySelector("article").innerHTML).toBe(projected.html);
  expect(saved.querySelector("article").getAttribute("data-rev")).toBe(projected.rev);

  // The accepted write opens the room and the page store follows it.
  expect(await until(() => storeOf("page").handle.status.mode === "fast")).toBe(true);
  expect(room.stores.page).toBeTruthy();
  expect(pageTag()).toBe(null);

  // Operations made after that capture keep their own identities and travel through
  // the room the accepted initialization opened.
  const framesBefore = sent.length;
  const at = view.state.doc.content.size - 1;
  view.dispatch(view.state.tr.insertText("!", at));
  expect(await until(() => sent.length > framesBefore)).toBe(true);
  expect(sent.at(-1).name).toBe("page");
  expect(sent.at(-1).ops.length).toBeGreaterThan(0);
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there!");
});

test("a losing first write keeps the typed text in this tab", async () => {
  const reload = jest.fn();
  const realLocation = window.location;
  Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
  try {
    const { page, storeOf, checkpointWithin, saves } = await load({
      answer: () => ({ status: 412, body: { msg: "This document changed since you last loaded it.", code: "conflict" } }),
    });
    const save = await import("../../../src/core/save.js");
    const conflicts = [];
    const onConflict = (event) => conflicts.push(event.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await page.ready;
    await settle(save);
    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    expect(await until(() => saves.length > 0)).toBe(true);
    expect(await until(() => conflicts.length > 0)).toBe(true);

    expect(reload).not.toHaveBeenCalled();
    expect(page.view).toBe(view);
    expect(view.editable).toBe(true);
    expect(page.view.dom.textContent).toContain("Hello there");
    // Nothing was accepted, so the operations are still this tab's to keep.
    expect(storeOf("page").pending).toHaveLength(1);
    expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
    document.removeEventListener("clay:save-conflict", onConflict);
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }
});

test("a host that keeps no page data saves through the file lane at the first real edit", async () => {
  const html = pageHtml();
  const { page, storeOf, checkpointWithin, saves, sent } = await load({ html, liveData: false });
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await settle(save);

  expect(page.view).toBeTruthy();
  expect(pageTag()).toBe(null);
  expect(saves).toHaveLength(0);
  expect(sent).toHaveLength(0);

  const view = page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  checkpointWithin(0);
  expect(await until(() => saves.length > 0)).toBe(true);

  expect(saves).toHaveLength(1);
  expect(saves[0].headers["Page-Write"]).toBe("v1");
  const saved = new DOMParser().parseFromString(saves[0].body, "text/html");
  const tag = saved.querySelector(TAG_SEL);
  expect(blocksFromYValue(JSON.parse(tag.textContent)).p.c).toBe("Hello there");
  // No room on this host: nothing is framed and no writer is claimed.
  expect(sent).toHaveLength(0);
  expect(storeOf("page").handle.status.mode).toBe("file");
  expect(page.view.dom.textContent).toContain("Hello there");
});

test("the staged store is pending only after an edit, and its flush is the first write", async () => {
  const html = pageHtml();
  const { page, storeOf, stageStore, saves } = await load({ html });
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await settle(save);

  const staged = stageStore("page");
  expect(staged.handle).toBe(window.clay.live("page"));
  expect(staged.isPending()).toBe(false);
  await expect(staged.flush()).resolves.toEqual({ ok: true });
  expect(saves).toHaveLength(0);

  const view = page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  expect(staged.isPending()).toBe(true);
  await expect(staged.flush()).resolves.toEqual({ ok: true });
  expect(saves).toHaveLength(1);
  expect(saves[0].headers["Page-Write"]).toBe("v1");
  expect(staged.isPending()).toBe(false);

  // Accepted initialization: the store is no longer staged, so the same call writes
  // nothing and the room it now belongs to carries what comes next.
  await expect(staged.flush()).resolves.toEqual({ ok: true });
  expect(saves).toHaveLength(1);
  expect(storeOf("page").pending).toHaveLength(0);
  staged.dispose();
  expect(storeOf("page")).toBeTruthy();
});

test("a staged editor takes a peer's first saved state without requiring its own edit", async () => {
  const html = pageHtml();
  const peer = peerValue(html);
  const { page, storeOf } = await load({ html, liveData: false });
  await page.ready;
  const { receiveFrame } = await import("../../../src/plugins/live.js");
  receiveFrame(taggedPage(peer));
  expect(await until(() => page.view.dom.textContent.includes("Hello peer"))).toBe(true);
  expect(page.view.editable).toBe(true);
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello peer");
});

test("a refused first save merges the stored Yjs lineage and preserves both edits", async () => {
  const html = pageHtml();
  const peer = peerValue(html);
  const { page, storeOf, checkpointWithin, saves } = await load({
    html,
    liveData: false,
    answer: (n) => n === 0
      ? { status: 412, body: { code: "conflict", msg: "Changed" } }
      : { status: 200, body: { msg: "Saved", etag: "stamp-3" } },
  });
  await page.ready;
  const save = await import("../../../src/core/save.js");
  await settle(save);
  const saveFetch = global.fetch;
  global.fetch = jest.fn((url, options) => options?.method === "POST"
    ? saveFetch(url, options)
    : Promise.resolve({ ok: true, status: 200, headers: { get: (name) => name === "etag" ? "stamp-2" : null }, text: async () => taggedPage(peer) }));
  const view = page.view;
  view.dispatch(view.state.tr.insertText(" local", view.state.doc.content.size - 1));
  checkpointWithin(0);
  expect(await until(() => saves.length === 2)).toBe(true);
  expect(await until(() => storeOf("page").pending.length === 0)).toBe(true);
  expect(view.editable).toBe(true);
  const value = JSON.parse(new DOMParser().parseFromString(saves[1].body, "text/html").querySelector(TAG_SEL).textContent);
  const text = blocksFromYValue(value).p.c;
  expect(text).toContain(" local");
  expect(text).toContain(" peer");
  expect(text.match(/Hello/g)).toHaveLength(1);
});

test("entering a tagless saved version uses the host's existing Yjs state without writing", async () => {
  const persisted = peerValue(pageHtml());
  const { page, storeOf, saves } = await load({ html: pageHtml(persisted), liveData: false, storedState: persisted });
  await page.ready;
  expect(page.view).toBeTruthy();
  expect(page.view.editable).toBe(true);
  expect(storeOf("page").value).toEqual(persisted);
  expect(pageTag()).toBe(null);
  expect(saves).toHaveLength(0);
  const reads = global.fetch.mock.calls.filter(([url]) => String(url).endsWith("/_/page-state"));
  expect(reads).toHaveLength(1);
  expect(reads[0][1].headers["If-Match"]).toBe("stamp-1");
});

test("a moved page-state version refuses entry instead of inventing a new lineage", async () => {
  const persisted = peerValue(pageHtml());
  const { page, saves } = await load({ html: pageHtml(persisted), liveData: false, storedState: persisted, stateStatus: 412 });
  await page.ready;
  expect(page.view).toBe(null);
  expect(page.status.reason).toBe("etag-mismatch");
  expect(saves).toHaveLength(0);
});

test.each([false, true])("an unstamped reader verifies the served article before using its state, changed=%s", async (changed) => {
  const persisted = peerValue(pageHtml());
  const html = pageHtml(persisted);
  const { page, storeOf, saves } = await load({ html, liveData: false, storedState: persisted });
  await page.ready;
  const previous = storeOf("page");
  page.dispose();
  const { closeStore } = await import("../../../src/plugins/live.js");
  closeStore("page", previous);
  const served = changed ? seedValue([{ id: "p", t: "paragraph", text: "Another article" }]) : persisted;
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, headers: { get: () => "stamp-2" }, text: async () => taggedPage(served),
  }));
  const { preparePageSession } = await import("../../../src/plugins/page.js");
  const lease = preparePageSession({ represented: { bytes: html, etag: null }, isCurrent: () => true });
  try {
    if (changed) {
      await expect(lease.ready).rejects.toMatchObject({ code: "stale-document" });
    } else {
      await lease.ready;
      expect(storeOf("page").value).toEqual(persisted);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][0]).toBe("https://example.com/notes.html");
    }
    expect(saves).toHaveLength(0);
  } finally {
    lease.dispose();
  }
});
