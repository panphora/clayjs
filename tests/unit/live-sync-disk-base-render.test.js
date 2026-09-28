/** @jest-environment jsdom */
import { jest } from "@jest/globals";

/**
 * The disk base live sync seeds has to be the bytes a SAVE would send.
 *
 * A merge base is a string the morph parses as one side of a three-way merge, so it has to
 * parse back to the tree the page is in. The save clone's own serialization does not always:
 * a <pre> whose first child starts with a newline loses one on the way back in through the
 * HTML parser, so bytes serialized from a page holding "\nalpha" parse as "alpha" — the same
 * as an incoming frame that DELETES that newline. The morph then reads a real remote change
 * as no change and keeps the local newline. The rendered bytes are the author's own, which
 * round-trip through the parser by construction, and the save path verifies that.
 *
 * So this pins the real seeding path, not a capture called by hand: start() has to seed the
 * disk lane through the renderer, and the merge that follows has to carry the remote change.
 */
const SRC = "<!DOCTYPE html><html><head></head><body><pre id=p>\n\nalpha</pre><p id=other>old</p></body></html>";

let snapshot;
let source;
let save;
let dirtyGate;
let LiveSync;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

beforeAll(async () => {
  jest.useRealTimers();
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.clayEditMode = true;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => SRC,
  }));

  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
  dirtyGate = await import("../../src/lib/dirty-gate.js");
  ({ source } = await import("../../src/plugins/source.js"));
  await source.ready;

  // No server from here on: the discovery request fails and the profile falls back, which
  // is all the seeding below needs. The stream itself is the fake EventSource above.
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" }));
  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  // The singleton auto-starts on import; this file builds its own instance.
  liveSyncModule.liveSync.stop();
});

beforeEach(() => {
  jest.restoreAllMocks();
});

test("a disk base seeded by start() renders, so an incoming <pre> newline removal survives the merge", async () => {
  expect(source.stats().installed).toBe(true);
  expect(source.text()).toBe(SRC);

  // A seed is taken over a clean page only. Nothing here is unsaved work, so the gate is
  // cleared the way a completed save clears it.
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  dirtyGate.gateClearIfUnchanged(dirtyGate.gateCaptureToken());

  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  sync.start("index.html");
  const base = sync._diskBase;
  sync.stop();

  expect(base).toBe(SRC);

  document.querySelector("#other").textContent = "local unsaved edit";

  const { HyperMorph } = await import("../../src/vendor/hyper-morph.vendor.js");
  const report = await HyperMorph.mergeDocument({
    live: document,
    base,
    remote: SRC.replace("<pre id=p>\n\nalpha", "<pre id=p>alpha"),
    local: { root: snapshot.captureSaveClone(), toLive: snapshot.originalSnapshotNode },
  });

  expect(document.querySelector("#other").textContent).toBe("local unsaved edit");
  expect(document.querySelector("pre").textContent).toBe("alpha");
  expect(report.conflicts).toHaveLength(0);
});
