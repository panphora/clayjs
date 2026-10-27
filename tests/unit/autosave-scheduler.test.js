import { jest } from "@jest/globals";
import {
  ADAPTIVE_SPACING,
  CONTINUOUS_MS,
  COST_MULTIPLIER,
  IDLE_MS,
  MAX_COOLDOWN_MS,
  MIN_GAP_MS,
  createAutosaveScheduler,
  nextAutoAt
} from "../../src/lib/autosave-scheduler.js";

/**
 * An automatic save is admitted before it captures anything.
 *
 * The scheduler owns the quiet period and the continuous-typing ceiling, so a
 * page that is merely queued is never copied, and an admitted attempt takes one
 * snapshot for both the decision and the bytes it sends. Today's cadence is kept:
 * 1,500 ms quiet, 10,000 ms continuous, and adaptive spacing is off.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const START = 1000000;

function fakeTime({ start = START } = {}) {
  let clock = start;
  let timers = [];
  let seq = 0;

  const drain = () => new Promise((r) => queueMicrotask(r));

  return {
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({ id, at: clock + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    async advance(ms) {
      const until = clock + ms;
      for (;;) {
        await drain();
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > until) break;
        timers.shift();
        clock = next.at;
        next.fn();
      }
      await drain();
      clock = until;
    },
    timers: () => timers.length
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe("the automatic-save cadence", () => {
  test("a quiet page is admitted IDLE_MS after its last change", async () => {
    const time = fakeTime();
    const runs = [];
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => { runs.push(time.now()); }
    });

    scheduler.noteActivity();
    await time.advance(IDLE_MS);
    expect(runs).toEqual([START + IDLE_MS]);
  });

  test("continuous changes are admitted CONTINUOUS_MS after the first one", async () => {
    const time = fakeTime();
    const runs = [];
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => { runs.push(time.now()); }
    });

    scheduler.noteActivity();
    for (let waited = 0; waited < CONTINUOUS_MS; waited += 400) {
      await time.advance(400);
      scheduler.noteActivity();
    }

    expect(runs).toEqual([START + CONTINUOUS_MS]);
  });

  test("continuous changes wait out the cost the last save measured", async () => {
    const time = fakeTime();
    const runs = [];
    const gate = deferred();
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => {
        runs.push(time.now());
        return gate.promise;
      }
    });

    // The first burst is admitted by the quiet period; the attempt it admits does
    // three seconds of synchronous work.
    scheduler.noteActivity();
    await time.advance(IDLE_MS);
    expect(runs).toHaveLength(1);
    await time.advance(3000);
    scheduler.noteCost(3000);
    gate.resolve();
    await time.advance(0);
    expect(scheduler.running()).toBe(false);

    const finishedAt = START + IDLE_MS + 3000;
    const continuousAt = finishedAt + 4 * 3000;

    // No pause long enough to flush: the ten-second healthy checkpoint is replaced
    // by the twelve seconds this save earned.
    while (time.now() < continuousAt) {
      await time.advance(400);
      if (time.now() < continuousAt) scheduler.noteActivity();
    }

    expect(runs).toEqual([START + IDLE_MS, continuousAt]);
  });

  test("two trigger types coalesce onto one admitted attempt", async () => {
    const time = fakeTime();
    const runs = [];
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => { runs.push(time.now()); }
    });

    scheduler.noteActivity();
    await time.advance(100);
    scheduler.request();
    await time.advance(1400);

    expect(runs).toEqual([START + IDLE_MS]);
  });

  test("a request with no input behind it waits only the gap after the last save", async () => {
    const time = fakeTime();
    const runs = [];
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => { runs.push(time.now()); }
    });

    scheduler.noteActivity();
    await time.advance(IDLE_MS);
    expect(runs.length).toBe(1);

    scheduler.request();
    await time.advance(MIN_GAP_MS - 1);
    expect(runs.length).toBe(1);
    await time.advance(1);
    expect(runs).toEqual([START + IDLE_MS, START + IDLE_MS + MIN_GAP_MS]);
  });

  test("a save that blocks for three seconds cannot cause an immediate catch-up save", async () => {
    const time = fakeTime();
    const runs = [];
    const gate = deferred();
    const scheduler = createAutosaveScheduler({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
      run: () => {
        runs.push(time.now());
        return gate.promise;
      }
    });

    scheduler.noteActivity();
    await time.advance(IDLE_MS);
    expect(runs.length).toBe(1);

    await time.advance(500);
    scheduler.noteActivity();
    await time.advance(2500);
    expect(runs.length).toBe(1);

    gate.resolve();
    await time.advance(0);
    expect(scheduler.running()).toBe(false);

    const finishedAt = START + IDLE_MS + 3000;
    expect(scheduler.dueAt()).toBe(finishedAt + IDLE_MS);
    await time.advance(1400);
    expect(runs.length).toBe(1);
    await time.advance(200);
    expect(runs.length).toBe(2);
    expect(runs[1]).toBe(finishedAt + IDLE_MS);
  });

  test("adaptive spacing multiplies the cooldown a costly save earned", () => {
    expect(ADAPTIVE_SPACING).toBe(true);
    expect(COST_MULTIPLIER).toBe(4);

    const common = { firstDirtyAt: 0, lastActivityAt: 0, finishedAt: 5000 };
    expect(nextAutoAt({ ...common, costMs: 0 })).toBe(6500);
    // A real quiet period still flushes 1,500 ms after the last change, whatever
    // that save cost.
    expect(nextAutoAt({ ...common, costMs: 3000 })).toBe(6500);
    expect(nextAutoAt(common)).toBeGreaterThanOrEqual(common.finishedAt + MIN_GAP_MS);

    // Under continuous typing the same cost replaces the ten-second checkpoint with
    // the twelve seconds that save's own 3,000 ms of work earned.
    expect(nextAutoAt({ firstDirtyAt: 0, lastActivityAt: 16000, finishedAt: 5000, costMs: 3000 }))
      .toBe(5000 + 4 * 3000);
  });

  // 4 x 20,000 ms would be 80,000 ms of cooldown. The plan's ceiling is thirty.
  test("the cost cooldown stops at MAX_COOLDOWN_MS", () => {
    const finishedAt = 60000;
    const typing = { firstDirtyAt: finishedAt + 2500, lastActivityAt: finishedAt + 29500, finishedAt };

    expect(nextAutoAt({ ...typing, costMs: 20000 })).toBe(finishedAt + MAX_COOLDOWN_MS);
    // Just under the ceiling, the measured cost is still what sets the interval.
    expect(nextAutoAt({ ...typing, costMs: 6000 })).toBe(finishedAt + 6000 * 4);
  });

  test("the cooldown is capped and never shorter than the gap", () => {
    const finishedAt = 2000;
    expect(nextAutoAt({ firstDirtyAt: finishedAt, lastActivityAt: finishedAt, finishedAt, costMs: MAX_COOLDOWN_MS * 10 }))
      .toBeGreaterThanOrEqual(finishedAt + MIN_GAP_MS);
  });

  test("a slower save raises the cost estimate at once, a skipped one never zeroes it", () => {
    const scheduler = createAutosaveScheduler({ run: () => {} });

    scheduler.noteCost(100);
    expect(scheduler.costEstimate()).toBe(100);

    scheduler.noteCost(0);
    scheduler.noteCost(undefined);
    scheduler.noteCost(-5);
    expect(scheduler.costEstimate()).toBe(100);

    scheduler.noteCost(40);
    expect(scheduler.costEstimate()).toBe(80);

    scheduler.noteCost(400);
    expect(scheduler.costEstimate()).toBe(400);
  });
});

describe("an admitted automatic save", () => {
  let save, snapshot, core, dirtyGate;
  let posts = [];
  let abortSaves = false;
  let latency = 0;
  let nextSaveReply = null;
  let captures = 0;
  let authored = 0;

  beforeAll(async () => {
    window.clayEditMode = true;
    document.body.innerHTML = '<div id="c">start</div>';
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method !== "POST") {
        return { ok: false, status: 404, statusText: "NF", headers: { get: () => null }, text: async () => "", json: async () => ({}) };
      }
      posts.push(String(options.body ?? ""));
      if (latency) await sleep(latency);
      if (abortSaves) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const reply = nextSaveReply;
      nextSaveReply = null;
      if (reply) return reply;
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify({ msg: "Saved" }) };
    });
    save = await import("../../src/core/save.js");
    snapshot = await import("../../src/core/snapshot.js");
    core = await import("../../src/core/save-core.js");
    dirtyGate = await import("../../src/lib/dirty-gate.js");
    snapshot.onSnapshot(() => { captures++; });
  }, 20000);

  // First, while the load-time settle is still running: the baseline veto is
  // armed, so page bytes that match the boot capture are never written on their
  // own. Undoing back to the boot state is the case that shows it: the veto holds
  // it while the page is settling and releases it once the settle is done.
  test("the load-time veto refuses an automatic save that returns to the boot bytes", async () => {
    expect(save.baselineSettled()).toBe(false);
    const bootBytes = save.getLastSavedContents();
    const before = posts.length;

    document.getElementById("c").textContent = "boot-saved";
    await sleep(0);
    expect((await save.savePage()).ok).toBe(true);
    expect(posts.length).toBe(before + 1);
    expect(save.getLastSavedContents()).not.toBe(bootBytes);

    document.getElementById("c").textContent = "start";
    await sleep(0);
    const vetoed = await save.savePageThrottled();
    expect(vetoed.msgType).toBe("skipped");
    expect(vetoed.msg).toBe("No changes to save");
    expect(posts.length).toBe(before + 1);

    for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
    expect(save.baselineSettled()).toBe(true);
  }, 20000);

  async function establish(text) {
    document.getElementById("c").textContent = text;
    await sleep(0);
    await save.savePage();
    await sleep(1300); // past the automatic lane's throttle
  }

  test("an automatic request captures nothing until it is admitted", async () => {
    await establish("queued");
    const seenCaptures = captures;
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "queued-next";
    await sleep(0);
    save.autosaveScheduler.noteActivity();
    await sleep(300);
    expect(captures).toBe(seenCaptures);

    save.autosaveScheduler.noteActivity();
    await sleep(1000);
    expect(captures).toBe(seenCaptures);

    await sleep(800);
    expect(captures).toBe(seenCaptures + 1);
    expect(posts.length).toBe(seenPosts + 1);
    expect(posts[posts.length - 1]).toContain("queued-next");
  }, 20000);

  test("an admitted request captures once and runs the authored capture once", async () => {
    document.getElementById("c").insertAdjacentHTML("afterend",
      '<div id="counted" onbeforesave="window.__authored = (window.__authored || 0) + 1"></div>');
    await establish("authored-base");
    window.__authored = 0;
    const seenCaptures = captures;
    const seenAuthored = window.__authored;

    document.getElementById("c").textContent = "authored-one";
    await sleep(0);
    let callbackResult = null;
    const result = await save.savePageThrottled((r) => { callbackResult = r; });

    expect(result.ok).toBe(true);
    expect(callbackResult).toBe(result);
    expect(captures - seenCaptures).toBe(1);
    expect(window.__authored - seenAuthored).toBe(1);
  }, 20000);

  test("a clean request sends nothing", async () => {
    await establish("clean");
    const seenPosts = posts.length;

    const result = await save.savePageThrottled();

    expect(result.msgType).toBe("skipped");
    expect(result.msg).toBe("No changes to save");
    expect(posts.length).toBe(seenPosts);
  }, 20000);

  // The cost estimate is this page's own work: the capture, the render, the
  // verifier's parse and the adoption of what the host accepted. Waiting for the
  // host is not this page's work, so a slow answer must not buy a longer cooldown
  // (four times two seconds would be eight seconds of one).
  test("a two-second network delay does not raise the cost estimate", async () => {
    await establish("slow-network-base");
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "slow-network-edit";
    await sleep(0);
    latency = 2000;
    const startedAt = performance.now();
    const result = await save.savePageThrottled();
    latency = 0;

    expect(result.ok).toBe(true);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(2000);
    expect(posts.length).toBe(seenPosts + 1);
    expect(save.autosaveScheduler.costEstimate()).toBeLessThan(1000);
  }, 20000);

  // The dirty gate is the cheap half of the old dirtyMatchesLastSave check, and
  // it is what an automatic attempt consults before it captures anything. A page
  // it calls clean must cost no snapshot at all: no hooks, no sync serialization,
  // no clay:snapshot-ready, and no request.
  test("a clean page's automatic attempt fires no snapshot event and no fetch", async () => {
    await establish("clean-page");
    expect(dirtyGate.pageMaybeDirty()).toBe(false);
    const seenPosts = posts.length;
    const seenCaptures = captures;
    let events = 0;
    const count = () => { events++; };
    document.addEventListener("clay:snapshot-ready", count);

    const result = await save.savePageThrottled();

    document.removeEventListener("clay:snapshot-ready", count);
    expect(result.msgType).toBe("skipped");
    expect(result.msg).toBe("No changes to save");
    expect(events).toBe(0);
    expect(captures).toBe(seenCaptures);
    expect(posts.length).toBe(seenPosts);
  }, 20000);

  test("a manual save takes priority over a pending automatic one, which then finds nothing to send", async () => {
    await establish("manual-base");
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "manual-first";
    await sleep(0);
    save.autosaveScheduler.noteActivity();

    const manual = await save.savePage();
    expect(manual.ok).toBe(true);
    expect(posts.length).toBe(seenPosts + 1);
    expect(posts[posts.length - 1]).toContain("manual-first");

    await sleep(2000);
    expect(posts.length).toBe(seenPosts + 1);
  }, 20000);

  test("text typed during an automatic save stays dirty and is saved by the next one", async () => {
    await establish("flight-base");
    latency = 150;
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "flight-one";
    await sleep(0);
    const first = save.savePageThrottled();
    await sleep(20);
    document.getElementById("c").textContent = "flight-two";
    await sleep(0);
    const second = await save.savePageThrottled();
    expect(second.msg).toBe("Save already in progress");
    await first;

    await sleep(2500);
    expect(posts.length).toBe(seenPosts + 2);
    expect(posts[posts.length - 1]).toContain("flight-two");
    expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
    latency = 0;
  }, 20000);

  test("a batching-only edit waits for an explicit save", async () => {
    if (!document.getElementById("batch")) {
      document.body.insertAdjacentHTML("beforeend", '<div id="batch" clay="no-trigger-autosave">b</div>');
    }
    await establish("batching-base");
    const seenPosts = posts.length;

    document.getElementById("batch").textContent = "batched-edit";
    await sleep(0);
    save.autosaveScheduler.noteActivity();
    await sleep(2000);

    expect(posts.length).toBe(seenPosts);

    await save.savePage();
    expect(posts.length).toBe(seenPosts + 1);
    expect(posts[posts.length - 1]).toContain("batched-edit");
    document.getElementById("batch").remove();
  }, 20000);

  test("undo back to the load-time bytes is still saved", async () => {
    await establish("original-undo");
    const bootBytes = save.getLastSavedContents();
    await establish("undo-change");
    expect(save.getLastSavedContents()).not.toBe(bootBytes);

    document.getElementById("c").textContent = "original-undo";
    await sleep(0);
    await save.savePageThrottled();

    expect(save.getLastSavedContents()).toBe(bootBytes);
    expect(posts[posts.length - 1]).toContain("original-undo");
  }, 20000);

  test("an automatic save held by the all-save hold replays once on release", async () => {
    await establish("held-base");
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "held-edit";
    await sleep(0);
    save.holdAllSaves();
    expect((await save.savePageThrottled()).msgType).toBe("skipped");
    save.releaseAllSaves();

    await sleep(2500);
    expect(posts.length).toBe(seenPosts + 1);
    expect(posts[posts.length - 1]).toContain("held-edit");
  }, 20000);

  test("a conflict stops automatic saves until it is resolved", async () => {
    await establish("conflict-base");
    const seenPosts = posts.length;

    nextSaveReply = {
      ok: false,
      status: 412,
      statusText: "PRECONDITION",
      headers: { get: () => null },
      text: async () => JSON.stringify({ msg: "This document changed since you last loaded it.", code: "conflict", etag: "E9" })
    };
    document.getElementById("c").textContent = "conflict-edit";
    await sleep(0);
    const refused = await save.savePageThrottled();

    expect(refused.msgType).toBe("conflict");
    expect(save.isSaveConflicted()).toBe(true);
    expect(document.documentElement.getAttribute("savestatus")).toBe("conflict");
    expect(posts.length).toBe(seenPosts + 1);

    document.getElementById("c").textContent = "typed-over-the-conflict";
    await sleep(0);
    save.autosaveScheduler.noteActivity();
    await sleep(2000);
    expect(posts.length).toBe(seenPosts + 1);

    save.conflictResolvedBySync("E9");
    expect(save.isSaveConflicted()).toBe(false);

    await sleep(2500);
    expect(posts.length).toBe(seenPosts + 2);
    expect(posts[posts.length - 1]).toContain("typed-over-the-conflict");
  }, 20000);

  test("coalesced callers receive the one attempt's result", async () => {
    await establish("coalesce-base");
    const seenPosts = posts.length;

    // A clean call opens the automatic lane's window, so the two dirty calls
    // below land inside it and share one attempt.
    await save.savePageThrottled();
    document.getElementById("c").textContent = "coalesced";
    await sleep(0);
    const first = save.savePageThrottled();
    const second = save.savePageThrottled();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe(b);
    expect(a.ok).toBe(true);
    expect(posts.length).toBe(seenPosts + 1);
    expect(posts[posts.length - 1]).toContain("coalesced");
  }, 20000);

  test("a save whose fate is unknown is not treated as saved, and no queued save drains into it", async () => {
    await establish("unknown-base");
    abortSaves = true;
    latency = 300;
    const seenPosts = posts.length;

    document.getElementById("c").textContent = "unknown-outcome";
    await sleep(0);
    const first = save.savePageThrottled();
    for (let i = 0; i < 400 && !core.isSaveInProgress(); i++) await sleep(5);
    expect(core.isSaveInProgress()).toBe(true);
    document.getElementById("c").textContent = "queued-behind-unknown";
    await sleep(0);
    expect((await save.savePageThrottled()).msg).toBe("Save already in progress");

    const result = await first;
    expect(result.msgType).toBe("unknown");
    expect(core.saveFateIsUnknown()).toBe(true);
    expect(save.getLastSavedContents()).not.toContain("unknown-outcome");

    await sleep(2500);
    expect(posts.length).toBe(seenPosts + 1);
    abortSaves = false;
    latency = 0;
  }, 20000);
});
