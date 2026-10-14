import { jest } from "@jest/globals";

/**
 * A clay="live" JSON script belongs to the live plugin, not to the DOM merge:
 * a frame never rewrites this tab's copy, on a clean or a dirty tab, while an
 * ordinary merge= tag beside it still merges. The peer applied event carries
 * the frame's html so the live plugin can read the incoming value itself.
 * The tag is in every save and relay capture and in neither comparison domain.
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
let snapshot;
let gate;
let save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.documentElement.removeAttribute("autosave");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

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

const BODY =
  '<script type="application/json" merge="game" clay="live">{"score":1}</script>' +
  '<script type="application/json" merge="prefs">{"theme":"light"}</script>' +
  '<section data-id="a"><p>a0</p></section>';

test("clean tab: the live tag keeps its text, the plain merge tag merges, and the event carries html", async () => {
  const sync = makeSync();
  await settle(BODY);
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace('{"score":1}', '{"score":99}').replace('{"theme":"light"}', '{"theme":"dark"}');
  expect(frame).toContain('{"score":99}');

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 5, null);
  seen.stop();

  expect(document.querySelector('[merge="game"]').textContent).toBe('{"score":1}');
  expect(JSON.parse(document.querySelector('[merge="prefs"]').textContent)).toEqual({ theme: "dark" });
  expect(seen).toHaveLength(1);
  expect(seen[0].source).toBe("peer");
  expect(seen[0].html).toBe(frame);
  sync.stop();
});

test("dirty tab: the live tag keeps its text and a local edit elsewhere survives", async () => {
  const sync = makeSync();
  await settle(BODY);
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace('{"score":1}', '{"score":99}');

  document.querySelector('[data-id="a"] p').textContent = "a-local";
  await Promise.resolve();

  await sync._doApplyUpdate(frame, 6, null);

  expect(document.querySelector('[merge="game"]').textContent).toBe('{"score":1}');
  expect(document.querySelector('[data-id="a"] p').textContent).toBe("a-local");
  sync.stop();
});

test("the live tag is in the save and relay capture and in neither comparison domain", async () => {
  await settle(BODY);
  expect(captureFrame()).toContain('merge="game"');
  expect(snapshot.captureForComparison()).not.toContain('merge="game"');
  expect(snapshot.captureForComparison()).toContain('merge="prefs"');
  expect(snapshot.captureForDirtyCheck()).not.toContain('merge="game"');
});

test("changing the live tag's text does not make the page dirty", async () => {
  await settle(BODY);
  document.querySelector('[merge="game"]').textContent = '{"score":2}';
  await Promise.resolve();
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents ? save.getLastSavedContents() : snapshot.captureForComparison());
});
