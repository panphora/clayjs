import { jest } from "@jest/globals";

import { PresenceStore, presence } from "../../src/sync/presence-store.js";
import { EditingSender } from "../../src/sync/editing-sender.js";

/**
 * One transport and one sender per document (Document 10 Step 5).
 *
 * The store is the sender: a page target and the generic caret marker both go
 * through it, so a document can never have two of them talking at once. What has
 * to hold: only the latest target is kept, requests are serialized so an old clear
 * cannot overtake a newer target, an explicit page target silences the positional
 * marker until its owner releases it, a reconnect starts a fresh session, and
 * cleanup cancels future publication and releases only the lease it made.
 */

const PAGE = {
  kind: "page",
  v: 1,
  epoch: "room-7",
  generation: 0,
  selection: {
    kind: "text",
    anchor: { block: "p1", rel: "AAAAAA==" },
    head: { block: "p1", rel: "AAAAAA==" },
  },
};

const SELF = { id: "self-pseudonym", token: "token-a" };
const SELF_AGAIN = { id: "self-pseudonym", token: "token-b" };
const ADA = { id: "p_ada", name: "Ada Lovelace", you: false, canEdit: true };

const frame = (people, selfSession = null) => ({ people, anonymous: 0, selfSession });

let store;

beforeEach(() => {
  jest.useFakeTimers();
  store = new PresenceStore();
});

afterEach(() => {
  jest.useRealTimers();
});

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function recording() {
  const sent = [];
  const lease = store.attachTransport({
    send: async (body) => {
      sent.push(body);
      return true;
    },
  });
  return { lease, sent };
}

describe("the one sender", () => {
  test("only the latest target is sent, once per coalescing window", async () => {
    const { sent } = recording();

    store.setGeneric("0");
    store.setGeneric("1");
    store.setGeneric("2");
    expect(sent).toHaveLength(0);

    jest.advanceTimersByTime(250);
    await settle();

    expect(sent).toEqual([{ editing: "2" }]);
  });

  test("a clear during an in-flight request queues behind it", async () => {
    const sent = [];
    let release = null;
    store.attachTransport({
      send: (body) => {
        sent.push(body);
        return new Promise((resolve) => {
          release = () => resolve(true);
        });
      },
    });

    store.setGeneric("0");
    jest.advanceTimersByTime(250);
    expect(sent).toEqual([{ editing: "0" }]);

    store.setGeneric(null);
    jest.advanceTimersByTime(1000);
    expect(sent).toHaveLength(1);

    release();
    await settle();

    expect(sent).toEqual([{ editing: "0" }, { editing: null }]);
  });

  test("an old null cannot overtake a newer target", async () => {
    const sent = [];
    let release = null;
    store.attachTransport({
      send: (body) => {
        sent.push(body);
        return new Promise((resolve) => {
          release = () => resolve(true);
        });
      },
    });

    store.setGeneric("0");
    jest.advanceTimersByTime(250);
    expect(sent).toHaveLength(1);

    store.setGeneric(null);
    store.setGeneric("1");
    release();
    await settle();
    jest.advanceTimersByTime(250);
    await settle();

    expect(sent).toEqual([{ editing: "0" }, { editing: "1" }]);
  });

  test("an explicit page target silences the marker until its owner releases it", async () => {
    const { sent } = recording();
    store.receive(frame([], SELF));

    expect(store.setTarget(PAGE)).toBe(true);
    jest.advanceTimersByTime(250);
    await settle();
    expect(sent).toEqual([{ v: 1, session: SELF.token, n: 1, editing: PAGE }]);

    // The generic caret path is the page's subordinate: it may not speak over it.
    expect(store.setGeneric("0")).toBe(false);
    jest.advanceTimersByTime(250);
    await settle();
    expect(sent).toHaveLength(1);

    // A clear is the page's, and it does not fall back to a positional marker.
    store.setTarget(null);
    await settle();
    expect(sent.at(-1)).toEqual({ editing: null });
    expect(store.setGeneric("0")).toBe(false);
    jest.advanceTimersByTime(250);
    await settle();
    expect(sent.at(-1)).toEqual({ editing: null });

    // Teardown gives the target up with the ownership, and the marker speaks again.
    expect(store.releaseTarget()).toBe(true);
    expect(store.setGeneric("0")).toBe(true);
    jest.advanceTimersByTime(250);
    await settle();
    expect(sent.at(-1)).toEqual({ editing: "0" });
  });

  test("a reconnect starts a fresh session, and the old token is never used again", async () => {
    const { sent } = recording();
    store.receive(frame([], SELF));
    store.setTarget(PAGE);
    jest.advanceTimersByTime(250);
    await settle();
    expect(sent).toEqual([{ v: 1, session: SELF.token, n: 1, editing: PAGE }]);

    store.reconnect();
    store.setTarget(PAGE);
    jest.advanceTimersByTime(250);
    await settle();
    // A page target needs the connection's session, so it waits for one.
    expect(sent).toHaveLength(1);

    store.receive(frame([], SELF_AGAIN));
    await settle();
    expect(sent).toEqual([
      { v: 1, session: SELF.token, n: 1, editing: PAGE },
      { v: 1, session: SELF_AGAIN.token, n: 1, editing: PAGE },
    ]);
  });
});

