/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";
import { bootFixture } from "./helpers/mode-harness.js";

// A boot parses and mounts the real fixtures: the jsdom default is a boot's own time.
jest.setTimeout(120000);

/**
 * Every failed or refused entry leaves a working reader (V4 gate fix 4).
 *
 * The reviewers' probes, as repo tests:
 *
 *   - a newer saved frame queued while the entry prepares refuses it with
 *     `stale-document`, and the reader applies that file afterwards (Astra 2);
 *   - a `plugins=page,sync` Document's exit restarts the page-view reader and the
 *     live-sync saved lane it follows (Opus 5, Astra 3);
 *   - an `enable` that throws rolls the entry back and restarts the reader the
 *     retired one handed over, so the view keeps receiving files (Opus 6, Astra 5);
 *   - an entry timeout disposes the prepared participants before the article goes
 *     back, so the reader reclaims it and the editor and its save hold are gone
 *     (Opus 8, Astra 4).
 */

const SRC = "../../src/";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};
const until = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!(await predicate()) && Date.now() < deadline) await sleep(5);
  return Boolean(await predicate());
};

const PAGE_HOST = { spec: 1, extensions: ["page", "live-data", "sync", "upload"], document: {} };

const routeHost = async () => {
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if (new URL(String(url), window.location.origin).pathname.startsWith("/_/meta")) {
      const body = JSON.stringify(PAGE_HOST);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => PAGE_HOST, text: async () => body };
    }
    return inner(url, options);
  };
  const { resetHostMeta } = await import(`${SRC}core/host-meta.js`);
  resetHostMeta();
};

const openStream = (boot) => [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);

const frameFrom = (source, bytes, seq, etag = `E${seq}`) =>
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag, sender: "peer" }) });

// The file another tab saved: this page's bytes with one paragraph rewritten.
const otherTabFile = (bytes, word) => {
  const file = new DOMParser().parseFromString(bytes, "text/html");
  for (const tag of file.querySelectorAll('script[merge="page"]')) tag.remove();
  file.querySelector('article[data-page] [data-id="p1"]').textContent = word;
  return `<!DOCTYPE html>\n${file.documentElement.outerHTML}`;
};

const savedFile = (word) =>
  `<!DOCTYPE html><html clay-mode-switch="live"><head><title>Test</title></head><body><p data-id="p1">${word}</p></body></html>`;

// A generic sync document's saved lane, holding A/E1 before the entry starts.
async function syncedPage() {
  const boot = await bootFixture("document-sync.html", { mode: "view", declare: true });
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  const source = sync.sse._source;
  expect(source).toBeTruthy();
  frameFrom(source, savedFile("A"), 1, "E1");
  expect(await until(() => sync._represented.bytes === savedFile("A"))).toBe(true);
  return { boot, sync, source };
}

test("a saved frame queued while the entry prepares refuses it as stale and is applied", async () => {
  const { boot, sync, source } = await syncedPage();
  try {
    const shown = () => document.querySelector('[data-id="p1"]')?.textContent;
    let builtFrom = null;
    boot.clay.modeLifecycle.register({
      id: "probe:arrival",
      order: 900,
      async prepare(context) {
        builtFrom = context.represented;
        frameFrom(source, savedFile("B"), 2, "E2");
        await flush();
        return { enable() {}, quiesce() {}, resume() {}, dispose() {} };
      },
    });

    const answer = await boot.clay.setMode("edit");
    expect(builtFrom.etag).toBe("E1");
    expect(answer).toMatchObject({ ok: false, mode: "view", code: "stale-document" });
    // The queued frame is the reader's, not the refused session's: it applies it.
    expect(await until(() => shown() === "B")).toBe(true);
    expect(sync._represented.bytes).toBe(savedFile("B"));
    expect(sync._represented.etag).toBe("E2");
  } finally {
    sync.stop();
    boot.stop();
  }
});

test("a plugins=page,sync Document's exit restarts the saved lane beside its page reader", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true, params: "plugins=page,sync&exclude=richclay,source" });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  try {
    await routeHost();
    const bytes = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
    const source = openStream(boot);
    expect(source).toBeTruthy();
    frameFrom(source, bytes, 1);
    expect(await until(() => sync._represented.bytes === bytes)).toBe(true);

    expect((await boot.clay.setMode("edit")).ok).toBe(true);
    await flush();
    expect(boot.eventSources().open).toBe(1);
    expect((await boot.clay.setMode("view")).ok).toBe(true);
    await flush();

    // Both readers the page ran before the entry are running again: the page-view
    // reader over the article, and the saved lane it follows.
    expect(boot.eventSources().open).toBe(1);
    expect(sync.isDestroyed).toBe(false);
    expect(sync.lane).toBe("saved");
    expect(sync._represented.bytes).toBe(bytes);
    const held = await until(async () => Boolean(await pageView.acquired));
    expect(held).toBe(true);

    // A file another tab saves reaches the article through the restarted lane.
    frameFrom(openStream(boot), otherTabFile(bytes, "newer"), 2);
    expect(await until(() => document.querySelector('article[data-page] [data-id="p1"]')?.textContent === "newer")).toBe(true);
  } finally {
    pageView.stop();
    sync.stop();
    boot.stop();
  }
});

