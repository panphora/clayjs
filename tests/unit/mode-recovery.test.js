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
 *
 * The same road out of edit, bounded (V4 gate fix 5):
 *
 *   - an initial edit exit whose adoption fails keeps the boot's sessions, so the next
 *     exit adopts them and hands them back instead of committing view over a live
 *     editor (Opus 2);
 *   - a `quiesce` that never settles, and a pending-source flush that never does,
 *     fail the exit with `timeout` inside the deadline and leave the tab in edit
 *     rather than stuck in `leaving` (Astra 6);
 *   - an element added after an initial edit boot gets its `editmode:` behaviour
 *     (Argon 6A).
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

test("a plugins=page Document's exit starts no saved lane its view never ran", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true, params: "plugins=page&exclude=richclay,source" });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  try {
    await routeHost();
    const source = openStream(boot);
    frameFrom(source, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    await pageView.acquired;
    // The reader's one stream, and nothing else: `plugins=page` in view resolves to the
    // page-view reader alone.
    expect(boot.eventSources().open).toBe(1);

    // An entry of this page loads generic sync, because `page` implies it in edit, so by
    // the exit a lane exists that this tab's view never ran. The exit restarts the
    // readers the view had, and that is one.
    expect((await boot.clay.setMode("edit")).ok).toBe(true);
    await flush();
    expect((await boot.clay.setMode("view")).ok).toBe(true);
    await flush();

    expect(boot.eventSources().open).toBe(1);
  } finally {
    pageView.stop();
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

test("an initial edit exit whose adoption fails keeps its sessions, and the next exit commits view", async () => {
  const boot = await bootFixture("document.html", {
    mode: "edit",
    declare: true,
    params: "plugins=cms&exclude=richclay,source,quickcrop",
  });
  const { cms } = await import(`${SRC}vendor/hypercms.vendor.js`);
  const editable = await import(`${SRC}core/admin-contenteditable.js`);
  const { registerUnsavedState } = await import(`${SRC}lib/unsaved-state.js`);
  try {
    const clay = boot.clay;
    // A control the boot's own page-load sweep turned on: the exit is what hands it back.
    const control = document.createElement("div");
    control.setAttribute("editmode:contenteditable", "");
    control.setAttribute("inert-contenteditable", "plaintext-only");
    document.body.appendChild(control);
    editable.enableContentEditable();
    expect(control.getAttribute("contenteditable")).toBe("plaintext-only");

    // The CMS this tab opened holds a session no exit can take back, so the controller
    // answers the caller with its guarded reload instead of a live exit.
    const rules = document.createElement("script");
    rules.setAttribute("data-rules-name", "cms");
    rules.setAttribute("data-rules-version", "1");
    rules.setAttribute("type", "application/json");
    rules.textContent = JSON.stringify({ title: "h1" });
    document.head.appendChild(rules);
    expect(cms.open()).toMatchObject({ ok: true });
    expect(cms.isOpen).toBe(true);

    // Work a save cannot write, so the reload road's own flush refuses too.
    const pending = registerUnsavedState({ id: "probe:composer", isPending: () => true });

    const first = await clay.setMode("view");
    await flush();
    expect(first).toMatchObject({ ok: false, mode: "edit", code: "save-failed", state: "blocked" });
    expect(clay.mode).toBe("edit");
    expect(cms.isOpen).toBe(true);
    expect(control.getAttribute("contenteditable")).toBe("plaintext-only");

    // The person closes the CMS and finishes: the next exit has the boot to adopt again.
    pending.dispose();
    expect(cms.close()).toMatchObject({ ok: true });

    const second = await clay.setMode("view");
    await flush();
    expect(second).toEqual({ ok: true, mode: "view", changed: true });
    expect(clay.mode).toBe("view");
    expect(clay.modeLifecycle.state.phase).toBe("idle");
    expect(document.documentElement.getAttribute("editmode")).toBe("false");
    // The boot's own sessions were handed back, not left running in view.
    expect(control.hasAttribute("contenteditable")).toBe(false);
    expect(control.getAttribute("inert-contenteditable")).toBe("plaintext-only");
  } finally {
    boot.stop();
  }
});

test("an exit whose quiesce never settles fails with timeout inside the deadline", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const realSetTimeout = globalThis.setTimeout;
  let timerSpy;
  let armed = false;
  const deadlines = [];
  let reached = false;
  let resumed = false;
  try {
    await routeHost();
    const source = openStream(boot);
    frameFrom(source, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    await pageView.acquired;

    boot.clay.modeLifecycle.register({
      id: "probe:stuck-quiesce",
      order: 900,
      prepare() {
        return {
          enable() {},
          quiesce() {
            reached = true;
            return new Promise(() => {});
          },
          resume() {
            resumed = true;
          },
          dispose() {},
        };
      },
    });
    timerSpy = jest.spyOn(globalThis, "setTimeout").mockImplementation((fn, delay, ...args) => {
      if (armed && delay >= 1000) deadlines.push(fn);
      return realSetTimeout(fn, delay, ...args);
    });

    expect((await boot.clay.setMode("edit")).ok).toBe(true);
    armed = true;
    const exit = boot.clay.setMode("view");
    expect(await until(() => reached)).toBe(true);
    await flush();
    // The one deadline this exit took at its start is all it is waiting on.
    expect(deadlines.length).toBe(1);
    deadlines[0]();

    const answer = await exit;
    expect(answer).toMatchObject({ ok: false, mode: "edit", code: "timeout" });
    expect(boot.clay.mode).toBe("edit");
    expect(boot.clay.modeLifecycle.state.phase).toBe("idle");
    expect(resumed).toBe(true);
  } finally {
    timerSpy?.mockRestore();
    pageView.stop();
    boot.stop();
  }
});

test("an exit whose pending-source flush never settles fails with timeout inside the deadline", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const { registerUnsavedState } = await import(`${SRC}lib/unsaved-state.js`);
  const realSetTimeout = globalThis.setTimeout;
  let timerSpy;
  let armed = false;
  const deadlines = [];
  let reached = false;
  let pending = null;
  try {
    await routeHost();
    const source = openStream(boot);
    frameFrom(source, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    await pageView.acquired;
    expect((await boot.clay.setMode("edit")).ok).toBe(true);

    // A queued upload that never finishes: the barrier asks it to flush and waits.
    pending = registerUnsavedState({
      id: "probe:upload",
      isPending: () => true,
      flush() {
        reached = true;
        return new Promise(() => {});
      },
    });
    timerSpy = jest.spyOn(globalThis, "setTimeout").mockImplementation((fn, delay, ...args) => {
      if (armed && delay >= 1000) deadlines.push(fn);
      return realSetTimeout(fn, delay, ...args);
    });

    armed = true;
    const exit = boot.clay.setMode("view");
    expect(await until(() => reached)).toBe(true);
    // The barrier's own wait and the exit's deadline, and nothing without an end.
    expect(deadlines.length).toBeGreaterThan(0);
    for (const fire of [...deadlines]) fire();

    const answer = await exit;
    expect(answer).toMatchObject({ ok: false, mode: "edit", code: "timeout" });
    expect(boot.clay.mode).toBe("edit");
    expect(boot.clay.modeLifecycle.state.phase).toBe("idle");
    expect(boot.clay.modeLifecycle.canWrite()).toBe(true);
  } finally {
    pending?.dispose();
    timerSpy?.mockRestore();
    pageView.stop();
    boot.stop();
  }
});

test("an exit that spent its deadline on a lease gives the barrier no fresh one", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const { registerUnsavedState } = await import(`${SRC}lib/unsaved-state.js`);
  const realNow = Date.now;
  let shift = 0;
  const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + shift);
  let pending = null;
  let flushed = false;
  try {
    await routeHost();
    const source = openStream(boot);
    frameFrom(source, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    await pageView.acquired;

    // A lease that uses all but a moment of the exit's 15 s: the barrier inherits what is
    // left of that deadline instead of a fresh 15 s of its own.
    boot.clay.modeLifecycle.register({
      id: "probe:long-quiesce",
      order: 900,
      prepare() {
        return { enable() {}, quiesce() { shift = 14900; }, resume() {}, dispose() {} };
      },
    });
    expect((await boot.clay.setMode("edit")).ok).toBe(true);

    // Work that finishes on its own, but not inside the moment the exit has left.
    pending = registerUnsavedState({
      id: "probe:slow-flush",
      isPending: () => !flushed,
      flush() {
        return new Promise((resolve) => setTimeout(() => { flushed = true; resolve({ ok: true }); }, 400));
      },
    });

    const answer = await boot.clay.setMode("view");
    expect(answer).toMatchObject({ ok: false, mode: "edit", code: "timeout" });
    expect(boot.clay.mode).toBe("edit");
    expect(flushed).toBe(false);
  } finally {
    pending?.dispose();
    nowSpy.mockRestore();
    pageView.stop();
    boot.stop();
  }
});

test("an element added after an initial edit boot gets its editmode behaviour", async () => {
  // A boot stops the observers it started but leaves the realm-global hub in place, so a
  // later page in this file would subscribe to a hub nobody observes any more.
  delete window.__clayMutation;
  const boot = await bootFixture("document.html", { mode: "edit", declare: true });
  try {
    const card = document.createElement("div");
    card.id = "late-card";
    card.setAttribute("editmode:contenteditable", "");
    card.setAttribute("inert-contenteditable", "plaintext-only");
    document.body.appendChild(card);
    await flush();

    expect(card.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(card.hasAttribute("inert-contenteditable")).toBe(false);
    expect(boot.clay.mode).toBe("edit");
  } finally {
    boot.stop();
  }
});

test("an empty saved lane acquires a stamped served file, so the next entry goes live", async () => {
  // The host stamps every response, so the file the lane acquires names the very version this
  // tab already represents. It is still the file that lane has to hold: without it the reader
  // hands the next entry nothing and that entry falls back to a reload.
  const boot = await bootFixture("document-sync.html", { mode: "edit", declare: true, root: { documentetag: "v1" } });
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  const realFetch = globalThis.fetch;
  try {
    const clay = boot.clay;
    globalThis.fetch = window.fetch = async (url, options = {}) => {
      const method = (options.method || "GET").toUpperCase();
      const path = new URL(String(url), window.location.origin).pathname;
      if (method === "GET" && !path.startsWith("/_/meta")) {
        const body = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => body };
      }
      return realFetch(url, options);
    };

    expect((await clay.setMode("view")).ok).toBe(true);
    await sync._ready;
    expect(await until(() => typeof sync._represented.bytes === "string", 5000)).toBe(true);
    expect(sync._represented.etag).toBe("v1");

    const answer = await clay.setMode("edit");
    expect(answer).toEqual({ ok: true, mode: "edit", changed: true });
  } finally {
    globalThis.fetch = window.fetch = realFetch;
    sync.stop();
    boot.stop();
  }
});
