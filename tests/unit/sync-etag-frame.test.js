// Scenario: the host tells editing tabs the new stamp, and a tab only takes it
// while it is actually in step with disk.
//
// An editing tab never receives the saved document (that lane is viewers only,
// because dropping a saved document onto an editor would replace work in
// progress). So before this frame existed, one tab saving made every other
// editing tab's stamp stale, and their next conditional save was refused over a
// change they had no quarrel with: a conflict about nothing.
//
// The exception is the whole point. When live sync cannot merge an incoming
// change into an unsaved local edit it HOLDS the frame and keeps this tab's
// version, so the DOM here is knowingly missing what disk holds. Live sync's own
// comment says such a tab "converges through its own next save", and that
// convergence is an overwrite of the change it could not merge. A held tab must
// therefore refuse the new stamp, so its next save is refused and somebody is
// told, instead of the overwrite happening silently.

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
    { _heldLive: false, _heldExt: false, ...held },
    data
  );

beforeEach(() => {
  forgetEtag();
});

test("an in-step editor takes the new stamp", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, { etag: "stamp-after" });

  expect(handled).toBe(true);
  expect(lastSeenEtag()).toBe("stamp-after");
});

test("a tab holding on the live lane keeps its old stamp", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({ _heldLive: true }, { etag: "stamp-after" });

  expect(handled).toBe(true);
  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a tab holding on the external lane keeps its old stamp too", () => {
  recordEtag("stamp-before");

  applyEtagFrame({ _heldExt: true }, { etag: "stamp-after" });

  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a frame carrying a document is not a stamp frame", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, {
    etag: "stamp-after",
    html: "<html>a real update</html>",
  });

  // Falls through to the morph path, which owns its own stamp handling.
  expect(handled).toBe(false);
  expect(lastSeenEtag()).toBe("stamp-before");
});

test("a frame with no stamp is not a stamp frame", () => {
  const handled = applyEtagFrame({}, { sender: "someone", seq: 4 });

  expect(handled).toBe(false);
});

test("a non-string stamp is ignored rather than recorded", () => {
  recordEtag("stamp-before");

  const handled = applyEtagFrame({}, { etag: 12345 });

  expect(handled).toBe(false);
  expect(lastSeenEtag()).toBe("stamp-before");
});
