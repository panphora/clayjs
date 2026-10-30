/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { createHash } from "node:crypto";
import { jest } from "@jest/globals";
import { $, $$ } from "./helpers/editor-ui.js";

/**
 * The menu, the SEO sheet, the upgrade runner and the source map where they meet a mode
 * change or a whole-document operation.
 *
 * Four claims, each about something that was already running when the change landed:
 *
 *   the Edit switch shows the mode that was committed. A commit can come from the
 *   keyboard, from another lease or from a live entry this menu did not start, and the
 *   switch reads the announcement rather than the click that may have caused it.
 *
 *   the SEO sheet follows a live entry into edit: the sheet never leaves the page, so its
 *   fields become editable where they are, and the reload receipt it wrote is cleared
 *   again because nothing reloaded to spend it.
 *
 *   fields typed into the sheet and not applied are pending work, registered with the
 *   page's own registry, whether or not the document asked for the optional `unsent`
 *   plugin.
 *
 *   an upgrade takes the document-operation slot for its flush, its preparation and its
 *   write, and refuses rather than interleaving with a replacement or a mode barrier.
 *
 *   a source fetch that answers late never adopts an older file than one already
 *   adopted, and never adopts bytes that name a version this page does not hold.
 */

const SLOT = "/notes.html";
const HEAD = '<title>Start title</title><meta name="description" content="Start description">';
const BODY = '<div id="content">start</div>';

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

function response({ ok = true, status = 200, body = "", headers = {} } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  };
}

async function boot({ edit = true, plugins = "menu,undo" } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  document.head.innerHTML = HEAD;
  document.body.innerHTML = BODY;
  window.fetch = async (input, options = {}) => {
    const method = (options && options.method) || "GET";
    if (method === "HEAD") return response({});
    if (String(input).includes("/_/meta")) return response({ body: JSON.stringify({ spec: 1, extensions: [] }) });
    return response({ ok: false, status: 404 });
  };
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await settle();
}

const menuEdit = () => $(".clay-menu-edit", "menu");
const sheetRoot = () => $(".clay-seo", "seo");
const fieldOf = (key) => $(`.clay-seo [data-key="${key}"]`, "seo");
const buttonOf = (name) => $(`.clay-seo-${name}`, "seo");

async function openSheet() {
  $(".clay-menu-goo", "menu").click();
  const item = $$('[role="menuitem"]', "menu").find((button) => button.dataset.menuId === "seo");
  expect(item).toBeDefined();
  item.click();
  await settle();
}

function type(key, value) {
  const input = fieldOf(key);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the menu and the SEO sheet follow committed mode changes", () => {
  test("the Edit switch shows the committed mode, not the click that asked for it", async () => {
    await boot({ edit: true });
    const facts = await import("../../src/core/is-edit-mode.js");
    expect(menuEdit().getAttribute("aria-checked")).toBe("true");

    // A commit from anywhere else — here a live exit — is announced once.
    facts.commitModeFacts({ mode: "view", isEditMode: false });
    document.dispatchEvent(new Event("clay:modechange"));
    expect(menuEdit().getAttribute("aria-checked")).toBe("false");

    facts.commitModeFacts({ mode: "edit", isEditMode: true });
    document.dispatchEvent(new Event("clay:modechange"));
    expect(menuEdit().getAttribute("aria-checked")).toBe("true");
  });

  test("a successful live entry makes the open sheet editable and leaves no reopen flag", async () => {
    await boot({ edit: false });
    await openSheet();
    expect(sheetRoot()).not.toBeNull();
    expect(fieldOf("title").readOnly).toBe(true);
    expect(buttonOf("edit").hidden).toBe(false);

    const facts = await import("../../src/core/is-edit-mode.js");
    const storage = window.clay.storage.session;
    const setMode = jest.spyOn(window.clay, "setMode").mockImplementation(async () => {
      // The reload path's receipt is still written while the switch is asked for: the
      // live path is the one that has nothing to spend it on.
      expect(storage.get("reopen-seo")).toBe(true);
      facts.commitModeFacts({ mode: "edit", isEditMode: true });
      document.dispatchEvent(new Event("clay:modechange"));
      return { ok: true, mode: "edit", changed: true };
    });

    buttonOf("edit").click();
    await settle();

    expect(setMode).toHaveBeenCalledWith("edit");
    expect(fieldOf("title").readOnly).toBe(false);
    expect(fieldOf("index").disabled).toBe(false);
    expect(buttonOf("apply").hidden).toBe(false);
    expect(buttonOf("edit").hidden).toBe(true);
    expect(storage.get("reopen-seo")).toBeUndefined();

    // The sheet also follows a commit it did not ask for: another control leaving edit
    // makes the open fields read-only again rather than leaving them writable.
    facts.commitModeFacts({ mode: "view", isEditMode: false });
    document.dispatchEvent(new Event("clay:modechange"));
    expect(fieldOf("title").readOnly).toBe(true);
    // Done stays: in a read-only sheet it closes without writing.
    expect(buttonOf("apply").hidden).toBe(false);
    expect(buttonOf("edit").hidden).toBe(false);
  });

  test("unapplied SEO fields are pending work without the optional unsent plugin", async () => {
    await boot({ plugins: "menu,undo" });
    const { pendingIds } = await import("../../src/lib/unsaved-state.js");
    expect(window.clay.unsent).toBeUndefined();

    await openSheet();
    expect(pendingIds()).not.toContain("seo");

    type("description", "Typed and not applied");
    expect(pendingIds()).toContain("seo");

    // Applying it writes the field, so there is nothing left to refuse an exit over.
    buttonOf("apply").click();
    await settle();
    expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("Typed and not applied");
    expect(pendingIds()).not.toContain("seo");

    // Cancelling keeps nothing either: the value it held is gone with the sheet.
    await openSheet();
    type("description", "Typed again");
    expect(pendingIds()).toContain("seo");
    buttonOf("cancel").click();
    await settle();
    expect(pendingIds()).not.toContain("seo");
  });
});

