/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import * as realToolPart from "../../../src/page/features/tool.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { seedLineage, valueClients } from "../../../src/page/ybind/lineage.js";

/**
 * The page as a mode session: preparation stages the article, the room and the editor
 * without taking input and without writing, the commit that enters edit opens exactly
 * that session, a refused exit leaves every buffer where it was, and the committed
 * exit puts the accepted page back. A refused first write reads the stored document
 * once, re-seeds from its article, replays this tab's edit and offers it again.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TOOL = { id: "t1", t: "tool", pos: "Z" };
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const ARTICLE_SEL = "article[data-page]";

const clone = (v) => JSON.parse(JSON.stringify(v));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const until = async (predicate, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  return predicate();
};
const settle = async (save, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!save.baselineSettled() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};
const tick = async (turns = 20) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };

const articleHtml = (blocks = BLOCKS) => {
  const { html, rev } = renderFromTags([JSON.stringify(seedValue(blocks))]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (blocks = BLOCKS) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(seedValue(blocks))}</script>`;
const articleOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector(ARTICLE_SEL);
const context = (generation = 1) => ({ generation, destination: "host", signal: new AbortController().signal, isCurrent: () => true });

const MODE = { factory: "ok", toolGate: null };

const marks = [];
beforeEach(() => {
  marks.length = 0;
  MODE.factory = "ok";
  MODE.toolGate = null;
});
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const roomState = (room) => ({ epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0, stores: clone(room.stores) });

async function load({
  html = articleHtml(),
  head = "",
  liveData = true,
  answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }),
  reread = () => null,
  roomStores = {},
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  if (liveData) document.documentElement.setAttribute("documentetag", "stamp-1");
  else document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const extensions = liveData ? ["page", "live-data", "conditional"] : ["page"];
  const saves = [];
  const reads = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: clone(roomStores) };

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

  await jest.unstable_mockModule("../../../src/page/features/tool.js", async () => {
    if (MODE.toolGate) await MODE.toolGate.promise;
    return realToolPart;
  });

  // The host's answer to a save, and the stored document a refused first write is
  // offered to again.
  global.fetch = jest.fn(async (url, options) => {
    if ((options?.method ?? "GET") !== "POST") {
      const page = reread(saves.length);
      reads.push({ url: String(url) });
      if (!page) return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
      const headers = page.headers ?? { etag: page.etag ?? null };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (name) => { const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase()); return key ? headers[key] : null; } },
        text: async () => page.html,
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

  const { live, storeOf, checkpointWithin } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const { page, preparePageSession, pageParticipant } = await import("../../../src/plugins/page.js");
  const save = await import("../../../src/core/save.js");
  return { page, pageParticipant, preparePageSession, storeOf, checkpointWithin, saves, reads, sent, room, save };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
});

const inputReady = () => marks.filter((entry) => entry.name === "document:input-ready");
const noInput = (page) => {
  const view = page.view;
  if (!view) return;
  expect(view.editable).toBe(false);
  const shell = view.dom.closest(".page-shell");
  expect(shell.inert).toBe(true);
};

test("a session stages a tagless page and takes no input or write until the commit", async () => {
  const html = articleHtml();
  const { page, preparePageSession, storeOf, checkpointWithin, saves } = await load({ html });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);

    // Prepared: the editor is mounted over the page and nothing types into it.
    expect(page.view).toBeTruthy();
    expect(page.view.editable).toBe(false);
    noInput(page);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(inputReady()).toHaveLength(0);
    expect(page.status.phase).not.toBe("ready");
    // The seed is the article's own, held as a value only.
    expect(storeOf("page").value).toEqual(seedPageFromArticle(articleOf(html)));
    expect(saves).toHaveLength(0);

    // An edit and a checkpoint while the mode is still view write nothing.
    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    await tick();
    expect(saves).toHaveLength(0);
    expect(storeOf("page").handle.status.mode).toBe("file");

    lease.enable();
    expect(page.view).toBe(view);
    expect(page.view.editable).toBe(true);
    expect(page.view.dom.closest(".page-shell").inert).toBe(false);
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(inputReady()).toHaveLength(1);
    expect(page.view.dom.textContent).toContain("Hello there");

    // Admitted now: the same edit writes once, as this page's first write.
    checkpointWithin(0);
    expect(await until(() => saves.length > 0)).toBe(true);
    expect(saves).toHaveLength(1);
    expect(saves[0].headers["Page-Write"]).toBe("v1");
  } finally {
    lease.dispose();
  }
});

test("a tagged document prepares the state the file already has", async () => {
  const html = articleHtml();
  const { page, preparePageSession, storeOf, saves } = await load({ html, head: tagHtml() });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);

    expect(page.view.editable).toBe(false);
    expect(saves).toHaveLength(0);
    expect(storeOf("page").value).toEqual(seedValue(BLOCKS));

    lease.enable();
    expect(page.view.editable).toBe(true);
    expect(page.view.dom.textContent).toContain("Hello");
    expect(saves).toHaveLength(0);
  } finally {
    lease.dispose();
  }
});

test("a view part still on the wire keeps preparation open and the saved article up", async () => {
  const html = articleHtml([{ id: "p", t: "paragraph", text: "Hello" }, TOOL]);
  MODE.toolGate = deferred();
  const { page, preparePageSession, saves } = await load({ html });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    expect(await until(() => !!page.view)).toBe(true);
    await tick();
    // The part the article demands is not in yet, so the commit has nothing to open.
    expect(inputReady()).toHaveLength(0);
    expect(page.status.phase).not.toBe("ready");
    expect(page.view?.editable).toBe(false);
    expect(document.querySelector('.page-shell').style.visibility).toBe("hidden");
    expect(document.querySelector(`${ARTICLE_SEL} > [data-id="p"]`)).toBeTruthy();

    MODE.toolGate.resolve();
    await lease.ready;
    await settle(save);
    expect(page.view.editable).toBe(false);
    expect(saves).toHaveLength(0);

    lease.enable();
    expect(page.view.editable).toBe(true);
    expect(inputReady()).toHaveLength(1);
    expect(document.querySelector(`${ARTICLE_SEL} > [data-id="p"]`)).toBe(null);
  } finally {
    lease.dispose();
  }
});

test("a part the room adds while the page prepares is in before the commit", async () => {
  const blocks = [{ id: "p", t: "paragraph", text: "Hello" }];
  MODE.toolGate = deferred();
  const remote = seedValue([...blocks, TOOL]);
  const { page, preparePageSession, sent } = await load({
    html: articleHtml(blocks),
    head: tagHtml(blocks),
    roomStores: { page: { value: remote, ephemeral: false, last: 0, landed: 0 } },
  });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    // The room's page carries a part the saved article never had: preparation waits
    // for it, and the commit is what opens input.
    expect(await until(() => page.view?.state.doc.toString().includes("tool"))).toBe(true);
    await settle(save);
    expect(inputReady()).toHaveLength(0);
    expect(page.view.editable).toBe(false);

    MODE.toolGate.resolve();
    await lease.ready;
    lease.enable();
    expect(page.view.editable).toBe(true);
    expect(inputReady()).toHaveLength(1);
    expect(document.querySelectorAll(".page-shell section[data-type=\"tool\"]").length).toBe(1);
    expect(sent).toHaveLength(0);
  } finally {
    lease.dispose();
  }
});

test("a pending composition refuses the exit and keeps the typed text", async () => {
  const { page, preparePageSession, storeOf, checkpointWithin, saves } = await load();
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    lease.enable();

    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    Object.defineProperty(view, "composing", { configurable: true, get: () => true });
    expect(() => lease.quiesce()).toThrow(expect.objectContaining({ code: "composition" }));
    expect(page.view).toBe(view);
    expect(view.editable).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there");

    Object.defineProperty(view, "composing", { configurable: true, get: () => false });
    lease.quiesce();
    expect(view.editable).toBe(false);
    // Still in the session, still holding what was typed, and no scheduled save runs
    // while admission is closed.
    expect(page.view.dom.textContent).toContain("Hello there");
    checkpointWithin(0);
    await tick(60);
    expect(saves).toHaveLength(0);

    lease.resume();
    expect(view.editable).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
    expect(await until(() => saves.length > 0)).toBe(true);
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there");
  } finally {
    lease.dispose();
  }
});

test("a refused checkpoint during preparation writes nothing and keeps the edit", async () => {
  const { page, preparePageSession, checkpointWithin, storeOf, saves } = await load();
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    checkpointWithin(0);
    await tick(60);
    expect(saves).toHaveLength(0);
    expect(storeOf("page").pending).toHaveLength(1);
    expect(view.dom.textContent).toContain("Hello there");

    lease.enable();
    checkpointWithin(0);
    expect(await until(() => saves.length > 0)).toBe(true);
    expect(saves).toHaveLength(1);
  } finally {
    lease.dispose();
  }
});

test("a mount that fails blocks the session and leaves the saved article alone", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const html = articleHtml();
  MODE.factory = "throw";
  try {
    const { page, preparePageSession } = await load({ html });
    const lease = preparePageSession(context());
    await expect(lease.ready).rejects.toMatchObject({ code: "mount-failed" });
    await tick();
    expect(page.status).toMatchObject({ phase: "blocked", reason: "mount-failed" });
    expect(page.view).toBe(null);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(document.querySelector(ARTICLE_SEL).innerHTML).toBe(articleOf(html).innerHTML);
    expect(inputReady()).toHaveLength(0);
    lease.enable();
    expect(page.view).toBe(null);
    lease.dispose();
  } finally {
    quiet.mockRestore();
  }
});

test("a page with a tool prepares it inside the session and gives it back on the exit", async () => {
  const html = articleHtml([...BLOCKS, TOOL]);
  const { page, preparePageSession, storeOf } = await load({ html, head: "" });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    expect(page.view.editable).toBe(false);
    // The store the tool keeps its state in is open, and the tool renders with the
    // page rather than waiting for the commit.
    expect(storeOf("page.tools")).toBeTruthy();
    expect(document.querySelectorAll('.page-shell section[data-type="tool"]').length).toBe(1);

    lease.enable();
    expect(page.view.editable).toBe(true);

    lease.dispose();
    expect(page.view).toBe(null);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
    // The article comes back from the accepted page, tools included.
    expect(document.querySelectorAll(`${ARTICLE_SEL} section[data-type="tool"]`).length).toBe(1);
  } finally {
    lease.dispose();
  }
});

test("a session cancelled before its commit leaves nothing behind, however often", async () => {
  const html = articleHtml();
  const { page, preparePageSession } = await load({ html });
  const save = await import("../../../src/core/save.js");
  const before = articleOf(html).innerHTML;

  for (let i = 0; i < 3; i += 1) {
    const lease = preparePageSession(context(i + 1));
    lease.dispose();
    await tick();
    expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(document.querySelector(ARTICLE_SEL).innerHTML).toBe(before);
    expect(page.view).toBe(null);
  }

  // A cancelled session leaves the page free for the one that does commit.
  const lease = preparePageSession(context(9));
  try {
    await lease.ready;
    await settle(save);
    lease.enable();
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(page.view.editable).toBe(true);
    expect(inputReady()).toHaveLength(1);
  } finally {
    lease.dispose();
  }
});

test("a refused first write re-reads the file once, re-seeds, replays the edit and writes again", async () => {
  const html = articleHtml();
  // The stored document is the same page, now carrying the tag a first write left on
  // it: same article, newer stamp.
  const stored = `<script type="application/json" merge="page" clay="live">${JSON.stringify(seedPageFromArticle(articleOf(html)))}</script>${html}`;
  const { page, preparePageSession, checkpointWithin, storeOf, saves, reads } = await load({
    html,
    answer: (count) => (count === 0
      ? { status: 412, body: { msg: "This document changed since you last loaded it.", code: "conflict", etag: "stamp-2" } }
      : { status: 200, body: { msg: "Saved", etag: "stamp-3" } }),
    reread: () => ({ html: stored, etag: "stamp-2" }),
  });
  const save = await import("../../../src/core/save.js");
  const conflicts = [];
  const onConflict = (event) => conflicts.push(event.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    lease.enable();

    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    expect(await until(() => reads.length > 0)).toBe(true);
    expect(await until(() => saves.length > 1)).toBe(true);

    // The stored document was read exactly once, and the offered body carries its
    // article plus this tab's own edit, conditional on the version just read.
    expect(reads).toHaveLength(1);
    expect(saves).toHaveLength(2);
    expect(saves[1].headers["If-Match"]).toBe("stamp-2");
    expect(saves[1].headers["Page-Write"]).toBe("v1");
    const saved = new DOMParser().parseFromString(saves[1].body, "text/html");
    const value = JSON.parse(saved.querySelector(TAG_SEL).textContent);
    const blocks = blocksFromYValue(value);
    // The seed the stored article states, with this tab's own edit replayed over it.
    expect(blocks.p.c).toBe("Hello there");
    expect(blocks.h.c).toBe("Notes");
    expect(valueClients(value).has(seedLineage(articleOf(html)).client)).toBe(true);

    // The tab is still editing, with what it typed.
    expect(page.view).toBe(view);
    expect(view.editable).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
    expect(await until(() => storeOf("page").handle.status.mode === "fast")).toBe(true);
  } finally {
    document.removeEventListener("clay:save-conflict", onConflict);
    lease.dispose();
  }
});

test("a seed the host refuses for its lineage is offered again over the stored article", async () => {
  const html = articleHtml();
  const { page, preparePageSession, checkpointWithin, storeOf, saves, reads } = await load({
    html,
    answer: (count) => (count === 0
      ? { status: 409, body: { msg: "This page does not descend from the stored document.", code: "page-lineage-stale", etag: "stamp-2" } }
      : { status: 200, body: { msg: "Saved", etag: "stamp-3" } }),
    reread: () => ({ html: articleHtml(), etag: "stamp-2" }),
  });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    lease.enable();

    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    expect(await until(() => saves.length > 1)).toBe(true);

    expect(reads).toHaveLength(1);
    expect(saves).toHaveLength(2);
    expect(saves[1].headers["If-Match"]).toBe("stamp-2");
    const saved = new DOMParser().parseFromString(saves[1].body, "text/html");
    expect(blocksFromYValue(JSON.parse(saved.querySelector(TAG_SEL).textContent)).p.c).toBe("Hello there");
    expect(await until(() => storeOf("page").handle.status.mode === "fast")).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
  } finally {
    lease.dispose();
  }
});

test("a second refusal keeps the text and shows the conflict instead of writing again", async () => {
  const html = articleHtml();
  const { page, preparePageSession, checkpointWithin, storeOf, saves, reads } = await load({
    html,
    answer: () => ({ status: 412, body: { msg: "This document changed since you last loaded it.", code: "conflict", etag: "stamp-2" } }),
    reread: () => ({ html, etag: "stamp-2" }),
  });
  const save = await import("../../../src/core/save.js");
  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(save);
    lease.enable();

    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    checkpointWithin(0);
    expect(await until(() => saves.length > 1)).toBe(true);
    await tick(60);

    // One re-read, one retry, and the refusal stands with the text kept.
    expect(reads).toHaveLength(1);
    expect(saves).toHaveLength(2);
    expect(page.view).toBe(view);
    expect(view.editable).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
    expect(storeOf("page").pending.length).toBeGreaterThan(0);
    expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
  } finally {
    lease.dispose();
  }
});

test("the page is a participant the coordinator can hold", async () => {
  const { page, pageParticipant } = await load();
  const participant = pageParticipant();
  expect(participant.id).toBe("clay:page");
  expect(participant.order).toBeLessThan(1000);
  const lease = await participant.prepare(context());
  try {
    await lease.ready;
    expect(page.view.editable).toBe(false);
    lease.enable();
    expect(page.view.editable).toBe(true);
    expect(page.status).toMatchObject({ phase: "ready" });
  } finally {
    lease.dispose();
  }
});
