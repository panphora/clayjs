/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import * as realTablePart from "../../../src/page/features/table.js";
import * as realMergeEngine from "../../../src/sync/merge-engine.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * One installation owns the page at a time. Every test here holds the boot at a
 * deferred boundary, starts a new installation, and only then lets the old promises
 * resolve: the result must be one mounted view, one owner, one save participant,
 * no old notice, no old input-ready mark and no timer left waiting. The exported
 * page object a caller captured before readiness keeps working.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const TABLE = {
  id: "tbl",
  t: "table",
  pos: "Z",
  cols: { c1: { pos: "1", name: "Name", kind: "text" } },
  rows: { r1: { pos: "1", cells: { c1: "A" } } },
};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flushAsync = async (turns = 40) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const until = async (check, tries = 300) => {
  for (let i = 0; i < tries; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const handEdit = (doc) => { doc.querySelector('article[data-page] [data-id="p"]').textContent = "Hello, edited by hand"; };

const marks = [];
const cleanups = [];
beforeEach(() => { marks.length = 0; });
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

async function open({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  edit = null,
  extensions = ["page"],
  metaGate = null,
  saveGate = null,
  roomGate = null,
  editorGate = null,
  tableGate = null,
  adoptGate = null,
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  if (edit) edit(document);

  const value = seedValue(BLOCKS);
  const saves = [];
  const sent = [];
  const registrations = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, conn: 0 };
  const roomState = () => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    conn: 0,
    stores: { page: { value: clone(value), ephemeral: false, last: 0, landed: 0 } },
  });

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => {
      if (metaGate) await metaGate.promise;
      return { spec: 1, extensions, document: null };
    },
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/core/save.js", () => ({
    savePageForce: async () => { saves.push(1); return saveGate ? saveGate.promise : { ok: true, msgType: "success" }; },
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
  // again: an install that is cancelled must not leave one behind.
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
      async send(clientId, frame) {
        sent.push(clone(frame));
        room.seq += 1;
        if (room.writer === null) room.writer = clientId;
        handlersRef.h?.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() { return roomState(); },
    }),
  }));

  // The two downloads this boot can lose, and the engine a hand edit waits for.
  await jest.unstable_mockModule("../../../src/page/editor.js", async () => {
    if (editorGate) await editorGate.promise;
    return realEditor;
  });
  await jest.unstable_mockModule("../../../src/page/features/table.js", async () => {
    if (tableGate) await tableGate.promise;
    return realTablePart;
  });
  await jest.unstable_mockModule("../../../src/sync/merge-engine.js", () => ({
    ...realMergeEngine,
    mergeEngine: async () => {
      if (adoptGate) await adoptGate.promise;
      return realMergeEngine.mergeEngine();
    },
  }));

  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  cleanups.push(() => document.removeEventListener("clay:page-save-state", onState));

  const liveCalls = [];
  const { live } = await import("../../../src/plugins/live.js");
  window.clay = {
    live: (name) => {
      liveCalls.push(name);
      if (name !== "page") return live(name);
      const handle = live(name);
      return roomGate ? { ready: roomGate.promise.then(() => handle.ready) } : handle;
    },
  };
  const { page } = await import("../../../src/plugins/page.js");
  const { ownerOf } = await import("../../../src/page/runtime-owner.js");
  return { page, ownerOf, saves, sent, states, registrations, liveCalls };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

// What the page must look like once the new installation has settled: one view,
// one owner, one participant, one input-ready mark, no stale notice or status.
async function expectSettled(page, { ownerOf, registrations, stable, since = 0 }) {
  const fresh = marks.slice(since);
  expect(page.status).toMatchObject({ phase: "ready", reason: null });
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
  expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
  expect(ownerOf(document.querySelector("article[data-page]"))).toBe("editor");
  expect(page.view).toBeTruthy();
  expect(page.view.editable).toBe(true);

  const inputReady = marks.filter((entry) => entry.name === "document:input-ready");
  expect(inputReady).toHaveLength(1);
  expect(inputReady[0].detail).toEqual({ installId: page.status.installId });
  expect(fresh.filter((entry) => entry.name === "document:input-ready")).toHaveLength(1);

  // No old notice and no waiting line: the settled boot left nothing of its own.
  expect(document.querySelectorAll("[data-clay-toast]")).toHaveLength(0);
  expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);

  const pageLive = registrations.filter((entry) => entry.id === "page:live");
  expect(pageLive.filter((entry) => !entry.disposed)).toHaveLength(1);

  // The object a caller captured before readiness is the same object, and it answers
  // for the page that is now on screen.
  expect(stable).toBe(page);
  expect(stable.view).toBe(page.view);
  expect(stable.status).toMatchObject({ phase: "ready" });
}