describe("an upgrade takes the document-operation slot", () => {
  // One instance each, shared by both tests here: the runner and the slot are the same
  // modules the page has, so what these ask is what a switch would ask.
  let run;
  let core;

  async function load() {
    run = run || await import("../../src/core/upgrade-run.js");
    core = core || await import("../../src/core/save-core.js");
    return { run, core };
  }

  function page() {
    document.head.innerHTML =
      '<meta name="hyper-source" content="https://hyperclay.com/templates/mini/owned/latest.html">' +
      '<meta name="hyper-version" content="1.0.0">' +
      '<meta name="clay-template" content="mini owned">' +
      '<meta name="clay-seo-title-mode" content="custom">' +
      '<script type="application/json" data-rules-name="api" data-rules-version="1">{"title":"#title","note":"#note"}</script>';
    document.body.innerHTML = '<h1 id="title">Old title</h1><p id="note">Keep me</p>';
  }

  const HTML_URL = "https://hyperclay.com/templates/mini/owned/1.1.0.html";
  const MANIFEST_URL = "https://hyperclay.com/templates/mini/owned/latest.json";
  const NEW_HTML =
    '<!DOCTYPE html><html><head><meta name="hyper-version" content="1.1.0">' +
    '<meta name="clay-template" content="mini owned">' +
    '<script type="application/json" data-rules-name="api" data-rules-version="1">{"title":"#title","note":"#note"}</script>' +
    '</head><body><h1 id="title">New title</h1>' +
    '<p id="note">Keep me</p></body></html>';

  function fetcher() {
    return jest.fn(async (url) => {
      if (url === MANIFEST_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "mini",
            variant: "owned",
            version: "1.1.0",
            html: HTML_URL,
            sha256: createHash("sha256").update(NEW_HTML).digest("hex"),
          }),
        };
      }
      if (url === HTML_URL) return { ok: true, status: 200, text: async () => NEW_HTML };
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  const update = () => ({ version: "1.1.0", html: HTML_URL, latestUrl: MANIFEST_URL });

  function clayWith(flush) {
    return {
      isDraftMode: false,
      isEditMode: true,
      save: { flush, replace: jest.fn(async () => ({ ok: true, etag: "etag-after" })) },
      storage: { session: new Map() },
      getHTML: () => "<!DOCTYPE html>\n" + document.documentElement.outerHTML,
      host: { versions: Promise.resolve(true) },
    };
  }

  beforeEach(() => {
    page();
    // The digest of the fetched template is what says these are the verified bytes.
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: { digest: async () => createHash("sha256").update(NEW_HTML).digest() } },
      configurable: true,
      writable: true,
    });
  });

  test("the slot is held from the flush until the write is answered", async () => {
    const { run, core } = await load();
    let releaseFlush;
    const flush = jest.fn(() => new Promise((resolve) => { releaseFlush = resolve; }));
    const clay = clayWith(flush);

    const running = run.apply(update(), { clay, fetchFn: fetcher(), reload: jest.fn(), doc: document, loc: location });
    await settle();

    expect(core.operationKind()).toBe("upgrade");
    // A mode switch's barrier asks for the same slot and is told no.
    expect(core.claimDocumentOperation("mode")).toBeNull();

    releaseFlush({ state: "clean" });
    const result = await running;

    expect(result.ok).toBe(true);
    expect(clay.save.replace).toHaveBeenCalledTimes(1);
    expect(core.operationKind()).toBeNull();
  });

  test("an upgrade that finds the slot taken refuses without flushing or writing", async () => {
    const { run, core } = await load();
    const held = core.claimDocumentOperation("replace");
    const flush = jest.fn(async () => ({ state: "clean" }));
    const clay = clayWith(flush);

    const result = await run.apply(update(), { clay, fetchFn: fetcher(), reload: jest.fn(), doc: document, loc: location });

    expect(result).toEqual({ ok: false, code: "busy", message: "Something else is changing this document. Nothing was changed." });
    expect(flush).not.toHaveBeenCalled();
    expect(clay.save.replace).not.toHaveBeenCalled();
    expect(core.operationKind()).toBe("replace");

    core.releaseDocumentOperation(held);
    expect(core.operationKind()).toBeNull();
  });
});

