import { jest } from "@jest/globals";

/**
 * Two template versions never merge (plan 05, Step 5). A saved frame states the
 * version it was published at; when that is not this page's version the frame is
 * neither merged nor applied, every save is held, and the notice offers a reload.
 * A page without the meta, or a frame whose version matches, behaves as before.
 *
 * jsdom ships no EventSource, so the fake is installed before live-sync.js loads.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let save;
let gate;
let etag;
let versionGuard;
let notice;

beforeAll(async () => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  save = await import("../../src/core/save.js");
  gate = await import("../../src/lib/dirty-gate.js");
  etag = await import("../../src/core/etag.js");
  versionGuard = await import("../../src/sync/version-guard.js");
  await import("../../src/core/conflict-notice.js");
  notice = await import("../../src/core/conflict-notice-ui.js");
});

beforeEach(async () => {
  versionGuard._test.reset();
  notice._test.resetUpgrade();
  notice._test.render();
  while (save.savesHeld()) save.releaseAllSaves({ replay: false, reason: versionGuard.UPGRADED_MESSAGE });
  document.head.innerHTML = '<meta name="hyper-version" content="1.0.0">';
  document.body.innerHTML = '<section data-id="b"><p>b0</p></section>';
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
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

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

const diskDoc = (body, version = "1.0.0") =>
  `<!DOCTYPE html><html><head>${
    version ? `<meta name="hyper-version" content="${version}">` : ""
  }</head><body>${body}</body></html>`;

const noticeEl = () => document.querySelector("[data-clay-conflict]");
const noticeText = () => (noticeEl() ? noticeEl().textContent : "");
const noticeButton = (label) =>
  noticeEl() ? [...noticeEl().querySelectorAll("button")].find((b) => b.textContent === label) : null;

test("a frame carrying this page's version applies as it does today", async () => {
  const sync = makeSync();

  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>from disk</p></section>', "1.0.0"), 1, "E1");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("from disk");
  expect(save.savesHeld()).toBe(false);
  expect(noticeText()).not.toContain("upgraded");
  sync.stop();
});

test("a frame carrying no version applies as it does today", async () => {
  const sync = makeSync();

  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>no version</p></section>', null), 1, "E1");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("no version");
  expect(save.savesHeld()).toBe(false);
  sync.stop();
});

test("a page that states no version takes every frame, whatever it carries", async () => {
  document.head.innerHTML = "";
  const sync = makeSync();

  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>2.0</p></section>', "2.0.0"), 1, "E1");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("2.0");
  expect(save.savesHeld()).toBe(false);
  sync.stop();
});

test("a frame carrying another version is not applied, saves are held, and the notice offers Reload", async () => {
  const sync = makeSync();

  await sync._doApplyExternal(
    diskDoc('<section data-id="b"><p>upgraded layout</p></section>', "2.0.0"),
    2,
    "E2"
  );

  // Nothing of the frame reached the page.
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b0");
  expect(document.documentElement.outerHTML).not.toContain("upgraded layout");
  // And this tab cannot write its version back over the upgrade.
  expect(save.savesHeld()).toBe(true);
  expect(save.saveHoldReason()).toBe(versionGuard.UPGRADED_MESSAGE);

  expect(await until(() => noticeText().includes("This document was upgraded."))).toBe(true);
  expect(noticeButton("Reload")).toBeTruthy();
  sync.stop();
});

test("once refused, a later frame is refused too, whatever version it carries", async () => {
  const sync = makeSync();
  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>other</p></section>', "2.0.0"), 3, "E3");

  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>back to mine</p></section>', "1.0.0"), 4, "E4");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b0");
  expect(save.savesHeld()).toBe(true);
  sync.stop();
});

// The peer lane is the other way a newer version reaches a tab: hyperclay relays
// every /_/save as a live-lane frame, and a peer snapshot arrives on the same
// slot. Neither merges into a page of another version.

test("a live-lane frame carrying another version is not merged, the meta stays, saves are held and the notice is shown", async () => {
  const sync = makeSync();

  await sync._doApplyUpdate(
    diskDoc('<section data-id="b"><p>upgraded layout</p></section>', "2.0.0"),
    2,
    null,
    "E2"
  );

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b0");
  expect(document.documentElement.outerHTML).not.toContain("upgraded layout");
  expect(document.querySelector('meta[name="hyper-version"]').getAttribute("content")).toBe("1.0.0");
  expect(save.savesHeld()).toBe(true);
  expect(save.saveHoldReason()).toBe(versionGuard.UPGRADED_MESSAGE);
  expect(await until(() => noticeText().includes("This document was upgraded."))).toBe(true);
  expect(noticeButton("Reload")).toBeTruthy();
  sync.stop();
});

test("a peer snapshot after a refusal is refused too", async () => {
  const sync = makeSync();
  await sync._doApplyExternal(diskDoc('<section data-id="b"><p>other</p></section>', "2.0.0"), 3, "E3");

  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>snapshot</p></section>', "2.0.0"), 4, null, "E4");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b0");
  expect(document.documentElement.outerHTML).not.toContain("snapshot");
  expect(document.querySelector('meta[name="hyper-version"]').getAttribute("content")).toBe("1.0.0");
  expect(save.savesHeld()).toBe(true);
  sync.stop();
});

test("a live-lane frame carrying this page's version still applies", async () => {
  const sync = makeSync();

  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>live</p></section>', "1.0.0"), 5, null, "E5");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("live");
  expect(save.savesHeld()).toBe(false);
  expect(noticeText()).not.toContain("upgraded");
  sync.stop();
});
