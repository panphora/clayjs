import { jest } from "@jest/globals";
import { PresenceStore } from "../../src/sync/presence-store.js";
import { EXPIRE_MS, RENEW_MS } from "../../src/sync/presence-target.js";
import { resetHostMeta } from "../../src/core/host-meta.js";
import { localChannel } from "../../src/live/local-channel.js";
import { localPresence } from "../../src/sync/local-presence.js";
import { createStore } from "../../src/live/store.js";
import { createFastLane } from "../../src/live/fast-lane.js";
import { localTransport } from "../../src/live/local-lane.js";

/**
 * Presence over the same-browser channel: two readers of one document see each
 * other with no room, no lock and no durable lane loaded; a reader and an editor
 * share one channel and the editor's room frames are untouched; a client that
 * does not know `presence-v1` ignores it; documents that only share a filename
 * never meet; the lane's sequencer dying leaves the survivors' presence alone; a
 * silent tab expires; and the channel closes when the last subscriber lets go.
 *
 * The fake BroadcastChannel and Web Locks are the local lane's, so the same
 * several-tabs-in-one-test the durable lane is tested with carries presence.
 */

const KEY = "clay-live:/doc.html";
let channels;
let posted;
let locks;
let tabs;

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    channels.push(this);
  }
  postMessage(data) {
    posted.push({ channel: this, data });
    const copy = JSON.parse(JSON.stringify(data));
    for (const other of channels) {
      if (other === this || other.closed || other.name !== this.name) continue;
      setTimeout(() => other.onmessage?.({ data: copy }), 0);
    }
  }
  close() {
    this.closed = true;
  }
}

function fakeLocks() {
  const queue = [];
  let held = false;
  let requests = 0;
  async function grant() {
    if (held || !queue.length) return;
    held = true;
    const { callback, resolve } = queue.shift();
    const result = await callback({ name: KEY });
    held = false;
    resolve(result);
    grant();
  }
  return {
    get requests() {
      return requests;
    },
    request(name, callback) {
      requests += 1;
      return new Promise((resolve) => {
        queue.push({ callback, resolve });
        Promise.resolve().then(grant);
      });
    },
  };
}

beforeAll(() => {
  global.BroadcastChannel = FakeChannel;
});

beforeEach(() => {
  jest.useFakeTimers();
  channels = [];
  posted = [];
  locks = fakeLocks();
  tabs = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
});

afterEach(() => {
  for (const tab of tabs) tab.stop();
  tabs = [];
  delete global.fetch;
  resetHostMeta();
  jest.useRealTimers();
});

const settle = (ms = 1000) => jest.advanceTimersByTimeAsync(ms);

// One tab with the presence transport started on the document's channel.
function presenceTab({ scope = "/doc.html", key = null, store = new PresenceStore() } = {}) {
  const transport = localPresence({ scope, key, store });
  transport.start();
  const tab = {
    store,
    transport,
    channel: channels.at(-1),
    stop: () => transport.stop(),
  };
  tabs.push(tab);
  return tab;
}

// One tab with the durable lane, as a reader never has, given the presence
// transport beside it on the same channel when asked.
function durableTab({ withPresence = false, store = new PresenceStore() } = {}) {
  const entries = new Map();
  entries.set("game", { store: createStore({ name: "game", value: { score: 0 } }) });
  const seed = () => {
    const values = new Map();
    for (const [name, entry] of entries) {
      values.set(name, { value: entry.store.authoritative, ephemeral: entry.store.ephemeral, text: JSON.stringify({ score: 0 }) });
    }
    return values;
  };
  const shared = withPresence ? localChannel(KEY) : null;
  const transport = localTransport({ seed, key: KEY, channel: shared });
  const lane = createFastLane({ transport, entries });
  for (const [name, entry] of entries) entry.store.onLocal((ops) => lane.local(name, ops, entry.store.mark));
  lane.start();
  const handle = entries.get("game").store.handle;
  const presence = withPresence ? localPresence({ key: KEY, store, channel: shared }) : null;
  if (presence) presence.start();
  const tab = {
    store,
    lane,
    transport,
    presence,
    game: handle,
    channel: channels.at(-1),
    stop: () => {
      presence?.stop();
      lane.stop();
    },
  };
  tabs.push(tab);
  return tab;
}

function sessions(tab) {
  const [person] = tab.store.getSnapshot().people;
  if (!person) return [];
  return person.sessions.map((session) => session.id);
}

