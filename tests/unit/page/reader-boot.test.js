import { jest } from "@jest/globals";

/**
 * A reader opens a Document in view mode with `plugins=page`. The loader adds
 * the reader half of the page plugin by itself (plugins/page-view.js), so the
 * saved-article listener is installed at boot and each frame the host sends is
 * morphed into the frozen article without a reload and without the page's own
 * code calling startPageView.
 */

const FILE = (rev, p1) => `<!doctype html><html><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}"><p data-id="p1">${p1}</p><p data-id="p2">Keep me</p><details data-id="d1"><summary>Note</summary><p>Inside</p></details></article></body></html>`;

test("a view-mode boot applies a saved frame to the reader's article", async () => {
  jest.resetModules();
  document.documentElement.innerHTML = `<head><title>Reader</title></head><body>${new DOMParser().parseFromString(FILE("one", "Before"), "text/html").body.innerHTML}</body>`;
  window.clay = {};
  window.clayEditMode = false;
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    close() { this.readyState = 2; }
  };
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ extensions: [] }), text: async () => "", headers: { get: () => null } }));
  jest.useFakeTimers();
  let sync;
  let pageView;
  try {
    const { boot } = await import("../../../src/loader.js");
    await boot("https://clayjs.com/v1", new URLSearchParams("plugins=page"), () => {});
    for (let i = 0; i < 20; i++) await Promise.resolve();
    sync = await import("../../../src/sync/live-sync.js");
    const p2 = document.querySelector('[data-id="p2"]');
    const details = document.querySelector('details[data-id="d1"]');
    details.querySelector("summary").click();
    // jsdom may not flip open on a summary click; a browser does.
    details.open = true;
    // jsdom queues the toggle event as its own task, which the fake clock holds.
    details.dispatchEvent(new Event("toggle"));

    const frame = (rev, p1) => document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: FILE(rev, p1), source: "disk" } }));

    frame("two", "After");

    expect(document.querySelector('[data-id="p1"]').textContent).toBe("After");
    expect(document.querySelector('[data-id="p2"]')).toBe(p2);
    expect(document.querySelector('details[data-id="d1"]').open).toBe(true);

    pageView = await import("../../../src/plugins/page-view.js");
    pageView.stop();
    expect(() => pageView.stop()).not.toThrow();

    frame("three", "After stop");
    expect(document.querySelector('[data-id="p1"]').textContent).toBe("After");
  } finally {
    sync?.liveSync.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window.clay;
  }
});
