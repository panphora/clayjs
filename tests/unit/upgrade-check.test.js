/**
 * The upgrade check (plan 05, Step 3): a copy of a starter template carries a source
 * and a version, and once per load its owner is told when a newer version was
 * published. Everything the check touches outside the page is `fetch`, so that is
 * the seam: the stub answers `latest.json` and its HTML, and the digest is real
 * (node:crypto stands in for `crypto.subtle`, which jsdom does not implement).
 */
import { createHash } from "node:crypto";
import { jest } from "@jest/globals";
import { storage } from "../../src/lib/doc-storage.js";
import { findUpdate, announce } from "../../src/plugins/upgrade.js";

const BASE = "https://hyperclay.com/templates/kanban/owned";
const SOURCE = `${BASE}/latest.html`;
const HTML = '<!DOCTYPE html><html><head><meta name="hyper-version" content="1.1.0"></head><body></body></html>';
const TTL_MS = 24 * 60 * 60 * 1000;

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
  const fetchFn = jest.fn(async (url) => {
    if (url.endsWith(".json")) return { ok: true, status: 200, json: async () => latest };
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(html).buffer };
  });
  return fetchFn;
}

function page({ source = SOURCE, version = "1.0.0" } = {}) {
  const metas = [source && `<meta name="hyper-source" content="${source}">`, version && `<meta name="hyper-version" content="${version}">`];
  document.head.innerHTML = metas.filter(Boolean).join("");
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
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
  test("a copy with no metas shows nothing, and never fetches", async () => {
    page({ source: null, version: null });
    const fetchFn = fetcher();
    expect(await findUpdate({ fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a newer version is read from latest.json beside the source", async () => {
    page();
    const fetchFn = fetcher();
    expect(await findUpdate({ fetchFn })).toEqual({
      version: "1.1.0",
      html: `${BASE}/1.1.0.html`,
      sha256: sha256(HTML),
      latestUrl: `${BASE}/latest.json`,
    });
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/latest.json`);
    expect(fetchFn.mock.calls[1][0]).toBe(`${BASE}/1.1.0.html`);
    expect(fetchFn.mock.calls[0][1]).toEqual({ credentials: "omit" });
  });

  test("an equal version shows nothing", async () => {
    page({ version: "1.1.0" });
    expect(await findUpdate({ fetchFn: fetcher() })).toBeNull();
  });

  test("an older published version shows nothing", async () => {
    page({ version: "1.1.0" });
    expect(await findUpdate({ fetchFn: fetcher({ latest: manifest({ version: "1.0.9" }) }) })).toBeNull();
  });

  test("a digest that does not match the HTML shows nothing", async () => {
    page();
    expect(await findUpdate({ fetchFn: fetcher({ latest: manifest({ sha256: sha256("other bytes") }) }) })).toBeNull();
  });

  test("no network shows nothing", async () => {
    page();
    const fetchFn = jest.fn(async () => {
      throw new Error("offline");
    });
    expect(await findUpdate({ fetchFn })).toBeNull();
  });

  test("a failed fetch shows nothing", async () => {
    page();
    const fetchFn = jest.fn(async () => ({ ok: false, status: 404 }));
    expect(await findUpdate({ fetchFn })).toBeNull();
  });

  test("a source that served unparseable JSON shows nothing", async () => {
    page();
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("not JSON");
      },
    }));
    expect(await findUpdate({ fetchFn })).toBeNull();
  });

  test("a copy made before the metas carried a version shows nothing", async () => {
    page({ version: null });
    const fetchFn = fetcher();
    expect(await findUpdate({ fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("the check is cached for a day, keyed by source and current version", async () => {
    page();
    const now = 1_000_000;
    const first = fetcher();
    expect(await findUpdate({ fetchFn: first, now })).not.toBeNull();
    const second = fetcher({ latest: manifest({ version: "1.9.9" }) });
    const cached = await findUpdate({ fetchFn: second, now: now + TTL_MS - 1 });
    expect(cached.version).toBe("1.1.0");
    // Only the manifest is cached: the HTML is still fetched, because its digest is
    // what makes the offer trustworthy on every load.
    expect(second.mock.calls.map(([url]) => url)).toEqual([`${BASE}/1.1.0.html`]);
    const third = fetcher({ latest: manifest({ version: "1.9.9" }) });
    expect((await findUpdate({ fetchFn: third, now: now + TTL_MS + 1 })).version).toBe("1.9.9");
  });
});

describe("who is asked", () => {
  test("a visitor without permission never fetches", async () => {
    page();
    window.clay = { canEdit: false, isDraftMode: false, storage };
    const fetchFn = fetcher();
    expect(await findUpdate({ fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a draft never fetches", async () => {
    page();
    window.clay = { canEdit: true, isDraftMode: true, storage };
    const fetchFn = fetcher();
    expect(await findUpdate({ fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("the offer", () => {
  test("a newer version adds a menu item with a badge", async () => {
    page();
    const addItem = jest.fn();
    window.clay.menu = { addItem };
    const update = await findUpdate({ fetchFn: fetcher() });
    expect(await announce(update)).toBe("menu");
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0][0]).toMatchObject({ id: "upgrade", badge: true });
    expect(addItem.mock.calls[0][0].label).toContain("1.1.0");
  });

  test("without a menu, a notice with Upgrade and Not now", async () => {
    page();
    const toastPersistent = jest.fn();
    window.clay.toastPersistent = toastPersistent;
    const update = await findUpdate({ fetchFn: fetcher() });
    expect(await announce(update)).toBe("notice");
    const [message, type, options] = toastPersistent.mock.calls[0];
    expect(type).toBe("info");
    expect(message).toMatch(/new version/i);
    expect(options.actions.map((action) => action.label)).toEqual(["Upgrade", "Not now"]);
  });

  // The menu loads after ready, so the check can reach its offer first. When the plan
  // names the menu, the item waits for `clay:plugin-ready` rather than falling back to
  // a notice the page would show beside a menu that is about to arrive.
  test("a planned menu that has not arrived gets the item once it does, and no notice", async () => {
    page();
    const addItem = jest.fn();
    const toastPersistent = jest.fn();
    window.clay = { canEdit: true, isDraftMode: false, storage, plugins: Object.freeze(["menu"]), toastPersistent };
    const update = await findUpdate({ fetchFn: fetcher() });

    const offered = announce(update);
    expect(addItem).not.toHaveBeenCalled();
    expect(toastPersistent).not.toHaveBeenCalled();

    document.dispatchEvent(new CustomEvent("clay:plugin-ready", { detail: { plugin: "source" } }));
    expect(await Promise.race([offered, Promise.resolve("waiting")])).toBe("waiting");

    window.clay.menu = { addItem };
    document.dispatchEvent(new CustomEvent("clay:plugin-ready", { detail: { plugin: "menu" } }));

    expect(await offered).toBe("menu");
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0][0]).toMatchObject({ id: "upgrade", badge: true });
    expect(toastPersistent).not.toHaveBeenCalled();
  });

  test("with no menu in the plan, the notice shows without waiting", async () => {
    page();
    const addItem = jest.fn();
    const toastPersistent = jest.fn();
    window.clay = { canEdit: true, isDraftMode: false, storage, plugins: Object.freeze([]), toastPersistent };
    const update = await findUpdate({ fetchFn: fetcher() });

    expect(await announce(update)).toBe("notice");
    expect(toastPersistent).toHaveBeenCalledTimes(1);
    expect(addItem).not.toHaveBeenCalled();
  });

  test("a menu that is already there is used without waiting", async () => {
    page();
    const addItem = jest.fn();
    window.clay = { canEdit: true, isDraftMode: false, storage, plugins: Object.freeze(["menu"]), menu: { addItem } };
    const update = await findUpdate({ fetchFn: fetcher() });

    expect(await announce(update)).toBe("menu");
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  test("with neither menu nor toast, nothing is offered", async () => {
    page();
    const update = await findUpdate({ fetchFn: fetcher() });
    expect(await announce(update)).toBeNull();
  });

  test("Upgrade asks for the upgrade itself", async () => {
    page();
    const addItem = jest.fn();
    window.clay.menu = { addItem };
    const update = await findUpdate({ fetchFn: fetcher() });
    await announce(update);
    const seen = [];
    document.addEventListener("clay:upgrade-requested", (event) => seen.push(event.detail), { once: true });
    addItem.mock.calls[0][0].run();
    expect(seen).toEqual([update]);
  });

  test("Not now hides that version until a newer one is published", async () => {
    page();
    const toastPersistent = jest.fn();
    window.clay.toastPersistent = toastPersistent;
    const now = 1_000_000;
    const update = await findUpdate({ fetchFn: fetcher(), now });
    await announce(update);
    const notNow = toastPersistent.mock.calls[0][2].actions[1];
    notNow.onClick();
    expect(storage.local.get("upgrade-dismissed")).toBe("1.1.0");

    const same = fetcher();
    expect(await findUpdate({ fetchFn: same, now })).toBeNull();
    expect(same).not.toHaveBeenCalled();

    const later = fetcher({ latest: manifest({ version: "1.2.0" }) });
    expect((await findUpdate({ fetchFn: later, now: now + TTL_MS + 1 })).version).toBe("1.2.0");
  });
});