describe("ownership and cleanup", () => {
  test("detaching an obsolete lease leaves a newer owner's roster and sender alone", async () => {
    const first = recording();
    store.receive(frame([ADA], SELF));
    const second = recording();

    first.lease.detach();
    expect(second.lease.active).toBe(true);
    expect(store.getSnapshot().people.map((person) => person.name)).toEqual(["Ada Lovelace"]);

    second.lease.detach();
    expect(store.getSnapshot().people).toEqual([]);
    expect(store.getSnapshot().anonymous).toBe(0);
  });

  test("no stale publication survives 100 view/edit transitions", async () => {
    const { sent } = recording();
    sent.length = 0;
    let last = null;

    for (let i = 0; i < 100; i++) {
      const lease = store.attachTransport({ send: async (body) => { sent.push(body); return true; } });
      store.setGeneric("0");
      jest.advanceTimersByTime(250);
      await settle();
      lease.detach();
      last = lease;
    }

    expect(sent).toHaveLength(100);
    expect(last.active).toBe(false);

    // Nothing is left scheduled: a detached owner publishes nothing, ever again.
    store.setGeneric("0");
    jest.advanceTimersByTime(60000);
    await settle();
    expect(sent).toHaveLength(100);
  });
});

describe("the gate a leave closes", () => {
  const ME = { id: "p_me", name: "Me", you: true };

  class FakeChannel {}

  beforeAll(() => {
    global.BroadcastChannel = FakeChannel;
    window.BroadcastChannel = FakeChannel;
  });

  const senders = [];

  // The participant clears the facade the page shares, so these tests drive that one.
  beforeEach(() => {
    presence.owner?.detach();
    presence.clear();
  });

  afterEach(() => {
    senders.splice(0).forEach((sender) => sender.stop());
    presence.owner?.detach();
    presence.clear();
  });

  // An editor with the marker publishing through the store: a caret on `one`, one
  // other person present, and a request that landed.
  async function editing() {
    document.body.innerHTML =
      '<div id="one" contenteditable="true">one</div><div id="two" contenteditable="true">two</div>';
    const sent = [];
    const lease = presence.attachTransport({ send: async (body) => { sent.push(body); return true; } });
    const sender = new EditingSender({});
    senders.push(sender);
    sender.start();
    sender.roster({ people: [ME, ADA] });
    document.getElementById("one").focus();
    await jest.advanceTimersByTimeAsync(1000);
    const sync = { _editing: sender, lane: "view", _morphInFlight: false, stop: () => {} };
    const { syncParticipant } = await import("../../src/sync/live-sync-edit.js");
    const participant = await syncParticipant(sync).prepare({});
    return { sent, lease, sender, participant };
  }

  // Quiesced: the caret the tab was showing is cleared, and the sender is stopped
  // rather than merely cleared.
  async function quiesced() {
    const session = await editing();
    expect(session.sent).toEqual([{ editing: "0" }]);
    expect(session.participant.quiesce()).toEqual({ ok: true });
    await jest.advanceTimersByTimeAsync(250);
    expect(session.sent).toEqual([{ editing: "0" }, { editing: null }]);
    return session;
  }

  test("no roster frame during the exit republishes the caret (relay-first-frame-during-leave)", async () => {
    const { sent, lease, sender } = await quiesced();

    // The exit barrier is still running when the stream says everybody else left.
    sender.roster({ people: [ME] });
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);

    lease.detach();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
  });

  test("no focus move during the exit republishes the caret (relay-focus-move-during-leave)", async () => {
    const { sent, lease } = await quiesced();

    document.getElementById("two").focus();
    document.dispatchEvent(new Event("selectionchange"));
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);

    lease.detach();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
  });

  test("a reconnect during the exit publishes nothing (relay-reconnect-during-leave)", async () => {
    const { sent, lease, sender } = await quiesced();

    sender.reconnected();
    presence.reconnect();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);

    lease.detach();
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
  });

  test("a refused exit resumes publishing the target it was leaving", async () => {
    const { sent, participant } = await quiesced();

    participant.resume();
    await jest.advanceTimersByTimeAsync(250);

    // The clear went with the quiesce, so the target the tab still holds goes again.
    expect(sent).toEqual([{ editing: "0" }, { editing: null }, { editing: "0" }]);
  });
});

