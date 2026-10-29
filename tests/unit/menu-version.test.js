/**
 * The menu's version line: a copy of a starter template tells its owner what it is,
 * and says "latest" only after the check proved it. The fixtures are the upgrade
 * check's own (its metas, its fake network, its real digest); the footer cases boot
 * the real menu and upgrade plugins through the loader, as menu-actions does.
 */
import { createHash } from "node:crypto";
import { jest } from "@jest/globals";
import { storage } from "../../src/lib/doc-storage.js";
import { checkUpdate, findUpdate } from "../../src/plugins/upgrade.js";

const BASE = "https://hyperclay.com/templates/kanban/owned";
const SOURCE = `${BASE}/latest.html`;
const HTML = '<!DOCTYPE html><html><head><meta name="hyper-version" content="1.1.0"></head><body></body></html>';
const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function manifest(overrides = {}) {
  return {
    id: "kanban",
    variant: "owned",
    version: "1.1.0",
    html: `${BASE}/1.1.0.html`,
    sha256: sha256(HTML),
    ...overrides,
  };
}

function fetcher({ latest = manifest(), html = HTML } = {}) {
  return jest.fn(async (url) => {
    if (url.endsWith(".json")) return { ok: true, status: 200, json: async () => latest };
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(html).buffer };
  });
}

function page({ source = SOURCE, version = "1.0.0" } = {}) {
  const metas = [source && `<meta name="hyper-source" content="${source}">`, version && `<meta name="hyper-version" content="${version}">`];
  document.head.innerHTML = metas.filter(Boolean).join("");
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

async function waitFor(check, timeout = 2000) {
  const deadline = Date.now() + timeout;
  let value = check();
  while (!value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    value = check();
  }
  return value;
}

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

function netFetch({ latest = manifest(), html = HTML, gate = null } = {}) {
  return jest.fn(async (url) => {
    const href = String(url);
    if (href.endsWith(".json")) {
      if (gate) await gate;
      return { ok: true, status: 200, json: async () => latest };
    }
    if (href.endsWith(".html")) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(html).buffer };
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      text: async () => "",
      json: async () => ({}),
    };
  });
}

async function boot({ version = "1.4.0", copy = true, fetchFn = netFetch() } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", SLOT);
  page(copy ? { version } : { source: null, version: null });
  document.body.innerHTML = BODY;
  window.fetch = fetchFn;
  window.clay = {};
  const params = new URLSearchParams("plugins=menu,upgrade&exclude=richclay,source");
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

let release;

const versionLine = () => document.querySelector("p.clay-menu-version");
const upgradeItem = () => document.querySelector('[data-menu-id="upgrade"]');
const badgeLine = () => document.querySelector(".clay-menu-dot");

function gated() {
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return gate;
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  storage.local.remove("upgrade-dismissed");
  window.clay = { canEdit: true, isDraftMode: false, storage };
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: {
        digest: async (algorithm, bytes) => createHash("sha256").update(Buffer.from(bytes)).digest(),
      },
    },
    configurable: true,
    writable: true,
  });
});

