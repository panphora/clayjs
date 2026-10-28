import { jest } from "@jest/globals";

import { PresenceStore, presence } from "../../src/sync/presence-store.js";

/**
 * `clay.presence`: the roster and this tab's target.
 *
 * Two things have to be true together. A subscriber sees one immutable snapshot of
 * who is present — including the unsupported state, before any frame — with no
 * private token in it. And this tab's target goes out on the host's own limits:
 * one coalesced request every 250 ms, a standing target renewed every 5 s, a clear
 * sent at once, and never more than a connection's session may carry.
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

const ADA = { id: "p_ada", name: "Ada Lovelace", you: false, canEdit: true };
const ME = { id: "p_me", name: "Grace Hopper", you: true, canEdit: true };
const SELF = { id: "self-pseudonym", token: "private-token" };
const frame = (people, anonymous = 0, selfSession = null) => ({ people, anonymous, selfSession });

let store;

beforeEach(() => {
  jest.useFakeTimers();
  store = new PresenceStore();
});

afterEach(() => {
  jest.useRealTimers();
});

const transport = () => {
  const sent = [];
  const lease = store.attachTransport({ send: async (body) => { sent.push(body); return true; } });
  return { lease, sent };
};

describe("the snapshot", () => {
  test("a subscriber is answered at once, in the unsupported state", () => {
    const seen = [];
    const unsubscribe = store.subscribe((snapshot) => seen.push(snapshot));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ supported: false, recordAwareness: false, pageAwareness: false, people: [], anonymous: 0 });
    expect(seen[0]).toBe(store.getSnapshot());

    unsubscribe();
    store.receive(frame([ADA]));
    expect(seen).toHaveLength(1);
  });

  test("the host's answer is published once, and an unchanged answer publishes nothing", () => {
    const seen = [];
    store.subscribe((snapshot) => seen.push(snapshot));

    store.setCapabilities({ supported: true, recordAwareness: true, pageAwareness: true });
    expect(seen.at(-1)).toMatchObject({ supported: true, recordAwareness: true, pageAwareness: true });

    const settled = store.getSnapshot();
    store.setCapabilities({ supported: true, recordAwareness: true, pageAwareness: true });
    expect(store.getSnapshot()).toBe(settled);
    expect(seen).toHaveLength(2);
  });

  test("an empty roster and an anonymous one are both published", () => {
    expect(store.receive({})).toEqual({ supported: false, recordAwareness: false, pageAwareness: false, people: [], anonymous: 0 });
    expect(store.receive(frame([], 4))).toMatchObject({ people: [], anonymous: 4 });
    expect(store.receive({ people: [], anonymous: -2 }).anonymous).toBe(0);
    expect(store.receive({ people: [], anonymous: "lots" }).anonymous).toBe(0);
  });

  test("is immutable, and the private session token is not in it", () => {
    const snapshot = store.receive(frame([ADA], 0, SELF));

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.people)).toBe(true);
    expect(snapshot.selfSession).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(SELF.token);
    expect(JSON.stringify(snapshot)).not.toContain(SELF.id);
  });

  test("keeps a malformed person out rather than drawing a guess", () => {
    const snapshot = store.receive(frame([null, { name: "No id" }, { id: 7 }, { id: "p_ada", name: "  Ada  " }]));

    expect(snapshot.people).toEqual([{ id: "p_ada", name: "Ada", you: false, editing: null, sessions: [] }]);
  });

  test("several sessions of one person stay separate, and a stale n is ignored", () => {
    const first = store.receive(frame([{
      ...ADA,
      sessions: [
        { id: "a", you: false, n: 5, editing: "0" },
        { id: "b", you: false, n: 2, editing: "1" },
      ],
    }]));

    expect(first.people[0].sessions.map((session) => session.id)).toEqual(["a", "b"]);

    // A frame that overtook a newer one for session `a` cannot move its caret back.
    const second = store.receive(frame([{
      ...ADA,
      sessions: [
        { id: "a", you: false, n: 4, editing: "9" },
        { id: "b", you: false, n: 3, editing: "2" },
      ],
    }]));

    expect(second.people[0].sessions).toEqual([
      { id: "a", you: false, n: 5, editing: "0" },
      { id: "b", you: false, n: 3, editing: "2" },
    ]);
  });
});

describe("the target this tab publishes", () => {
  test("a dotted path keeps today's body, and a clear is not coalesced", async () => {
    const { sent } = transport();

    expect(store.setTarget("1.2")).toBe(true);
    expect(sent).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(250);
    expect(sent.map((body) => JSON.stringify(body))).toEqual(['{"editing":"1.2"}']);

    expect(store.setTarget(null)).toBe(true);
    // Sent on the same turn: a clear that waited for a window would leave a caret
    // on somebody's screen for a quarter of a second.
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((body) => JSON.stringify(body))).toEqual(['{"editing":"1.2"}', '{"editing":null}']);
  });

  test("moves coalesce to one request every 250 ms, ending on the latest", async () => {
    const { sent } = transport();

    store.setTarget("0");
    await jest.advanceTimersByTimeAsync(100);
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(100);
    store.setTarget("2");
    await jest.advanceTimersByTimeAsync(50);
    // One request for three moves, carrying the block the caret ended on.
    expect(sent).toEqual([{ editing: "2" }]);

    store.setTarget("3");
    await jest.advanceTimersByTimeAsync(249);
    expect(sent).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([{ editing: "2" }, { editing: "3" }]);
  });

  test("the same target twice is one request", async () => {
    const { sent } = transport();

    store.setTarget("1");
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(1000);

    expect(sent).toEqual([{ editing: "1" }]);
  });

  test("a target this client will not publish is refused, and the held one stays", async () => {
    const { sent } = transport();

    store.setTarget("1");
    expect(store.setTarget({ kind: "record", id: "x".repeat(129) })).toBe(false);
    expect(store.setTarget({ kind: "card", id: "c1" })).toBe(false);
    await jest.advanceTimersByTimeAsync(250);

    expect(sent).toEqual([{ editing: "1" }]);
  });

  test("a standing target is renewed every five seconds", async () => {
    const { sent } = transport();

    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(sent).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([{ editing: "1" }, { editing: "1" }]);

    await jest.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(3);

    // A clear ends the renewal: nothing keeps saying somebody is somewhere.
    store.setTarget(null);
    await jest.advanceTimersByTimeAsync(20000);
    expect(sent).toEqual([{ editing: "1" }, { editing: "1" }, { editing: "1" }, { editing: null }]);
  });

  test("a record target starts in the single-field shape and upgrades to the envelope", async () => {
    const { sent } = transport();
    const target = { kind: "record", id: "card-42", field: "title" };

    store.setTarget(target);
    await jest.advanceTimersByTimeAsync(250);
    expect(JSON.stringify(sent[0])).toBe('{"editing":{"kind":"record","id":"card-42","field":"title"}}');

    // The connection's first frame carries the token, and what this tab already
    // holds goes again inside the envelope, with the session's first n.
    store.receive(frame([ADA], 0, SELF));
    await jest.advanceTimersByTimeAsync(0);
    expect(JSON.stringify(sent.at(-1))).toBe(
      '{"v":1,"session":"private-token","n":1,"editing":{"kind":"record","id":"card-42","field":"title"}}'
    );

    store.setTarget({ kind: "record", id: "card-42", field: "labels" });
    await jest.advanceTimersByTimeAsync(250);
    expect(sent.at(-1)).toMatchObject({ v: 1, session: "private-token", n: 2, editing: { field: "labels" } });
  });

  test("a target re-published after the stream went away is sent again", async () => {
    const { sent } = transport();

    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(sent).toHaveLength(1);

    // The stream closed and came back: the host kept nothing on the connection.
    store.clear();
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);

    expect(sent).toEqual([{ editing: "1" }, { editing: "1" }]);
  });

  test("a page target waits for the connection's token, then goes in the envelope", async () => {
    const { sent } = transport();

    store.setTarget(PAGE);
    await jest.advanceTimersByTimeAsync(3000);
    // Page coordinates need the envelope, and there is no session to put in one.
    expect(sent).toHaveLength(0);

    store.receive(frame([ADA], 0, SELF));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ v: 1, session: "private-token", n: 1, editing: PAGE });
  });

  test("a target with no owner attached is held, not dropped", async () => {
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(1000);

    const { sent } = transport();
    await jest.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ editing: "1" }]);
  });

  test("a failed request is retried, and a delivered one keeps renewing", async () => {
    const sent = [];
    store.attachTransport({ send: async (body) => { sent.push(body); return sent.length > 1; } });

    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(sent).toHaveLength(1);

    // The same target again: the first request never landed.
    await jest.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual([{ editing: "1" }, { editing: "1" }]);

    // And this one did, so the five-second renewal takes over from the retry.
    await jest.advanceTimersByTimeAsync(5000);
    expect(sent).toHaveLength(3);
  });
});

describe("transport leases", () => {
  test("an old lease detaching after a new one attached clears nothing", async () => {
    const first = transport();
    store.receive(frame([ADA], 2, SELF));

    const second = transport();
    expect(first.lease.active).toBe(false);
    expect(second.lease.active).toBe(true);

    first.lease.detach();

    expect(store.getSnapshot().people.map((person) => person.id)).toEqual(["p_ada"]);
    expect(store.getSnapshot().anonymous).toBe(2);
    expect(second.lease.active).toBe(true);

    // And the streaming owner is still the one that sends.
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(second.sent).toHaveLength(1);
    expect(first.sent).toHaveLength(0);
  });

  test("the current lease detaching clears the roster and the target", async () => {
    const { lease, sent } = transport();
    store.receive(frame([ADA], 0, SELF));
    store.setTarget("1");
    await jest.advanceTimersByTimeAsync(250);

    lease.detach();

    expect(lease.active).toBe(false);
    expect(store.getSnapshot()).toEqual({ supported: false, recordAwareness: false, pageAwareness: false, people: [], anonymous: 0 });
    expect(store.getSnapshot().people).toEqual([]);

    // Nothing is published through a transport that went away.
    store.setTarget("2");
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([{ editing: "1" }]);
  });

  test("a new lease starts from no session, so the next target waits for its frame", async () => {
    const first = transport();
    store.receive(frame([ADA], 0, SELF));
    first.lease.detach();

    const second = transport();
    store.setTarget(PAGE);
    await jest.advanceTimersByTimeAsync(250);
    expect(second.sent).toHaveLength(0);

    store.receive(frame([ADA], 0, { id: "next", token: "next-token" }));
    await jest.advanceTimersByTimeAsync(0);
    expect(second.sent.at(-1)).toMatchObject({ session: "next-token", n: 1 });
  });

  test("a clear the host never heard goes with the lease (relay-leave-inflight-target)", async () => {
    const sent = [];
    const answers = [];
    const lease = store.attachTransport({
      send: (body) => new Promise((resolve) => {
        sent.push(body);
        answers.push(resolve);
      }),
    });
    store.receive(frame([ADA], 0, SELF));
    store.setGeneric("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(sent).toEqual([{ editing: "1" }]);

    // The exit's clear queues behind the target nobody has answered yet.
    store.setGeneric(null);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(1);

    lease.detach();
    expect(sent).toEqual([{ editing: "1" }, { editing: null }]);

    // The answer that lands after the lease let go takes nothing back.
    answers[0](true);
    await jest.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
  });

  test("a lease that let go does not swallow the next lease's target (relay-second-session-swallowed)", async () => {
    const first = [];
    let answerFirst = null;
    const old = store.attachTransport({
      send: (body) => new Promise((resolve) => {
        first.push(body);
        answerFirst = resolve;
      }),
    });
    store.receive(frame([ADA], 0, SELF));
    store.setGeneric("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(first).toEqual([{ editing: "1" }]);

    old.detach();

    const second = [];
    // The next session's own request stays unanswered for the rest of the test.
    store.attachTransport({ send: (body) => new Promise(() => { second.push(body); }) });
    store.receive(frame([ADA], 0, { id: "next", token: "next-token" }));
    store.setGeneric("1");
    await jest.advanceTimersByTimeAsync(250);
    expect(second).toEqual([{ editing: "1" }]);

    // The old request answers late, and the new session's target still stands: the
    // old answer releases neither the newer lease nor its request.
    answerFirst(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(second).toEqual([{ editing: "1" }]);

    store.setGeneric("2");
    await jest.advanceTimersByTimeAsync(250);
    expect(second).toEqual([{ editing: "1" }]);
  });

  test("a transport without a send function is refused", () => {
    expect(() => store.attachTransport(null)).toThrow(TypeError);
    expect(() => store.attachTransport({})).toThrow(TypeError);
  });
});

test("the module's own store is the facade a page reaches", async () => {
  const { clay } = globalThis.window ?? {};
  expect(window.clay.presence).toBe(presence);
  expect(typeof window.clay.presence.getSnapshot).toBe("function");
  expect(typeof window.clay.presence.subscribe).toBe("function");
  expect(typeof window.clay.presence.setTarget).toBe("function");
  expect(clay.presence.setTarget(null)).toBe(true);
});
