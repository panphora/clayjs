/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
globalThis.structuredClone ??= (v) => JSON.parse(JSON.stringify(v));
import * as realMediaPart from "../../../src/page/features/media.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { readYValue, writeYValue } from "../../../src/page/ybind/external.js";

/**
 * Input is the last thing a boot gives: the saved article's shell stays inert, so a
 * control inside the non-editable editor cannot write, and nothing takes a key or a
 * paste, until the editor is mounted and every part the room's own document needs is
 * in. The waiting line says so where the person is looking, above the editor, and it
 * goes when input arrives.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const CHECK = { id: "chk", t: "list_item", text: "Do it", attrs: { kind: "check", checked: false } };
const IMAGE = { id: "img", t: "image", attrs: { src: "https://example.com/diagram.png", alt: "Diagram" } };
const ADOPTED = "Hello, edited by hand";

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const until = async (check, tries = 400) => {
  for (let i = 0; i < tries; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleHtml = (value) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const handEdit = (doc) => { doc.querySelector('article[data-page] [data-id="p"]').textContent = ADOPTED; };

// A hand edit that adds a block the saved tag never had, so the editor has to install
// a part the boot did not know to fetch until the adoption landed.
const handImage = (doc) => {
  const { html } = renderFromTags([JSON.stringify(seedValue([...BLOCKS, IMAGE]))]);
  const parsed = document.createElement("article");
  parsed.innerHTML = html;
  doc.querySelector('article[data-page] [data-id="p"]').after(parsed.querySelector('[data-id="img"]'));
};

const marks = [];
beforeEach(() => { marks.length = 0; });
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const MODE = { mediaGate: null };

async function open({ edit = null, blocks = BLOCKS, extensions = ["page", "live-data"], writer = null, mediaGate = null } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  MODE.mediaGate = mediaGate;
  const value = seedValue(blocks);
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value);
  if (edit) edit(document);

  const requests = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer, conn: 0 };
  const roomState = () => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    conn: 0,
    stores: { page: { value: clone(value), ephemeral: false, last: 0, landed: 0 } },
  });

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: null }),
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/core/save.js", () => ({
    savesAdmitted: () => true,
    savePageForce: async () => ({ ok: true, msgType: "success" }),
    savePage: async () => ({ ok: true, msgType: "success" }),
    savePageThrottled: () => {},
    baselineSettled: () => true,
    isSaveConflicted: () => false,
    autosaveIsSuspended: () => false,
    suspendAutosave: () => {},
    resumeAutosave: () => {},
    holdAllSaves: () => {},
    releaseAllSaves: () => {},
    getLastSavedDirty: () => false,
    setLastSavedBaselines: () => {},
    getLastSavedBytes: () => null,
  }));

  await jest.unstable_mockModule("../../../src/lib/unsaved-state.js", () => ({
    registerUnsavedState: () => ({ changed() {}, dispose() {} }),
    pendingIds: () => [],
    hasUnsavedState: () => false,
    flushUnsaved: async () => ({ ok: true, pending: [] }),
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
        handlers.state(roomState());
        return () => {};
      },
      async send(clientId) {
        room.seq += 1;
        if (room.writer === null) room.writer = clientId;
        handlersRef.h?.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() { return roomState(); },
    }),
  }));

  // The image part is the download a boot can lose: a test holds it to see what input
  // waits for.
  await jest.unstable_mockModule("../../../src/page/features/media.js", async () => {
    requests.push("media");
    if (MODE.mediaGate) await MODE.mediaGate.promise;
    return realMediaPart;
  });

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const article = document.querySelector("article[data-page]");
  const { page } = await import("../../../src/plugins/page.js");

  // The elected writer's adoption, as the room delivers it to every other tab.
  const adoptFromWriter = async (text = ADOPTED) => {
    const { revision } = await readYValue(value);
    const { updates } = await writeYValue(value, { expectedRevision: revision, changes: [{ id: "p", content: { c: text } }] });
    room.seq += 1;
    handlersRef.h.frame({
      epoch: room.epoch,
      seq: room.seq,
      name: "page",
      from: "other",
      n: room.seq,
      ops: Object.entries(updates).map(([key, encoded]) => ({ op: "set", path: ["y", key], value: encoded })),
    });
  };

  return { page, article, requests, adoptFromWriter };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const editableNodes = () => document.querySelectorAll('[contenteditable="true"]').length;
const markNames = () => marks.map((entry) => entry.name);
const shellOf = (article) => article.querySelector(".page-shell");

test("the waiting shell takes no input of any kind, and takes it at ready", async () => {
  const { page, article, adoptFromWriter } = await open({ edit: handEdit, writer: "other" });
  try {
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "adopting" });
    expect(page.view.editable).toBe(false);
    expect(editableNodes()).toBe(0);
    expect(markNames()).not.toContain("document:input-ready");
    // The mounted shell is inert, so a control inside the read-only editor cannot be
    // clicked into a write while the room's writer has yet to land the hand edit.
    expect(shellOf(article).inert).toBe(true);

    await adoptFromWriter();
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "ready" });
    expect(page.view.editable).toBe(true);
    expect(editableNodes()).toBe(1);
    expect(shellOf(article).inert).toBe(false);
    expect(markNames().at(-1)).toBe("document:input-ready");
  } finally {
    page.dispose();
  }
}, 20_000);

test("a control inside the waiting editor writes nothing", async () => {
  const { page, article, adoptFromWriter } = await open({ blocks: [...BLOCKS, CHECK], edit: handEdit, writer: "other" });
  try {
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    const li = article.querySelector('.page-li[data-kind="check"]');
    expect(li).toBeTruthy();
    // The checkbox is a control the editor answers even while it is not editable, so
    // the shell it sits in is what refuses the click: an inert subtree takes none.
    expect(li.closest(".page-shell").inert).toBe(true);
    expect(page.view.editable).toBe(false);
    expect(page.view.state.doc.child(1).attrs.checked).toBe(false);

    await adoptFromWriter();
    await page.ready;
    await flushAsync();

    // Nothing was clicked into a write while the boot waited.
    expect(page.view.state.doc.child(1).attrs.checked).toBe(false);
    expect(article.querySelector('.page-li[data-kind="check"]').closest(".page-shell").inert).toBe(false);
  } finally {
    page.dispose();
  }
}, 20_000);

test("the waiting line sits above the editor while the adoption is waited on", async () => {
  const { page, article, adoptFromWriter } = await open({ edit: handEdit, writer: "other" });
  try {
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();
    expect(article.querySelectorAll(".page-boot-status")).toHaveLength(0);

    expect(await until(() => article.querySelectorAll(".page-boot-status").length === 1)).toBe(true);
    const note = article.querySelector(".page-boot-status");
    // Above the editor, where the person is looking, not below its bottom padding.
    expect(article.firstElementChild).toBe(note);
    expect(note.compareDocumentPosition(shellOf(article)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.textContent).toBe("Loading the editor\u2026");
    expect(editableNodes()).toBe(0);

    await adoptFromWriter();
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "ready" });
    expect(article.querySelectorAll(".page-boot-status")).toHaveLength(0);
    expect(editableNodes()).toBe(1);
  } finally {
    page.dispose();
  }
}, 20_000);

test("a part only the adopted document needs is loaded before input", async () => {
  const mediaGate = deferred();
  const { page, article, requests } = await open({
    edit: (doc) => { handEdit(doc); handImage(doc); },
    mediaGate,
  });
  try {
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    // The adoption lands with an image the saved article never had, and that part is
    // still on the wire: the boot waits for it rather than handing over a document
    // whose image is only a stand-in.
    expect(await until(() => page.view?.state.doc.childCount === 2)).toBe(true);
    await flushAsync();
    expect(requests).toContain("media");
    expect(page.view.state.doc.child(1).type.name).toBe("image");
    expect(page.status).toMatchObject({ phase: "adopting" });
    expect(page.view.editable).toBe(false);
    expect(editableNodes()).toBe(0);
    expect(shellOf(article).inert).toBe(true);
    expect(markNames()).not.toContain("document:input-ready");
    expect(article.querySelectorAll(".page-image")).toHaveLength(0);

    mediaGate.resolve();
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "ready" });
    expect(article.querySelectorAll(".page-image")).toHaveLength(1);
    expect(page.view.editable).toBe(true);
    expect(shellOf(article).inert).toBe(false);
    expect(markNames().at(-1)).toBe("document:input-ready");
  } finally {
    page.dispose();
  }
}, 20_000);
