/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";
import { bootFixture } from "./helpers/mode-harness.js";

// A boot parses and mounts the real fixtures: the jsdom default is a boot's own time.
jest.setTimeout(120000);

/**
 * One honest receipt and stamp per session (V4 gate fix 2).
 *
 * The reviewers' probes, as repo tests:
 *
 *   - a clean exit restarts the reader from THIS session's accepted save or its entry
 *     receipt, never an older session's save (Opus 1, Astra 1);
 *   - the saved lane's represented file is what the lane applied, and a saved lane
 *     that starts with no bytes acquires the served file once, so the next entry goes
 *     live instead of reloading (Argon 5);
 *   - a live entry learns conditional saves and records the represented stamp, every
 *     session, so a save carries If-Match with the file this tab shows (Argon 2).
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

const PAGE_HOST = { spec: 1, extensions: ["page", "live-data", "live-provenance", "sync", "upload"], document: {} };

const routeHost = async (host = PAGE_HOST) => {
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if (new URL(String(url), window.location.origin).pathname.startsWith("/_/meta")) {
      const body = JSON.stringify(host);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => host, text: async () => body };
    }
    return inner(url, options);
  };
  const { resetHostMeta } = await import(`${SRC}core/host-meta.js`);
  resetHostMeta();
};

const sendFrame = async (boot, bytes, seq, etag = `E${seq}`) => {
  await flush();
  const source = [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);
  expect(source).toBeTruthy();
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag }) });
};

const frameFrom = (source, bytes, seq, etag = `E${seq}`) =>
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag, sender: "peer" }) });

const otherTabFile = (bytes) => {
  const file = new DOMParser().parseFromString(bytes, "text/html");
  for (const tag of file.querySelectorAll('script[merge="page"]')) tag.remove();
  const paragraph = file.querySelector('article[data-page] [data-id="p1"]');
  if (paragraph) paragraph.textContent = "from another tab";
  return `<!DOCTYPE html>\n${file.documentElement.outerHTML}`;
};

const capturePosts = () => {
  const posts = [];
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if ((options.method || "GET").toUpperCase() === "POST") {
      posts.push({ url: String(url), headers: options.headers || {}, body: options.body });
    }
    return inner(url, options);
  };
  return posts;
};

test("a Document's clean second session keeps the newer file and the next entry builds from it", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const save = await import(`${SRC}core/save.js`);
  try {
    const clay = boot.clay;
    await routeHost();
    await sendFrame(boot, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);

    const receipt = async () => {
      const held = await pageView.acquired;
      return held?.represented ?? held ?? null;
    };
    expect(await until(async () => (await receipt())?.bytes)).toBe(true);

    const seen = [];
    clay.modeLifecycle.register({
      id: "probe:seen",
      order: 900,
      prepare(context) {
        seen.push(context.represented);
        return { enable() {}, quiesce() {}, resume() {}, dispose() {} };
      },
    });
    const paragraph = () => document.querySelector('article[data-page] [data-id="p1"]');

    expect((await clay.setMode("edit")).ok).toBe(true);
    paragraph().textContent = "saved A";
    await flush();
    await clay.save();
    await flush();
    expect(await until(() => save.acceptedReceipt()?.bytes)).toBe(true);
    const first = save.acceptedReceipt();
    expect(first?.bytes).toContain("saved A");
    expect((await clay.setMode("view")).ok).toBe(true);
    await flush();

    const newer = otherTabFile(first.bytes);
    await sendFrame(boot, newer, 2);
    expect(await until(() => paragraph()?.textContent === "from another tab")).toBe(true);

    // A clean second session saves nothing: its exit must hand the reader the file it
    // was built from, not the first session's older save.
    expect((await clay.setMode("edit")).ok).toBe(true);
    expect((await clay.setMode("view")).ok).toBe(true);
    await flush();
    expect(paragraph()?.textContent).toBe("from another tab");
    const afterExit = await receipt();
    expect(afterExit.bytes).toContain("from another tab");
    expect(afterExit.etag).toBe("E2");

    expect((await clay.setMode("edit")).ok).toBe(true);
    expect(seen[2]?.bytes).toContain("from another tab");

    const posts = capturePosts();
    paragraph().textContent = "third";
    await flush();
    await clay.save();
    await flush();
    expect(await until(() => posts.some((entry) => /\/_\/save$/.test(entry.url)))).toBe(true);
    const filePost = posts.find((entry) => /\/_\/save$/.test(entry.url));
    const saved = new DOMParser().parseFromString(String(filePost.body), "text/html");
    expect(saved.querySelector('article[data-page] [data-id="p1"]')?.textContent).toBe("third");
    await clay.setMode("view");
  } finally {
    pageView.stop();
    boot.stop();
  }
});

test("a generic sync document's clean second session keeps the newer receipt", async () => {
  const boot = await bootFixture("document-sync.html", { mode: "view", declare: true });
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  const save = await import(`${SRC}core/save.js`);
  try {
    const clay = boot.clay;
    await sync._ready;
    const source = sync.sse._source;
    expect(source).toBeTruthy();
    const shown = () => document.querySelector('[data-id="p1"]')?.textContent;
    const doc = (word) =>
      `<!DOCTYPE html><html clay-mode-switch="live"><head><title>Test</title></head><body><p data-id="p1">${word}</p></body></html>`;

    frameFrom(source, doc("A"), 1, "E1");
    expect(await until(() => sync._represented.bytes === doc("A"))).toBe(true);

    expect((await clay.setMode("edit")).ok).toBe(true);
    document.querySelector('[data-id="p1"]').textContent = "saved A";
    await flush();
    await clay.save();
    await flush();
    expect(save.acceptedReceipt()?.bytes).toContain("saved A");
    expect((await clay.setMode("view")).ok).toBe(true);
    await flush();

    await sync._ready;
    await flush();
    frameFrom(sync.sse._source, doc("B"), 2, "E2");
    expect(await until(() => shown() === "B")).toBe(true);

    expect((await clay.setMode("edit")).ok).toBe(true);
    expect((await clay.setMode("view")).ok).toBe(true);
    await flush();
    expect(shown()).toBe("B");
    expect(sync._represented.bytes).toBe(doc("B"));
    expect(sync._represented.etag).toBe("E2");
  } finally {
    sync.stop();
    boot.stop();
  }
});

test("a saved lane that starts with no bytes acquires the served file, so the next entry goes live", async () => {
  const boot = await bootFixture("document-sync.html", { mode: "edit", declare: true });
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
    expect(await until(() => typeof sync._represented.bytes === "string")).toBe(true);

    const answer = await clay.setMode("edit");
    expect(answer).toEqual({ ok: true, mode: "edit", changed: true });
  } finally {
    globalThis.fetch = window.fetch = realFetch;
    sync.stop();
    boot.stop();
  }
});

test("a disk apply on the saved lane updates the represented file", async () => {
  const boot = await bootFixture("document-sync.html", { mode: "view", declare: true });
  const { liveSync: sync } = await import(`${SRC}sync/live-sync.js`);
  try {
    await sync._ready;
    expect(sync.lane).toBe("saved");
    const html =
      '<!DOCTYPE html><html clay-mode-switch="live" documentetag="v2"><head></head>' +
      '<body><main><p>Repaired V2 from disk</p></main></body></html>';
    await sync._doApplyExternal(html, 5, "v2");
    expect(document.body.textContent).toContain("Repaired V2 from disk");
    expect(sync._represented.bytes).toBe(html);
    expect(sync._represented.etag).toBe("v2");
    expect(sync._represented.seq).toBe(5);
  } finally {
    sync.stop();
    boot.stop();
  }
});

test("a live entry learns conditional saves and every session records the stamp it represents", async () => {
  const boot = await bootFixture("document.html", { mode: "view", declare: true });
  const pageView = await import(`${SRC}plugins/page-view.js`);
  const etag = await import(`${SRC}core/etag.js`);
  try {
    const clay = boot.clay;
    await routeHost({ ...PAGE_HOST, extensions: [...PAGE_HOST.extensions, "conditional"] });
    await sendFrame(boot, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);
    expect(await until(async () => {
      const held = await pageView.acquired;
      return (held?.represented ?? held)?.etag === "E1";
    })).toBe(true);
    const paragraph = () => document.querySelector('article[data-page] [data-id="p1"]');

    // A live entry, not an edit boot: the stamp comes from the reader's receipt, and the
    // conditional capability from discovery. The first save must carry it.
    const posts = capturePosts();
    expect((await clay.setMode("edit")).ok).toBe(true);
    expect(await until(() => etag.conditionalSaves())).toBe(true);
    expect(etag.lastSeenEtag()).toBe("E1");
    paragraph().textContent = "first";
    await flush();
    await clay.save();
    await flush();
    await until(() => posts.some((entry) => /\/_\/save$/.test(entry.url)));
    const first = posts.find((entry) => /\/_\/save$/.test(entry.url));
    expect(first.headers["If-Match"]).toBe("E1");
    expect((await clay.setMode("view")).ok).toBe(true);
    await flush();

    // Another tab advances the file while this one is in view: the re-entry must record
    // the advanced stamp, not the one the earlier session saved with.
    const advanced = otherTabFile(`<!DOCTYPE html>\n${document.documentElement.outerHTML}`);
    await sendFrame(boot, advanced, 2);
    expect(await until(() => paragraph().textContent === "from another tab")).toBe(true);
    expect(await until(() => etag.lastSeenEtag() === "E2")).toBe(true);

    expect((await clay.setMode("edit")).ok).toBe(true);
    expect(await until(() => etag.conditionalSaves())).toBe(true);
    expect(etag.lastSeenEtag()).toBe("E2");
    paragraph().textContent = "second";
    await flush();
    await clay.save();
    await flush();
    await until(() => posts.filter((entry) => /\/_\/save$/.test(entry.url)).length >= 2);
    const second = posts.filter((entry) => /\/_\/save$/.test(entry.url))[1];
    expect(second.headers["If-Match"]).toBe("E2");
    await clay.setMode("view");
  } finally {
    pageView.stop();
    boot.stop();
  }
});
