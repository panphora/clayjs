import { jest } from "@jest/globals";

/**
 * A late plugin loads after the page is interactive, so "the plugin is in the plan"
 * is not the same as "the plugin works": a page that waits for the late half of its
 * own markup has nothing to wait on but time. The loader awaits each late plugin's
 * `ready` and then announces it on the document, so that wait is an event.
 *
 * Not before: a page that heard the event early would wire against a plugin whose
 * vendor fetch has not landed. Not at all for a plugin that fails: a rejection is
 * the loader's existing degrade-to-absent, and announcing it would be a lie.
 */

let latePlugin;

jest.unstable_mockModule("../../src/plugins/source.js", () => ({
  default: () => {},
  init: () => {},
  ready: latePlugin.ready,
  source: latePlugin.source,
}));

async function waitFor(predicate) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out waiting for the loader");
}

async function boot() {
  jest.resetModules();
  document.documentElement.innerHTML = "<head><title>Document</title></head><body><p>Hi</p></body>";
  window.clay = {};
  window.clayEditMode = true;
  delete window.__hyperclayEditMode;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "<!DOCTYPE html><html><head><title>Document</title></head><body><p>Hi</p></body></html>",
  }));
  const events = [];
  document.addEventListener("clay:ready", () => events.push("clay:ready"));
  document.addEventListener("clay:plugin-ready", (event) => events.push(event.detail.plugin));
  const { boot: bootLoader } = await import("../../src/loader.js");
  await bootLoader("https://clayjs.com/v1", new URLSearchParams("exclude=richclay"), () => {});
  return { events };
}

afterEach(() => {
  delete window.clay;
  delete window.clayEditMode;
  jest.restoreAllMocks();
});

test("clay:plugin-ready fires once, for source, after its ready resolves", async () => {
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  latePlugin = { ready, source: {} };

  const { events } = await boot();
  await waitFor(() => window.clay.source !== undefined);

  // The loader had the module in hand and its member attached, and still announced
  // nothing: the plugin is not usable until its own ready settles.
  expect(events).toEqual(["clay:ready"]);

  resolveReady();
  await waitFor(() => events.length > 1);

  expect(events).toEqual(["clay:ready", "source"]);
});

test("a late plugin whose ready rejects is logged and not announced", async () => {
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});
  latePlugin = { ready: Promise.reject(new Error("vendor fetch failed")), source: {} };

  const { events } = await boot();
  await waitFor(() => logged.mock.calls.length > 0);

  expect(events).toEqual(["clay:ready"]);
  expect(logged.mock.calls[0][0]).toContain('plugins/source.js');
});
