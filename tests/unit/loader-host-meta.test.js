import { jest } from "@jest/globals";

/**
 * An edit-mode boot starts the host metadata request in the loader, before the
 * plugins are imported, so the page plugin's later call reuses that one request
 * instead of opening its own. hostMeta() memoizes the in-flight promise, so the
 * whole page makes one request and every later caller gets that answer.
 *
 * Core save.js seeds an ETag from the same answer and live-sync asks for its own
 * profile, so a request existing is not proof the loader made it. The caller is:
 * the loader's own call is the one that runs before core save.js evaluates.
 */

// The first module below hostMeta() in a request's stack, which is its caller.
const callerOf = (stack) =>
  stack.split("\n")
    .map((line) => line.trim())
    .find((line) => /\/src\//.test(line) && !line.includes("core/host-meta.js")) ?? "";

const metaRequests = (requests) => requests.filter((r) => new URL(r.href).pathname === "/_/meta");

async function boot(mode, query) {
  jest.resetModules();
  document.documentElement.innerHTML = '<head><title>Document</title></head><body><article class="page" clay="freeze" data-page="1"><p data-id="p1">Hi</p></article></body>';
  window.clay = {};
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  if (mode === "draft") {
    document.documentElement.setAttribute("visitor-drafts", "slot");
    document.head.innerHTML += '<script type="application/json" data-rules-name="api" data-rules-version="1">{}</script>';
  } else {
    window.clayEditMode = mode === "edit";
  }
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    close() { this.readyState = 2; }
  };
  const requests = [];
  globalThis.fetch = jest.fn(async (input) => {
    requests.push({ href: String(input), caller: callerOf(new Error().stack) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ spec: 1, extensions: [] }),
      text: async () => JSON.stringify({ spec: 1, extensions: [] }),
      headers: { get: () => null },
    };
  });
  const { boot } = await import("../../src/loader.js");
  await boot("https://clayjs.com/v1", new URLSearchParams(query), () => {});
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return { requests };
}

afterEach(() => {
  delete window.clay;
  delete window.clayEditMode;
  document.documentElement.removeAttribute("visitor-drafts");
});

test("an edit-mode boot with plugins=page asks the host for its metadata exactly once", async () => {
  const { requests } = await boot("edit", "plugins=page");

  const meta = metaRequests(requests);
  expect(meta.length).toBe(1);
  // The boot asks once: the loader, or the host-permission check it runs first.
  expect(meta[0].caller).toMatch(/\/src\/(loader|core\/host-permission)\.js:/);
  expect(window.clay.page).toBeDefined();
});

test("a view-mode boot does not ask the host for its metadata from the loader", async () => {
  const { requests } = await boot("view", "plugins=page");

  expect(window.clay.page).toBeUndefined();
  expect(metaRequests(requests).filter((r) => r.caller.includes("/src/loader.js:"))).toEqual([]);
});

test("a draft-mode boot sends no host-metadata request", async () => {
  const { requests } = await boot("draft", "plugins=visitor-drafts");

  expect(window.clay.isDraftMode).toBe(true);
  expect(metaRequests(requests)).toEqual([]);
});

test("a view-mode boot with no plugins asks the host nothing", async () => {
  const { requests } = await boot("view", "");

  expect(window.clay.toggleEditMode).toBeDefined();
  expect(metaRequests(requests)).toEqual([]);
});
