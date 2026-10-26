/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import { bootFixture } from "./helpers/mode-harness.js";

// A boot parses and mounts the real fixtures: the jsdom default is a boot's own time.
jest.setTimeout(120000);

/**
 * A `plugins=page,sync` Document's second editing session edits the file the reader
 * shows, not the one the live DOM remembered (Opus 1, Opus 5).
 *
 * An exit restarts the page-view reader on the receipt the session left, and that
 * reader follows generic sync's saved lane instead of opening a stream of its own. The
 * tag a live entry opens its page store from is the one on screen, so the restarted
 * reader has to keep that tag at the file it represents exactly as the reader that owns
 * the stream does: an untagged page gains the tag the session's save wrote, and a tagged
 * one takes the tag the session left. Without it the next entry builds its page from the
 * pre-session tag, mounts older content and saves over the first session's edit.
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

const PAGE_HOST = { spec: 1, extensions: ["page", "sync", "upload"], document: {} };
const TAG = 'script[type="application/json"][merge="page"]';

let posts = [];

// The host: its discovery answer, and every save this page sends.
const routeHost = async () => {
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if (new URL(String(url), window.location.origin).pathname.startsWith("/_/meta")) {
      const body = JSON.stringify(PAGE_HOST);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => PAGE_HOST, text: async () => body };
    }
    if ((options.method || "GET").toUpperCase() === "POST") posts.push(String(options.body ?? ""));
    return inner(url, options);
  };
  const { resetHostMeta } = await import(`${SRC}core/host-meta.js`);
  resetHostMeta();
};

const openStream = (boot) => [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);

const frameFrom = (source, bytes, seq, etag = `E${seq}`) =>
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag, sender: "peer" }) });

const tagOf = (bytes) => new DOMParser().parseFromString(bytes, "text/html").querySelector(TAG);

// One view boot of the page,sync fixture, its readers and its editor, with the first
// saved file already applied.
async function openDocument({ tagged = false } = {}) {
  posts = [];
  const boot = await bootFixture("document.html", { mode: "view", declare: true, params: "plugins=page,sync&exclude=richclay,source" });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  const pageMod = await import(`${SRC}plugins/page.js`);
  const { seedPageFromArticle } = await import(`${SRC}page/ybind/migrate.js`);
  await routeHost();
  const article = document.querySelector("article[data-page]");
  if (tagged) {
    const tag = document.createElement("script");
    tag.setAttribute("type", "application/json");
    tag.setAttribute("merge", "page");
    tag.setAttribute("clay", "live");
    tag.textContent = JSON.stringify(seedPageFromArticle(article.cloneNode(true)));
    article.parentNode.insertBefore(tag, article);
  }
  const bytes = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
  frameFrom(openStream(boot), bytes, 1);
  expect(await until(() => sync._represented?.bytes === bytes)).toBe(true);
  return { boot, pageView, sync, pageMod };
}

const stop = ({ boot, pageView, sync }) => {
  pageView.stop();
  sync.stop();
  boot.stop();
};

test("a tagged Document's exit leaves the tag at the file the session saved, and the next session edits it", async () => {
  const quiet = ["warn", "error", "log"].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
  const page = await openDocument({ tagged: true });
  try {
    expect(await page.boot.clay.setMode("edit")).toMatchObject({ ok: true, mode: "edit" });
    expect(await until(() => Boolean(page.pageMod.page.view?.editable))).toBe(true);
    const view = page.pageMod.page.view;
    view.dispatch(view.state.tr.insertText("SESSION-ONE", 1));
    await flush();
    expect((await page.pageMod.page.flush())?.ok).toBe(true);
    expect(await until(() => posts.length > 0)).toBe(true);
    expect((await page.boot.clay.setMode("view")).ok).toBe(true);
    await flush();

    // The reader that took over from the exit represents the saved file, and the tag on
    // screen is that file's: same value, and the session's edit is in it.
    const accepted = page.sync._represented.bytes ?? "";
    expect(accepted).toContain("SESSION-ONE");
    const onScreen = document.querySelector(TAG)?.textContent ?? null;
    expect(onScreen).toBe(tagOf(accepted)?.textContent ?? null);
    expect(onScreen).not.toBe(null);

    // The second session builds on that file, and what it saves still carries the first
    // session's edit.
    const postsBefore = posts.length;
    expect(await page.boot.clay.setMode("edit")).toMatchObject({ ok: true, mode: "edit" });
    expect(await until(() => Boolean(page.pageMod.page.view?.editable))).toBe(true);
    const next = page.pageMod.page.view;
    expect(next.state.doc.textContent).toContain("SESSION-ONE");
    next.dispatch(next.state.tr.insertText("TWO", 1));
    await flush();
    expect((await page.pageMod.page.flush())?.ok).toBe(true);
    expect(await until(() => posts.length > postsBefore)).toBe(true);
    expect(posts.at(-1)).toContain("SESSION-ONE");
    expect(posts.at(-1)).toContain("TWO");
  } finally {
    quiet.forEach((spy) => spy.mockRestore());
    stop(page);
  }
});

test("an untagged Document's exit leaves the tag its save wrote, so the next entry mounts", async () => {
  const quiet = ["warn", "error", "log"].map((level) => jest.spyOn(console, level).mockImplementation(() => {}));
  const page = await openDocument();
  try {
    expect(document.querySelector(TAG)).toBe(null);
    expect(await page.boot.clay.setMode("edit")).toMatchObject({ ok: true, mode: "edit" });
    expect(await until(() => Boolean(page.pageMod.page.view?.editable))).toBe(true);
    const view = page.pageMod.page.view;
    view.dispatch(view.state.tr.insertText("FIRST", 1));
    await flush();
    expect((await page.pageMod.page.flush())?.ok).toBe(true);
    expect(await until(() => posts.length > 0)).toBe(true);
    expect((await page.boot.clay.setMode("view")).ok).toBe(true);
    await flush();

    // The file the session left states its page in a tag; the page on screen states it
    // too, so the next entry has a store to open.
    expect(tagOf(page.sync._represented.bytes ?? "")).not.toBe(null);
    expect(document.querySelector(TAG)).not.toBe(null);

    expect(await page.boot.clay.setMode("edit")).toMatchObject({ ok: true, mode: "edit" });
    expect(await until(() => Boolean(page.pageMod.page.view?.editable))).toBe(true);
    expect(page.pageMod.page.view.state.doc.textContent).toContain("FIRST");
  } finally {
    quiet.forEach((spy) => spy.mockRestore());
    stop(page);
  }
});
