import { jest } from "@jest/globals";
import {
  createSaveHistoryRecovery,
  RECOVERY_WINDOW_MS,
} from "../../src/live/save-history.js";

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  const at = () => time;
  const setTimer = (fn, ms) => {
    const id = nextId;
    nextId += 1;
    timers.set(id, { id, at: time + Math.max(0, ms), fn });
    return id;
  };
  const clearTimer = (id) => {
    timers.delete(id);
  };
  const set = (value) => {
    time = value;
  };
  const advance = async (ms) => {
    const target = time + ms;
    for (;;) {
      let pick = null;
      for (const timer of timers.values()) {
        if (timer.at > target) continue;
        if (!pick || timer.at < pick.at || (timer.at === pick.at && timer.id < pick.id)) pick = timer;
      }
      if (!pick) break;
      time = pick.at;
      timers.delete(pick.id);
      pick.fn();
      await flush();
    }
    time = target;
    await flush();
  };
  return { at, setTimer, clearTimer, advance, set, timers };
}

function fakeQuery(clock, handler) {
  const calls = [];
  const aborts = [];
  const query = ({ saveId, requestHash, signal }) => {
    const call = { at: clock.at(), saveId, requestHash };
    calls.push(call);
    if (signal && typeof signal.addEventListener === "function") {
      signal.addEventListener("abort", () => aborts.push({ at: clock.at(), saveId }));
    }
    if (handler) return Promise.resolve(handler(call, calls.length));
    return Promise.resolve(null);
  };
  return { query, calls, aborts };
}

function collect() {
  const applied = [];
  const unknown = [];
  return {
    applied,
    unknown,
    onApplied: (value) => applied.push(value),
    onUnknown: (value) => unknown.push(value),
  };
}

function recovery(clock, query, digest) {
  return createSaveHistoryRecovery({
    query,
    digest,
    now: clock.at,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
}

const twoIds = [{ saveId: "a" }, { saveId: "b" }];

test("queries two unique ids at elapsed 0, 10000 and 30000 and expires at 45000", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const digest = jest.fn(async () => "h1");
  const events = collect();
  recovery(clock, query, digest).start({
    captureId: "c1",
    html: "<p>x</p>",
    attempts: [{ saveId: "a" }, { saveId: "b" }, { saveId: "a" }, { saveId: "c" }],
    startedAt: 0,
    ...events,
  });
  await flush();
  await clock.advance(RECOVERY_WINDOW_MS + 5000);

  expect(digest).toHaveBeenCalledTimes(1);
  expect(digest).toHaveBeenCalledWith("<p>x</p>");
  expect(calls.map((call) => call.at)).toEqual([0, 0, 10000, 10000, 30000, 30000]);
  expect(calls.map((call) => call.saveId)).toEqual(["a", "b", "a", "b", "a", "b"]);
  expect(calls.every((call) => call.requestHash === "h1")).toBe(true);
  expect(calls).toHaveLength(6);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toEqual([{ captureId: "c1", reason: "expired" }]);

  await clock.advance(60000);
  expect(calls).toHaveLength(6);
  expect(events.unknown).toHaveLength(1);
});

test("deadline is absolute from startedAt, not reset by a round", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const events = collect();
  recovery(clock, query, async () => "h1").start({
    captureId: "late",
    html: "body",
    attempts: twoIds,
    startedAt: -5000,
    ...events,
  });
  await flush();
  expect(calls.map((call) => call.at)).toEqual([0, 0]);
  await clock.advance(45000);
  expect(calls.map((call) => call.at)).toEqual([0, 0, 5000, 5000, 25000, 25000]);
  expect(events.unknown).toEqual([{ captureId: "late", reason: "expired" }]);
});

test("late hash completion skips missed rounds and never bursts them", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const digest = deferred();
  const events = collect();
  recovery(clock, query, () => digest.promise).start({
    captureId: "latehash",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });

  await clock.advance(12000);
  expect(calls).toHaveLength(0);

  digest.resolve("h1");
  await flush();
  expect(calls.map((call) => call.at)).toEqual([12000, 12000]);

  await clock.advance(RECOVERY_WINDOW_MS);
  expect(calls.map((call) => call.at)).toEqual([12000, 12000, 30000, 30000]);
  expect(events.unknown).toEqual([{ captureId: "latehash", reason: "expired" }]);
});

