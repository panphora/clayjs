import { jest } from "@jest/globals";

// Stamps are broadcast when a save lands, not when a merge succeeds. So every stamp
// that arrived while this tab was holding was refused and nothing ever re-sends it.
// Once the hold clears the tab is back in step and still carrying a stamp from
// before it, and its next save is refused over a conflict that has already resolved
// itself. That is the notice crying wolf, which is how people learn to ignore it.

const seedEtag = jest.fn();

jest.unstable_mockModule("../../src/core/etag.js", () => ({
  seedEtag,
  recordEtag: jest.fn(),
  lastSeenEtag: jest.fn(),
  conditionalSaves: jest.fn(() => true),
  forgetEtag: jest.fn(),
}));

class FakeEventSource extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 0; }
  close() {}
}

let LiveSync;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;

  const mod = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = mod);
  mod.liveSync.stop();
});

beforeEach(() => seedEtag.mockClear());

// The real method on a minimal receiver carrying only the state it reads, so a
// change to live-sync.js breaks these rather than a copy of its rule.
const setHeld = (state, lane, isHeld) =>
  LiveSync.prototype._setHeld.call({ _heldLive: false, _heldExt: false, ...state }, lane, isHeld);

test("a cleared hold asks the host for the current stamp", () => {
  setHeld({ _heldLive: true }, "live", false);

  expect(seedEtag).toHaveBeenCalledTimes(1);
});

test("it refetches, and never clears the stamp it already holds", () => {
  setHeld({ _heldLive: true }, "live", false);

  // Clearing fails OPEN: an empty answer would drop the guard and let the next save
  // overwrite silently. A stale stamp only ever costs one refusal.
  expect(seedEtag).toHaveBeenCalledWith({ fresh: true, clearIfMissing: false });
});

test("one lane resuming while the other still holds asks for nothing", () => {
  setHeld({ _heldLive: true, _heldExt: true }, "live", false);

  // Still behind on the external lane, so the old stamp is the correct thing to keep.
  expect(seedEtag).not.toHaveBeenCalled();
});

test("the external lane clearing counts too", () => {
  setHeld({ _heldExt: true }, "external", false);

  expect(seedEtag).toHaveBeenCalledTimes(1);
});

test("entering a hold asks for nothing", () => {
  setHeld({}, "live", true);

  expect(seedEtag).not.toHaveBeenCalled();
});

test("a no-op call asks for nothing", () => {
  // Already clear. Without the early return this would refetch on every merged
  // frame, which is most frames.
  setHeld({ _heldLive: false }, "live", false);

  expect(seedEtag).not.toHaveBeenCalled();
});
