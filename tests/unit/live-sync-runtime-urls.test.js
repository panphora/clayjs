/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRuntimeHTML } from "../../src/server/offline-runtime/index.js";

/**
 * A local host serves this page with its ClayJS runtime URLs projected to the local
 * mirror, and relays live-sync frames the same way, without the descriptor.
 *
 * ClayJS's captures are canonical: the clone canonicalizer puts the authored
 * `https://clayjs.com/...` URLs back and drops the descriptor. hyper-morph pairs head
 * scripts and links by absolute URL, so a canonical base and remote against a projected
 * live side used to leave those nodes unpaired on every merge: the report said
 * `localDiverged`, the base stopped advancing and an autosave followed.
 *
 * So every frame-derived document is canonicalized as it is parsed, while the live DOM
 * keeps what the host served. These tests pin that on both lanes and through the
 * identity map, and pin the source plugin refusing to model projected bytes as the file.
 */

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/offline-runtime");
const { selectedVersion, releases } = JSON.parse(readFileSync(path.join(FIXTURES, "releases.json"), "utf8"));

const CLAY = "https://clayjs.com/v1/clay.js?plugins=sync";
const CLAY_LOCAL = "/_/clayjs/1.15.2/clay.js?plugins=sync";

const AUTHORED =
  "<!doctype html><html><head>" +
  `<script src="${CLAY}"></script>` +
  '</head><body><p data-id="text">hello</p></body></html>';

const SERVED = projectRuntimeHTML(AUTHORED, {
  releases,
  selectedVersion,
  documentURL: "http://127.0.0.1:4321/notes/doc.html",
}).html;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let snapshot;
let gate;
let save;
let source;

const sourceFetch = () => ({
  ok: true,
  status: 200,
  redirected: false,
  type: "basic",
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
  text: async () => AUTHORED,
});

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  global.fetch = jest.fn(async () => sourceFetch());

  snapshot = await import("../../src/core/snapshot.js");
  await import("../../src/core/save-core.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  ({ source } = await import("../../src/plugins/source.js"));
  await source.ready;

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();
});

const served = new DOMParser().parseFromString(SERVED, "text/html");
const SERVED_HEAD = served.head.innerHTML;
const SERVED_BODY = served.body.innerHTML;

beforeEach(() => {
  // Filled in place: the dirty gate observes this document, and replacing its
  // documentElement would leave it watching a detached tree.
  document.head.innerHTML = SERVED_HEAD;
  document.body.innerHTML = SERVED_BODY;
  document.documentElement.removeAttribute("autosave");
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.clay;
  document.documentElement.removeAttribute("autosave");
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));

function onApplied() {
  const seen = [];
  const handler = (e) => seen.push(e.detail);
  document.addEventListener("clay:sync-applied", handler);
  seen.stop = () => document.removeEventListener("clay:sync-applied", handler);
  return seen;
}

async function settle(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

const projected = (frame) => frame.split(CLAY).join(CLAY_LOCAL);
const liveRuntime = () => document.querySelector("head script[src]").getAttribute("src");

test("peer lane: a projected frame merges clean and the live runtime URL stays projected", async () => {
  const autosaveState = await import("../../src/lib/autosave-state.js");
  autosaveState.setAutosaveActive(true);

  const sync = makeSync();
  await settle('<p data-id="text">hello</p>');
  const canonical = captureFrame();

  // The base is the frame this tab applied last, as the host relayed it: projected,
  // with no descriptor.
  sync.lastHtml = projected(canonical);

  // The peer's change, and this tab typing the same words.
  const frame = projected(canonical).replace("hello", "hello peer");
  expect(frame).not.toContain("clay-runtime-map");
  expect(frame).toContain(CLAY_LOCAL);
  document.querySelector('[data-id="text"]').textContent = "hello peer";
  await Promise.resolve();

  const saves = [];
  const realSaveAfterMerge = sync._saveAfterMerge;
  sync._saveAfterMerge = function (diverged, typed) {
    saves.push([diverged, typed]);
    return realSaveAfterMerge.call(this, diverged, typed);
  };

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 5, null);
  seen.stop();
  sync.stop();
  autosaveState.setAutosaveActive(false);

  expect(document.querySelector('[data-id="text"]').textContent).toBe("hello peer");
  expect(seen).toHaveLength(1);
  expect(seen[0].report.localDiverged).toBe(false);
  expect(liveRuntime()).toBe(CLAY_LOCAL);
  expect(saves).toEqual([[false, false]]);
});