// A cancelled installation's delayed status must never appear: its timer goes with it.
async function expectNoLateStatus() {
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);
}

test("a boot cancelled while the shared metadata is out leaves the new one alone", async () => {
  const metaGate = deferred();
  const { page, ownerOf, registrations } = await open({ metaGate });
  const stable = page;
  const since = marks.length;

  const next = page.install();
  await flushAsync();
  metaGate.resolve();
  await next;
  await flushAsync();

  await expectSettled(page, { ownerOf, registrations, stable, since });
  await expectNoLateStatus();
  page.dispose();
});

test("a seeded boot writes nothing and joins no room, so a replacement owns the only editor", async () => {
  const { page, ownerOf, registrations, saves, liveCalls } = await open({
    head: "",
    extensions: ["page", "live-data"],
  });
  const stable = page;
  await flushAsync();
  await expect(page.ready).resolves.toBeTruthy();
  // The seed is staged in memory: no write and no room at entry.
  expect(saves).toEqual([]);
  expect(liveCalls).toEqual([]);
  expect(document.querySelectorAll('script[merge="page"]')).toHaveLength(0);

  const since = marks.length;
  const next = page.install();
  await flushAsync();
  await next;
  await flushAsync();

  expect(liveCalls).toEqual([]);
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
  expect(ownerOf(document.querySelector("article[data-page]"))).toBe("editor");
  // The replaced installation left no participant behind, and the page object a
  // caller holds answers for what is there now.
  expect(registrations.filter((entry) => !entry.disposed && entry.id === "page:live")).toHaveLength(1);
  const fresh = marks.slice(since).filter((entry) => entry.name === "document:input-ready");
  expect(fresh).toHaveLength(1);
  expect(fresh[0].detail?.installId).toBe(page.status.installId);
  expect(stable.status).toBe(page.status);
  page.dispose();
});

test("a boot cancelled while the room is joining mounts nothing from the old one", async () => {
  const roomGate = deferred();
  const { page, ownerOf, registrations } = await open({ roomGate });
  const stable = page;
  expect(await until(() => page.status.phase === "joining")).toBe(true);
  const since = marks.length;

  const next = page.install();
  await flushAsync();
  roomGate.resolve();
  await next;
  await flushAsync();

  await expectSettled(page, { ownerOf, registrations, stable, since });
  page.dispose();
});

test("a boot cancelled while the editor's code is still coming mounts no view", async () => {
  const editorGate = deferred();
  const { page, ownerOf, registrations } = await open({ editorGate });
  const stable = page;
  const since = marks.length;

  const next = page.install();
  await flushAsync();
  editorGate.resolve();
  await next;
  await flushAsync();

  await expectSettled(page, { ownerOf, registrations, stable, since });
  page.dispose();
});

test("a boot cancelled while a demanded view part is coming takes its editor with it", async () => {
  const value = seedValue([...BLOCKS, TABLE]);
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  const tableGate = deferred();
  const { page, ownerOf, registrations } = await open({
    head: tagHtml(value),
    html: `<article data-page="1" data-rev="${rev}">${html}</article>`,
    tableGate,
  });
  const stable = page;
  expect(await until(() => page.status.phase === "adopting")).toBe(true);
  // The old installation has its shell on screen and input still off.
  expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
  const since = marks.length;

  const next = page.install();
  await flushAsync();
  tableGate.resolve();
  await next;
  await flushAsync();

  await expectSettled(page, { ownerOf, registrations, stable, since });
  expect(page.view.state.doc.toString()).toContain("table");
  page.dispose();
});

test("a boot cancelled while adoption waits on the engine restores nothing from its view", async () => {
  const adoptGate = deferred();
  const { page, ownerOf, registrations } = await open({ edit: handEdit, adoptGate });
  const stable = page;
  expect(await until(() => page.status.phase === "adopting")).toBe(true);
  const since = marks.length;

  // The article is what the new installation reads; the old one already captured its
  // own source, so putting the file back changes nothing for it.
  document.querySelector('article[data-page] [data-id="p"]').textContent = "Hello";
  const next = page.install();
  await flushAsync();
  adoptGate.resolve();
  await next;
  await flushAsync();

  await expectSettled(page, { ownerOf, registrations, stable, since });
  expect(page.view.state.doc.child(0).textContent).toBe("Hello");
  page.dispose();
});
