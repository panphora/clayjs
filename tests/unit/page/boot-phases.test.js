/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * The edit boot is one coordinator with named steps and one owner per
 * installation. It reports loading, joining, adopting and ready, or stops
 * blocked with the reason that stopped it. Every failure in the table below
 * ends with no input-ready mark and nothing a person could type into.
 */

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const until = async (check, tries = 400) => {
  for (let i = 0; i < tries; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

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

// No input-ready and nothing editable: the two things every blocked row must
// leave behind it.
function expectNoInput(page, seen = marks) {
  expect(seen.filter((entry) => entry.name === "document:input-ready")).toEqual([]);
  expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  if (page.view) expect(page.view.editable).toBe(false);
  else expect(document.querySelectorAll(".page-editor")).toHaveLength(0);
}

async function load({
  html = articleHtml(),
  head = tagHtml(seedValue(BLOCKS)),
  edit = null,
  extensions = ["page"],
  saveAnswer = () => ({ ok: true, msgType: "success" }),
  livePage = "ok",
  writer = null,
  holdFails = false,
  onPhase = null,
} = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.head.innerHTML = head;
  document.body.innerHTML = html;
  if (edit) edit(document);

  const value = seedValue(BLOCKS);
  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer, conn: 0, stores: {} };
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
    savePageForce: async () => { saves.push(1); return saveAnswer(); },
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

  // The boot starts while the modules import, so a state listener has to be in
  // place before that.
  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  cleanups.push(() => document.removeEventListener("clay:page-save-state", onState));

  const { live } = await import("../../../src/plugins/live.js");
  window.clay = {
    live: (name) => {
      if (name !== "page") return live(name);
      if (livePage === "throw") throw new Error('this page has no <script merge="page" clay="live"> tag');
      if (livePage === "reject-ready") return { ready: Promise.reject(new Error("the room refused the join")) };
      return live(name);
    },
  };
  const { page } = await import("../../../src/plugins/page.js");
  return { page, saves, sent, states };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("boot reports loading, joining, adopting and ready, and marks input-ready last", async () => {
  const { page } = await load();
  await page.ready;
  marks.length = 0;
  const phases = [];
  await page.install({ onPhase: (result) => phases.push(result) });
  await flushAsync();

  expect(phases.map((result) => result.phase)).toEqual(["loading", "joining", "adopting", "ready"]);
  expect(phases.map((result) => result.reason)).toEqual([null, null, null, null]);
  expect(new Set(phases.map((result) => result.installId)).size).toBe(1);
  expect(page.status).toMatchObject({ phase: "ready", reason: null });
  expect(page.view.editable).toBe(true);

  const names = marks.map((entry) => entry.name);
  expect(names[0]).toBe("document:boot");
  expect(names).toContain("document:authority-ready");
  expect(names.at(-1)).toBe("document:input-ready");
  expect(marks.at(-1).detail).toEqual({ installId: page.status.installId });
  page.dispose();
});

test("a throwing phase callback cannot break admission", async () => {
  const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { page } = await load();
    await page.ready;
    await page.install({ onPhase: () => { throw new Error("callback exploded"); } });
    await flushAsync();

    expect(page.status.phase).toBe("ready");
    expect(page.view.editable).toBe(true);
    expect(quiet).toHaveBeenCalled();
    page.dispose();
  } finally {
    quiet.mockRestore();
  }
});

test("every install owns its own id and status", async () => {
  const { page } = await load();
  await page.ready;
  const first = page.status;
  expect(first.phase).toBe("ready");

  await page.install();
  const second = page.status;
  expect(second.phase).toBe("ready");
  expect(second.installId).toBeGreaterThan(first.installId);
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  page.dispose();
});

test("invalid or multiple articles leave the saved HTML and no editable surface", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const many = await load({ html: articleHtml() + articleHtml() });
    await many.page.ready;
    await flushAsync();
    expect(many.page.status).toMatchObject({ phase: "blocked", reason: "ambiguous-page" });
    expect(many.page.view).toBe(null);
    expect(document.querySelectorAll("article[data-page]")).toHaveLength(2);
    expectNoInput(many.page);
    many.page.dispose();

    marks.length = 0;
    const none = await load({ html: "", head: "" });
    await none.page.ready;
    await flushAsync();
    expect(none.page.status).toMatchObject({ phase: "blocked", reason: "no-page" });
    expect(none.page.view).toBe(null);
    expectNoInput(none.page);
    none.page.dispose();
  } finally {
    warn.mockRestore();
  }
});