test("an enable that throws rolls the entry back and restarts the reader it retired", async () => {
  const { boot, sync } = await syncedPage();
  try {
    const shown = () => document.querySelector('[data-id="p1"]')?.textContent;
    boot.clay.modeLifecycle.register({
      id: "probe:enable-fails",
      order: 900,
      prepare() {
        return {
          enable() {
            throw Object.assign(new Error("mount failed"), { code: "load-failed" });
          },
          quiesce() {},
          resume() {},
          dispose() {},
        };
      },
    });

    const answer = await boot.clay.setMode("edit");
    await flush();
    expect(answer).toMatchObject({ ok: false, mode: "view", code: "load-failed" });
    expect(boot.clay.mode).toBe("view");

    // The reader the entry retired is running again, from the file it handed over.
    expect(boot.eventSources().open).toBe(1);
    expect(sync.isDestroyed).toBe(false);
    expect(sync.lane).toBe("saved");
    expect(sync._represented.bytes).toBe(savedFile("A"));
    expect(sync._represented.etag).toBe("E1");

    frameFrom(openStream(boot), savedFile("B"), 2, "E2");
    expect(await until(() => shown() === "B")).toBe(true);
  } finally {
    sync.stop();
    boot.stop();
  }
});

test("a Document's enable that throws restarts its page reader from the entry receipt", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  try {
    await routeHost();
    const bytes = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
    const source = openStream(boot);
    frameFrom(source, bytes, 1);
    await pageView.acquired;
    const shown = () => document.querySelector('article[data-page] [data-id="p1"]')?.textContent;

    boot.clay.modeLifecycle.register({
      id: "probe:enable-fails",
      order: 900,
      prepare() {
        return {
          enable() {
            throw Object.assign(new Error("mount failed"), { code: "load-failed" });
          },
          quiesce() {},
          resume() {},
          dispose() {},
        };
      },
    });

    const answer = await boot.clay.setMode("edit");
    await flush();
    expect(answer).toMatchObject({ ok: false, mode: "view", code: "load-failed" });
    expect(boot.clay.mode).toBe("view");

    // The reader the entry retired is running again, on the file it handed over.
    const held = await pageView.acquired;
    expect((held?.represented ?? held)?.bytes).toBe(bytes);
    expect(boot.eventSources().open).toBe(1);

    frameFrom(openStream(boot), otherTabFile(bytes, "newer"), 2);
    expect(await until(() => shown() === "newer")).toBe(true);
  } finally {
    pageView.stop();
    boot.stop();
  }
});

test("an entry timeout releases the prepared Page before it returns view", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const { ownerOf } = await import(`${SRC}page/runtime-owner.js`);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let reached = false;
  const realSetTimeout = globalThis.setTimeout;
  let timerSpy;
  try {
    await routeHost();
    const source = openStream(boot);
    expect(source).toBeTruthy();
    frameFrom(source, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    await pageView.acquired;

    boot.clay.modeLifecycle.register({
      id: "probe:slow-ready",
      order: 1100,
      prepare() {
        reached = true;
        return { ready: held, enable() {}, quiesce() {}, resume() {}, dispose() {} };
      },
    });
    const deadlines = [];
    timerSpy = jest.spyOn(globalThis, "setTimeout").mockImplementation((fn, delay, ...args) => {
      if (delay === 15000) deadlines.push(fn);
      return realSetTimeout(fn, delay, ...args);
    });

    const entry = boot.clay.setMode("edit");
    for (let i = 0; i < 1000 && !reached; i++) await new Promise((resolve) => realSetTimeout(resolve, 1));
    expect(reached).toBe(true);
    expect(deadlines.length).toBeGreaterThan(0);
    deadlines[0]();
    const answer = await entry;
    const article = document.querySelector("article[data-page]");
    release();
    await flush();

    expect(answer).toMatchObject({ ok: false, mode: "view", code: "timeout" });
    expect(ownerOf(article)).toBe("reader");
    expect(article.querySelectorAll(".page-editor").length).toBe(0);
  } finally {
    release();
    timerSpy?.mockRestore();
    pageView.stop();
    boot.stop();
  }
});
