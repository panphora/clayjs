// Scenario: a stamp travels ON the content it describes, and is adopted only when
// that content lands.
//
// One tab saves. Every other editing tab is now holding a stale stamp, and its
// next conditional save is refused over a change it has no quarrel with. Telling
// them is what this frame is for. What it must NOT do is tell them they are in
// step with disk when they are not, which is what a stamp travelling alone did:
// a save and its tab's snapshot relay are two concurrent requests, so the stamp
// could arrive first and the receiving tab's next save would then overwrite it.
//
// So there is one rule, and these tests are that rule: adopting the stamp and
// applying the bytes are the same event, and neither happens without the other.

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

beforeEach(() => {
  forgetEtag();
});

// The shipping queue, on a minimal receiver. applyUpdate only fills the pending
// slot and asks for a frame, so this reads what it parked without morphing.
function queue(html, seq, identityMap, etag) {
  const tab = {
    isDestroyed: false,
    _pendingHtml: null,
    _pendingSeq: null,
    _pendingIdentityMap: null,
    _pendingEtag: null,
    _scheduleNextFrame() {},
  };
  LiveSync.prototype.applyUpdate.call(tab, html, seq, identityMap, etag);
  return tab;
}

describe("the stamp rides in the slot beside the bytes", () => {
  test("a frame's stamp is parked with its content, not applied on arrival", () => {
    recordEtag("stamp-before");

    const tab = queue("<html>peer</html>", 4, undefined, "stamp-after");

    expect(tab._pendingHtml).toBe("<html>peer</html>");
    expect(tab._pendingEtag).toBe("stamp-after");
    // Nothing has merged yet, so nothing has been adopted yet.
    expect(lastSeenEtag()).toBe("stamp-before");
  });

  test("a frame with no stamp parks none, rather than keeping the last one", () => {
    const tab = queue("<html>peer</html>", 4, undefined, undefined);

    expect(tab._pendingEtag).toBeNull();
  });

  // The slot is one deep and newer wins. A superseded frame takes its stamp with
  // it, which is right: that stamp describes bytes that are no longer what will
  // apply. The cost is one honest 412 later, which is the safe direction to fail.
  test("a newer frame replacing an older one takes the older stamp with it", () => {
    const tab = queue("<html>first</html>", 4, undefined, "stamp-first");
    LiveSync.prototype.applyUpdate.call(tab, "<html>second</html>", 5, undefined, undefined);

    expect(tab._pendingHtml).toBe("<html>second</html>");
    expect(tab._pendingEtag).toBeNull();
  });
});

describe("a saving tab tells the other editors, and only when it has something to tell", () => {
  function commitTab(over = {}) {
    const posted = [];
    return {
      posted,
      tab: {
        isDestroyed: false,
        isPaused: false,
        lastHtml: "<html>what I saved</html>",
        clientId: "tab-a",
        _profile: { relayPath: "/_/sync", documentHeader: "Document-URL", snapshotKey: "snapshot" },
        _log() {},
        _postCommit(html, etag) { posted.push({ html, etag }); },
        ...over,
      },
    };
  }

  const relay = (over) => {
    const { posted, tab } = commitTab(over);
    LiveSync.prototype._relayCommit.call(tab);
    return posted;
  };

  test("relays the bytes it last sent, carrying the stamp its save returned", () => {
    recordEtag("stored-7");

    expect(relay()).toEqual([{ html: "<html>what I saved</html>", etag: "stored-7" }]);
  });

  test("says nothing when the save returned no stamp", () => {
    forgetEtag();

    expect(relay()).toEqual([]);
  });

  // Holding a stamp IS the condition. A host that does not do conditional saves
  // returns none, so there is one test rather than two, and no branch that can
  // only be reached by driving discovery.
  test("says nothing on a host whose saves return no stamp", () => {
    recordEtag(null);

    expect(relay()).toEqual([]);
  });

  test("says nothing before this tab has ever relayed a snapshot", () => {
    recordEtag("stored-7");

    expect(relay({ lastHtml: null })).toEqual([]);
  });

  test("says nothing while paused or destroyed", () => {
    recordEtag("stored-7");

    expect(relay({ isPaused: true })).toEqual([]);
    expect(relay({ isDestroyed: true })).toEqual([]);
  });
});

describe("the body a commit frame puts on the wire", () => {
  test("names the snapshot lane and carries the stamp beside it", async () => {
    const sent = [];
    global.fetch = (url, options) => {
      sent.push({ url: String(url), body: JSON.parse(options.body) });
      return Promise.resolve({ ok: true });
    };

    LiveSync.prototype._postCommit.call({
      clientId: "tab-a",
      _profile: { relayPath: "/_/sync", documentHeader: "Document-URL", snapshotKey: "snapshot" },
      _log() {},
    }, "<html>saved</html>", "stored-7");

    expect(sent).toHaveLength(1);
    expect(sent[0].body.snapshot).toBe("<html>saved</html>");
    expect(sent[0].body.etag).toBe("stored-7");
    expect(sent[0].body.sender).toBe("tab-a");
  });

  // A stamp with no content is the thing this whole design refuses, so the frame
  // that carries one must never be able to become that by accident.
  test("never puts a stamp on the wire without content", () => {
    const sent = [];
    global.fetch = (url, options) => {
      sent.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true });
    };

    LiveSync.prototype._postCommit.call({
      clientId: "tab-a",
      _profile: { relayPath: "/_/sync", documentHeader: "Document-URL", snapshotKey: "snapshot" },
      _log() {},
    }, "<html>saved</html>", "stored-7");

    expect(typeof sent[0].snapshot).toBe("string");
    expect(sent[0].snapshot.length).toBeGreaterThan(0);
  });
});
