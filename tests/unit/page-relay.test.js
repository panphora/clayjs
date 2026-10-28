import { jest } from "@jest/globals";
import { createIdentityStore, importMap } from "../../src/vendor/hyper-morph-identity.vendor.js";
import { serializeForSync } from "../../src/core/snapshot.js";
import { pageRelay } from "../../src/sync/page-relay.js";

/**
 * The relay of an accepted page save must carry the page that landed.
 *
 * A page's capture is taken at clay:snapshot-ready, before the document
 * transforms run, and the page projection is one of them: the captured article
 * is still the editor DOM. Forwarding that capture described a file nobody
 * wrote, so peers merged against an article with no text in it. The accepted
 * bytes from the same save are the only source that agrees with the file, and
 * everything outside the page's own elements still comes from the capture.
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

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let LiveSync;
let snapshot;
let save;
let live;
let storeOf;
let etag;
let projection;
let migration;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
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
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  ({ live, storeOf } = await import("../../src/plugins/live.js"));
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  projection = await import("../../src/page/save-projection.js");
  migration = await import("../../src/page/ybind/migrate.js");
  await import("../../src/core/save-conflict-notice.js");
  await etag.seedEtag();
});

const seed = () => migration.migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "First" } } }]);
const authored = () => migration.migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "Authored at save" } } }]);

function pageDocument({ pageTag = seed(), title = "Notes", extra = "", article = '<div class="page-editor">Editor DOM</div>' } = {}) {
  document.head.innerHTML =
    `<title>${title}</title>` +
    `<script type="application/json" merge="page" clay="live">${JSON.stringify(pageTag)}</script>` +
    `<script type="application/json" merge="prefs" clay="live">{"theme":"one"}</script>` +
    `<style id="owned-style" clay="no-dirty">.page { color: red; }</style>`;
  document.body.innerHTML = `${extra}<main><article data-page="1" clay="freeze" data-rev="old">${article}</article></main>`;
}

beforeEach(() => {
  relayPosts.length = 0;
  savePosts.length = 0;
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  etag.recordEtag("E0");
});

const started = [];
afterEach(() => {
  while (started.length) started.pop().stop();
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

async function startSync() {
  const sync = makeSync();
  started.push(sync);
  sync.start("index.html");
  await sync._ready;
  return sync;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (html) => new DOMParser().parseFromString(html, "text/html");
const articleText = (html) => parse(html).querySelector("article[data-page]").textContent;
const pageTagText = (html) => parse(html).querySelector('script[merge="page"]').textContent;
const titleText = (html) => parse(html).querySelector("head > title")?.textContent ?? null;

function pendingSnapshot(html, identity, captureId = 7) {
  const root = parse(html).documentElement;
  return { html, identityMap: identity.exportMap(root, (node) => node), ticket: 1, captureId };
}

const PENDING = () =>
  "<!DOCTYPE html><html><head><title>Notes</title>" +
  `<script type="application/json" merge="page" clay="live">${JSON.stringify(seed())}</script>` +
  '<script type="application/json" merge="prefs" clay="live">{"theme":"one"}</script>' +
  "</head><body>" +
  '<header data-id="toolbar"><b>Toolbar</b></header>' +
  '<aside no-save data-id="scratch">A note only this tab holds</aside>' +
  '<main><article data-page="1" clay="freeze" data-rev="old"><div class="page-editor">Editor DOM</div></article></main>' +
  "</body></html>";

function acceptedFromPending(identity, { pageTag = seed(), title = "Notes" } = {}) {
  const root = parse(PENDING()).documentElement;
  for (const el of root.querySelectorAll("[no-save]")) el.remove();
  const article = root.querySelector("article[data-page]");
  article.innerHTML = projection.renderFromTags([JSON.stringify(pageTag)]).html;
  root.querySelector('script[merge="page"]').textContent = JSON.stringify(pageTag);
  root.querySelector("head > title").textContent = title;
  return { html: serializeForSync(root), identity };
}

describe("pageRelay", () => {
  test("carries the accepted article, page tags and title, keeping the rest of the sync domain", () => {
    const identity = createIdentityStore("tab-a");
    const pending = pendingSnapshot(PENDING(), identity);
    const accepted = acceptedFromPending(identity);

    const relay = pageRelay(pending, accepted.html, identity);
    expect(relay).not.toBe(pending);
    expect(relay.html).not.toBe(pending.html);

    // The article is the file's, not the editor DOM the capture saw.
    expect(articleText(relay.html)).toBe("First");
    expect(relay.html).not.toContain("Editor DOM");
    // Exactly what the save wrote, tag pair and title included.
    expect(pageTagText(relay.html)).toBe(pageTagText(accepted.html));
    expect(titleText(relay.html)).toBe("Notes");
    // Everything outside the page's own elements is still the capture's domain,
    // including a no-save region the file does not contain.
    expect(parse(relay.html).querySelector('[data-id="toolbar"]').textContent).toBe("Toolbar");
    expect(parse(relay.html).querySelector('[data-id="scratch"]').textContent).toBe("A note only this tab holds");
    expect(accepted.html).not.toContain("A note only this tab holds");
    expect(relay.ticket).toBe(pending.ticket);
    expect(relay.captureId).toBe(pending.captureId);
  });

  test("a second capture of newer input cannot be relayed under an older save's stamp", async () => {
    pageDocument();
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    const sync = await startSync();
    let release;
    global.fetch.mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const saving = save.savePageForce();
    await wait(0);
    const firstCapture = sync._savedSnapshot;
    expect(firstCapture.captureId).toEqual(expect.any(Number));

    // A second save's capture replaces the pending snapshot before the first
    // save's answer arrives.
    const clone = snapshot.captureSnapshot({ flushUndo: false });
    document.dispatchEvent(new CustomEvent("clay:snapshot-ready", { detail: { documentElement: clone, forSave: true, captureId: 9999 } }));
    expect(sync._savedSnapshot.captureId).toBe(9999);

    release(respond(200, { msg: "Saved", etag: "E1" }));
    expect((await saving).ok).toBe(true);
    await wait(20);

    expect(relayPosts).toHaveLength(0);
    expect(sync._savedSnapshot.captureId).toBe(9999);
  });
});

describe("a page save's relay", () => {
  async function savePage() {
    pageDocument();
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    live("prefs").set("theme", "one");
    const sync = await startSync();
    const result = await save.savePageForce();
    await wait(20);
    return { sync, result };
  }

  test("relays the accepted file's article, page tags and title, not the pre-projection capture", async () => {
    const { sync, result } = await savePage();
    expect(result.ok).toBe(true);

    expect(savePosts).toHaveLength(1);
    expect(relayPosts).toHaveLength(1);
    const file = savePosts[0];
    const relay = relayPosts[0].html;

    expect(articleText(file)).toBe("First");
    expect(articleText(relay)).toBe(articleText(file));
    expect(pageTagText(relay)).toBe(pageTagText(file));
    expect(titleText(relay)).toBe(titleText(file));
    expect(relay).not.toContain("Editor DOM");
    // The relay is the peer base, so the base agrees with the file too.
    expect(sync.lastHtml).toBe(relay);
  });

  test("the relay of a floor-0 page activated in the session carries the floor its save sent", async () => {
    pageDocument();
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    await startSync();
    // The format gate's activation: one save that raises the document's floor on its
    // way out, so the marker is in the bytes the host took and not in the capture.
    const result = await save.savePageForce(() => {}, { pageFormatFloor: 1 });
    await wait(20);

    expect(result.ok).toBe(true);
    expect(savePosts).toHaveLength(1);
    expect(relayPosts).toHaveLength(1);
    expect(savePosts[0]).toContain('<meta name="clay-page-format" content="1">');
    // A peer that receives this relay learns the floor the host stored.
    expect(relayPosts[0].html).toContain('<meta name="clay-page-format" content="1">');
  });

  test("typing after the capture but before the answer is absent from that older relay", async () => {
    pageDocument();
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    const sync = await startSync();
    let release;
    global.fetch.mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const saving = save.savePageForce();
    await wait(0);
    expect(sync._savedSnapshot).not.toBeNull();

    // The store moves on while the save is on the wire: the answer still
    // describes the bytes that were sent.
    live("page").update((value) => {
      Object.assign(value, migration.migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "First later" } } }]));
    });
    release(respond(200, { msg: "Saved", etag: "E1" }));
    expect((await saving).ok).toBe(true);
    await wait(20);

    expect(relayPosts).toHaveLength(1);
    expect(articleText(relayPosts[0].html)).toBe("First");
    expect(relayPosts[0].html).not.toContain("later");
  });

  test("an authored transform that changes the final article is what the relay carries", async () => {
    pageDocument();
    // Runs after the capture, before the projection reads the tag: the accepted
    // article can differ from both the live store and the captured article.
    document.head.querySelector('script[merge="page"]')
      .setAttribute("onbeforesave", `this.textContent = ${JSON.stringify(JSON.stringify(authored()))}`);
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    await startSync();
    const result = await save.savePageForce();
    await wait(20);

    expect(result.ok).toBe(true);
    expect(savePosts).toHaveLength(1);
    expect(articleText(savePosts[0])).toBe("Authored at save");
    expect(relayPosts).toHaveLength(1);
    expect(articleText(relayPosts[0].html)).toBe("Authored at save");
  });

  test("a no-save region outside the article stays in the relay and out of the file", async () => {
    pageDocument({ extra: '<aside no-save data-id="scratch">A note only this tab holds</aside>' });
    live("page").update((value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, seed());
    });
    await startSync();
    await save.savePageForce();
    await wait(20);

    expect(savePosts).toHaveLength(1);
    expect(savePosts[0]).not.toContain("A note only this tab holds");
    expect(relayPosts).toHaveLength(1);
    expect(relayPosts[0].html).toContain("A note only this tab holds");
  });

  test("the rebuilt identity map imports against the new tree and keeps an outside sibling's identity", () => {
    const identity = createIdentityStore("tab-b");
    const pending = pendingSnapshot(PENDING(), identity);
    const accepted = acceptedFromPending(identity);

    const relay = pageRelay(pending, accepted.html, identity);
    const pendingRoot = parse(pending.html).documentElement;
    const relayRoot = parse(relay.html).documentElement;

    // The shape arrays describe the relay's own tree, not the capture's.
    expect(relay.identityMap["~"]).toBeDefined();
    const imported = importMap(relayRoot, relay.identityMap);
    expect(imported.get(relayRoot.querySelector("body"))).toEqual(expect.any(String));
    expect(imported.get(relayRoot.querySelector("article[data-page]"))).toEqual(expect.any(String));
    expect(imported.get(relayRoot.querySelector('[data-id="scratch"]'))).toEqual(expect.any(String));

    // A sibling outside the article keeps exactly the identity it had.
    const before = importMap(pendingRoot, pending.identityMap);
    expect(imported.get(relayRoot.querySelector('[data-id="toolbar"]')))
      .toBe(before.get(pendingRoot.querySelector('[data-id="toolbar"]')));
    // The new article's descendants never inherit a stale positional identity.
    expect(imported.has(relayRoot.querySelector("article p"))).toBe(false);
  });

  test("a generic document's relay payload is unchanged", async () => {
    pageDocument();
    document.head.innerHTML = "<title>Plain</title>";
    document.body.innerHTML = '<main><p data-id="one">One</p><p data-id="two">Two</p></main>';
    const sync = await startSync();
    let captured = null;
    document.addEventListener("clay:snapshot-ready", () => { captured = sync._savedSnapshot.html; }, { once: true });

    await save.savePageForce();
    await wait(20);

    expect(captured).toEqual(expect.any(String));
    expect(relayPosts).toHaveLength(1);
    expect(relayPosts[0].html).toBe(captured);
  });

  test("a page relay that cannot be built is skipped instead of sending stale bytes", () => {
    const identity = createIdentityStore("tab-c");
    const pending = pendingSnapshot(PENDING(), identity);
    // Accepted bytes with no page article: nothing can be overlaid, so no relay.
    const accepted = "<!DOCTYPE html><html><head><title>Notes</title></head><body><main><p>gone</p></main></body></html>";
    expect(pageRelay(pending, accepted, identity)).toBeNull();
    // A non-page capture is not touched at all.
    const plain = pendingSnapshot("<html><body><p data-id=\"one\">One</p></body></html>", identity);
    expect(pageRelay(plain, accepted, identity)).toBe(plain);
  });
});
