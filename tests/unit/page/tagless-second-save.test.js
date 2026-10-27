/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";

/**
 * A Document whose file has no page tag keeps saving on a host that offers `page`
 * with no room. Its first save writes the tag into the capture only, and the live
 * page never gains one, so every save after the first has to build its tag again:
 * otherwise the second save writes the boot article, loses the first edit and
 * leaves the page's operations pending forever.
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

const pageTag = () => document.querySelector(TAG_SEL);

const settle = async (save, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!save.baselineSettled() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

const until = async (predicate, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  return predicate();
};

const taggedBody = (body) => {
  const doc = new DOMParser().parseFromString(body, "text/html");
  const tag = doc.querySelector(TAG_SEL);
  return tag ? JSON.parse(tag.textContent) : null;
};

const paragraphText = (body) => {
  const value = taggedBody(body);
  return value ? blocksFromYValue(value).p.c : null;
};

const roomState = (room) => ({
  epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
  stores: clone(room.stores),
});

async function load({ html = pageHtml(), head = "", answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }) } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  // The host offers `page` and no `live-data`, as HTML Clay does.
  const extensions = ["page"];
  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };

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

  global.fetch = jest.fn(async (url, options) => {
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

  const { live, storeOf, checkpointWithin } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const { page } = await import("../../../src/plugins/page.js");
  return { page, storeOf, checkpointWithin, saves, sent, room };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
});

test("every typed edit after the first reaches the host, with the tag and the text before it", async () => {
  const { page, storeOf, checkpointWithin, saves, sent } = await load();
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await settle(save);
  expect(page.view).toBeTruthy();
  expect(pageTag()).toBe(null);
  expect(saves).toHaveLength(0);

  const view = page.view;
  const typed = async (text) => {
    const at = view.state.doc.content.size - 1;
    view.dispatch(view.state.tr.insertText(text, at));
    checkpointWithin(0);
    expect(await until(() => saves.length > 0)).toBe(true);
    await until(() => storeOf("page").pending.length === 0);
  };

  await typed(" first.");
  expect(saves).toHaveLength(1);
  expect(paragraphText(saves[0].body)).toBe("Hello first.");

  await typed(" second.");
  expect(saves).toHaveLength(2);
  expect(paragraphText(saves[1].body)).toBe("Hello first. second.");

  await typed(" third.");
  expect(saves).toHaveLength(3);
  expect(paragraphText(saves[2].body)).toBe("Hello first. second. third.");

  for (const saved of saves) {
    const doc = new DOMParser().parseFromString(saved.body, "text/html");
    expect(doc.querySelectorAll(TAG_SEL)).toHaveLength(1);
  }

  // No room on this host, and no operation is left pending behind a save.
  expect(sent).toHaveLength(0);
  expect(storeOf("page").pending).toHaveLength(0);
  expect(page.view.dom.textContent).toContain("Hello first. second. third.");
  // The live page never gains a tag of its own.
  expect(pageTag()).toBe(null);
}, 30000);

test("a document that already has its tag still ends with exactly one", async () => {
  const authored = JSON.stringify(seedValue(BLOCKS));
  const tag = `<script type="application/json" merge="page" clay="live">${authored}</script>`;
  const { page, storeOf, checkpointWithin, saves } = await load({ head: tag });
  const save = await import("../../../src/core/save.js");

  await page.ready;
  await settle(save);
  expect(pageTag()).toBeTruthy();

  const view = page.view;
  for (const text of [" first.", " second."]) {
    const at = view.state.doc.content.size - 1;
    view.dispatch(view.state.tr.insertText(text, at));
    const before = saves.length;
    checkpointWithin(0);
    expect(await until(() => saves.length > before)).toBe(true);
    await until(() => storeOf("page").pending.length === 0);
  }

  expect(saves).toHaveLength(2);
  for (const saved of saves) {
    const doc = new DOMParser().parseFromString(saved.body, "text/html");
    expect(doc.querySelectorAll(TAG_SEL)).toHaveLength(1);
  }
  expect(paragraphText(saves[1].body)).toBe("Hello first. second.");
  expect(document.querySelectorAll(TAG_SEL)).toHaveLength(1);
  expect(storeOf("page").pending).toHaveLength(0);
}, 30000);
