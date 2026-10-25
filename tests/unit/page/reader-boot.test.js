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

  // The startup GET's body is the reader's first represented file.
  const p2 = document.querySelector('[data-id="p2"]');
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Served");
  expect(window.clay.conflicts).toBeUndefined();
  expect(window.clay.live).toBeUndefined();
  expect(window.clay.page).toBeUndefined();

  const pageView = await import("../../../src/plugins/page-view.js");
  const reader = await pageView.ready;
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
