/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * The source map as a mode participant.
 *
 * A view that imports this module must start nothing: no fetch, no model, and no save
 * renderer left on the save path. A live entry installs through its lease, keeps the
 * renderer across the exit's barrier save, and takes it back at the commit that leaves
 * edit. An explicit edit boot is adopted rather than fetched again.
 */

const SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Notes</title></head>",
  "  <body class='page'>",
  "    <ul id=list>",
  "      <li data-id='a'>alpha</li>",
  "      <li data-id='b'>beta</li>",
  "    </ul>",
  "  </body>",
  "</html>",
].join("\n");

const FULL = () => "<!DOCTYPE html>" + document.documentElement.outerHTML;

function seedDocument() {
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

function stubFetch() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => SRC,
  }));
  return global.fetch;
}

// The module reads the committed mode when it evaluates, so each test loads it fresh.
async function load(mode) {
  jest.resetModules();
  seedDocument();
  window.clayEditMode = mode === "edit";
  stubFetch();
  const snapshot = await import("../../src/core/snapshot.js");
  const source = await import("../../src/plugins/source.js");
  return { snapshot, ...source };
}

afterEach(() => {
  delete window.requestIdleCallback;
  delete global.requestIdleCallback;
});

test("importing in view fetches nothing and installs no renderer", async () => {
  const { snapshot, source } = await load("view");

  expect(global.fetch).not.toHaveBeenCalled();
  expect(source.ready).toBeNull();
  expect(source.stats().installed).toBe(false);
  expect(snapshot.captureForSave({ emitForSync: false })).toBe(FULL());
});

test("a fresh prepare and enable put the renderer on the save path", async () => {
  const { snapshot, source, modeParticipant } = await load("view");

  const lease = modeParticipant().prepare({ initial: false });
  await lease.ready;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(source.stats().installed).toBe(true);
  // Prepared, not committed: the save path is still the full serialization.
  expect(snapshot.captureForSave({ emitForSync: false })).toBe(FULL());

  lease.enable();
  document.querySelector("[data-id='b']").firstChild.data = "beta, edited";
  const out = snapshot.captureForSave({ emitForSync: false });
  expect(out).toContain("<li data-id='a'>alpha</li>");
  expect(out).toContain("beta, edited");
  lease.dispose();
});

test("quiesce keeps the renderer the exit's barrier save renders through", async () => {
  const { snapshot, modeParticipant } = await load("view");

  const lease = modeParticipant().prepare({ initial: false });
  await lease.ready;
  lease.enable();
  lease.quiesce();

  document.querySelector("[data-id='b']").firstChild.data = "beta, edited";
  expect(snapshot.captureForSave({ emitForSync: false })).toContain("<li data-id='a'>alpha</li>");
  lease.dispose();
});

test("dispose clears the renderer, and a sync frame in view schedules no refresh", async () => {
  const { snapshot, source, modeParticipant } = await load("view");

  const lease = modeParticipant().prepare({ initial: false });
  await lease.ready;
  lease.enable();
  lease.dispose();

  expect(source.stats().installed).toBe(false);
  expect(snapshot.captureForSave({ emitForSync: false })).toBe(FULL());

  const idle = jest.fn();
  window.requestIdleCallback = idle;
  global.requestIdleCallback = idle;
  const refreshes = source.stats().refreshes;
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: SRC } }));
  expect(idle).not.toHaveBeenCalled();
  expect(source.stats().refreshes).toBe(refreshes);
});

test("an entry installs after the file advanced past the version this page was served at", async () => {
  const { snapshot, source, modeParticipant } = await load("view");
  // The page was served at one version and another tab has saved since: the reader hands
  // over the newer file, and the fetch answers with the stamp that file names itself by.
  // The version on the served <html> is not the one this session represents, so it must
  // not refuse the file the person is about to edit.
  document.documentElement.setAttribute("documentetag", "v1");
  const advanced = SRC.replace("<html>", '<html documentetag="v2">');
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => advanced,
  }));

  const lease = modeParticipant().prepare({ initial: false, represented: { bytes: advanced, etag: "v2", seq: 2 } });
  await lease.ready;
  const stats = source.stats();
  expect(stats.refused).toBeNull();
  expect(stats.installed).toBe(true);

  lease.enable();
  document.querySelector("[data-id='b']").firstChild.data = "beta, edited";
  const out = snapshot.captureForSave({ emitForSync: false });
  expect(out).toContain("<li data-id='a'>alpha</li>");
  expect(out).toContain("beta, edited");
  lease.dispose();
});

test("a second entry installs again, one fetch per session", async () => {
  const { snapshot, source, modeParticipant } = await load("view");

  const first = modeParticipant().prepare({ initial: false });
  await first.ready;
  first.enable();
  first.dispose();

  const second = modeParticipant().prepare({ initial: false });
  await second.ready;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(source.stats().installed).toBe(true);

  second.enable();
  document.querySelector("[data-id='b']").firstChild.data = "beta, edited";
  expect(snapshot.captureForSave({ emitForSync: false })).toContain("<li data-id='a'>alpha</li>");
  second.dispose();
});

test("initial: true adopts the boot's install without a second fetch, and its dispose clears it", async () => {
  const { snapshot, source, modeParticipant } = await load("edit");
  await source.ready;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(source.stats().installed).toBe(true);

  const lease = modeParticipant().prepare({ initial: true });
  lease.enable();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  document.querySelector("[data-id='b']").firstChild.data = "beta, edited";
  expect(snapshot.captureForSave({ emitForSync: false })).toContain("<li data-id='a'>alpha</li>");

  lease.dispose();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(source.stats().installed).toBe(false);
  expect(snapshot.captureForSave({ emitForSync: false })).toBe(FULL());
});
