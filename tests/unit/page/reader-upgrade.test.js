import { jest } from "@jest/globals";

/**
 * A reader never shows a file another version of the document wrote. The plugin
 * starts one reader with the first full body the saved transport accepts, and that
 * reader follows later files on its own stream; both moments check the incoming
 * file's own `hyper-version` against the page's, refuse on a mismatch, and leave
 * the article and the receipt where they were.
 */

const streams = [];

jest.unstable_mockModule("../../../src/sync/saved-stream.js", () => ({
  createSavedStream: (options) => {
    const handle = {
      options,
      started: false,
      stopped: false,
      ready: Promise.resolve(null),
      represented: options.represented,
      start() { this.started = true; return this; },
      stop() { this.stopped = true; },
    };
    streams.push(handle);
    return handle;
  },
}));

let start;
let versionGuard;
let notice;

beforeAll(async () => {
  ({ start } = await import("../../../src/page/view.js"));
  versionGuard = await import("../../../src/sync/version-guard.js");
  notice = await import("../../../src/core/conflict-notice-ui.js");
});

beforeEach(() => {
  streams.length = 0;
  versionGuard._test.reset();
  notice._test.resetUpgrade();
  notice._test.render();
});

afterEach(() => {
  notice._test.resetUpgrade();
  notice._test.render();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

async function until(predicate, ms = 2000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (predicate()) return true;
    await tick();
  }
  return false;
}

const FILE = (inner, { version = "1.0.0", rev = "r1", title = "Reader" } = {}) =>
  `<!doctype html><html><head>${
    version ? `<meta name="hyper-version" content="${version}">` : ""
  }<title>${title}</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}">${inner}</article></body></html>`;

const load = (html) => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  return document.querySelector("article");
};
const deliver = (candidate) => streams[streams.length - 1].options.onSnapshot(candidate);
const shown = () => document.querySelector('article [data-id="a"]').textContent;
const pageVersion = () => document.querySelector('meta[name="hyper-version"]').getAttribute("content");
const noticeText = () => document.querySelector("[data-clay-conflict]")?.textContent ?? "";
const noticeButton = (label) =>
  [...(document.querySelector("[data-clay-conflict]")?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === label
  );

test("a file carrying this page's version applies and starts the reader", () => {
  load(FILE('<p data-id="a">Boot</p>'));
  const bytes = FILE('<p data-id="a">Saved A</p>', { title: "Saved A" });
  const reader = start({ represented: { bytes, etag: "etag-a", seq: 1 } });

  expect(shown()).toBe("Saved A");
  expect(reader.represented).toEqual({ bytes, etag: "etag-a", seq: 1 });
  expect(streams).toHaveLength(1);
  expect(streams[0].started).toBe(true);
  reader.stop();
});

test("a file another version wrote is refused before the reader claims the article", async () => {
  load(FILE('<p data-id="a">Boot</p>'));

  expect(() =>
    start({ represented: { bytes: FILE('<p data-id="a">Upgraded</p>', { version: "2.0.0" }), etag: "etag-b", seq: 2 } })
  ).toThrow(/another version/);

  // Nothing of the file reached the page, nothing was received for it, and the
  // notice offers a reload.
  expect(shown()).toBe("Boot");
  expect(document.body.innerHTML).not.toContain("Upgraded");
  expect(pageVersion()).toBe("1.0.0");
  expect(document.title).toBe("Reader");
  expect(streams).toHaveLength(0);
  expect(await until(() => noticeText().includes("This document was upgraded."))).toBe(true);
  expect(noticeButton("Reload")).toBeTruthy();
});

test("a file another version wrote after an accepted file is refused, the stream stops and the notice is shown", async () => {
  load(FILE('<p data-id="a">Boot</p>'));
  const accepted = FILE('<p data-id="a">Saved A</p>');
  const reader = start({ represented: { bytes: accepted, etag: "etag-a", seq: 1 } });
  expect(shown()).toBe("Saved A");

  const applied = deliver({ bytes: FILE('<p data-id="a">Upgraded</p>', { version: "2.0.0" }), etag: "etag-b", seq: 2 });

  expect(applied).toBe(false);
  expect(shown()).toBe("Saved A");
  expect(pageVersion()).toBe("1.0.0");
  expect(reader.represented).toEqual({ bytes: accepted, etag: "etag-a", seq: 1 });
  expect(streams[0].stopped).toBe(true);
  expect(await until(() => noticeText().includes("This document was upgraded."))).toBe(true);
  expect(noticeButton("Reload")).toBeTruthy();
});

test("a later file carrying this page's version applies as it does today", () => {
  load(FILE('<p data-id="a">Boot</p>'));
  const reader = start({ represented: { bytes: FILE('<p data-id="a">Saved A</p>'), etag: "etag-a", seq: 1 } });

  const bytes = FILE('<p data-id="a">Saved B</p>', { rev: "r2" });
  expect(deliver({ bytes, etag: "etag-b", seq: 2 })).toBe(true);

  expect(shown()).toBe("Saved B");
  expect(reader.represented).toEqual({ bytes, etag: "etag-b", seq: 2 });
  expect(noticeText()).not.toContain("upgraded");
  reader.stop();
});
