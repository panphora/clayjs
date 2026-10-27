/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";
import { bootFixture } from "../helpers/mode-harness.js";

// A Document boot parses its page and mounts its reader, so a boot's own time is the
// budget here, not a transition's.
jest.setTimeout(120000);

/**
 * The page as a mode session, entered and left through `clay.setMode`, with an optional
 * command installed in the editor it mounts. A markdown preview holds the exit open: the
 * refusal names it and the page stays in edit with the preview still usable. An exit
 * that commits disposes what the session installed, preview and loader alike, so the
 * refusal path quiesces nothing away and the committed path still leaves nothing behind.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};

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
  const hostMeta = await import("../../../src/core/host-meta.js");
  hostMeta.resetHostMeta();
};

const sendFrame = async (boot, bytes, seq = 1) => {
  await flush();
  const source = [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);
  expect(source).toBeTruthy();
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag: `E${seq}` }) });
  return bytes;
};

const readerFile = async () => {
  const pageView = await import("../../../src/plugins/page-view.js");
  if (!pageView.ready) return null;
  const held = await pageView.acquired;
  return held?.represented ?? held ?? null;
};

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

// The unsaved-state registry the page's own modules registered in: this file asks for it
// after the boot, because the harness resets the module registry a boot starts from.
const pendingIds = async () => (await import("../../../src/lib/unsaved-state.js")).pendingIds();
const panel = () => document.querySelector(".page-import-preview");
const click = (what) => panel().querySelector(`[data-import="${what}"]`).click();
const file = (name, text) => ({ name, size: new TextEncoder().encode(text).length, text: async () => text });

// An edit session over the document template, entered the way a person enters it.
async function editSession() {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  await routeHost();
  await openReader(boot);
  expect(await boot.clay.setMode("edit")).toMatchObject({ ok: true, mode: "edit" });
  const page = await import("../../../src/plugins/page.js");
  const view = page.page.view;
  expect(view).toBeTruthy();
  const editor = await import("../../../src/page/editor.js");
  return { boot, clay: boot.clay, view, editor };
}

// The real Markdown command, with its own `dispose` recorded: the module the page fetches
// on the first ask is the file in this tree, wrapped only to count what the exit disposes.
async function trackCommand() {
  const registry = await import("../../../src/page/features/registry.js");
  const row = registry.COMMAND_FEATURES.importMarkdown;
  const realLoad = row.load;
  const calls = { installs: 0, disposes: 0 };
  row.load = () =>
    realLoad().then((mod) => ({
      ...mod,
      createFeature: (context) => {
        calls.installs += 1;
        const feature = mod.createFeature(context);
        return {
          run: (args) => feature.run(args),
          dispose: () => {
            calls.disposes += 1;
            feature.dispose();
          },
        };
      },
    }));
  return { calls, restore: () => { row.load = realLoad; } };
}

test("an unsent preview refuses clay.setMode(\"view\") and the page stays usable", async () => {
  const { boot, clay, view, editor } = await editSession();
  try {
    const answer = await editor.runPageCommand(view, "importMarkdown", { file: file("notes.md", "# Heading\n\nSome text") });
    expect(answer).toEqual({ ok: true, preview: true });
    expect(panel()).not.toBeNull();

    const refused = await clay.setMode("view");

    expect(refused).toMatchObject({ ok: false, code: "pending-input" });
    expect(refused.pending).toEqual(["markdown-import-preview"]);
    expect(clay.mode).toBe("edit");
    expect(panel()).not.toBeNull();
    expect(await pendingIds()).toEqual(["markdown-import-preview"]);

    click("insert");
    await flush();
    expect(panel()).toBeNull();
    expect(view.state.doc.textContent).toContain("Heading");
    expect(clay.mode).toBe("edit");
  } finally {
    boot.stop();
  }
});

test("a committed exit disposes the installed command and its preview", async () => {
  const { boot, clay, view, editor } = await editSession();
  const tracked = await trackCommand();
  try {
    const beforeCommand = boot.counters().listeners.document;
    expect(await editor.runPageCommand(view, "importMarkdown", { file: file("notes.md", "# Heading") })).toEqual({ ok: true, preview: true });
    expect(panel()).not.toBeNull();
    expect(tracked.calls.installs).toBe(1);
    const withPreview = boot.counters().listeners.document;
    expect(withPreview).toBeGreaterThan(beforeCommand);

    click("cancel");
    await flush();
    expect(panel()).toBeNull();

    expect(await clay.setMode("view")).toMatchObject({ ok: true, mode: "view" });

    expect(tracked.calls.disposes).toBe(1);
    expect(panel()).toBeNull();
    expect(document.querySelector(".page-import-preview")).toBeNull();
    expect(await pendingIds()).toEqual([]);
    expect(boot.counters().listeners.document).toBeLessThan(withPreview);
  } finally {
    tracked.restore();
    boot.stop();
  }
});

test("a refused exit, then a cancelled preview, then the commit disposes", async () => {
  const { boot, clay, view, editor } = await editSession();
  const tracked = await trackCommand();
  try {
    expect(await editor.runPageCommand(view, "importMarkdown", { file: file("notes.md", "# Heading") })).toEqual({ ok: true, preview: true });

    expect(await clay.setMode("view")).toMatchObject({ ok: false, code: "pending-input" });
    expect(tracked.calls.disposes).toBe(0);
    expect(panel()).not.toBeNull();

    click("cancel");
    await flush();
    expect(panel()).toBeNull();

    expect(await clay.setMode("view")).toMatchObject({ ok: true, mode: "view" });
    expect(tracked.calls.disposes).toBe(1);
    expect(await pendingIds()).toEqual([]);
  } finally {
    tracked.restore();
    boot.stop();
  }
});
