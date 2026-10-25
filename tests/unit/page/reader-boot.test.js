import { jest } from "@jest/globals";

/**
 * A reader opens a Document in view mode with `plugins=page`. The loader adds
 * the reader half of the page plugin by itself (plugins/page-view.js) and nothing
 * else: no generic sync, no live data service. So the reader follows saved files
 * through its own receive-only transport — the startup GET and the saved lane —
 * and projects each body onto the article by key, without a reload and without
 * the page's own code calling startPageView.
 */

const SERVED = (rev, p1, stamp = "disk-two") => `<!doctype html><html documentetag="${stamp}"><head><title>Reader</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}"><p data-id="p1">${p1}</p><p data-id="p2">Keep me</p><details data-id="d1"><summary>Note</summary><p>Inside</p></details></article></body></html>`;

const sources = [];

const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const until = async (check, times = 40) => {
  for (let i = 0; i < times && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

test("a view-mode boot follows the saved file through the reader's own transport", async () => {
  jest.resetModules();
  sources.length = 0;
  document.documentElement.innerHTML = `<head><title>Reader</title></head><body>${new DOMParser().parseFromString(SERVED("one", "Before"), "text/html").body.innerHTML}</body>`;
  window.clay = {};
  window.clayEditMode = false;
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    constructor(url) {
      super();
      this.url = String(url);
      sources.push(this);
    }
    close() { this.readyState = 2; }
  };
  const disk = SERVED("two", "Served");
  globalThis.fetch = jest.fn(async (url) => {
    if (String(url).includes("/_/meta")) {
      return { ok: true, status: 200, json: async () => ({ extensions: [] }), text: async () => "", headers: { get: () => null } };
    }
    return { ok: true, status: 200, text: async () => disk, headers: { get: () => null } };
  });

  const { boot } = await import("../../../src/loader.js");
  const booting = boot("https://clayjs.com/v1", new URLSearchParams("plugins=page"), () => {});
  await until(() => sources.length > 0);
  expect(sources).toHaveLength(1);

  sources[0].onopen();
  await booting;

  // clay:ready does not wait for the file, so the reader's first represented
  // file is what `acquired` settles on.
  const pageView = await import("../../../src/plugins/page-view.js");
  const reader = await pageView.acquired;
  const p2 = document.querySelector('[data-id="p2"]');
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Served");
  expect(window.clay.conflicts).toBeUndefined();
  expect(window.clay.live).toBeUndefined();
  expect(window.clay.page).toBeUndefined();

  // The acquisition stream handed the article over to the reader's own, which
  // starts from exactly the bytes that were applied.
  const source = sources.at(-1);
  const opened = sources.length;
  source.onopen();
  await flush();

  const details = document.querySelector('details[data-id="d1"]');
  details.open = true;
  details.dispatchEvent(new Event("toggle"));

  const frame = (seq, html, etag) => source.onmessage({ data: JSON.stringify({ seq, html, etag }) });
  // The frame names the stamp the served bytes carried, so the reader knows the
  // version it holds and applies the body straight from the stream.
  frame(3, SERVED("three", "After"), "disk-two");

  expect(document.querySelector('[data-id="p1"]').textContent).toBe("After");
  expect(document.querySelector('[data-id="p2"]')).toBe(p2);
  expect(document.querySelector('details[data-id="d1"]').open).toBe(true);
  // One stream for the whole reader: generic sync never loaded to open a second.
  expect(sources).toHaveLength(opened);
  expect(reader.represented).toMatchObject({ bytes: SERVED("three", "After"), etag: "disk-two", seq: 3 });

  pageView.stop();
  expect(() => pageView.stop()).not.toThrow();
  frame(4, SERVED("four", "After stop"), "disk-two");
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("After");
});

const META = { ok: true, status: 200, json: async () => ({ extensions: [] }), text: async () => "", headers: { get: () => null } };

/**
 * Boot `plugins=page` in view mode with a stream that records itself but never
 * opens on its own, so each test decides when (or whether) the host answers.
 */
const bootView = async (fetchImpl) => {
  jest.resetModules();
  sources.length = 0;
  document.documentElement.innerHTML = `<head><title>Reader</title></head><body>${new DOMParser().parseFromString(SERVED("one", "Before"), "text/html").body.innerHTML}</body>`;
  window.clay = {};
  window.clayEditMode = false;
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    constructor(url) {
      super();
      this.url = String(url);
      sources.push(this);
    }
    close() { this.readyState = 2; }
  };
  const fetched = [];
  globalThis.fetch = jest.fn(async (url) => {
    fetched.push(String(url));
    return String(url).includes("/_/meta") ? META : fetchImpl(url);
  });
  const events = [];
  const onReady = () => events.push("clay:ready");
  document.addEventListener("clay:ready", onReady);
  const { boot } = await import("../../../src/loader.js");
  await boot("https://clayjs.com/v1", new URLSearchParams("plugins=page"), () => {});
  document.removeEventListener("clay:ready", onReady);
  const pageView = await import("../../../src/plugins/page-view.js");
  const documentReads = fetched.filter((url) => !url.includes("/_/meta"));
  return { pageView, events, documentReads };
};

test("clay:ready fires even when the host's stream never opens, and the first file stays pending", async () => {
  const settled = { value: false };
  const { pageView, events, documentReads } = await bootView(async () => {
    throw new Error("the stream never opened, so nothing was fetched");
  });

  // clay:ready never waits on the network: it fired with the root on screen and
  // the startup GET was never asked for.
  expect(events).toEqual(["clay:ready"]);
  expect(window.clay.page).toBeUndefined();
  expect(documentReads).toEqual([]);
  expect(await pageView.ready).toBeNull();

  pageView.acquired.then(() => { settled.value = true; });
  await flush();
  expect(settled.value).toBe(false);

  pageView.stop();
  expect(await pageView.acquired).toBeNull();
});

test("a stream that opens after clay:ready still hands acquired the reader", async () => {
  const disk = SERVED("two", "Served");
  const { pageView, events } = await bootView(async () => ({ ok: true, status: 200, text: async () => disk, headers: { get: () => null } }));

  expect(events).toEqual(["clay:ready"]);
  expect(sources).toHaveLength(1);

  sources[0].onopen();
  const reader = await pageView.acquired;

  expect(reader).not.toBeNull();
  expect(reader.represented).toMatchObject({ bytes: disk, etag: "disk-two" });
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Served");
  pageView.stop();
});

test("a failed first read settles acquired with null, and a later frame still starts the reader", async () => {
  const { pageView, events } = await bootView(async () => ({ ok: false, status: 500, text: async () => "", headers: { get: () => null } }));

  expect(events).toEqual(["clay:ready"]);
  sources[0].onopen();
  expect(await pageView.acquired).toBeNull();

  // The stream kept running after that null, so the next accepted file still
  // reaches the article through a reader.
  sources[0].onmessage({ data: JSON.stringify({ seq: 3, html: SERVED("three", "After"), etag: "disk-two" }) });

  expect(document.querySelector('[data-id="p1"]').textContent).toBe("After");
  pageView.stop();
});
