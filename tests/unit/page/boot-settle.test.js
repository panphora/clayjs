/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { createInstall, disposeInstall, runBoot } from "../../../src/page/boot.js";

/**
 * A boot settles on its first failure or on its dispose, not on the last branch to
 * answer: an editor download that failed blocks the page while the room join is still
 * unanswered, and a disposed installation releases the boot it left waiting. A seeded
 * document's generated tag belongs to its first save, so a boot that ends before that
 * save leaves none behind and a replacement waits for that save's outcome instead of
 * joining the room on the strength of a tag the file does not have.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flushAsync = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
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
const seedTags = () => document.querySelectorAll('script[type="application/json"][merge="page"]');

const marks = [];
const cleanups = [];
beforeEach(() => { marks.length = 0; });
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const steps = (overrides) => ({
  readSource: () => ({ ok: true, source: {} }),
  loadEditorAssets: () => Promise.resolve({ ok: true }),
  prepareAuthority: () => Promise.resolve({ ok: true }),
  mountAndAttach: () => ({ ok: true, view: {} }),
  adoptSource: async () => ({ ok: true }),
  enableInput: async () => ({ ok: true }),
  ...overrides,
});

test("a failed editor import settles the boot without waiting for an unanswered room join", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const inst = createInstall();
    let settled = false;
    runBoot(inst, steps({
      loadEditorAssets: async () => ({ ok: false, reason: "editor-assets-failed" }),
      prepareAuthority: () => new Promise(() => {}),
    })).then(() => { settled = true; });
    await flushAsync();

    expect(inst.result.phase).toBe("blocked");
    expect(inst.result.reason).toBe("editor-assets-failed");
    expect(settled).toBe(true);
    expect(inst.controller.signal.aborted).toBe(true);
  } finally {
    quiet.mockRestore();
  }
});

test("disposing a boot releases readiness even if a branch never answers", async () => {
  const inst = createInstall();
  let settled = false;
  runBoot(inst, steps({ prepareAuthority: () => new Promise(() => {}) })).then(() => { settled = true; });
  await flushAsync();

  expect(settled).toBe(false);
  disposeInstall(inst);
  await flushAsync();

  expect(inst.controller.signal.aborted).toBe(true);
  expect(settled).toBe(true);
});

async function open({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  extensions = ["page"],
  editorGate = null,
  saveGate = null,
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const value = seedValue(BLOCKS);
  const saves = [];
  const registrations = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, conn: 0 };
  const roomState = () => ({
    epoch: room.epoch,
    seq: room.seq,
    writer: room.writer,
    conn: 0,
    stores: { page: { value: pageValue(), ephemeral: false, last: 0, landed: 0 } },
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

  // Every save participant this boot registers, and whether it was taken away again.
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

  // The download this boot can lose, held and then lost.
  const editor = { state: "ok" };
  await jest.unstable_mockModule("../../../src/page/editor.js", async () => {
    if (editorGate) await editorGate.promise;
    if (editor.state === "throw") throw new Error("the editor's code did not arrive");
    return realEditor;
  });

  // The page store this fake room holds is the one the document states: a seeded page's
  // tag is the seed its first save writes, so the room carries that. Read after the
  // mocks above are in place, the way the boot reads it.
  const { readFile } = await import("../../../src/page/adopt-boot.js");
  const { seedPageFromArticle } = await import("../../../src/page/ybind/migrate.js");
  const pageValue = () => {
    const tag = seedTags()[0];
    if (tag) return JSON.parse(tag.textContent);
    return clone(seedPageFromArticle(readFile(document).article));
  };

  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  cleanups.push(() => document.removeEventListener("clay:page-save-state", onState));

  const liveCalls = [];
  const { live } = await import("../../../src/plugins/live.js");
  window.clay = {
    live: (name) => {
      liveCalls.push(name);
      return live(name);
    },
  };
  const { page } = await import("../../../src/plugins/page.js");
  const { ownerOf } = await import("../../../src/page/runtime-owner.js");
  return { page, ownerOf, saves, states, registrations, liveCalls, editor };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("a blocked boot releases the room the other branch had already taken", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const editorGate = deferred();
  const { page, ownerOf, registrations, liveCalls, editor } = await open({ editorGate });
  try {
    // The room is joined and its participant registered while the editor is still
    // coming, so what the failure below has to release is already there.
    expect(await until(() => registrations.some((entry) => entry.id === "page:live"))).toBe(true);
    expect(page.status).toMatchObject({ phase: "joining" });
    expect(liveCalls).toEqual(["page"]);

    editor.state = "throw";
    editorGate.resolve();
    const result = await page.ready;
    await flushAsync();

    expect(result).toMatchObject({ phase: "blocked", reason: "editor-assets-failed" });
    expect(page.view).toBe(null);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(registrations.filter((entry) => entry.id === "page:live" && !entry.disposed)).toEqual([]);
    expect(ownerOf(document.querySelector("article[data-page]"))).toBe(null);
    expect(marks.filter((entry) => entry.name === "document:input-ready")).toEqual([]);
  } finally {
    page.dispose();
    quiet.mockRestore();
  }
});

test("a replacement install of a seeded page stages its own store and leaves no tag behind", async () => {
  const { page, saves, liveCalls } = await open({ head: "", extensions: ["page", "live-data"] });
  try {
    await page.ready;
    expect(saves).toEqual([]);
    expect(liveCalls).toEqual([]);
    expect(seedTags()).toHaveLength(0);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);

    const result = await page.install();
    await flushAsync();

    // The replacement reads a tagless page again and stages its own seed: nothing is
    // written, no room is joined, and one editor owns the article.
    expect(result).toMatchObject({ phase: "ready", reason: null });
    expect(saves).toEqual([]);
    expect(liveCalls).toEqual([]);
    expect(seedTags()).toHaveLength(0);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  } finally {
    page.dispose();
  }
});
