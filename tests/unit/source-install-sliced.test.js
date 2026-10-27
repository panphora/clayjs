/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/big.html"}
 */
import { jest } from "@jest/globals";

/**
 * source-install-sliced: a large document's install and repair run across tasks.
 *
 * The source session's first use is a parse of the whole file and a pairing of it against
 * the page, and a repair after an accepted save is the same walk again. At 5,000 entries
 * that is over a second of uninterrupted work, and every keystroke behind it waits. Above
 * `SLICED_SAVE_MIN_BYTES` both now go through the same driver the save's own preparation
 * uses, on the same threshold and with the same exceptions.
 *
 * What must NOT change is the state they leave behind: the same model, map, stats and
 * answer as the one-task form, which is what the hidden-tab case here is for. A session
 * that ends mid-walk installs nothing, and a synchronous reader — `text()`, `stats()`,
 * `locate()` — still answers in its own task.
 *
 * The task boundary is the real one, so the clock spends the slice budget on every step:
 * nothing before a macrotask turn proves nothing was installed, and a walk that settled
 * without one took the synchronous path.
 */

const BIG = 320 * 1024;

const source = (filler) => [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Big</title></head>",
  `  <body><article id="filler">${filler}</article><p id="c">initial</p></body>`,
  "</html>",
].join("\n");

// Over the threshold in bytes, and refused by nothing: this is the file this page was
// served as.
const SRC = source("x".repeat(BIG));
const EDITED = SRC.replace(">initial<", ">edited<");
const EDITED_AGAIN = SRC.replace(">initial<", ">edited again<");
const SMALL = source("small");

let session;
let clock = 0;
let installed = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const drainMicrotasks = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };

// A walk that has settled before any macrotask turn took the one-task path: the sliced one
// always waits for at least one task boundary.
async function settlesInThisTask(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await drainMicrotasks();
  return settled;
}

async function until(check, limit = 200) {
  for (let i = 0; i < limit; i++) {
    if (check()) return true;
    await sleep(5);
  }
  return check();
}

function seed(filler) {
  const parsed = new DOMParser().parseFromString(source(filler), "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

beforeAll(async () => {
  // A clock that spends the slice budget on every step, so the walk hands the page back
  // between its phases. How long a slice really takes is the parser's own contract.
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  window.clayEditMode = true;
  seed("x".repeat(BIG));
  global.fetch = jest.fn(async () => {
    throw new Error("the receipt is the file: no install should ask the host for it");
  });
  session = await import("../../src/source/session.js");
  installed = () => session.stats().installed;
});

beforeEach(() => {
  // Every test starts from an uninstalled session on the same page: the map is keyed by
  // live node identity, so re-seeding would make it describe nodes that are gone.
  session.release();
});

afterAll(() => {
  session.release();
});

test("an install over the threshold hands the page back, and ends where the drained one ends", async () => {
  // The one-task form, which a hidden tab keeps: timers there are throttled and there is
  // no typing to protect.
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  let drained;
  let drainedSummary;
  try {
    const pending = session.start({ latest: () => ({ bytes: SRC }) });
    expect(await settlesInThisTask(pending)).toBe(true);
    drained = await pending;
    drainedSummary = session.stats();
  } finally {
    delete document.hidden;
  }
  expect(drained.installed).toBe(true);
  expect(document.hidden).toBe(false);

  session.release();
  const pending = session.start({ latest: () => ({ bytes: SRC }) });

  // The same install, sliced: it is still walking after every microtask this turn has.
  expect(await settlesInThisTask(pending)).toBe(false);
  expect(session.installed()).toBe(false);

  const sliced = await pending;
  expect(sliced.installed).toBe(true);

  // The same session state as the drained form, field for field except the timings.
  const slicedSummary = session.stats();
  const comparable = (summary) => {
    const { timing, ...rest } = summary;
    return rest;
  };
  expect(comparable(slicedSummary)).toEqual(comparable(drainedSummary));
  expect(slicedSummary.paired).toBeGreaterThan(0);

  // And it is a real install: the file is the model, a live node indexes it, and the save
  // renderer is in place.
  expect(session.text()).toBe(SRC);
  const loc = session.locateLive(document.getElementById("c"));
  expect(loc).not.toBeNull();
  expect(SRC.slice(loc.from, loc.to)).toBe('<p id="c">initial</p>');
});

test("an install under the threshold stays in the caller's task", async () => {
  const pending = session.start({ latest: () => ({ bytes: SMALL }) });

  expect(await settlesInThisTask(pending)).toBe(true);
  expect(installed()).toBe(true);
  expect(session.text()).toBe(SMALL);
});

test("a session that ends mid-install installs nothing", async () => {
  const before = session.text();
  const pending = session.start({ latest: () => ({ bytes: SRC }) });
  // Far enough into the walk that it has yielded at least once.
  await sleep(0);
  await sleep(0);
  expect(session.installed()).toBe(false);

  session.release();
  await expect(pending).resolves.toBeNull();

  const stats = session.stats();
  expect(stats.installed).toBe(false);
  expect(stats.refused).toBeNull();
  // The aborted walk adopted nothing: the model a previous install left is still the one
  // this module answers with.
  expect(session.text()).toBe(before);
});

test("a repair over the threshold hands the page back, and a reader still answers in its own task", async () => {
  await session.start({ latest: () => ({ bytes: SRC }) });
  const before = session.repairGeneration();

  // An accepted save queues the repair. `repairGeneration()` is read without draining, so
  // it is how this test sees the walk between slices.
  session.adoptAccepted(EDITED);
  await drainMicrotasks();
  expect(session.repairGeneration()).toBe(before);

  await sleep(0);
  expect(session.repairGeneration()).toBe(before);

  expect(await until(() => session.repairGeneration() === before + 1)).toBe(true);
  expect(session.text()).toBe(EDITED);
  expect(session.stats().refreshes).toBeGreaterThan(0);

  // A synchronous reader drains the queued repair in its own task, which is what every
  // `text()`, `locate()` and `stats()` answer has always been.
  const queued = session.repairGeneration();
  session.adoptAccepted(EDITED_AGAIN);
  expect(session.text()).toBe(EDITED_AGAIN);
  expect(session.repairGeneration()).toBe(queued + 1);
});
