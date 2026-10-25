import { jest } from "@jest/globals";

/**
 * The reader's saved lane refuses a newer version of the document too. A Kanban
 * opened in view mode streams the saved lane through `_doApplyUpdate`; a frame
 * another version wrote is neither merged nor applied there either, the stream
 * stops for good and the same notice offers Reload.
 *
 * A view-mode tab has no save lane, so nothing is held: the hold is edit and
 * draft mode's, exactly as version-guard.js already decides it.
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
let versionGuard;
let notice;

beforeAll(async () => {
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

  versionGuard = await import("../../src/sync/version-guard.js");
  notice = await import("../../src/core/conflict-notice-ui.js");
});

beforeEach(() => {
  versionGuard._test.reset();
  notice._test.resetUpgrade();
  notice._test.render();
  document.head.innerHTML = '<meta name="hyper-version" content="1.0.0">';
  document.body.innerHTML = '<section data-id="b"><p>b0</p></section>';
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
  sync.lane = "saved";
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

test("a saved-lane frame carrying another version is not applied, the meta stays, and the notice offers Reload", async () => {
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
  expect(await until(() => noticeText().includes("This document was upgraded."))).toBe(true);
  expect(noticeButton("Reload")).toBeTruthy();
  sync.stop();
});

test("after a refusal a peer snapshot is refused too, whatever version it carries", async () => {
  const sync = makeSync();
  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>upgraded layout</p></section>', "2.0.0"), 3, null, "E3");

  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>snapshot</p></section>', "2.0.0"), 4, null, "E4");
  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>back to mine</p></section>', "1.0.0"), 5, null, "E5");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b0");
  expect(document.documentElement.outerHTML).not.toContain("snapshot");
  expect(document.documentElement.outerHTML).not.toContain("back to mine");
  sync.stop();
});

test("a saved-lane frame carrying this page's version still applies", async () => {
  const sync = makeSync();

  await sync._doApplyUpdate(diskDoc('<section data-id="b"><p>saved</p></section>', "1.0.0"), 5, null, "E5");

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("saved");
  expect(noticeText()).not.toContain("upgraded");
  sync.stop();
});