describe("the page's caret at the gate a leave closes", () => {
  let createPageAwareness;
  let createYPageBinding;
  let seedValue;
  let createStore;
  let identityPlugin;
  let EditorState;
  let EditorView;
  let TextSelection;
  let opened;

  beforeAll(async () => {
    ({ createPageAwareness } = await import("../../src/page/awareness.js"));
    ({ createYPageBinding, seedValue } = await import("../../src/page/ybind/index.js"));
    ({ createStore } = await import("../../src/live/store.js"));
    ({ identityPlugin } = await import("../../src/page/model.js"));
    const pm = await import("../../src/vendor/prosemirror.vendor.js");
    EditorState = pm.state.EditorState;
    EditorView = pm.view.EditorView;
    TextSelection = pm.state.TextSelection;
  });

  beforeEach(() => {
    presence.owner?.detach();
    presence.clear();
    presence.explicit = false;
    opened = [];
    document.body.innerHTML = "";
  });

  afterEach(() => {
    for (const one of opened.splice(0)) {
      one.awareness?.dispose();
      one.view.destroy();
      one.binding.dispose();
      one.binding.ydoc.destroy();
    }
    presence.owner?.detach();
    presence.clear();
    presence.explicit = false;
  });

  // The page editor this tab mounted, publishing through the document's one store.
  function page() {
    const store = createStore({ name: "page", value: seedValue([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }]) });
    const binding = createYPageBinding({ store });
    const editor = new EditorView(document.body.appendChild(document.createElement("div")), {
      state: EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
      dispatchTransaction: (tr) => binding.dispatch(tr),
    });
    binding.attach(editor);
    const awareness = createPageAwareness({
      binding,
      view: editor,
      store: presence,
      epoch: "id:doc-1",
      frame: () => 0,
      cancel: () => {},
    });
    const one = { store, binding, view: editor, awareness };
    opened.push(one);
    editor.dom.dispatchEvent(new Event("focus"));
    return one;
  }

  const pagePosts = (sent) => sent.filter((body) => body.editing && body.editing.kind === "page");

  // A page caret on the wire, then the exit: the participant's quiesce and its clear.
  async function leaving() {
    presence.setCapabilities({ supported: true, pageAwareness: true });
    const sent = [];
    presence.attachTransport({ send: async (body) => { sent.push(body); return true; } });
    presence.session = { id: "session-1", token: "token-a" };
    presence.n = 0;
    const one = page();
    await jest.advanceTimersByTimeAsync(250);
    expect(pagePosts(sent)).toHaveLength(1);

    const sync = { _editing: null, lane: "live", _morphInFlight: false, stop: () => {} };
    const { syncParticipant } = await import("../../src/sync/live-sync-edit.js");
    const participant = await syncParticipant(sync).prepare({});
    expect(participant.quiesce()).toEqual({ ok: true });
    await jest.advanceTimersByTimeAsync(250);
    expect(sent.at(-1)).toEqual({ editing: null });
    return { sent, one, participant };
  }

  test("a caret move during the exit's barrier posts nothing (pa1)", async () => {
    const { sent, one } = await leaving();

    one.view.dispatch(one.view.state.tr.setSelection(TextSelection.near(one.view.state.doc.resolve(3))));
    await jest.advanceTimersByTimeAsync(1000);

    expect(pagePosts(sent)).toHaveLength(1);
    expect(sent.at(-1)).toEqual({ editing: null });
  });

  test("a doc change during the exit's barrier posts nothing (pa2)", async () => {
    const { sent, one } = await leaving();

    one.view.dispatch(one.view.state.tr.insertText("!", one.view.state.doc.content.size - 1));
    await jest.advanceTimersByTimeAsync(1000);

    expect(pagePosts(sent)).toHaveLength(1);
    expect(sent.at(-1)).toEqual({ editing: null });
  });

  test("a refused exit puts the focused target back with no new transaction (pa4)", async () => {
    const { sent, one, participant } = await leaving();

    participant.resume();
    await jest.advanceTimersByTimeAsync(250);

    // The clear went with the quiesce, so the target the caret still holds goes again.
    expect(pagePosts(sent)).toHaveLength(2);
    expect(pagePosts(sent)[1].editing).toEqual(one.awareness.target);
    expect(sent.at(-1)).toMatchObject({ v: 1, session: "token-a", editing: { kind: "page", epoch: "id:doc-1" } });
  });

  test("a committed exit leaves the last word a clear (pa1 commit)", async () => {
    const { sent, one } = await leaving();

    one.view.dispatch(one.view.state.tr.setSelection(TextSelection.near(one.view.state.doc.resolve(3))));
    await jest.advanceTimersByTimeAsync(1000);
    one.awareness.dispose();
    await jest.advanceTimersByTimeAsync(1000);

    expect(pagePosts(sent)).toHaveLength(1);
    expect(sent.at(-1)).toEqual({ editing: null });
  });
});