test("peer lane: an identity map built from the canonical clone imports", async () => {
  const sender = makeSync();
  const sync = makeSync();
  await settle("<ul><li>x</li><li>x</li></ul>");
  sync.lastHtml = captureFrame();

  const clone = snapshot.captureSnapshot({ flushUndo: false });
  const frame = projected(snapshot.serializeForSync(clone));
  const map = sender.identity.exportMap(clone, snapshot.originalSnapshotNode);
  const [first, second] = document.querySelectorAll("li");
  const firstId = sender.identity.idOf(first);
  const secondId = sender.identity.idOf(second);
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 6, map);
  seen.stop();

  expect(sync.identity.idOf(document.querySelector("li"))).toBe(firstId);
  expect(sync.identity.idOf(document.querySelectorAll("li")[1])).toBe(secondId);
  expect(document.querySelectorAll("li")[0]).toBe(first);
  expect(document.querySelectorAll("li")[1]).toBe(second);
  expect(seen[0].report.localDiverged).toBe(false);
  expect(liveRuntime()).toBe(CLAY_LOCAL);
  sender.stop();
  sync.stop();
});

test("disk lane: two projected frames in a row both merge clean", async () => {
  const sync = makeSync();
  await settle('<p data-id="text">hello</p>');
  const canonical = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;
  sync._diskBase = canonical;
  sync._diskBaseTicket = sync._ticket();

  // A dirty tab whose edit the file now holds too: the first frame leaves nothing
  // local, and the second one's base is the first frame's raw, projected bytes.
  document.querySelector('[data-id="text"]').textContent = "hello file";
  await Promise.resolve();

  const first = projected(canonical).replace("hello", "hello file");
  const second = projected(canonical).replace("hello", "hello again");

  const seen = onApplied();
  await sync._doApplyExternal(first, 7);
  await sync._doApplyExternal(second, 8);
  seen.stop();
  sync.stop();

  expect(seen).toHaveLength(2);
  expect(seen[0].report.localDiverged).toBe(false);
  expect(seen[1].report.localDiverged).toBe(false);
  expect(document.querySelector('[data-id="text"]').textContent).toBe("hello again");
  expect(liveRuntime()).toBe(CLAY_LOCAL);
});

test("source plugin: a projected disk frame is not modelled, the file is fetched instead", async () => {
  const fileText = AUTHORED.replace("hello", "hello file");
  const fetched = [];
  global.fetch = jest.fn(async (url, options) => {
    if (options && options.headers && options.headers["Clay-Source"]) {
      fetched.push({ url, headers: options.headers });
    }
    return { ...sourceFetch(), text: async () => fileText };
  });

  expect(source.text()).toBe(AUTHORED);

  document.dispatchEvent(
    new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: SERVED } })
  );
  await new Promise((r) => setTimeout(r, 20));

  expect(fetched).toHaveLength(1);
  expect(fetched[0].url).toBe(window.location.href);
  expect(fetched[0].headers).toEqual({ "Clay-Source": "1" });
  expect(source.text()).toBe(fileText);
  expect(source.text()).not.toContain("/_/clayjs/");
  expect(source.text()).not.toContain("clay-runtime-map");
});

test("source plugin: an unprojected disk frame is modelled directly, with no fetch", async () => {
  const direct = AUTHORED.replace("hello", "hello disk");
  const fetched = [];
  global.fetch = jest.fn(async (url, options) => {
    if (options && options.headers && options.headers["Clay-Source"]) fetched.push(url);
    return sourceFetch();
  });

  document.dispatchEvent(
    new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: direct } })
  );
  await new Promise((r) => setTimeout(r, 20));

  expect(fetched).toHaveLength(0);
  expect(source.text()).toBe(direct);
});