function editingOf(tab, sessionId) {
  const [person] = tab.store.getSnapshot().people;
  if (!person) return undefined;
  return person.sessions.find((session) => session.id === sessionId)?.editing;
}

// A tab that vanishes without a goodbye: it hears nothing and says nothing.
function crash(tab) {
  tab.channel.closed = true;
  tab.channel.postMessage = () => {};
  tab.stop();
}

test("two readers exchange presence with no room created", async () => {
  const a = presenceTab();
  const b = presenceTab();
  await settle();

  // Zero room: no lock asked for, no lane, and nothing but presence on the wire.
  expect(locks.requests).toBe(0);
  expect(channels).toHaveLength(2);
  expect(posted.every((message) => message.data.type === "presence-v1")).toBe(true);
  expect(posted.every((message) => message.data.v === 4)).toBe(true);

  const [person] = a.store.getSnapshot().people;
  expect(person.name).toBe("This computer");
  expect(person.you).toBe(true);
  expect(sessions(a).sort()).toEqual([a.transport.sessionId, b.transport.sessionId].sort());
  expect(sessions(b).sort()).toEqual([a.transport.sessionId, b.transport.sessionId].sort());
  expect(person.sessions.filter((session) => session.you).map((session) => session.id)).toEqual([a.transport.sessionId]);

  // The target each reader holds reaches the other's sessions.
  a.store.setTarget("1.2");
  b.store.setTarget("3");
  await settle();
  expect(editingOf(b, a.transport.sessionId)).toBe("1.2");
  expect(editingOf(a, b.transport.sessionId)).toBe("3");
  expect(a.store.getSnapshot().people[0].editing).toBe("1.2");

  a.store.setTarget(null);
  await settle();
  expect(editingOf(b, a.transport.sessionId)).toBeNull();
});

test("a reader and an editor share one channel; the editor's durable frames are unchanged", async () => {
  const editor = durableTab({ withPresence: true });
  const peer = durableTab();
  await settle();
  const reader = presenceTab();
  await settle();

  expect(editor.transport.isSequencer).toBe(true);
  expect(editor.lane.isWriter()).toBe(true);

  // The editor's tab holds one channel for both services, and no second one.
  expect(channels.filter((channel) => channel.name === KEY)).toHaveLength(3);

  // Presence crosses the reader and the editor.
  expect(sessions(editor)).toContain(reader.transport.sessionId);
  expect(sessions(reader)).toContain(editor.presence.sessionId);
  reader.store.setTarget("2.1");
  await settle();
  expect(editingOf(editor, reader.transport.sessionId)).toBe("2.1");

  // The room still converges, over frames that keep their version and types.
  editor.game.add("score", 1);
  peer.game.add("score", 1);
  await settle();
  expect(editor.game.toJSON()).toEqual({ score: 2 });
  expect(peer.game.toJSON()).toEqual({ score: 2 });
  const durable = posted.filter((message) => message.data.type !== "presence-v1");
  expect(durable.length).toBeGreaterThan(0);
  expect(durable.every((message) => message.data.v === 4)).toBe(true);
  expect(peer.lane.status.epoch).toBe(editor.lane.status.epoch);

  // Releasing presence leaves the editor's channel to the lane.
  editor.presence.stop();
  expect(editor.channel.closed).toBe(false);
  editor.lane.stop();
  expect(editor.channel.closed).toBe(true);
  expect(editor.channel.onmessage).toBeNull();
});

test("an older v4 peer that does not know presence-v1 ignores it and keeps working", async () => {
  // A client of the lane before this step: it reads the channel and draws only the
  // types it knows, so a presence frame is a type it does not handle.
  const channel = new FakeChannel(KEY);
  const seen = [];
  const state = {};
  channel.onmessage = ({ data: message }) => {
    if (!message || message.v !== 4) return;
    seen.push(message.type);
    if (message.type === "data-state" && message.state) Object.assign(state, message.state);
  };
  const before = presenceTab();
  await settle();
  expect(seen).toContain("presence-v1");
  expect(state).toEqual({});

  // Its own durable frames still arrive, and a presence tab draws nothing from them.
  channel.postMessage({ v: 4, type: "data-state", state: { epoch: "r1", seq: 1, writer: "old" } });
  await settle();
  expect(sessions(before)).toEqual([before.transport.sessionId]);
  expect(before.store.getSnapshot().people[0].editing).toBeNull();

  // Presence keeps flowing past it: a second reader is seen by the first.
  const after = presenceTab();
  await settle();
  expect(sessions(before).sort()).toEqual([before.transport.sessionId, after.transport.sessionId].sort());
});

