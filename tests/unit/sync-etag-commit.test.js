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
  // lastHtml is deliberately something ELSE, and every test here depends on that.
  // It is the last relay that COMPLETED, which lags the save whenever the response
  // beats the 150ms snapshot debounce, and reading it was the defect: the commit
  // went out pairing pre-save bytes with the new save's stamp. What the commit must
  // carry is _savedSnapshot, captured at snapshot-ready from the very clone the save
  // stored.
  function commitTab(over = {}) {
    const posted = [];
    return {
      posted,
      tab: {
        isDestroyed: false,
        isPaused: false,
        lastHtml: "<html>a stale relay</html>",
        _savedSnapshot: { html: "<html>what I saved</html>", identityMap: { a: 1 } },
        clientId: "tab-a",
        _profile: { relayPath: "/_/sync", documentHeader: "Document-URL", snapshotKey: "snapshot" },
        _log() {},
        _postCommit(html, etag, identityMap) { posted.push({ html, etag, identityMap }); },
        ...over,
      },
    };
  }

  const relay = (over) => {
    const { posted, tab } = commitTab(over);
    LiveSync.prototype._relayCommit.call(tab);
    return posted;
  };

  test("relays the bytes THIS SAVE stored, carrying the stamp that save returned", () => {
    recordEtag("stored-7");

    expect(relay()).toEqual([
      { html: "<html>what I saved</html>", etag: "stored-7", identityMap: { a: 1 } },
    ]);
  });

  // The regression this whole shape exists for. A tab that took its content from
  // lastHtml would send "<html>a stale relay</html>" with stamp stored-7, and a peer
  // adopting that pair holds bytes without the save in them while claiming the save's
  // version, so its next autosave passes If-Match and overwrites what it never saw.
  test("never sends the last completed relay in place of the saved bytes", () => {
    recordEtag("stored-7");

    const [frame] = relay();
    expect(frame.html).not.toBe("<html>a stale relay</html>");
  });

  // A save-saved with no capture behind it cannot know which bytes the stamp
  // describes, and §10 says a stamp must never travel on its own.
  test("says nothing when no snapshot was captured for this save", () => {
    recordEtag("stored-7");

    expect(relay({ _savedSnapshot: null })).toEqual([]);
  });

  // Consumed, not left behind: a later save-saved must not reuse an older save's
  // bytes under a newer stamp.
  test("consumes the captured snapshot, so it is never relayed twice", () => {
    recordEtag("stored-7");
    const { posted, tab } = commitTab();

    LiveSync.prototype._relayCommit.call(tab);
    LiveSync.prototype._relayCommit.call(tab);

    expect(posted).toHaveLength(1);
    expect(tab._savedSnapshot).toBeNull();
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

  test("says nothing before this tab has captured anything", () => {
    recordEtag("stored-7");

    expect(relay({ _savedSnapshot: undefined })).toEqual([]);
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