describe("a late source fetch adopts nothing that is already out of date", () => {
  const BOOT_SRC = [
    "<!DOCTYPE html>",
    '<html documentetag="v1">',
    "  <head><title>Notes</title></head>",
    '  <body class="page">',
    "    <ul id=list>",
    "      <li data-id='a'>alpha</li>",
    "    </ul>",
    "  </body>",
    "</html>",
  ].join("\n");

  const PEER_SRC = BOOT_SRC.replace("alpha", "alpha, from a peer").replace(' documentetag="v1"', "");
  const AHEAD_SRC = BOOT_SRC.replace("alpha", "alpha, one version later").replace('documentetag="v1"', 'documentetag="v2"');

  let plugin;
  let saveMod;
  let calls;
  let queue;

  const deferred = () => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    return { promise, release };
  };

  function html(body) {
    return {
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => body,
    };
  }

  function seedDocument(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  }

  /** Boot the plugin on `served`, with the answers it gets after that queued by hand. */
  async function bootSource(served, ...answers) {
    jest.resetModules();
    seedDocument(served);
    calls = [];
    queue = answers.slice();
    window.fetch = jest.fn(async (url) => {
      const href = String(url);
      // Only the document itself is answered here: discovery and everything else is a
      // host this fixture does not have.
      if (!href.startsWith("https://example.com/notes.html")) return { ok: false, status: 404, headers: { get: () => null }, text: async () => "" };
      calls.push(href);
      const next = queue.length ? queue.shift() : served;
      return html(await (typeof next === "function" ? next() : next));
    });
    saveMod = await import("../../src/core/save.js");
    window.clay = { ...(window.clay || {}), undo: { flush: () => {} } };
    plugin = await import("../../src/plugins/source.js");
  }

  test("a disk frame that overtook the boot fetch is what the plugin models", async () => {
    const held = deferred();
    await bootSource(BOOT_SRC, held.promise, PEER_SRC);

    // A peer's disk write lands while the served bytes are still on the wire.
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: PEER_SRC } }));
    await settle();

    held.release(BOOT_SRC);
    await plugin.source.ready;
    await settle();

    // The older answer was not adopted. The frame arrived before anything asked, so the
    // bytes this page holds are the file and the install never asks the host for a copy
    // it has: no request, and the newer file is what the plugin models.
    expect(calls.length).toBe(0);
    expect(plugin.source.text()).toBe(PEER_SRC);
    expect(plugin.source.text()).not.toBe(BOOT_SRC);
    expect(plugin.source.stats().installed).toBe(true);
  });

  test("a fetch answered with a version this page does not hold is refused whole", async () => {
    const held = deferred();
    await bootSource(BOOT_SRC, held.promise);
    const baseline = saveMod.getLastSavedContents();
    const before = document.documentElement.outerHTML;

    held.release(AHEAD_SRC);
    await plugin.source.ready;
    await settle();

    const stats = plugin.source.stats();
    expect(stats.installed).toBe(false);
    expect(stats.refused).toContain("v2");
    expect(stats.refused).toContain("v1");
    // Nothing of the newer file reached the page, its stamp, or its saved baseline.
    expect(document.documentElement.getAttribute("documentetag")).toBe("v1");
    expect(document.documentElement.outerHTML).toBe(before);
    expect(saveMod.getLastSavedContents()).toBe(baseline);
    expect(calls.length).toBe(1);
  });
});