describe("what the check answers", () => {
  test("a page that is not a copy is none, with no version", async () => {
    page({ source: null, version: null });
    const fetchFn = fetcher();
    expect(await checkUpdate({ fetchFn })).toEqual({ status: "none", version: null, update: null });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a manifest no newer than this copy is current, at the page's version", async () => {
    page({ version: "1.4.0" });
    expect(await checkUpdate({ fetchFn: fetcher({ latest: manifest({ version: "1.4.0" }) }) })).toEqual({
      status: "current",
      version: "1.4.0",
      update: null,
    });

    localStorage.clear();
    expect((await checkUpdate({ fetchFn: fetcher({ latest: manifest({ version: "1.0.9" }) }) })).status).toBe("current");
  });

  test("a check that could not be completed is unknown, and still names the page's version", async () => {
    page({ version: "1.4.0" });
    const offline = jest.fn(async () => {
      throw new Error("offline");
    });
    expect(await checkUpdate({ fetchFn: offline })).toEqual({ status: "unknown", version: "1.4.0", update: null });

    localStorage.clear();
    const notFound = jest.fn(async () => ({ ok: false, status: 404 }));
    expect((await checkUpdate({ fetchFn: notFound })).status).toBe("unknown");

    localStorage.clear();
    const nameless = manifest({ version: undefined });
    expect((await checkUpdate({ fetchFn: fetcher({ latest: nameless }) })).status).toBe("unknown");

    localStorage.clear();
    storage.local.set("upgrade-dismissed", "2.0.0");
    const dismissed = fetcher({ latest: manifest({ version: "2.0.0" }) });
    expect((await checkUpdate({ fetchFn: dismissed })).status).toBe("unknown");
    expect(dismissed.mock.calls.filter(([url]) => String(url).endsWith(".html"))).toHaveLength(0);

    localStorage.clear();
    const wrongDigest = manifest({ version: "2.0.0", sha256: sha256("other bytes") });
    expect((await checkUpdate({ fetchFn: fetcher({ latest: wrongDigest }) })).status).toBe("unknown");
  });

  test("a newer manifest whose digest matches is an update, the object findUpdate returns", async () => {
    page();
    const { status, version, update } = await checkUpdate({ fetchFn: fetcher() });
    expect(status).toBe("update");
    expect(version).toBe("1.0.0");
    expect(update).toEqual({
      version: "1.1.0",
      html: `${BASE}/1.1.0.html`,
      sha256: sha256(HTML),
      latestUrl: `${BASE}/latest.json`,
    });
    expect(await findUpdate({ fetchFn: fetcher() })).toEqual(update);
  });
});

describe("what the menu's footer says", () => {
  test("current: the latest-version line, and no dot", async () => {
    await boot({ fetchFn: netFetch({ latest: manifest({ version: "1.4.0" }) }) });

    await waitFor(() => versionLine() && versionLine().textContent === "This doc is at latest version (1.4.0)");
    expect(versionLine().textContent).toBe("This doc is at latest version (1.4.0)");
    expect(versionLine().dataset.menuId).toBe("upgrade");
    expect(badgeLine()).toBeNull();
  });

  test("unknown: the bare version line survives the answer, and there is no dot", async () => {
    await boot({ fetchFn: netFetch({ latest: manifest({ version: undefined }), gate: gated() }) });

    const checking = await waitFor(() => versionLine());
    expect(checking.textContent).toBe("Version 1.4.0");

    release();
    await waitFor(() => versionLine() && versionLine() !== checking);
    expect(versionLine()).not.toBe(checking);
    expect(versionLine().textContent).toBe("Version 1.4.0");
    expect(versionLine().dataset.menuId).toBe("upgrade");
    expect(badgeLine()).toBeNull();
  });

  test("update: the upgrade item with its dot, and no version line", async () => {
    await boot({ fetchFn: netFetch({ latest: manifest({ version: "2.0.0" }) }) });

    await waitFor(() => document.querySelector('[role="menuitem"][data-menu-id="upgrade"]'));
    const item = document.querySelector('[role="menuitem"][data-menu-id="upgrade"]');
    expect(item.textContent).toBe("Upgrade to version 2.0.0");
    expect(badgeLine()).not.toBeNull();
    expect(versionLine()).toBeNull();
  });

  test("a page that is not a copy gets no footer at all", async () => {
    await boot({ copy: false });

    await waitFor(() => document.querySelector(".clay-menu-list"));
    await flush();

    expect(document.querySelector(".clay-menu-list")).not.toBeNull();
    expect(upgradeItem()).toBeNull();
  });

  test("while the check waits, the footer shows the version; a current answer upgrades the line", async () => {
    await boot({ fetchFn: netFetch({ latest: manifest({ version: "1.4.0" }), gate: gated() }) });

    const waiting = await waitFor(() => versionLine());
    expect(waiting.textContent).toBe("Version 1.4.0");

    release();
    await waitFor(() => versionLine() && versionLine().textContent === "This doc is at latest version (1.4.0)");
    expect(versionLine().textContent).toBe("This doc is at latest version (1.4.0)");
  });
});