describe("one stream and one sender in an editor", () => {
  let LiveSync;
  let resetHostMeta;
  let sources = [];
  let syncs = [];

  class FakeEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 0;
      sources.push(this);
    }
    close() {}
  }

  const turn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function until(check, ms = 2000) {
    const deadline = Date.now() + ms;
    while (!check() && Date.now() < deadline) await turn(10);
  }

  const sentTo = (fetchImpl, path) => fetchImpl.mock.calls.filter(([url]) => String(url).includes(path));

  function host(extensions, documentBlock = null) {
    return jest.fn((url) => {
      if (String(url).includes("/_/meta")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ spec: 1, extensions, document: documentBlock }),
        });
      }
      return Promise.resolve({ ok: true });
    });
  }

  const HTML_CLAY = {
    extensions: [
      "conditional", "data-read", "data-write", "page", "page-awareness-v1", "receipts",
      "record-awareness-v1", "sync", "sync-worker", "upload", "wire",
    ],
    document: { awareness: { transport: "broadcast", scope: "id:doc-1", label: "This computer" } },
  };

  let channels = [];

  class FakeChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      this.posts = [];
      channels.push(this);
    }
    postMessage(data) {
      this.posts.push(data);
    }
    close() {
      this.closed = true;
    }
  }

  beforeAll(async () => {
    window.clayEditMode = true;
    global.EventSource = FakeEventSource;
    window.EventSource = FakeEventSource;
    const module = await import("../../src/sync/live-sync.js");
    ({ LiveSync } = module);
    module.liveSync.stop();
    ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
  });

  beforeEach(() => {
    jest.useRealTimers();
    global.BroadcastChannel = FakeChannel;
    window.BroadcastChannel = FakeChannel;
    resetHostMeta();
    sources = [];
    syncs = [];
    channels = [];
    presence.explicit = false;
    presence.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    syncs.splice(0).forEach((sync) => sync.stop());
    delete global.fetch;
    delete global.BroadcastChannel;
  });

  async function startedAgainst(fetchImpl, lane) {
    global.fetch = fetchImpl;
    const sync = new LiveSync();
    syncs.push(sync);
    // The committed mode is read once, when the core modules load, and this file
    // imports the store first: name the lane instead of depending on that order.
    sync.lane = lane || "live";
    sync.start("index.html");
    await sync._ready;
    await turn(20);
    return sync;
  }

  test("an editor opens one stream and one sender, and the marker publishes through it", async () => {
    const fetchImpl = host(["sync", "presence", "presence-editing"]);
    document.body.innerHTML = '<div id="block" contenteditable="true">the block</div>';
    const block = document.getElementById("block");
    const sync = await startedAgainst(fetchImpl);

    expect(sources).toHaveLength(1);
    sources[0].onopen();
    sources[0].dispatchEvent(new MessageEvent("presence", {
      data: JSON.stringify({ people: [{ id: "p_ada", name: "Ada", you: false }], anonymous: 0 }),
    }));

    block.focus();
    await until(() => sentTo(fetchImpl, "/_/presence").length === 1);

    expect(sync._editing).not.toBeNull();
    expect(presence.owner).not.toBeNull();
    expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(1);
    expect(JSON.parse(sentTo(fetchImpl, "/_/presence")[0][1].body)).toEqual({ editing: "0" });
    expect(sources).toHaveLength(1);
  });

  test("a broadcast-only host uses the broadcast adapter and never the relay", async () => {
    const fetchImpl = host(HTML_CLAY.extensions, HTML_CLAY.document);
    const sync = await startedAgainst(fetchImpl);

    await until(() => presence.getSnapshot().people.length === 1);

    expect(sync._editing).toBeNull();
    expect(sentTo(fetchImpl, "/_/presence")).toHaveLength(0);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toContain("id:doc-1");
    expect(presence.getSnapshot().people[0]).toMatchObject({ name: "This computer", you: true });
  });

  test("a broadcast editor's session goes with its exit (broadcast-cycle-session-survives)", async () => {
    const fetchImpl = host(HTML_CLAY.extensions, HTML_CLAY.document);
    const sync = await startedAgainst(fetchImpl);
    await until(() => presence.getSnapshot().people.length === 1);
    const channel = channels[0];
    const transport = sync._presenceLease;
    // The transport the document keeps is the store's owner and the session itself.
    expect(transport).toBe(presence.owner);
    expect(typeof transport.stop).toBe("function");

    const cleared = jest.spyOn(globalThis, "clearInterval");
    sync.stop();

    expect(transport.active).toBe(false);
    expect(presence.owner).toBeNull();
    expect(channel.posts.map((post) => post.op)).toContain("bye");
    expect(cleared).toHaveBeenCalled();
    // The channel is the session's: it closes with it, so nothing of the dead
    // session is left to answer a newcomer or to beat.
    expect(channel.closed).toBe(true);
    expect(channel.onmessage).toBeNull();
    cleared.mockRestore();
  });
});
