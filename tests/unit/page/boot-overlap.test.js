/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as realEditor from "../../../src/page/editor.js";
import * as realTablePart from "../../../src/page/features/table.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { createInstall, disposeInstall, runBoot } from "../../../src/page/boot.js";

/**
 * The edit boot fetches the editor's code while it prepares authority, so time to
 * input is the longer of the two branches plus adoption. The coordinator tests hold
 * each branch with a deferred promise: the assets branch cannot settle before the
 * authority branch has begun, and nothing mounts, adopts or takes input until both
 * are in. The plugin tests read the same boundary from the outside: the saved article
 * stays on screen, nothing is editable and no view exists while the room is still
 * joining, and a seeded document joins only after its forced first save lands.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const TABLE = {
  id: "tbl",
  t: "table",
  pos: "Z",
  cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "A", c2: "10" } } },
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

const marks = [];
beforeEach(() => {
  marks.length = 0;
});
Object.defineProperty(globalThis.performance, "mark", {
  configurable: true,
  writable: true,
  value: (name, options) => { marks.push({ name, detail: options?.detail }); },
});
afterAll(() => { delete globalThis.performance.mark; });

const markNames = () => marks.map((entry) => entry.name);

// ---- the coordinator, with a deferred promise on each branch -------------------

function coordinator(overrides = {}) {
  const record = [];
  const assets = deferred();
  const authority = deferred();
  const authorityStarted = deferred();
  const steps = {
    readSource: () => { record.push("read"); return { ok: true, source: { blocks: { p: BLOCKS[0] } } }; },
    // The editor's code is only answered once authority has begun: a boot that took
    // the branches one after the other would never finish this test.
    loadEditorAssets: () => { record.push("assets"); return authorityStarted.promise.then(() => assets.promise); },
    prepareAuthority: () => { record.push("authority"); authorityStarted.resolve(); return authority.promise; },
    mountAndAttach: () => { record.push("mount"); return { ok: true, view: {} }; },
    adoptSource: async () => { record.push("adopt"); return { ok: true }; },
    enableInput: async () => { record.push("enable"); return { ok: true }; },
    ...overrides,
  };
  const phases = [];
  const inst = createInstall({ onPhase: (result) => phases.push(result) });
  return { inst, steps, record, assets, authority, phases };
}

test("the editor's code and the room join run beside each other, and adoption follows the longer one", async () => {
  const { inst, steps, record, assets, authority, phases } = coordinator();
  const boot = runBoot(inst, steps);
  await flushAsync();

  // Both branches are in flight before either settles; nothing has mounted.
  expect(record).toEqual(["read", "assets", "authority"]);
  expect(inst.phase).toBe("joining");

  authority.resolve({ ok: true, store: {} });
  await flushAsync();
  expect(record).toEqual(["read", "assets", "authority"]);
  expect(markNames()).toEqual(["document:boot", "document:authority-ready"]);

  assets.resolve({ ok: true, editor: () => ({}) });
  const result = await boot;

  expect(record).toEqual(["read", "assets", "authority", "mount", "adopt", "enable"]);
  expect(result).toMatchObject({ phase: "ready", reason: null });
  expect(markNames()).toEqual(["document:boot", "document:authority-ready", "document:assets-ready", "document:input-ready"]);
  for (const entry of marks) expect(entry.detail).toEqual({ installId: inst.installId });
  expect(phases.map((phase) => phase.phase)).toEqual(["loading", "joining", "adopting", "ready"]);
});

test("the reverse order waits the same way: assets first, then authority, then the mount", async () => {
  const { inst, steps, record, assets, authority } = coordinator();
  const boot = runBoot(inst, steps);
  await flushAsync();

  assets.resolve({ ok: true, editor: () => ({}) });
  await flushAsync();
  expect(record).toEqual(["read", "assets", "authority"]);
  expect(markNames()).toEqual(["document:boot", "document:assets-ready"]);
  expect(inst.phase).toBe("joining");

  authority.resolve({ ok: true, store: {} });
  await flushAsync();
  expect(record).toEqual(["read", "assets", "authority", "mount", "adopt", "enable"]);
  expect((await boot).phase).toBe("ready");
  expect(markNames()).toEqual(["document:boot", "document:assets-ready", "document:authority-ready", "document:input-ready"]);
});

test("a failed editor import blocks the boot and mounts nothing, even as authority arrives", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { inst, steps, record, assets, authority } = coordinator();
    const boot = runBoot(inst, steps);
    await flushAsync();

    assets.reject(new Error("the editor's code did not arrive"));
    await flushAsync();
    authority.resolve({ ok: true, store: {} });
    const result = await boot;

    expect(result).toMatchObject({ phase: "blocked", reason: "editor-assets-failed" });
    expect(record).toEqual(["read", "assets", "authority"]);
    expect(markNames()).not.toContain("document:assets-ready");
    expect(markNames()).not.toContain("document:input-ready");
    expect(quiet).toHaveBeenCalled();
  } finally {
    quiet.mockRestore();
  }
});

test("a failed room join blocks the boot, and the assets that arrive after it mount nothing", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { inst, steps, record, assets, authority } = coordinator();
    const boot = runBoot(inst, steps);
    await flushAsync();

    authority.reject(new Error("the room threw"));
    await flushAsync();
    expect(record).toEqual(["read", "assets", "authority"]);

    assets.resolve({ ok: true, editor: () => ({}) });
    const result = await boot;

    expect(result).toMatchObject({ phase: "blocked", reason: "authority-failed" });
    expect(record).toEqual(["read", "assets", "authority"]);
    expect(markNames()).not.toContain("document:authority-ready");
    expect(markNames()).not.toContain("document:input-ready");
    expect(quiet).toHaveBeenCalled();
  } finally {
    quiet.mockRestore();
  }
});

test("a boot disposed while both branches are out mounts nothing and marks nothing", async () => {
  const { inst, steps, record, assets, authority } = coordinator();
  const boot = runBoot(inst, steps);
  await flushAsync();
  expect(record).toEqual(["read", "assets", "authority"]);

  inst.disposed = true;
  assets.resolve({ ok: true, editor: () => ({}) });
  authority.resolve({ ok: true, store: {} });

  expect(await boot).toBe(null);
  await flushAsync();
  expect(record).toEqual(["read", "assets", "authority"]);
  expect(markNames()).not.toContain("document:assets-ready");
  expect(markNames()).not.toContain("document:authority-ready");
  expect(markNames()).not.toContain("document:input-ready");
});

// ---- the plugin, read from the outside ----------------------------------------

const cleanups = [];
const liveCalls = [];
const MODE = { editor: "ok", tablePart: "ok", tableGate: null, editorGate: null, editorDone: false };

function expectNoInput(page) {
  expect(markNames()).not.toContain("document:input-ready");
  expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(0);
  expect(page.view).toBe(null);
}

async function load({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  edit = null,
  extensions = ["page"],
  saveAnswer = () => ({ ok: true, msgType: "success" }),
  saveGate = null,
  room = "ok",
  editor = "ok",
  tablePart = "ok",
  tableGate = null,
  editorGate = null,
  livePage = "ok",
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  if (edit) edit(document);
  liveCalls.length = 0;
  MODE.editor = editor;
  MODE.tablePart = tablePart;
  MODE.tableGate = tableGate;
  MODE.editorGate = editorGate;
  MODE.editorDone = false;

  const value = seedValue(BLOCKS);
  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const roomGate = deferred();
  const roomState = () => ({
    epoch: "e1",
    seq: 0,
    writer: null,
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
    savePageForce: async () => { saves.push(1); return saveGate ? saveGate.promise : saveAnswer(); },
    savePage: async () => ({ ok: true, msgType: "success" }),
    savePageThrottled: () => {},
    baselineSettled: () => true,
    isSaveConflicted: () => false,
    autosaveIsSuspended: () => false,
    suspendAutosave: () => ({}),
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
      async send(clientId, frame) {
        sent.push(clone(frame));
        return { status: 200, body: { seq: 1, epoch: "e1" } };
      },
      async fetchState() { return roomState(); },
    }),
  }));

  // The editor and the table part are the two downloads this boot can lose. The
  // factory is the only place a test can hold one, so it reads the mode it was given.
  await jest.unstable_mockModule("../../../src/page/editor.js", async () => {
    if (MODE.editor === "throw") throw new Error("the editor's code did not arrive");
    if (MODE.editorGate) await MODE.editorGate.promise;
    MODE.editorDone = true;
    return realEditor;
  });
  await jest.unstable_mockModule("../../../src/page/features/table.js", async () => {
    if (MODE.tablePart === "throw") throw new Error("the table part did not arrive");
    if (MODE.tableGate) await MODE.tableGate.promise;
    return realTablePart;
  });

  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  cleanups.push(() => document.removeEventListener("clay:page-save-state", onState));

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = {
    live: (name) => {
      liveCalls.push(name);
      if (name !== "page") return live(name);
      if (livePage === "reject-ready") return { ready: Promise.reject(new Error("the room refused the join")) };
      const handle = live(name);
      if (room !== "defer") return handle;
      // The join has begun (the store and its lane are open); this tab has not been
      // told it may proceed.
      return { ready: roomGate.promise.then(() => handle.ready) };
    },
  };
  // A state read the room answers with a different epoch is taken whole, the way a
  // rejoin that finds the page rewritten does.
  const { page, createSteps } = await import("../../../src/plugins/page.js");
  return { page, createSteps, saves, sent, states, roomGate };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("while the room is still joining, the saved article stays and nothing is editable", async () => {
  const { page, roomGate } = await load({ room: "defer" });
  try {
    // The editor's code arrived and was accepted while the room was still joining.
    expect(await until(() => markNames().includes("document:assets-ready"))).toBe(true);
    expect(liveCalls).toEqual(["page"]);
    expect(markNames()).not.toContain("document:authority-ready");
    expect(page.status).toMatchObject({ phase: "joining" });
    expect(document.querySelector('article[data-page] [data-id="p"]')).toBeTruthy();
    expectNoInput(page);

    roomGate.resolve();
    await page.ready;
    expect(page.status).toMatchObject({ phase: "ready", reason: null });
    expect(page.view.editable).toBe(true);
    expect(markNames().at(-1)).toBe("document:input-ready");
  } finally {
    page.dispose();
  }
});

test("a seeded document stages its seed in memory and opens no room", async () => {
  const { page, saves, sent } = await load({ head: "", extensions: ["page", "live-data"] });
  try {
    await page.ready;

    // Nothing of the boot writes: the seed is a value this tab holds, the article
    // stays on screen until the editor replaces it, and no room is joined.
    expect(saves).toEqual([]);
    expect(sent).toEqual([]);
    expect(liveCalls).toEqual([]);
    expect(markNames()).toContain("document:authority-ready");
    expect(markNames()).toContain("document:input-ready");
    expect(document.querySelectorAll('script[merge="page"]')).toHaveLength(0);
    expect(page.view.editable).toBe(true);
  } finally {
    page.dispose();
  }
});

test("an editor that never arrives blocks with the saved article kept and nothing editable", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({ editor: "throw" });
    await page.ready;

    expect(page.status).toMatchObject({ phase: "blocked", reason: "editor-assets-failed" });
    expect(document.querySelector('article[data-page] [data-id="p"]')).toBeTruthy();
    expect(markNames()).not.toContain("document:assets-ready");
    expectNoInput(page);
    page.dispose();
  } finally {
    warn.mockRestore();
    quiet.mockRestore();
  }
});

test("an optional part that never arrives keeps the text editor usable on its plain fallback", async () => {
  const value = seedValue([...BLOCKS, TABLE]);
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({
      head: tagHtml(value),
      html: `<article data-page="1" data-rev="${rev}">${html}</article>`,
      tablePart: "throw",
    });
    await page.ready;

    expect(page.status).toMatchObject({ phase: "ready" });
    expect(page.view.editable).toBe(true);
    expect(page.view.state.doc.toString()).toContain("table");
    expect(document.querySelector("table")).toBeTruthy();
    expect(document.querySelector(".page-table")).toBe(null);
    expect(markNames().at(-1)).toBe("document:input-ready");
    page.dispose();
  } finally {
    warn.mockRestore();
    quiet.mockRestore();
  }
});

test("the view part the saved article asks for is fetched with the editor and drawn at mount", async () => {
  const value = seedValue([...BLOCKS, TABLE]);
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  const tableGate = deferred();
  const { page } = await load({
    head: tagHtml(value),
    html: `<article data-page="1" data-rev="${rev}">${html}</article>`,
    tableGate,
  });
  try {
    // The part is still on the wire: the editor must not mount on a document whose
    // view parts are missing, and the saved article is what a person still sees.
    expect(await until(() => liveCalls.includes("page"))).toBe(true);
    expect(page.status).toMatchObject({ phase: "joining" });
    expect(document.querySelector(".page-editor")).toBe(null);
    expect(document.querySelector('article[data-page] [data-id="p"]')).toBeTruthy();

    tableGate.resolve();
    await page.ready;
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(document.querySelector(".page-table")).toBeTruthy();
    expect(page.view.editable).toBe(true);
  } finally {
    page.dispose();
  }
});

test("an empty page.tools tag on a text document asks the tools store for nothing", async () => {
  const tools = '<script type="application/json" merge="page.tools" clay="live">{}</script>';
  const { page } = await load({ head: tagHtml(seedValue(BLOCKS)) + tools });
  try {
    await page.ready;
    expect(page.status).toMatchObject({ phase: "ready" });
    expect(liveCalls).toEqual(["page"]);
  } finally {
    page.dispose();
  }
});

// ---- the page's own steps, driven directly ------------------------------------

test("the room join is asked for while the editor's code is still arriving", async () => {
  const editorGate = deferred();
  // The plugin starts a boot of its own as it evaluates. An empty document settles that
  // one before the steps below are built, so the two never share a page.
  const { page, createSteps } = await load({ html: "", head: "", editorGate });
  await page.ready;
  page.dispose();
  document.head.innerHTML = tagHtml(seedValue(BLOCKS));
  document.body.innerHTML = articleHtml();
  liveCalls.length = 0;
  MODE.editorDone = false;
  const inst = { ...createInstall({ gen: 1 }), listeners: [] };
  const boot = runBoot(inst, createSteps(inst, {}));
  try {
    // The join is asked for while the editor's code is still on the wire: the tag was
    // read without it, so the room answers before the editor ever evaluates.
    expect(await until(() => liveCalls.includes("page"))).toBe(true);
    expect(MODE.editorDone).toBe(false);
    expect(inst.phase).toBe("joining");
    expect(markNames()).not.toContain("document:assets-ready");
    expect(document.querySelector(".page-editor")).toBe(null);
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
    expect(inst.view ?? null).toBe(null);

    editorGate.resolve();
    expect(await boot).toMatchObject({ phase: "ready" });
    expect(MODE.editorDone).toBe(true);
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
  } finally {
    disposeInstall(inst);
  }
});
