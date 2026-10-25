import { jest } from "@jest/globals";

/**
 * The reader's compatibility path (Document 06 Step 3).
 *
 * A plain reader has no generic sync: page-view owns the saved lane through
 * sync/saved-stream.js, and that is the only stream on the page. A reader whose
 * tag also names `sync` is a different thing: generic sync already streams the
 * saved lane and applies what it receives, so page-view opens no stream of its
 * own and follows the saved-lane frames that apply reports instead. Nothing is
 * adopted from the live lane, whose frames are previews of unsaved keystrokes.
 */

const streams = [];

jest.unstable_mockModule("../../../src/sync/saved-stream.js", () => ({
  createSavedStream: (options) => {
    const handle = {
      options,
      started: false,
      stopped: false,
      ready: Promise.resolve(null),
      start() { this.started = true; return this; },
      stop() { this.stopped = true; },
    };
    streams.push(handle);
    return handle;
  },
}));

jest.unstable_mockModule("../../../src/sync/live-sync.js", () => ({
  liveSync: { stop() {} },
  morph: async () => {},
  conflicts: { list: () => [] },
}));

const FILE = (p1, { rev = "r1", stamp = "disk-1", title = "Reader" } = {}) =>
  `<!doctype html><html documentetag="${stamp}"><head><title>${title}</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}"><p data-id="p1">${p1}</p><p data-id="p2">Keep me</p></article></body></html>`;

const load = (html) => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  return document.querySelector("article");
};

const disk = (bytes, etag, seq) =>
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: bytes, etag, seq, source: "disk" } }));

beforeEach(() => {
  jest.resetModules();
  streams.length = 0;
  document.documentElement.innerHTML = "<head><title>Reader</title></head><body></body>";
  window.clay = {};
  window.clayEditMode = false;
});

test("with generic sync the reader opens no stream and follows the lane's disk frames", async () => {
  load(FILE("Boot"));
  const pageView = await import("../../../src/plugins/page-view.js");
  await pageView.start({ sync: true });

  expect(streams).toHaveLength(0);
  const reader = await pageView.acquired;
  expect(reader.represented).toEqual({ bytes: null, etag: null, seq: null });

  const bytes = FILE("Disk", { rev: "r2", title: "Disk title" });
  disk(bytes, "disk-2", 9);

  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Disk");
  expect(document.title).toBe("Disk title");
  expect(reader.represented).toEqual({ bytes, etag: "disk-2", seq: 9 });

  // A peer frame is a live preview of keystrokes nobody saved: it is not a file,
  // so it never becomes this reader's receipt.
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { html: FILE("Peer", { rev: "r3" }), source: "peer", seq: 10 },
  }));
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Disk");
  expect(reader.represented).toEqual({ bytes, etag: "disk-2", seq: 9 });

  pageView.stop();
  expect(reader.represented).toEqual({ bytes, etag: "disk-2", seq: 9 });
});

test("without sync the reader owns the saved lane and takes no clay:sync-applied feed", async () => {
  load(FILE("Boot"));
  const pageView = await import("../../../src/plugins/page-view.js");
  pageView.start({ sync: false });

  expect(streams).toHaveLength(1);
  expect(streams[0].started).toBe(true);

  const bytes = FILE("Fetched", { rev: "r2" });
  streams[0].options.onSnapshot({ bytes, etag: "disk-2", seq: 4 });

  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Fetched");
  const reader = await pageView.acquired;
  expect(reader.represented).toEqual({ bytes, etag: "disk-2", seq: 4 });

  disk(FILE("Elsewhere", { rev: "r3" }), "disk-3", 5);
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Fetched");
  pageView.stop();
  expect(streams[0].stopped).toBe(true);
});

test("the loader passes the plan's sync choice to the reader", async () => {
  load(FILE("Boot"));
  globalThis.EventSource = class extends EventTarget { close() {} };
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ extensions: [] }),
    text: async () => "",
    headers: { get: () => null },
  }));
  const { boot } = await import("../../../src/loader.js");
  await boot("https://clayjs.com/v1", new URLSearchParams("plugins=page,sync"), () => {});

  expect(window.clay.conflicts).toBeDefined();
  expect(streams).toHaveLength(0);

  const bytes = FILE("Synced", { rev: "r2" });
  disk(bytes, "disk-2", 3);
  expect(document.querySelector('[data-id="p1"]').textContent).toBe("Synced");

  const pageView = await import("../../../src/plugins/page-view.js");
  const reader = await pageView.acquired;
  expect(reader.represented).toEqual({ bytes, etag: "disk-2", seq: 3 });
  pageView.stop();
});
