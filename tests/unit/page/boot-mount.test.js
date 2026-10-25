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
import { createPageDoc, docOf, walk, bareShape } from "../../../src/page/ybind/index.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

/**
 * The shell is built out of the page, moved into the article in one go, and only
 * then, once adoption has landed, may it accept a key. A mount that fails leaves the
 * saved article exactly as it was; a long wait says so quietly; an adoption that
 * fails puts the article back from what the room accepted, never from the editor's
 * own DOM. After ready the first typed text is in Yjs and in the view at once.
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
const text = (page) => page.view.state.doc.child(0).textContent;

const marks = [];
const cleanups = [];
beforeEach(() => { marks.length = 0; });
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const MODE = { factory: "ok" };

async function open({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  edit = null,
  extensions = ["page"],
  room = "ok",
  writer = null,
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  if (edit) edit(document);
  MODE.factory = "ok";

  const value = seedValue(BLOCKS);
  const staged = [];
  const refreshed = [];
  const bindings = [];
  const handlersRef = { h: null };
  const roomGate = deferred();
  const roomState = () => ({
    epoch: "e1",
    seq: 0,
    writer,
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
    suspendAutosave: () => {},
    resumeAutosave: () => {},
    holdAllSaves: () => {},
    releaseAllSaves: () => {},
    getLastSavedDirty: () => false,
    setLastSavedBaselines: () => {},
    getLastSavedBytes: () => null,
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
      async send() { return { status: 200, body: { seq: 1, epoch: "e1" } }; },
      async fetchState() { return roomState(); },
    }),
  }));

  // The editor stages its shell in the mount it is given, so the fixture records
  // whether that mount was in the document, and whether the refresh that follows
  // the move ran with the shell attached.
  await jest.unstable_mockModule("../../../src/page/editor.js", () => ({
    ...realEditor,
    createPageEditor: (mount, options) => {
      staged.push({ connected: mount.isConnected });
      if (MODE.factory === "throw") {
        mount.appendChild(document.createElement("div")).className = "page-shell";
        throw new Error("the editor could not be built");
      }
      return realEditor.createPageEditor(mount, options);
    },
    refreshMountedView: (view) => {
      refreshed.push({ connected: view.dom.isConnected });
      return realEditor.refreshMountedView(view);
    },
  }));

  await jest.unstable_mockModule("../../../src/page/ybind/binding.js", () => ({
    ...realBinding,
    createYPageBinding: (options) => {
      const binding = realBinding.createYPageBinding(options);
      bindings.push(binding);
      return binding;
    },
  }));

  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  cleanups.push(() => document.removeEventListener("clay:page-save-state", onState));

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = {
    live: (name) => {
      if (name !== "page") return live(name);
      const handle = live(name);
      return room === "defer" ? { ready: roomGate.promise.then(() => handle.ready) } : handle;
    },
  };
  const article = document.querySelector("article[data-page]");
  const loaded = article.innerHTML;
  const { page } = await import("../../../src/plugins/page.js");
  const { ownerOf } = await import("../../../src/page/runtime-owner.js");
  return { page, ownerOf, article, loaded, staged, refreshed, bindings, roomGate, states };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const noInput = (page) => {
  expect(marks.filter((entry) => entry.name === "document:input-ready")).toEqual([]);
  expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  if (page.view) expect(page.view.editable).toBe(false);
};

const reload = (binding) => {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(binding.ydoc), NET);
  const pd = createPageDoc(doc);
  const result = docOf(pd, walk(pd));
  doc.destroy();
  return result;
};

const caret = (view, pos) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, pos)));
const type = (view, chars) => {
  for (const ch of chars) {
    const { from, to } = view.state.selection;
    view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
  }
};

test("the editor is built out of the page and moved in whole, then measured in place", async () => {
  const value = seedValue([...BLOCKS, TABLE]);
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  const { page, article, staged, refreshed } = await open({
    head: tagHtml(value),
    html: `<article data-page="1" data-rev="${rev}">${html}</article>`,
  });
  try {
    await page.ready;

    expect(page.status).toMatchObject({ phase: "ready" });
    // The shell was built in a detached element of the same document, so no half an
    // editor was ever on the page while it was being made.
    expect(staged).toEqual([{ connected: false }]);
    // The article element itself is the one that was on the page at boot.
    expect(document.querySelector("article[data-page]")).toBe(article);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
    expect(article.querySelectorAll(".page-shell")).toHaveLength(1);
    // One measurement pass, with the shell already in the article.
    expect(refreshed).toEqual([{ connected: true }]);
    expect(marks.at(-1)).toMatchObject({ name: "document:input-ready" });
  } finally {
    page.dispose();
  }
});

test("a mount that fails leaves the saved article untouched and the article free to claim", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { page, ownerOf, article, loaded } = await open();
    await page.ready;
    const before = loaded;
    marks.length = 0;
    MODE.factory = "throw";

    await page.install();
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "mount-failed" });
    expect(article.innerHTML).toBe(before);
    expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
    expect(document.querySelectorAll(".page-editor")).toHaveLength(0);
    expect(ownerOf(article)).toBe(null);
    noInput(page);

    // Nothing was left holding the article: the next installation mounts normally.
    MODE.factory = "ok";
    await page.install();
    await flushAsync();
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(ownerOf(article)).toBe("editor");
    page.dispose();
  } finally {
    quiet.mockRestore();
  }
});

test("a slow wait says so quietly after a moment, and a fast one never does", async () => {
  const { page, roomGate } = await open({ room: "defer" });
  try {
    // At first nothing is said: the saved article is on screen and that is enough.
    expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);
    expect(await until(() => document.querySelectorAll(".page-boot-status").length === 1)).toBe(true);

    const note = document.querySelector(".page-boot-status");
    expect(note.getAttribute("clay")).toBe("editor-ui");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toBe("Loading the editor\u2026");
    // The saved article is still there under it, and nothing takes input.
    expect(document.querySelector('article[data-page] [data-id="p"]')).toBeTruthy();
    noInput(page);

    roomGate.resolve();
    await page.ready;
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);

    // A boot that settles inside the moment leaves no waiting line behind, now or
    // a moment later.
    await page.install();
    await flushAsync();
    expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);
    page.dispose();
  } finally {
    page.dispose();
  }
});

test("an adoption another tab owns keeps this tab's staged view until the writer lands it", async () => {
  const { page, ownerOf, article } = await open({ edit: handEdit, writer: "other", extensions: ["page", "live-data"] });
  try {
    // Waiting for the elected writer, not blocked: the staged editor is in the
    // article over the room's state, and it takes no key.
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "adopting" });
    expect(page.view.isDestroyed).toBe(false);
    expect(article.textContent).toContain("Hello");
    expect(article.textContent).not.toContain("edited by hand");
    expect(article.querySelectorAll(".page-shell")).toHaveLength(1);
    expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
    expect(document.querySelectorAll(".page-boot-status")).toHaveLength(0);
    // The view is still this tab's, so the article goes with it if the boot ends.
    expect(ownerOf(article)).toBe("editor");
    noInput(page);
  } finally {
    page.dispose();
  }
});

test("after ready the first typed text is in Yjs and the view at once, and Undo takes only it", async () => {
  const { page, bindings } = await open();
  try {
    await page.ready;
    const binding = bindings.at(-1);
    expect(binding).toBeTruthy();
    expect(page.view.editable).toBe(true);

    caret(page.view, 6);
    type(page.view, "!");
    await flushAsync();

    expect(text(page)).toBe("Hello!");
    expect(page.view.dom.textContent).toContain("Hello!");
    expect(bareShape(reload(binding))).toBe(bareShape(page.view.state.doc));
    expect(binding.stats.mismatch).toBe(0);

    expect(binding.undo()).toBe(true);
    await flushAsync();
    expect(text(page)).toBe("Hello");
    expect(bareShape(reload(binding))).toBe(bareShape(page.view.state.doc));
    expect(binding.stats.mismatch).toBe(0);
    expect(binding.undo()).toBe(false);
  } finally {
    page.dispose();
  }
});
