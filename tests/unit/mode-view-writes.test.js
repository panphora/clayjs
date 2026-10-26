/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";
import { bootFixture } from "./helpers/mode-harness.js";

// A Document boot parses its page and mounts its reader, so a boot's own time is the
// budget here, not a transition's.
jest.setTimeout(120000);

/**
 * Two ways a page that is not being edited can end up moving under the mode machinery.
 *
 * First, a script that touches saved markup while the page is in view — a clock, a
 * counter, a reader's own repaint. The entry after it used to refuse `pending-input`
 * ("the page moved since the last session") for as long as that write stayed, and the
 * blocked phase it left behind made `clay.modeLifecycle.register` throw as well. Here
 * the entry goes live, the page's own write becomes the baseline, and the block is not a
 * registration's problem either.
 *
 * Second, an edit-only module that finishes evaluating while an exit is in flight. The
 * committed mode still reads edit until the exit commits, so the tail used to import it
 * and its evaluation started a session no lease covered. Here it starts nothing, and the
 * next entry's plan imports it in view, where it is a participant and nothing more.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};
const until = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};

// The host's answer about what it can do. The boot asks before any entry runs and memoizes
// the answer, so the route is installed right after boot and the memo is dropped.
const PAGE_HOST = { spec: 1, extensions: ["page", "live-data", "sync", "upload"], document: {} };

const routeHost = async () => {
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if (new URL(String(url), window.location.origin).pathname.startsWith("/_/meta")) {
      const body = JSON.stringify(PAGE_HOST);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => PAGE_HOST, text: async () => body };
    }
    return inner(url, options);
  };
  const hostMeta = await import("../../src/core/host-meta.js");
  hostMeta.resetHostMeta();
};

// The bytes each file write carried, in the order they went out. The harness records where
// a POST went; the body is what says which bytes a save wrote.
const fileWriteBytes = () => {
  const written = [];
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    const path = new URL(String(url), window.location.origin).pathname;
    if ((options.method || "GET").toUpperCase() === "POST" && /\/_\/save$/.test(path)) {
      written.push(String(options.body ?? ""));
    }
    return inner(url, options);
  };
  return written;
};

// The writes that wrote the file itself. A Document also writes its page data to the live
// room, which is a second POST but not a second save.
const fileSaves = (boot) => boot.sent().filter((url) => /\/_\/save$/.test(url)).length;

// One file from the host, on the stream the reader has open now.
const sendFrame = async (boot, bytes, seq = 1) => {
  await flush();
  const source = [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);
  expect(source).toBeTruthy();
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag: `E${seq}` }) });
  return bytes;
};

const readerFile = async () => {
  const pageView = await import("../../src/plugins/page-view.js");
  if (!pageView.ready) return null;
  const held = await pageView.acquired;
  return held?.represented ?? held ?? null;
};

// The reader a view boot starts needs a file before an entry has anything to build from.
const openReader = async (boot) => {
  const bytes = await sendFrame(boot, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
  const deadline = Date.now() + 8000;
  let held = await readerFile();
  while ((!held || held.bytes !== bytes) && Date.now() < deadline) {
    await sleep(5);
    held = await readerFile();
  }
  expect(held?.bytes).toBe(bytes);
  return held;
};

const enter = async (clay) => {
  const result = await clay.setMode("edit");
  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  return result;
};

const leave = async (clay) => {
  const result = await clay.setMode("view");
  expect(result).toEqual({ ok: true, mode: "view", changed: true });
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  return result;
};

test("a write a view script makes into saved markup does not refuse the next entry", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  try {
    const clay = boot.clay;
    await routeHost();
    const written = fileWriteBytes();
    await openReader(boot);

    await enter(clay);
    await leave(clay);

    // What a view script does between sessions: a clock paints an attribute into saved
    // markup. The file itself has not moved, and this tab has no work of its own.
    document.documentElement.setAttribute("data-clock", "12:00");
    await flush();

    // Before the fix this entry answered `pending-input` and left the page `blocked` for as
    // long as that attribute stayed on it.
    await enter(clay);

    // The page as it now stands is the baseline, so the page's own write is not work the
    // person has to resolve: nothing reports unsaved bytes over it.
    const save = await import("../../src/core/save.js");
    const warning = await import("../../src/core/unsaved-warning.js");
    expect(save.getLastSavedContents()).toContain('data-clock="12:00"');
    expect(warning.hasUnsavedChanges()).toBe(false);

    // The next save carries it, because it is still on the page: a save serializes the DOM,
    // so what the page keeps is what the page means to write.
    let before = fileSaves(boot);
    document.body.setAttribute("data-typed", "first");
    await flush();
    await clay.save();
    await flush();
    expect(await until(() => fileSaves(boot) > before)).toBe(true);
    expect(written[written.length - 1]).toContain('data-clock="12:00"');

    // And a page that takes its own write back takes it out of the file too.
    await leave(clay);
    document.documentElement.removeAttribute("data-clock");
    await flush();
    await enter(clay);
    before = fileSaves(boot);
    document.body.setAttribute("data-typed", "second");
    await flush();
    await clay.save();
    await flush();
    expect(await until(() => fileSaves(boot) > before)).toBe(true);
    expect(written[written.length - 1]).not.toContain("data-clock");
    await leave(clay);
  } finally {
    boot.stop();
  }
});

test("a registration while the page is blocked is recorded, not thrown", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  try {
    const clay = boot.clay;
    await routeHost();
    await openReader(boot);

    // An entry that fails after its leases were prepared: the page goes back to view with
    // the reason in its state, and stays there.
    let thrown = false;
    clay.modeLifecycle.register({
      id: "probe:fails-once",
      order: 500,
      prepare() {
        return {
          enable() {
            if (thrown) return;
            thrown = true;
            throw new Error("probe: enable refused");
          },
          quiesce() {},
          resume() {},
          dispose() {},
        };
      },
    });
    const failed = await clay.setMode("edit");
    expect(failed).toMatchObject({ ok: false, mode: "view", code: "load-failed" });
    expect(clay.modeLifecycle.state.phase).toBe("blocked");

    // A participant that arrives while the page is blocked is recorded for the next entry:
    // the block is already the answer, so this is not a second refusal on top of it.
    const prepared = [];
    const next = {
      id: "probe:next",
      order: 600,
      prepare() {
        prepared.push("next");
        return { enable() {}, quiesce() {}, resume() {}, dispose() {} };
      },
    };
    let unregister;
    expect(() => { unregister = clay.modeLifecycle.register(next); }).not.toThrow();

    await enter(clay);
    expect(prepared).toEqual(["next"]);
    await leave(clay);
    expect(() => unregister()).not.toThrow();
  } finally {
    boot.stop();
  }
});

// The late tail's own order is `menu` then `source`. A booted tail waits on `menu`'s ready,
// so pinning that promise holds the module after it back: the last test pins it, opens the
// exit's window and then lets go. Every other boot here reads a ready that is already over.
let pinMenuReady = null;
let menuReadyReads = 0;

jest.unstable_mockModule("../../src/plugins/menu.js", () => ({
  menu: { drawn: true },
  get ready() {
    menuReadyReads += 1;
    return pinMenuReady ?? undefined;
  },
}));

// An edit-only plugin that says what it saw when it evaluated, and answers as a
// participant. Its evaluation is the moment its real counterpart would start a session.
const sourceEvals = [];
let sourcePrepares = 0;

jest.unstable_mockModule("../../src/plugins/source.js", () => {
  sourceEvals.push(window.clay?.modeLifecycle?.canWrite?.() ?? null);
  return {
    default: () => {},
    source: { marked: true },
    modeParticipant: () => ({
      id: "clay:source",
      order: 30,
      prepare() {
        sourcePrepares += 1;
        return { enable() {}, quiesce() {}, resume() {}, dispose() {} };
      },
    }),
  };
});

const FIXTURE = `
  <article id="doc">
    <h1 id="title" editmode:contenteditable inert-contenteditable="plaintext-only">Authored title</h1>
    <p>Body text</p>
  </article>
`;

// A live-switch page, booted into edit: what it starts is the frame the exit is measured in.
async function bootLivePage(params) {
  jest.resetModules();
  const root = document.documentElement;
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
  document.documentElement.innerHTML = "<head><title>Document</title></head><body></body>";
  document.body.innerHTML = FIXTURE;
  root.setAttribute("clay-mode-switch", "live");
  // A URL with no `editmode` param: the mode this page starts in is the one its own boot
  // chose, not a query string an earlier boot left behind.
  window.history.replaceState({}, "", "/live-source.html");
  delete window.clay;
  delete window.__hyperclayEditMode;
  window.clayEditMode = true;
  window.clay = {};
  globalThis.fetch = window.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "<!DOCTYPE html><html><head><title>Document</title></head><body></body></html>",
  }));
  const { boot } = await import("../../src/loader.js");
  await boot("https://clayjs.com/v1", new URLSearchParams(params), () => {});
  return { facts: await import("../../src/core/is-edit-mode.js") };
}

test("an edit-only module that lands during an exit starts nothing, and the next entry prepares it", async () => {
  let resolveMenu;
  pinMenuReady = new Promise((resolve) => { resolveMenu = resolve; });
  try {
    const readsBefore = menuReadyReads;
    const evalsBefore = sourceEvals.length;
    const preparesBefore = sourcePrepares;
    const { facts } = await bootLivePage("exclude=richclay&plugins=menu,source");

    // The tail is at `menu`, which is holding the module after it back.
    expect(await until(() => menuReadyReads > readsBefore)).toBe(true);

    // The window an exit opens, committed the way the controller commits it: the phase
    // says leaving while the facts still say edit, which is what used to make an edit-only
    // module look like it belonged to a live session.
    facts.commitModeFacts({ phase: "leaving" });
    resolveMenu();
    await flush();

    // The edit-only module evaluated nowhere: not imported, not attached, and no session
    // of its own started on a page that was on its way to view.
    expect(sourceEvals.slice(evalsBefore)).toEqual([]);
    expect(window.clay.source).toBeUndefined();

    // The exit commits view, and the next entry imports the module while the page is idle
    // in view, where evaluating it starts nothing. It is a participant from there.
    facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
    expect(await window.clay.setMode("edit")).toEqual({ ok: true, mode: "edit", changed: true });
    expect(sourceEvals.slice(evalsBefore)).toEqual([false]);
    expect(sourcePrepares - preparesBefore).toBe(1);
    expect(window.clay.source).toEqual({ marked: true });
  } finally {
    pinMenuReady = null;
    jest.restoreAllMocks();
  }
});