test("a hash that finishes after the deadline queries nothing", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const digest = deferred();
  const events = collect();
  recovery(clock, query, () => digest.promise).start({
    captureId: "verylate",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });

  clock.set(RECOVERY_WINDOW_MS + 1000);
  digest.resolve("h1");
  await flush();

  expect(calls).toHaveLength(0);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toEqual([{ captureId: "verylate", reason: "expired" }]);
});

test("a late round starts once and respecting the remaining deadline", async () => {
  const clock = createClock();
  const { query, calls, aborts } = fakeQuery(clock, () => new Promise(() => {}));
  const digest = deferred();
  const events = collect();
  recovery(clock, query, () => digest.promise).start({
    captureId: "lastround",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });

  await clock.advance(40000);
  digest.resolve("h1");
  await flush();
  expect(calls.map((call) => call.at)).toEqual([40000, 40000]);

  await clock.advance(10000);
  expect(calls).toHaveLength(2);
  expect(aborts.map((abort) => abort.at)).toEqual([45000, 45000]);
  expect(events.unknown).toEqual([{ captureId: "lastround", reason: "expired" }]);
});

test("each query is bounded by the lesser of six seconds and the remaining deadline", async () => {
  const clock = createClock();
  const { query, calls, aborts } = fakeQuery(clock, () => new Promise(() => {}));
  const events = collect();
  recovery(clock, query, async () => "h1").start({
    captureId: "bound",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();
  expect(calls).toHaveLength(2);
  await clock.advance(6000);
  expect(aborts.map((abort) => abort.at)).toEqual([6000, 6000]);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toHaveLength(0);
  await clock.advance(39000);
  expect(events.unknown).toEqual([{ captureId: "bound", reason: "expired" }]);
});

test("a matching applied initialOutcome proves the attempt without any GET", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const events = collect();
  recovery(clock, query, async () => "h1").start({
    captureId: "409",
    html: "body",
    attempts: twoIds,
    initialOutcome: { saveId: "b", requestHash: "h1", status: "applied" },
    startedAt: 0,
    ...events,
  });
  await flush();
  expect(calls).toHaveLength(0);
  expect(events.applied).toEqual([{ captureId: "409", saveId: "b", requestHash: "h1" }]);
  expect(events.unknown).toHaveLength(0);
  await clock.advance(RECOVERY_WINDOW_MS + 1000);
  expect(events.unknown).toHaveLength(0);
});

test("mismatching, unknown or out-of-set initial outcomes do not settle early", async () => {
  const cases = [
    { saveId: "b", requestHash: "other", status: "applied" },
    { saveId: "z", requestHash: "h1", status: "applied" },
    { saveId: "b", requestHash: "h1", status: "unknown" },
    { saveId: "b", requestHash: "h1", status: null },
    null,
  ];
  for (const outcome of cases) {
    const clock = createClock();
    const { query, calls } = fakeQuery(clock, () => null);
    const events = collect();
    recovery(clock, query, async () => "h1").start({
      captureId: "mismatch",
      html: "body",
      attempts: twoIds,
      initialOutcome: outcome,
      startedAt: 0,
      ...events,
    });
    await flush();
    await clock.advance(RECOVERY_WINDOW_MS + 1000);
    expect(calls).toHaveLength(6);
    expect(events.applied).toHaveLength(0);
    expect(events.unknown).toEqual([{ captureId: "mismatch", reason: "expired" }]);
  }
});

test("only an exact id and hash with applied settles; mismatched replies keep polling", async () => {
  const clock = createClock();
  const handler = (call, index) => {
    if (index === 1) return { saveId: "a", requestHash: "wrong", status: "applied" };
    if (index === 2) return { saveId: "a", requestHash: "h1", status: "applied" };
    if (index === 3) return { saveId: "a", requestHash: "h1", status: "unknown" };
    if (index === 4) return { saveId: "b", requestHash: "h1", status: "unknown" };
    if (index === 5) return { saveId: "a", requestHash: "h1", status: "applied" };
    return { saveId: "b", requestHash: "h1", status: "applied" };
  };
  const { query, calls } = fakeQuery(clock, handler);
  const events = collect();
  recovery(clock, query, async () => "h1").start({
    captureId: "exact",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();
  await clock.advance(30000);

  expect(calls.map((call) => `${call.at}:${call.saveId}`)).toEqual([
    "0:a",
    "0:b",
    "10000:a",
    "10000:b",
    "30000:a",
    "30000:b",
  ]);
  expect(events.applied).toEqual([{ captureId: "exact", saveId: "a", requestHash: "h1" }]);
  expect(events.unknown).toHaveLength(0);

  await clock.advance(RECOVERY_WINDOW_MS);
  expect(calls).toHaveLength(6);
  expect(events.applied).toHaveLength(1);
});

test("a positive reply aborts the other probe and ignores its late duplicate", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, (call) => {
    if (call.saveId === "b") return new Promise(() => {});
    return { saveId: "a", requestHash: "h1", status: "applied" };
  });
  const events = collect();
  recovery(clock, query, async () => "h1").start({
    captureId: "dup",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();

  expect(calls).toHaveLength(2);
  expect(events.applied).toEqual([{ captureId: "dup", saveId: "a", requestHash: "h1" }]);

  await clock.advance(RECOVERY_WINDOW_MS + 1000);
  expect(events.applied).toHaveLength(1);
  expect(events.unknown).toHaveLength(0);
});

test("an unavailable digest gives up as unavailable with no query", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const events = collect();
  recovery(clock, query, async () => null).start({
    captureId: "nocrypto",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();
  expect(calls).toHaveLength(0);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toEqual([{ captureId: "nocrypto", reason: "unavailable" }]);
  await clock.advance(RECOVERY_WINDOW_MS + 1000);
  expect(events.unknown).toHaveLength(1);
});

test("a digest that throws is unavailable, and an unavailable query is not proof", async () => {
  const clock = createClock();
  const events = collect();
  recovery(clock, fakeQuery(clock, () => null).query, async () => {
    throw new Error("no subtle");
  }).start({
    captureId: "throw",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();
  expect(events.unknown).toEqual([{ captureId: "throw", reason: "unavailable" }]);

  const clock2 = createClock();
  const { query, calls } = fakeQuery(clock2, () => {
    throw new Error("offline");
  });
  const events2 = collect();
  recovery(clock2, query, async () => "h1").start({
    captureId: "offline",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events2,
  });
  await flush();
  await clock2.advance(RECOVERY_WINDOW_MS + 1000);
  expect(calls).toHaveLength(6);
  expect(events2.applied).toHaveLength(0);
  expect(events2.unknown).toEqual([{ captureId: "offline", reason: "expired" }]);
});

test("cancel before the hash resolves stops everything with no callback", async () => {
  const clock = createClock();
  const { query, calls } = fakeQuery(clock, () => null);
  const digest = deferred();
  const events = collect();
  const handle = recovery(clock, query, () => digest.promise).start({
    captureId: "cancel-early",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });

  handle.cancel();
  handle.cancel();
  digest.resolve("h1");
  await flush();
  await clock.advance(RECOVERY_WINDOW_MS + 10000);

  expect(calls).toHaveLength(0);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toHaveLength(0);
  expect(clock.timers.size).toBe(0);
});

test("cancel after the first round aborts its queries and is idempotent", async () => {
  const clock = createClock();
  const { query, calls, aborts } = fakeQuery(clock, () => new Promise(() => {}));
  const events = collect();
  const handle = recovery(clock, query, async () => "h1").start({
    captureId: "cancel-mid",
    html: "body",
    attempts: twoIds,
    startedAt: 0,
    ...events,
  });
  await flush();
  expect(calls).toHaveLength(2);

  handle.cancel();
  expect(aborts.map((abort) => abort.at)).toEqual([0, 0]);
  handle.cancel();
  await clock.advance(RECOVERY_WINDOW_MS + 10000);

  expect(calls).toHaveLength(2);
  expect(events.applied).toHaveLength(0);
  expect(events.unknown).toHaveLength(0);
  expect(clock.timers.size).toBe(0);
});

test("callback exceptions do not restart work", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const clock = createClock();
    const { query, calls } = fakeQuery(clock, () => null);
    const events = collect();
    recovery(clock, query, async () => "h1").start({
      captureId: "throwing",
      html: "body",
      attempts: twoIds,
      initialOutcome: { saveId: "a", requestHash: "h1", status: "applied" },
      startedAt: 0,
      onApplied: () => {
        throw new Error("callback boom");
      },
      onUnknown: events.onUnknown,
    });
    await flush();
    await clock.advance(RECOVERY_WINDOW_MS + 10000);

    expect(calls).toHaveLength(0);
    expect(events.unknown).toHaveLength(0);
    expect(clock.timers.size).toBe(0);

    const clock2 = createClock();
    const events2 = collect();
    recovery(clock2, fakeQuery(clock2, () => null).query, async () => "h1").start({
      captureId: "throwing-expiry",
      html: "body",
      attempts: twoIds,
      startedAt: 0,
      onApplied: events2.onApplied,
      onUnknown: () => {
        throw new Error("unknown boom");
      },
    });
    await flush();
    await clock2.advance(RECOVERY_WINDOW_MS + 10000);
    expect(events2.applied).toHaveLength(0);
    expect(clock2.timers.size).toBe(0);
  } finally {
    error.mockRestore();
  }
});

test("two simultaneous recoveries keep independent deadlines, queries and callbacks", async () => {
  const clock = createClock();
  const callsA = [];
  const callsB = [];
  const eventsA = collect();
  const eventsB = collect();
  const queryA = ({ saveId, requestHash, signal }) => {
    callsA.push({ at: clock.at(), saveId, requestHash });
    return Promise.resolve({ saveId: "a", requestHash: "h1", status: "applied" });
  };
  const queryB = ({ saveId, requestHash, signal }) => {
    callsB.push({ at: clock.at(), saveId, requestHash });
    return Promise.resolve(null);
  };
  const recoveryA = recovery(clock, queryA, async () => "h1");
  const recoveryB = recovery(clock, queryB, async () => "h2");
  const handleA = recoveryA.start({
    captureId: "A",
    html: "a-body",
    attempts: [{ saveId: "a" }],
    startedAt: 0,
    ...eventsA,
  });
  await flush();
  expect(callsA.map((call) => call.at)).toEqual([0]);
  expect(eventsA.applied).toEqual([{ captureId: "A", saveId: "a", requestHash: "h1" }]);

  await clock.advance(5000);
  const handleB = recoveryB.start({
    captureId: "B",
    html: "b-body",
    attempts: twoIds,
    startedAt: 5000,
    ...eventsB,
  });
  await flush();

  expect(callsB.map((call) => call.at)).toEqual([5000, 5000]);
  expect(eventsB.applied).toHaveLength(0);

  handleA.cancel();
  await clock.advance(46000);

  expect(callsA).toHaveLength(1);
  expect(callsB.map((call) => call.at)).toEqual([5000, 5000, 15000, 15000, 35000, 35000]);
  expect(callsB.every((call) => call.requestHash === "h2")).toBe(true);
  expect(eventsB.unknown).toEqual([{ captureId: "B", reason: "expired" }]);
  expect(eventsA.applied).toHaveLength(1);
  handleB.cancel();
});

test("the default digest hashes exact UTF-8 HTML when WebCrypto is present", async () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return;
  const { sha256Hex } = await import("../../src/live/save-history.js");
  const hex = await sha256Hex("<p>héllo</p>");
  expect(hex).toMatch(/^[0-9a-f]{64}$/);
  const again = await sha256Hex("<p>héllo</p>");
  expect(again).toBe(hex);
  const different = await sha256Hex("<p>hello</p>");
  expect(different).not.toBe(hex);
});
