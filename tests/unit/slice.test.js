/**
 * @jest-environment node
 */

/**
 * slice: one generator, two ways to run it.
 *
 * The save verifier's walks are generators so that the same code can run in one task
 * (what the synchronous functions always did) or across tasks (so a large document does
 * not hold the thread). This file pins the driver's own contract: `drain` is a plain
 * run, `runSliced` hands the event loop back only when the slice spent its budget, an
 * abort closes the generator so `finally` runs and nothing partial escapes, and an
 * exception comes out as a rejection rather than a wrong answer.
 */

import { jest } from "@jest/globals";
import { drain, runSliced } from "../../src/lib/slice.js";

jest.setTimeout(20000);

test("drain runs a generator to completion and returns its value", () => {
  let closed = false;
  const result = drain((function* () {
    try {
      let total = 0;
      for (let i = 0; i < 5; i++) { total += i; yield i; }
      return { total };
    } finally { closed = true; }
  })());
  expect(result).toEqual({ total: 10 });
  expect(closed).toBe(true);
});

test("drain returns the value of a generator that never yields", () => {
  expect(drain((function* () { return 7; })())).toBe(7);
});

test("runSliced returns the same value drain does", async () => {
  const gen = (function* () { for (let i = 0; i < 3; i++) yield i; return "done"; })();
  expect(await runSliced(gen, { budgetMs: 0 })).toBe("done");
});

test("runSliced yields to a task whenever the slice has spent its budget", async () => {
  // A fake clock that moves 5 ms per reading, so every slice of a 4 ms budget is spent.
  let t = 0;
  const now = () => (t += 5);
  let yields = 0;
  const gen = (function* () { for (let i = 0; i < 4; i++) yield i; return "done"; })();
  const value = await runSliced(gen, {
    budgetMs: 4,
    now,
    yieldTask: async () => { yields++; },
  });
  expect(value).toBe("done");
  expect(yields).toBe(4);
});

test("runSliced does not yield while the slices stay inside the budget", async () => {
  let yields = 0;
  const gen = (function* () { for (let i = 0; i < 20; i++) yield i; return "done"; })();
  const value = await runSliced(gen, {
    budgetMs: 400,
    now: () => 0,
    yieldTask: async () => { yields++; },
  });
  expect(value).toBe("done");
  expect(yields).toBe(0);
});

test("a budget of zero yields at every point the walk offers", async () => {
  let yields = 0;
  const gen = (function* () { for (let i = 0; i < 6; i++) yield i; })();
  await runSliced(gen, { budgetMs: 0, yieldTask: async () => { yields++; } });
  expect(yields).toBe(6);
});

test("the default yield hands the event loop back, so a timer fires mid-walk", async () => {
  let beats = 0;
  const heartbeat = setInterval(() => { beats++; }, 1);
  try {
    const gen = (function* () { for (let i = 0; i < 500; i++) yield i; })();
    await runSliced(gen, { budgetMs: 0 });
  } finally {
    clearInterval(heartbeat);
  }
  expect(beats).toBeGreaterThan(0);
});

test("an abort closes the generator, so its finally runs and nothing partial escapes", async () => {
  const controller = new AbortController();
  let closed = 0;
  let yields = 0;
  const gen = (function* () {
    try {
      for (let i = 0; i < 10; i++) yield i;
      return { document: "never" };
    } finally { closed++; }
  })();
  const result = await runSliced(gen, {
    budgetMs: 0,
    signal: controller.signal,
    yieldTask: async () => {
      if (++yields === 3) controller.abort();
      await Promise.resolve();
    },
  });
  expect(result).toEqual({ aborted: true });
  expect(result.document).toBeUndefined();
  expect(closed).toBe(1);
  expect(yields).toBe(3);
});

test("an already-aborted signal never resumes the generator at all", async () => {
  const controller = new AbortController();
  controller.abort();
  let ran = false;
  let yields = 0;
  const gen = (function* () { ran = true; yield 1; return "value"; })();
  const result = await runSliced(gen, {
    budgetMs: 0,
    signal: controller.signal,
    yieldTask: async () => { yields++; },
  });
  expect(result).toEqual({ aborted: true });
  expect(ran).toBe(false);
  expect(yields).toBe(0);
});

test("an exception in the walk is a rejection, not a wrong answer", async () => {
  const gen = (function* () {
    yield 1;
    throw new Error("the walk gave up");
  })();
  await expect(runSliced(gen, { budgetMs: 0 })).rejects.toThrow("the walk gave up");
});

test("an exception thrown after a yield is still the walk's own exception", async () => {
  let yields = 0;
  const gen = (function* () {
    for (let i = 0; i < 4; i++) yield i;
    throw new TypeError("late");
  })();
  await expect(runSliced(gen, {
    budgetMs: 0,
    yieldTask: async () => { yields++; },
  })).rejects.toThrow(TypeError);
  expect(yields).toBe(4);
});
