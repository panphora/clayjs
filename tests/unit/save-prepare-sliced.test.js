/**
 * save-prepare-sliced: a large document prepares its save across tasks.
 *
 * Above `SLICED_SAVE_MIN_BYTES` the verification of a save is seconds of uninterrupted
 * work, so the capture is one atomic snapshot in the caller's task and everything after it
 * is resumed across tasks. What that must NOT change is the answer: the same bytes, the
 * same refusals and the same receipts as the one-task path, and a checkpoint captured
 * before later typing is still the thing that gets written.
 *
 * The orderings the design fixes, each one asserted here:
 *
 *   1. the lane is taken and the capture begun before the first await, so nothing is sent
 *      while the preparation is pending and a second automatic request only records intent;
 *   2. ordinary typing during preparation never cancels the job — A is saved and B stays
 *      dirty;
 *   3. an invalidation (a mode change, a raised document format) cancels an unsent job,
 *      which drops what it captured and answers the skip contract;
 *   4. recovery copies are pinned at the capture boundary, so one staged afterwards is not
 *      acknowledged by A's acceptance;
 *   5. a flush waits for the preparation instead of deciding in the middle of it;
 *   6. a small document, a hidden tab and a keepalive flush keep the one-task path.
 *
 * The task boundary here is the real one: the driver yields with a macrotask, so nothing
 * before a macrotask turn proves nothing was sent, and a save that has settled without one
 * took the synchronous path.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

// The recovery store writes structured-cloned records, and this context has no
// `structuredClone` of its own.
globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

// Comfortably over the threshold once serialized: the saved bytes are the whole document,
// not just this text.
const BIG = 320 * 1024;
const SMALL = 200;

let save;
let recoveryModule;
let floorModule;
let posts = [];
let captures = 0;
let clock = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const drainMicrotasks = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const setText = (text) => { document.getElementById("c").textContent = text; };
const lastPost = () => posts[posts.length - 1] ?? "";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

function installRouter() {
  posts = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      posts.push(String(options.body ?? ""));
      return okJson({ msg: "Saved", etag: `etag-${posts.length}` });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
}

// A save that has settled before any macrotask turn took the one-task path: the prepared
// one always waits for at least one task boundary.
async function settlesInThisTask(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await drainMicrotasks();
  return settled;
}

beforeAll(async () => {
  // A clock that spends the slice budget on every step: the preparation then hands the
  // page back between the capture's phases, which is what the orderings below are about.
  // How much time a slice really takes is the parser's own contract, tested where it lives.
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  window.clayEditMode = true;
  // A document this big with one small edit inside it: the saved size stays over the
  // threshold, which is what decides the path, whatever the edit says.
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  installRouter();
  document.addEventListener("clay:snapshot-ready", () => { captures += 1; });
  save = await import("../../src/core/save.js");
  recoveryModule = await import("../../src/core/recovery.js");
  floorModule = await import("../../src/core/page-format.js");
  // The load-time settle is the page's own, not the person's; a save must not be the one
  // that waits for it here.
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
  // The first save of a page has no last saved size to judge, so it prepares in one task.
  setText("first");
  const first = await save.savePage();
  expect(first.ok).toBe(true);
  // One completed prepared save, so the lazily loaded driver is in place and every test
  // below takes the prepared path from its first task.
  setText("warm");
  const warm = await save.savePage();
  expect(warm.ok).toBe(true);
  posts = [];
}, 60000);

// --------------------------------------------------------------- the lane and the capture

test("nothing is sent while the preparation is pending, and the bytes are the capture's", async () => {
  setText("pending-A");
  const sentBefore = posts.length;
  const capturesBefore = captures;

  const saving = save.savePage();
  // The lane and the capture are this task's: the snapshot is taken now, the request is not.
  expect(captures).toBe(capturesBefore + 1);
  expect(posts.length).toBe(sentBefore);

  const result = await saving;
  expect(result.ok).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("pending-A");
});

test("a forced save above the threshold prepares across tasks too", async () => {
  setText("forced-A");
  const sentBefore = posts.length;

  const saving = save.savePageForce();
  expect(posts.length).toBe(sentBefore);
  const result = await saving;

  expect(result.ok).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("forced-A");
});

// ----------------------------------------------------------- typing, not invalidation

test("typing B while A prepares sends A's bytes and leaves B dirty and next", async () => {
  setText("checkpoint-A");
  const saving = save.savePage();
  // Ordinary typing is not an invalidation: the checkpoint that was captured is what goes
  // out, and the newer edit waits for the next save.
  setText("typed-B");

  const result = await saving;
  expect(result.ok).toBe(true);
  expect(lastPost()).toContain("checkpoint-A");
  expect(lastPost()).not.toContain("typed-B");
  expect(save.getLastSavedContents()).not.toContain("typed-B");

  const sentBefore = posts.length;
  await save.savePage();
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("typed-B");
});

test("a second automatic request during the preparation only records intent", async () => {
  await sleep(1300);
  setText("auto-one");
  const capturesBefore = captures;
  const sentBefore = posts.length;

  const preparing = save.savePage();
  // Typed during A's preparation: the queued attempt has something to write.
  setText("auto-two");
  const second = await save.savePageThrottled();

  expect(second.msgType).toBe("skipped");
  expect(second.msg).toBe("Save already in progress");
  // One capture for this stretch of typing, not two.
  expect(captures).toBe(capturesBefore + 1);

  await preparing;
  expect(lastPost()).toContain("auto-one");

  // The intent survived: the scheduler runs it once the gap after A allows.
  await sleep(2000);
  expect(captures).toBe(capturesBefore + 2);
  expect(posts.length).toBe(sentBefore + 2);
  expect(lastPost()).toContain("auto-two");
});

// ------------------------------------------------------------------------ invalidation

test("a mode change mid-preparation cancels with no request and no saved event", async () => {
  setText("mode-cancel");
  const sentBefore = posts.length;
  const capturesBefore = captures;
  const saved = [];
  const onSaved = (event) => saved.push(event.detail);
  document.addEventListener("clay:save-saved", onSaved);
  const generation = save.saveGeneration();

  let result;
  try {
    const saving = save.savePage();
    // The session generation moves under the job: these bytes describe a page the next
    // mode no longer owns.
    save.setSaveGeneration(generation + 1);
    result = await saving;
  } finally {
    save.setSaveGeneration(generation);
    document.removeEventListener("clay:save-saved", onSaved);
  }

  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(/cancelled/);
  expect(posts.length).toBe(sentBefore);
  expect(saved).toHaveLength(0);
  expect(captures).toBe(capturesBefore + 1);
});

test("a morph during the preparation cancels the job", async () => {
  setText("morph-cancel");
  const sentBefore = posts.length;

  const saving = save.savePage();
  // A disk frame or a peer's edit replaced the page under the job: the bytes it verified
  // describe a page that is no longer here.
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", seq: 1 } }));
  const result = await saving;

  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(/cancelled/);
  expect(posts.length).toBe(sentBefore);
});

// The check that no yield can make for you: a change that lands after the preparation's
// last yield, in the same task as the dispatch. The renderer here is the seam a source
// map installs, and its final segment runs once nothing can yield again.
test("a change after the last yield of the preparation still cancels before dispatch", async () => {
  const snapshot = await import("../../src/core/snapshot.js");
  const render = (clone, today) => today;
  let armed = false;
  function* renderSteps(clone, today) {
    yield;
    if (armed) {
      armed = false;
      save.setSaveGeneration(save.saveGeneration() + 1);
    }
    return today;
  }

  setText("late-invalidation");
  const sentBefore = posts.length;
  const generation = save.saveGeneration();
  snapshot.setSaveRenderer(render, { steps: renderSteps });
  let result;
  try {
    armed = true;
    result = await save.savePage();
  } finally {
    snapshot.setSaveRenderer(null);
    save.setSaveGeneration(generation);
  }

  expect(armed).toBe(false);
  expect(result.msgType).toBe("skipped");
  expect(result.msg).toMatch(/cancelled/);
  expect(posts.length).toBe(sentBefore);
});

test("a flush waits for the preparing job before deciding anything", async () => {
  setText("flush-waits");
  const sentBefore = posts.length;

  const preparing = save.savePage();
  const flushed = save.flushSave({ timeoutMs: 8000 });
  let answered = false;
  flushed.then(() => { answered = true; }, () => { answered = true; });

  await drainMicrotasks();
  // The flush has neither sent a second request nor answered over a preparation it cannot
  // see: it waits for the job that holds the lane.
  expect(answered).toBe(false);
  expect(posts.length).toBe(sentBefore);

  await preparing;
  const outcome = await flushed;

  // A already wrote everything the page holds, so the flush's own answer is that there is
  // nothing left to send — and it made no request of its own to find that out.
  expect(outcome.state).toBe("clean");
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("flush-waits");
});

// ---------------------------------------------------------------------------- recovery

test("a recovery copy staged after A's capture is not acknowledged by A's acceptance", async () => {
  const factory = new IDBFactory();
  const readSaved = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return new Map([["body", { text: doc.getElementById("c")?.textContent ?? "" }]]);
  };
  document.documentElement.setAttribute("documentid", "doc-sliced");
  const recovery = recoveryModule.createRecovery({ indexedDB: factory, mode: "edit", writerId: "writer-sliced" });
  const entries = recovery.register({ channel: "journal.body", version: 1, readSaved });
  const payload = () => ({ text: document.getElementById("c").textContent });
  const records = async () => (await entries.list()).records;

  try {
    setText("recovery-A");
    entries.stage({ key: "body", payload: payload() });
    expect((await entries.flush()).ok).toBe(true);
    expect(await records()).toHaveLength(1);

    const saving = save.savePage();
    // A revision staged while A prepares, with the very payload A is writing: the capture
    // pinned what was held when it was taken, so this newer copy is neither covered by A
    // nor cleared by its acceptance.
    entries.stage({ key: "body", payload: payload() });
    const result = await saving;
    expect(result.ok).toBe(true);
    expect(lastPost()).toContain("recovery-A");
    await entries.flush();

    const rows = await records();
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(2);
  } finally {
    await entries.dispose();
    document.documentElement.removeAttribute("documentid");
  }
});

// ---------------------------------------------------------------- the one-task path

test("a small document keeps the synchronous path", async () => {
  // Saving the small page is what tells the lane how big this document now is.
  document.body.innerHTML = `<article id="c">${"s".repeat(SMALL)}</article>`;
  await save.savePage();

  setText("small-document");
  const sentBefore = posts.length;
  const saving = save.savePage();

  expect(await settlesInThisTask(saving)).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("small-document");
});

test("a hidden tab keeps the synchronous path, however big the document is", async () => {
  // Back over the threshold first.
  document.body.innerHTML = `<article id="filler">${"y".repeat(BIG)}</article><article id="c">visible</article>`;
  await save.savePage();
  expect(lastPost()).toContain("yyyy");

  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  try {
    setText("hidden-tab");
    const sentBefore = posts.length;
    const saving = save.savePage();

    expect(await settlesInThisTask(saving)).toBe(true);
    expect(posts.length).toBe(sentBefore + 1);
    expect(lastPost()).toContain("hidden-tab");
  } finally {
    delete document.hidden;
  }
  expect(document.hidden).toBe(false);
});

test("a keepalive flush keeps the synchronous path", async () => {
  setText("keepalive-flush");
  const sentBefore = posts.length;

  const flushed = save.flushSave({ keepalive: true, timeoutMs: 8000 });

  expect(await settlesInThisTask(flushed)).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("keepalive-flush");
});

// The document format floor only rises, and this tab keeps it for good: it is asserted
// last so no other test's bytes carry the marker.
test("a document format that rises mid-preparation re-prepares at the new floor", async () => {
  setText("floor-rise");
  const capturesBefore = captures;
  const sentBefore = posts.length;

  const saving = save.savePage();
  floorModule.notePageFormatFloor(1);
  const result = await saving;

  expect(result.ok).toBe(true);
  // The first capture's marker and verification both predate the floor, so it is dropped
  // and taken again at the new one.
  expect(captures).toBe(capturesBefore + 2);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain('<meta name="clay-page-format" content="1">');
  expect(lastPost()).toContain("floor-rise");
});