test("a page tag that is not JSON blocks with no editable surface", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({ head: '<script type="application/json" merge="page" clay="live">{oops</script>' });
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "invalid-page-json" });
    expect(page.view).toBe(null);
    expectNoInput(page);
    page.dispose();
  } finally {
    warn.mockRestore();
  }
});

test("a page tag in an unsupported format blocks with no editable surface", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const legacy = { blocks: { p: { t: "paragraph", pos: "1", c: "Hello" } }, deleted: {} };
    const html = renderFromTags([JSON.stringify(legacy)]);
    const { page } = await load({
      head: tagHtml(legacy),
      html: `<article data-page="1" data-rev="${html.rev}">${html.html}</article>`,
    });
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "unsupported-page-format" });
    expect(page.view).toBe(null);
    expectNoInput(page);
    page.dispose();
  } finally {
    warn.mockRestore();
  }
});

test("a host without the page capability blocks and reports it", async () => {
  const { page, states } = await load({ extensions: [] });
  try {
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "missing-capability" });
    expect(page.view).toBe(null);
    expect(states.at(-1)).toEqual({ state: "blocked", code: "unsupported-host", message: "This host does not support page editing" });
    expectNoInput(page);
  } finally {
    page.dispose();
  }
});

test("a tagless page on a live-data host writes nothing at boot and opens no room", async () => {
  const { page, saves, sent, states } = await load({ head: "", extensions: ["page", "live-data"] });
  try {
    await page.ready;
    await flushAsync();

    // The seed is staged in memory: no write, no frame, no room, and the editor is
    // the thing that is ready, not a page waiting for its first save.
    expect(saves).toEqual([]);
    expect(sent).toEqual([]);
    expect(page.status).toMatchObject({ phase: "ready", reason: null });
    expect(page.view.editable).toBe(true);
    expect(document.querySelectorAll('script[merge="page"]')).toHaveLength(0);
    expect(states).toEqual([]);
  } finally {
    page.dispose();
  }
});

test("a page with no live store blocks without mounting", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({ livePage: "throw" });
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "missing-page-store" });
    expect(page.view).toBe(null);
    expectNoInput(page);
    page.dispose();
  } finally {
    warn.mockRestore();
  }
});

test("a room that refuses the join blocks without mounting", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { page } = await load({ livePage: "reject-ready" });
    await page.ready;
    await flushAsync();

    expect(page.status).toMatchObject({ phase: "blocked", reason: "admission-failed" });
    expect(page.view).toBe(null);
    expectNoInput(page);
    page.dispose();
  } finally {
    warn.mockRestore();
  }
});

test("an adoption another tab owns leaves the nonwriter waiting, not blocked", async () => {
  const { page, sent } = await load({
    edit: handEdit,
    extensions: ["page", "live-data"],
    writer: "other",
  });
  const adopted = [];
  const onAdopted = (event) => adopted.push(event.detail);
  document.addEventListener("clay:page-adopted", onAdopted);
  try {
    // The nonwriter is not refused: it stays in adopting, read-only, until the
    // elected writer's adoption reaches it through the room.
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    expect(sent).toEqual([]);
    expect(adopted).toEqual([]);
    expect(page.status).toMatchObject({ phase: "adopting" });
    expect(page.view).toBeTruthy();
    expect(page.view.isDestroyed).toBe(false);
    expectNoInput(page);
  } finally {
    document.removeEventListener("clay:page-adopted", onAdopted);
    page.dispose();
    await page.ready;
  }
});

test("a caught adoption error is not a success and enables nothing", async () => {
  const loud = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { page } = await load({ edit: handEdit, holdFails: true });
    const adopted = [];
    const onAdopted = (event) => adopted.push(event.detail);
    document.addEventListener("clay:page-adopted", onAdopted);
    try {
      await page.ready;
      await flushAsync();

      expect(adopted).toEqual([]);
      expect(page.status).toMatchObject({ phase: "blocked", reason: "adoption-error" });
      expect(page.view).toBeTruthy();
      expect(loud).toHaveBeenCalled();
      expectNoInput(page);
    } finally {
      document.removeEventListener("clay:page-adopted", onAdopted);
    }
    page.dispose();
  } finally {
    loud.mockRestore();
  }
});
