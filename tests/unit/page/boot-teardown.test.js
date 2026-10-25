/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import * as realBinding from "../../../src/page/ybind/binding.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { NET } from "../../../src/page/ybind/layout.js";

/**
 * A boot that ends without an editor owns nothing and leaves nothing running: the
 * binding, its unsaved participant, the adoption and replacement listeners, the
 * recovery subscription and the article claim all go with the view. An article
 * another runtime claimed is never rewritten, and a boot that fails says it failed
 * through page.status rather than through nothing at all.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };

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

const MODE = { refresh: "ok" };

async function open({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  edit = null,
  extensions = ["page"],
  writer = null,
  readerOwns = false,
  holdFails = false,
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  if (edit) edit(document);
  MODE.refresh = "ok";

  const value = seedValue(BLOCKS);
  const registrations = [];
  const bindings = [];
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
    savePageForce: async () => ({ ok: true, msgType: "success" }),
    savePage: async () => ({ ok: true, msgType: "success" }),
    savePageThrottled: () => {},
    baselineSettled: () => true,
    isSaveConflicted: () => false,
    autosaveIsSuspended: () => false,
    suspendAutosave: () => { if (holdFails) throw new Error("autosave hold failed"); },
    resumeAutosave: () => {},
    holdAllSaves: () => {},
    releaseAllSaves: () => {},
    getLastSavedDirty: () => false,
    setLastSavedBaselines: () => {},
    getLastSavedBytes: () => null,
  }));

  // Every save participant this boot registers, and whether it was taken away
  // again: a boot that ends without an editor must not leave one behind.
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

  // The view a boot mounts can fail after it is in the article, which is an error
  // rather than a blocked outcome.
  await jest.unstable_mockModule("../../../src/page/editor.js", () => ({
    ...realEditor,
    refreshMountedView: (view) => {
      if (MODE.refresh === "throw") throw new Error("the mounted view could not be measured");
      return realEditor.refreshMountedView(view);
    },
  }));

  // Each binding keeps the state it started from, so a peer edit can be built for
  // it after the boot that made it has ended.
  await jest.unstable_mockModule("../../../src/page/ybind/binding.js", () => ({
    ...realBinding,
    createYPageBinding: (options) => {
      const binding = realBinding.createYPageBinding(options);
      bindings.push({ binding, state: Y.encodeStateAsUpdateV2(binding.ydoc) });
      return binding;
    },
  }));

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name) };
  const article = document.querySelector("article[data-page]");
  const { claim, ownerOf } = await import("../../../src/page/runtime-owner.js");
  let release = null;
  if (readerOwns) {
    release = claim(article, "reader");
    article.innerHTML = '<div class="page-shell"><p>Current owner content</p></div>';
  }
  const { page } = await import("../../../src/plugins/page.js");

  // A peer's page update, through the room the way one arrives.
  const frame = (key, update) => {
    room.seq += 1;
    handlersRef.h.frame({
      epoch: room.epoch, seq: room.seq, name: "page", from: "other", n: room.seq,
      ops: [{ op: "set", path: ["y", key], value: Y.toBase64(update) }],
    });
  };
  return { page, article, ownerOf, registrations, bindings, frame, release };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const errors = (spy) => spy.mock.calls.map((call) => call.map(String).join(" "));
const noInput = (page) => {
  expect(marks.filter((entry) => entry.name === "document:input-ready")).toEqual([]);
  expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  if (page.view) expect(page.view.editable).toBe(false);
};

test("a failed adoption gives up the binding, its subscriptions and the article claim", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const { page, article, ownerOf, registrations, bindings, frame } = await open({
    edit: handEdit,
    holdFails: true,
    extensions: ["page", "live-data"],
  });
  try {
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "adoption-error" });
    expect(page.view.isDestroyed).toBe(true);
    expect(article.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(article.textContent.trim()).toBe("Hello");
    // The save participant and the claim went with the view.
    expect(registrations.filter((entry) => entry.id === "page:live" && !entry.disposed)).toEqual([]);
    expect(ownerOf(article)).toBe(null);
    noInput(page);

    // A peer update the room delivers afterwards reaches nothing: the binding is
    // detached and its document destroyed, so nothing renders into a dead view.
    const { state } = bindings.at(-1);
    const base = new Y.Doc();
    Y.applyUpdateV2(base, state, NET);
    const peer = new Y.Doc();
    Y.applyUpdateV2(peer, state, NET);
    const flow = peer.getText("flow");
    flow.insert(flow.length, ", edited by hand");
    const update = Y.encodeStateAsUpdateV2(peer, Y.encodeStateVector(base));
    expect(() => frame("remote-adoption", update)).not.toThrow();
    await flushAsync();
    peer.destroy();
    base.destroy();
    expect(errors(quiet).filter((line) => /rebase listener threw|matchesNode/.test(line))).toEqual([]);

    // The replacement listener went too: a sync frame cannot set a notice over an
    // article this tab no longer owns.
    document.dispatchEvent(new CustomEvent("clay:sync-applied", {
      detail: { html: '<!DOCTYPE html><html><head></head><body><article data-page="1" data-rev="zzz"><p>Someone replaced this page</p></article></body></html>' },
    }));
    await flushAsync();
    expect(document.body.textContent).not.toContain("changed outside the editor");
    expect(article.textContent.trim()).toBe("Hello");
    page.dispose();
  } finally {
    quiet.mockRestore();
  }
});

test("a refused article claim leaves the owner's article as it is and says so", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const { page, article, ownerOf, release } = await open({ edit: handEdit, readerOwns: true });
  try {
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "article-owned" });
    // The runtime that held the article keeps it, and what it mounted is untouched.
    expect(ownerOf(article)).toBe("reader");
    expect(article.textContent).toBe("Current owner content");
    expect(article.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(document.querySelectorAll(".page-editor")).toHaveLength(0);
    noInput(page);
    page.dispose();
    expect(ownerOf(article)).toBe("reader");
  } finally {
    release();
    quiet.mockRestore();
  }
});

test("a boot that fails after the join reports the error phase, never nothing", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const { page, article } = await open();
  try {
    MODE.refresh = "throw";
    const result = await page.install();
    await flushAsync();

    expect(result).toMatchObject({ phase: "error", reason: "boot-failed" });
    expect(page.status).toMatchObject({ phase: "error", reason: "boot-failed" });
    expect(article.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(article.textContent.trim()).toBe("Hello");
    noInput(page);
  } finally {
    page.dispose();
    quiet.mockRestore();
  }
});
