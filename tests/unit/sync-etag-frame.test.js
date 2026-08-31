// Scenario: a version stamp may only be adopted together with the content it
// describes, and a stamp that arrives alone is dropped.
//
// ⚠️ This file used to assert the opposite: that a lone stamp was TAKEN whenever
// neither lane was held. That was wrong, and it is the defect this replaces.
//
// A stamp says "disk is at this version". Adopting it says, additionally, "and I
// hold those bytes". Only the second claim makes the next save safe, and a frame
// with no content is no evidence for it. The race is real: a peer's save and that
// peer's snapshot relay are two concurrent requests, so a lone stamp can arrive
// before the content it belongs to. This tab would record it while its DOM still
// held the older version, and its next save would then pass If-Match and overwrite
// the save it had never received.
//
// The hold flags cannot close that. A lane holds when an incoming change could NOT
// be merged into an unsaved local edit, never when a change has yet to arrive, so
// the racing tab is not held and the guard never fires.
//
// The stamp now rides on the snapshot the saving tab relays once its save returns,
// and `_doApplyUpdate` records it only after that content has merged. The hold
// guard still matters there and is tested in sync-etag-commit.test.js.

// jsdom ships no EventSource, and live-sync.js has a singleton that auto-starts
// on import, so the fake has to be installed first. Same setup the other
// live-sync tests use.
class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let recordEtag;
let lastSeenEtag;
let forgetEtag;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  ({ recordEtag, lastSeenEtag, forgetEtag } = await import("../../src/core/etag.js"));
});

// The real method, on a minimal receiver carrying only the state it reads. This
// calls the shipping implementation rather than a copy of its rule, so a change
// to live-sync.js breaks these tests.
const applyEtagFrame = (held, data) =>
  LiveSync.prototype._applyEtagFrame.call(
    { _heldLive: false, _heldExt: false, _log() {}, ...held },
    data
  );

beforeEach(() => {
  forgetEtag();
});

test("a stamp arriving with no document is dropped, not taken", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, { etag: "stamp-after" });

  // Handled, so nothing tries to morph a frame with no document in it.
  expect(handled).toBe(true);
  expect(lastSeenEtag()).toBe("stamp-before");
});

test("being in step changes nothing: there is still no content to be in step WITH", () => {
  recordEtag("stamp-before");

  applyEtagFrame({ _heldLive: false, _heldExt: false }, { etag: "stamp-after" });

  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a held tab drops it too, for the reason it always did", () => {
  recordEtag("stamp-before");

  applyEtagFrame({ _heldLive: true }, { etag: "stamp-after" });
  applyEtagFrame({ _heldExt: true }, { etag: "stamp-after" });

  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a frame carrying a document is not a stamp-only frame", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, {
    etag: "stamp-after",
    html: "<html>a real update</html>",
  });

  // Falls through to the apply path, which is the only place a stamp is taken.
  expect(handled).toBe(false);
  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a frame with no stamp is not a stamp-only frame", () => {
  const handled = applyEtagFrame({}, { sender: "someone", seq: 4 });

  expect(handled).toBe(false);
});

test("a non-string stamp is not a stamp-only frame either", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, { etag: 12345 });

  expect(handled).toBe(false);
  expect(lastSeenEtag()).toBe("stamp-before");
});
