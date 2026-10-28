/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * A relay is the file the save wrote, byte for byte.
 *
 * The save prints through the source map, which keeps the author's spelling: an empty
 * attribute the file wrote bare stays bare. A relay that re-serialized the DOM wrote it
 * back as `=""`, the same document in other bytes, so a peer's base and the stamp it cites
 * disagreed with the file. When the relay describes the same document the host stored, it
 * carries the stored bytes.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: [], document: { etag: "E0" } };
const relayPosts = [];
const savePosts = [];
let SRC = "";

function respond(status, body, type = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    redirected: false,
    type: "basic",
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? type : null) },
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let LiveSync;
let save;
let live;
let etag;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const migration = await import("../../src/page/ybind/migrate.js");
  const tag = JSON.stringify(migration.migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "First" } } }]));
  SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "<head><title>Notes</title>",
    `<script type="application/json" merge="page" clay="live">${tag}</script>`,
    "</head>",
    "<body>",
    '<div data-id="flags" hidden data-pinned></div>',
    '<main><article data-page="1" clay="freeze"><p data-id="p">First</p></article></main>',
    "</body>",
    "</html>",
  ].join("\n");
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);

  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/live-sync/save")) {
      relayPosts.push(JSON.parse(options.body));
      return respond(200, { success: true });
    }
    if (method === "POST" && typeof options.body === "string" && options.body.startsWith("<")) {
      savePosts.push(options.body);
      return respond(200, { msg: "Saved", etag: "E1" });
    }
    if (method === "GET") return respond(200, SRC, "text/html; charset=utf-8");
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  ({ live } = await import("../../src/plugins/live.js"));
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  await import("../../src/core/save-conflict-notice.js");
  const plugin = await import("../../src/plugins/source.js");
  await plugin.source.ready;
  await etag.seedEtag();
});

test("a page with bare empty attributes relays the bytes its save sent", async () => {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  sync.start("notes.html");
  await sync._ready;
  try {
    live("page").set("touched", true);
    const result = await save.savePageForce();
    await wait(20);

    expect(result.ok).toBe(true);
    expect(savePosts).toHaveLength(1);
    expect(relayPosts).toHaveLength(1);
    // The file kept the author's bare spelling, and the relay is that file.
    expect(savePosts[0]).toContain('<div data-id="flags" hidden data-pinned>');
    expect(relayPosts[0].html).toBe(savePosts[0]);
    expect(sync.lastHtml).toBe(savePosts[0]);
  } finally {
    sync.stop();
  }
});
