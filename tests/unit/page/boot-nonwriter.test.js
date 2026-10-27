/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
globalThis.structuredClone ??= (v) => JSON.parse(JSON.stringify(v));
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { readYValue, writeYValue } from "../../../src/page/ybind/external.js";
import { ADOPTION_TIMEOUT_MS } from "../../../src/page/adopt-boot.js";

/**
 * A tab that is not the room's elected writer does not adopt a hand-edited
 * article itself: it stages its view, keeps the saved article up and takes no
 * typing until the writer's adoption reaches it through the room, and then
 * becomes editable. A room that already holds the writer's adoption, or a newer
 * state a peer made after it, is nothing to wait for: the tab types into the
 * room's state at once. A wait that outlives the adoption bound blocks with the
 * timeout, and a boot that ends while waiting leaves nothing running.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const TABLE = {
  id: "tbl",
  t: "table",
  pos: "Z",
  cols: { c1: { pos: "1", name: "Name", kind: "text" } },
  rows: { r1: { pos: "1", cells: { c1: "A" } } },
};
const ADOPTED = "Hello, edited by hand";

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

const marks = [];
beforeEach(() => { marks.length = 0; });
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

async function open({ edit = null, blocks = BLOCKS, roomEdits = null, extensions = ["page", "live-data"], writer = null } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  const value = seedValue(blocks);
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value);
  if (edit) edit(document);

  // The room's page state when this tab binds: the tag's own updates, then the ones
  // the writer's adoption, and anything a peer changed after it, added to the room.
  let roomValue = value;
  if (roomEdits) {
    const { revision } = await readYValue(value);
    ({ value: roomValue } = await writeYValue(value, { expectedRevision: revision, changes: roomEdits }));
  }

  const registrations = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer, conn: 0 };
  const roomState = () => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    conn: 0,
    stores: { page: { value: clone(roomValue), ephemeral: false, last: 0, landed: 0 } },
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

  // Every save participant this boot registers, and whether it was taken away
  // again: a boot that ends while waiting must not leave one behind.
  await jest.unstable_mockModule("../../../src/lib/unsaved-state.js", () => ({
    registerUnsavedState: ({ id }) => {
      const entry = { id, disposed: false };
      registrations.push(entry);
      return { changed() {}, dispose() { entry.disposed = true; } };
    },
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

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const article = document.querySelector("article[data-page]");
  const { ownerOf } = await import("../../../src/page/runtime-owner.js");
  const { page } = await import("../../../src/plugins/page.js");

  // The elected writer's adoption, as the room delivers it to every other tab: new
  // page updates, not a file frame.
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

  return { page, article, ownerOf, registrations, adoptFromWriter };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const editableNodes = () => document.querySelectorAll('[contenteditable="true"]').length;

test("a nonwriter waits for the writer's adoption and then takes input", async () => {
  const { page, article, adoptFromWriter } = await open({ edit: handEdit, writer: "other", blocks: [...BLOCKS, TABLE] });
  try {
    // Waiting, not blocked: the boot stays in adopting, the editor is staged and
    // read-only, and the saved article with the hand edit is still on screen.
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();
    expect(page.status).toMatchObject({ phase: "adopting" });
    expect(page.view.isDestroyed).toBe(false);
    expect(page.view.editable).toBe(false);
    expect(editableNodes()).toBe(0);
    expect(article.querySelector('[data-id="p"]').textContent).toBe(ADOPTED);
    expect(marks.filter((entry) => entry.name === "document:input-ready")).toEqual([]);

    await adoptFromWriter();
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "ready" });
    expect(page.view.editable).toBe(true);
    expect(editableNodes()).toBe(1);
    expect(page.view.state.doc.textContent).toContain(ADOPTED);
    expect(article.textContent).toContain(ADOPTED);
    expect(marks.at(-1)).toMatchObject({ name: "document:input-ready" });
    // The writer's adoption is not a page replaced outside the editor.
    expect(document.body.textContent).not.toContain("changed outside the editor");
  } finally {
    page.dispose();
  }
});

test("a room that already holds the adopted article takes input at once", async () => {
  const started = Date.now();
  const { page, article } = await open({
    edit: handEdit,
    writer: "other",
    roomEdits: [{ id: "p", content: { c: ADOPTED } }],
  });
  try {
    await page.ready;
    await flushAsync();

    // No wait at all: the writer's adoption is already in the room this tab bound
    // to, so the boot goes straight to ready and the editor takes input.
    expect(Date.now() - started).toBeLessThan(ADOPTION_TIMEOUT_MS / 2);
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(page.view.isDestroyed).toBe(false);
    expect(page.view.editable).toBe(true);
    expect(editableNodes()).toBe(1);
    expect(await until(() => page.view.state.doc.textContent.includes(ADOPTED))).toBe(true);
    expect(article.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(article.textContent).toContain(ADOPTED);
    expect(marks.at(-1)).toMatchObject({ name: "document:input-ready" });
  } finally {
    page.dispose();
  }
}, 20_000);

test("a room a peer changed after the adoption takes input on the room's state", async () => {
  const PEER = "A peer wrote this after the adoption";
  const started = Date.now();
  const { page, article } = await open({
    edit: handEdit,
    writer: "other",
    blocks: [...BLOCKS, { id: "h", t: "heading", text: "Heading" }],
    roomEdits: [{ id: "p", content: { c: ADOPTED } }, { id: "h", content: { c: PEER } }],
  });
  try {
    await page.ready;
    await flushAsync();

    // The room moved past the article, so it holds the article's edit too: nothing
    // to wait for, and the editor is the room's state, not the saved article's.
    expect(Date.now() - started).toBeLessThan(ADOPTION_TIMEOUT_MS / 2);
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(page.view.editable).toBe(true);
    expect(editableNodes()).toBe(1);
    expect(await until(() => page.view.state.doc.textContent.includes(PEER))).toBe(true);
    expect(page.view.state.doc.textContent).toContain(ADOPTED);
    expect(article.textContent).toContain(PEER);
    expect(article.textContent).not.toContain("Heading");
    expect(marks.at(-1)).toMatchObject({ name: "document:input-ready" });
  } finally {
    page.dispose();
  }
}, 20_000);

test("an adoption that never arrives blocks with the timeout", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const { page, article, ownerOf } = await open({ edit: handEdit, writer: "other" });
  try {
    // The wait runs to the adoption bound itself: a writer that never lands the hand
    // edit must end the boot, not leave it waiting.
    expect(await until(() => page.status?.phase === "blocked", 2400)).toBe(true);
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "adoption-timeout" });
    expect(warn.mock.calls.map((call) => call.map(String).join(" ")).some((line) => /writer/.test(line))).toBe(true);
    // The wait released the view and the article came back from the room's state.
    expect(page.view.isDestroyed).toBe(true);
    expect(article.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(article.textContent.trim()).toBe("Hello");
    expect(ownerOf(article)).toBe(null);
    expect(editableNodes()).toBe(0);
    expect(marks.filter((entry) => entry.name === "document:input-ready")).toEqual([]);
  } finally {
    warn.mockRestore();
    page.dispose();
  }
}, 20_000);

test("a boot that ends while waiting leaves nothing running", async () => {
  const { page, article, ownerOf, registrations } = await open({ edit: handEdit, writer: "other" });
  try {
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);

    page.dispose();
    await page.ready;
    await flushAsync();

    expect(page.status).toBe(null);
    expect(article.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(article.textContent.trim()).toBe("Hello");
    expect(registrations.filter((entry) => entry.id === "page:live" && !entry.disposed)).toEqual([]);
    expect(ownerOf(article)).toBe(null);
    expect(editableNodes()).toBe(0);
  } finally {
    page.dispose();
  }
});