test("two documents with identical filenames and different identities do not see each other", async () => {
  const one = presenceTab({ scope: "/page.html#a" });
  const two = presenceTab({ scope: "/page.html#b" });
  await settle();

  one.store.setTarget("1");
  two.store.setTarget("2");
  await settle();

  expect(sessions(one)).toEqual([one.transport.sessionId]);
  expect(sessions(two)).toEqual([two.transport.sessionId]);
  expect(one.store.getSnapshot().people[0].editing).toBe("1");
  expect(two.store.getSnapshot().people[0].editing).toBe("2");
  expect(channels.map((channel) => channel.name).sort()).toEqual(["clay-live:/page.html#a", "clay-live:/page.html#b"]);
});

test("the sequencer's death does not drop presence for the survivors", async () => {
  const leader = durableTab({ withPresence: true });
  const successor = durableTab({ withPresence: true });
  await settle();
  const first = presenceTab();
  const second = presenceTab();
  await settle();
  expect(sessions(first).sort()).toEqual([leader.presence.sessionId, successor.presence.sessionId, first.transport.sessionId, second.transport.sessionId].sort());

  crash(leader);
  await settle(2000);

  // The room hands off, and the readers still hold each other's presence.
  expect(successor.transport.isSequencer).toBe(true);
  expect(sessions(first)).toContain(successor.presence.sessionId);
  expect(sessions(second)).toContain(first.transport.sessionId);

  first.store.setTarget("4.1");
  second.store.setTarget("5");
  await settle();
  expect(editingOf(second, first.transport.sessionId)).toBe("4.1");

  // The dead tab's session goes when it expires; nobody else's does.
  await settle(EXPIRE_MS + 5000);
  expect(sessions(first)).not.toContain(leader.presence.sessionId);
  expect(sessions(first).sort()).toEqual([successor.presence.sessionId, first.transport.sessionId, second.transport.sessionId].sort());
  expect(editingOf(first, second.transport.sessionId)).toBe("5");
});

test("a silent peer expires after EXPIRE_MS", async () => {
  const a = presenceTab();
  const b = presenceTab();
  await settle();
  b.store.setTarget("2.2");
  await settle();
  expect(sessions(a).sort()).toEqual([a.transport.sessionId, b.transport.sessionId].sort());
  expect(editingOf(a, b.transport.sessionId)).toBe("2.2");

  // Frozen: it neither hears nor says anything, but its process is still there.
  b.channel.closed = true;
  b.channel.postMessage = () => {};
  await settle(EXPIRE_MS - 1000);
  expect(sessions(a)).toContain(b.transport.sessionId);

  await settle(2000 + 5000);
  expect(sessions(a)).toEqual([a.transport.sessionId]);
});

test("the channel closes after the final lease is released", async () => {
  const a = presenceTab();
  const channel = a.channel;
  expect(channel.closed).toBe(false);
  expect(typeof channel.onmessage).toBe("function");

  a.transport.stop();

  expect(channel.closed).toBe(true);
  expect(channel.onmessage).toBeNull();
});

test("a broadcast document's session goes with its lease (broadcast-cycle-session-survives)", async () => {
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    text: async () => JSON.stringify({
      spec: 1,
      extensions: ["page-awareness-v1", "record-awareness-v1"],
      document: { awareness: { transport: "broadcast", scope: "id:doc-1", label: "This computer" } },
    }),
  }));
  resetHostMeta();

  const store = new PresenceStore();
  const transport = await store.connect({ send: async () => true });
  expect(transport).not.toBeNull();
  // The lease the document keeps is the store's owner, and it carries the session's
  // own stop rather than only the lease's detach.
  expect(store.owner).toBe(transport);
  expect(typeof transport.stop).toBe("function");

  const channel = channels.at(-1);
  const from = posted.find((message) => message.data.from)?.data.from;
  expect(typeof from).toBe("string");

  transport.stop();

  expect(store.owner).toBeNull();
  expect(posted.filter((message) => message.data.op === "bye").map((message) => message.data.from)).toContain(from);
  // The channel closes and the heartbeat stops with the session: a dead session
  // neither beats nor answers a tab that arrives later.
  expect(channel.closed).toBe(true);
  const after = posted.length;
  await settle(RENEW_MS + 1000);
  expect(posted.slice(after)).toEqual([]);
});
