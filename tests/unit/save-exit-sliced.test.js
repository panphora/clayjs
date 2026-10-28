/**
 * save-exit-sliced: a large page's exit checkpoint keeps its permit.
 *
 * Above `SLICED_SAVE_MIN_BYTES` a save prepares across tasks, and a preparing job is
 * cancelled by a closed session. The exit's own checkpoint is the one write that closed
 * session still admits, so the permit the barrier minted has to travel with the call:
 * through a preparer that is not loaded yet, and into the sliced job it starts.
 *
 * Both handoffs are covered. The page here is the live page source, whose exit checkpoint
 * is the slot `exitSave` holds, and the leave is the real barrier. The first exit is the
 * page's second save, so the preparer is still unloaded and the call has to re-enter with
 * its permit; the second exit takes the loaded path.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

const BIG = 320 * 1024;

let save, saveCore, unsaved, transition;
let posts = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setText = (text) => { document.getElementById("c").textContent = text; };

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

// One leave of a page that has closed its session: the page source's own flush is the
// exit checkpoint, and the barrier is the only writer a closed session admits.
async function leave() {
  const session = save.saveSession();
  session.start();
  const typed = document.getElementById("c").textContent;
  session.quiesce();
  expect(save.savesAdmitted()).toBe(false);
  expect((await save.savePageForce()).msgType).toBe("skipped");
  expect(posts.length).toBe(0);

  let pending = true;
  const seen = [];
  const handle = unsaved.registerUnsavedState({
    id: "page:live",
    isPending: () => pending,
    flush: async (context) => {
      seen.push(context.permit);
      const result = await saveCore.exitSave()(context.permit);
      pending = false;
      return { ok: result?.ok === true };
    },
  });
  try {
    const left = await transition.runSaveBarrier();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeTruthy();
    expect(left).toMatchObject({ ok: true });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain(typed);
  } finally {
    handle.dispose();
    session.stop();
  }
}

function holdSlices() {
  const previous = globalThis.scheduler;
  const held = [];
  const gate = {
    held,
    released: false,
    release() {
      gate.released = true;
      held.splice(0).forEach((resolve) => resolve());
    },
    restore() {
      if (previous === undefined) delete globalThis.scheduler;
      else globalThis.scheduler = previous;
    },
  };
  globalThis.scheduler = {
    yield: () => (gate.released ? Promise.resolve() : new Promise((resolve) => { held.push(resolve); })),
  };
  return gate;
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  installRouter();
  save = await import("../../src/core/save.js");
  saveCore = await import("../../src/core/save-core.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
  transition = await import("../../src/core/mode-transition.js");
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
  // The page's first save: no last saved size to judge yet, so it prepares in one task and
  // leaves the preparer unloaded for the first exit below.
  setText("first");
  expect((await save.savePage()).ok).toBe(true);
  posts = [];
}, 60000);

test("a large page's exit keeps its permit through a preparer that is still loading", async () => {
  setText("the exit's own edit");
  await leave();
});

test("a large page's exit keeps its permit into the sliced job it starts", async () => {
  setText("after the first exit");
  expect((await save.savePage()).ok).toBe(true);
  posts = [];
  setText("a later exit's own edit");
  await leave();
});

test("the exit's own save answers a soon() waiter no drained save could", async () => {
  // Every step of a preparation spends the slice budget, so the job hands the page back
  // between its phases and the test can hold it there.
  const realNow = performance.now;
  let clock = 0;
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  setText("page-soon-A");
  const session = save.saveSession();
  session.start();
  const gate = holdSlices();
  const answers = [];
  const sentBefore = posts.length;
  const realFetch = global.fetch;
  const realError = console.error;
  console.error = () => {};
  try {
    const saving = save.savePage();
    expect(gate.held.length).toBeGreaterThan(0);

    // Queued behind the prepared save while admission is still open: the caller waits for
    // the save its call queued one behind, not for the answer to its own call.
    save.savePageSoon().then((value) => { answers.push(value); });
    await sleep(300);
    expect(answers).toHaveLength(0);

    // That save's fate is unknown, so the queued attempt behind it is kept rather than
    // sent: nothing but the exit's own write can answer these callers.
    global.fetch = jest.fn(async (url, options = {}) => {
      if (String(url).includes("/_/save")) {
        throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
      }
      return okJson({ spec: 1, document: { etag: "base-1" } });
    });
    gate.release();
    const unknown = await saving;
    expect(unknown.msgType).not.toBe("saved");
    expect(saveCore.saveFateIsUnknown()).toBe(true);
    expect(answers).toHaveLength(0);

    global.fetch = realFetch;
    session.quiesce();
    expect(save.savesAdmitted()).toBe(false);

    let pending = true;
    const seen = [];
    const handle = unsaved.registerUnsavedState({
      id: "page:soon",
      isPending: () => pending,
      flush: async (context) => {
        seen.push(context.permit);
        const result = await saveCore.exitSave()(context.permit);
        pending = false;
        return { ok: result?.ok === true };
      },
    });
    let left;
    try {
      left = await transition.runSaveBarrier();
    } finally {
      handle.dispose();
    }
    expect(seen).toHaveLength(1);
    expect(left).toMatchObject({ ok: true });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: true });
    expect(answers[0].msgType).not.toBe("skipped");
    expect(posts.length).toBe(sentBefore + 1);
    expect(posts[posts.length - 1]).toContain("page-soon-A");
  } finally {
    console.error = realError;
    global.fetch = realFetch;
    gate.restore();
    session.stop();
    Object.defineProperty(performance, "now", { configurable: true, writable: true, value: realNow });
  }
});
