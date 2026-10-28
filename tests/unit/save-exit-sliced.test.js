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

let save, saveCore, unsaved, transition, editMode, snapshot;
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
  editMode = await import("../../src/core/is-edit-mode.js");
  snapshot = await import("../../src/core/snapshot.js");
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

// ============================================
// EVERY RETURN OF THE EXIT'S OWN SAVE ANSWERS THE CALLERS QUEUED BEHIND IT
// ============================================
//
// A soon() caller whose timer fired while a save was on the wire waits for the save its own
// call queued one behind. Each return below ends the exit's own save with nothing later
// guaranteed to take those callers, so the answer is the return's own result. A waiter
// nobody answers is a promise the page can never settle.

// Every step of a preparation spends the slice budget, so the job hands the page back
// between its phases and the test can hold it there.
function stepClock() {
  const realNow = performance.now;
  let clock = 0;
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  return () => Object.defineProperty(performance, "now", { configurable: true, writable: true, value: realNow });
}

// Let whatever the return parked finish before the next test takes the lane: a drain runs
// one more save, and its lane would make the next test's save skip instead of prepare.
async function idleLane() {
  for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
  expect(saveCore.isSaveInProgress()).toBe(false);
  await save.savePage();
  for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
  expect(saveCore.isSaveInProgress()).toBe(false);
}

// Queue callers behind the save on the wire: the timer fires while the lane is held, so
// their own call parks and they wait for the save it queued behind.
async function queuedBehindSaved(gate, count = 1) {
  const answers = [];
  const saving = save.savePage();
  expect(gate.held.length).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    save.savePageSoon().then((value) => { answers.push(value); });
  }
  await sleep(300);
  expect(answers).toHaveLength(0);
  return { answers, saving };
}

test("a soon() caller hears the skip of a forced save that finds no edit mode", async () => {
  setText("forced-save-not-in-edit-mode");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    editMode.commitModeFacts({ isEditMode: false });
    const skipped = await save.savePageForce();
    expect(skipped).toMatchObject({ ok: false, msgType: "skipped", msg: "Not in edit mode" });
    editMode.commitModeFacts({ isEditMode: true });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "skipped", msg: "Not in edit mode" });
  } finally {
    editMode.commitModeFacts({ isEditMode: true });
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the host's refusal a forced save the page may not write gives", async () => {
  setText("forced-save-refused");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    editMode.noteHostWritable(false);
    const refused = await save.savePageForce();
    expect(refused).toMatchObject({ ok: false, msgType: "forbidden", code: "forbidden", sent: false });
    editMode.noteHostWritable(true);

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "forbidden", code: "forbidden" });
  } finally {
    editMode.noteHostWritable(true);
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the hold a forced save waiting for a preview gives", async () => {
  setText("forced-save-held");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const reason = "Saves are held for a test preview";
  const gate = holdSlices();
  const restoreClock = stepClock();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    save.holdAllSaves(reason);
    const held = await save.savePageForce();
    expect(held).toMatchObject({ ok: false, msgType: "skipped", msg: reason });
    // Released without a replay, which is how a closing session drops the missed save: no
    // later save is coming for these callers.
    save.releaseAllSaves({ replay: false, reason });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "skipped", msg: reason });
  } finally {
    save.releaseAllSaves({ replay: false, reason });
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the skip of a forced save that finds the lane busy", async () => {
  setText("forced-save-lane-busy");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    const skipped = await save.savePageForce();
    expect(skipped).toMatchObject({ ok: false, msgType: "skipped", msg: "Save already in progress" });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "skipped", msg: "Save already in progress" });
  } finally {
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

// One answer per caller. The return above took the waiters out of the queue, so the save that
// follows it is nobody's second answer: each caller still holds the skip it was given, and
// three callers produce three answers, not six.
test("no soon() caller is answered twice, whatever save follows", async () => {
  setText("forced-save-answered-once");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  let resolutions = 0;
  const answers = [];
  const soon = [];
  let saving;
  try {
    saving = save.savePage();
    expect(gate.held.length).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      soon.push(save.savePageSoon().then((value) => { resolutions++; answers.push(value); }));
    }
    await sleep(300);
    expect(resolutions).toBe(0);

    const skipped = await save.savePageForce();
    expect(skipped).toMatchObject({ msgType: "skipped", msg: "Save already in progress" });
    await sleep(100);
    expect(resolutions).toBe(3);

    // The save on the wire settles and the page is edited again, so a real save follows: a
    // caller settled by the return above is not the next save's to answer a second time.
    gate.release();
    const first = await saving;
    expect(first.msgType).not.toBe("saved");
    for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
    expect(saveCore.isSaveInProgress()).toBe(false);

    setText("forced-save-answered-once-later");
    expect((await save.savePage()).ok).toBe(true);
    await Promise.all(soon);
    await sleep(100);

    expect(resolutions).toBe(3);
    expect(answers).toHaveLength(3);
    for (const answer of answers) {
      expect(answer).toMatchObject({ msgType: "skipped", msg: "Save already in progress" });
    }
  } finally {
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

// The attempt queued behind a save whose fate is unknown is kept, not sent: the callers
// are still waiting once the lane is idle and nothing later is queued to take them.
async function keptWhenFateUnknown(gate, queued) {
  const realFetch = global.fetch;
  let unknown;
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes("/_/save")) {
      throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
  try {
    gate.release();
    unknown = await queued.saving;
  } finally {
    global.fetch = realFetch;
  }
  expect(unknown.msgType).not.toBe("saved");
  expect(saveCore.saveFateIsUnknown()).toBe(true);
  expect(queued.answers).toHaveLength(0);
}

// A page the save judges in one task: no preparation for the slice gate to hold, so the
// capture happens in the caller's own step.
function wholeCapturePage() {
  const realDescriptor = Object.getOwnPropertyDescriptor(document, "hidden") || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  return () => {
    if (realDescriptor && realDescriptor.get) Object.defineProperty(document, "hidden", realDescriptor);
    else delete document.hidden;
  };
}

test("a soon() caller hears the hold an explicit save waiting for a preview gives", async () => {
  setText("explicit-save-held");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const reason = "Saves are held for a test preview";
  const gate = holdSlices();
  const restoreClock = stepClock();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    save.holdAllSaves(reason);
    const held = await save.savePage();
    expect(held).toMatchObject({ ok: false, msgType: "skipped", msg: reason });
    // Released without a replay, which is how a closing session drops the missed save: no
    // later save is coming for these callers.
    save.releaseAllSaves({ replay: false, reason });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "skipped", msg: reason });
  } finally {
    save.releaseAllSaves({ replay: false, reason });
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the refusal a forced save in a closed session gives", async () => {
  setText("forced-save-not-admitted");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  const session = save.saveSession();
  let saving;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    session.start();
    session.quiesce();
    expect(save.savesAdmitted()).toBe(false);
    const skipped = await save.savePageForce();
    expect(skipped).toMatchObject({ ok: false, msgType: "skipped", msg: "Save session is quiesced" });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ ok: false, msgType: "skipped", msg: "Save session is quiesced" });
    expect(answers[0]).toBe(skipped);
  } finally {
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    session.stop();
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the error of a forced save whose capture fails", async () => {
  setText("before-forced-save-capture-failure");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  // Typed after that save, so the save the callers queue behind really goes out and its
  // aborted request leaves the page's fate unknown.
  setText("forced-save-capture-failure");
  const gate = holdSlices();
  const restoreClock = stepClock();
  const realError = console.error;
  console.error = () => {};
  let throwing = false;
  snapshot.addDocumentTransform(() => {
    if (throwing) throw new Error("capture exploded");
  });
  let restoreHidden = null;
  try {
    const queued = await queuedBehindSaved(gate);
    const answers = queued.answers;
    await keptWhenFateUnknown(gate, queued);

    restoreHidden = wholeCapturePage();
    throwing = true;
    const failed = await save.savePageForce();
    throwing = false;
    expect(failed).toMatchObject({ msgType: "error", msg: "capture exploded", code: null });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toBe(failed);
  } finally {
    throwing = false;
    restoreHidden?.();
    console.error = realError;
    gate.restore();
    restoreClock();
    await idleLane();
  }
});

test("a soon() caller hears the save a forced save lands in one task", async () => {
  setText("forced-save-whole-capture");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  const realError = console.error;
  console.error = () => {};
  let saving;
  let restoreHidden = null;
  try {
    const queued = await queuedBehindSaved(gate);
    saving = queued.saving;
    const answers = queued.answers;

    // The attempt queued behind the save on the wire is kept rather than sent: the host
    // has withdrawn permission, so the drain refuses it and takes nobody with it, and the
    // callers are left waiting with the lane idle.
    editMode.noteHostWritable(false);
    gate.release();
    await saving;
    saving = null;
    expect(answers).toHaveLength(0);
    editMode.noteHostWritable(true);
    for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
    expect(saveCore.isSaveInProgress()).toBe(false);

    restoreHidden = wholeCapturePage();
    const sentBefore = posts.length;
    const saved = await save.savePageForce();
    expect(saved).toMatchObject({ ok: true });

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toBe(saved);
    expect(posts.length).toBe(sentBefore + 1);
  } finally {
    editMode.noteHostWritable(true);
    restoreHidden?.();
    console.error = realError;
    gate.release();
    gate.restore();
    await saving?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

// A force save paused in its preparation holds the capture it took, not the page: an edit
// typed after that capture is not in the bytes it will write. A caller that asks for a save
// after the edit is asking about those bytes, so the paused save's result cannot be its
// answer, and the save the drain starts is.
test("a soon() caller is answered by the save that carries its edit, not the paused one", async () => {
  setText("forced-save-paused-alpha");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  const gate = holdSlices();
  const restoreClock = stepClock();
  const answers = [];
  let forcing;
  try {
    const sentBefore = posts.length;
    forcing = save.savePageForce();
    expect(saveCore.isSaveInProgress()).toBe(true);
    expect(gate.held.length).toBeGreaterThan(0);

    // Typed after the force save took its capture, so this edit is not in the bytes it is
    // preparing, and it is the edit the caller below is asking about.
    setText("forced-save-paused-beta");
    save.savePageSoon().then((value) => { answers.push(value); });
    await sleep(300);
    expect(answers).toHaveLength(0);

    gate.release();
    const forced = await forcing;
    forcing = null;
    expect(forced).toMatchObject({ ok: true });
    expect(posts[sentBefore]).toContain("forced-save-paused-alpha");
    expect(posts[sentBefore]).not.toContain("forced-save-paused-beta");

    await sleep(300);
    expect(answers).toHaveLength(1);
    expect(answers[0]).not.toBe(forced);
    expect(answers[0]).toMatchObject({ ok: true });
    expect(posts[sentBefore + 1]).toContain("forced-save-paused-beta");
    expect(answers[0].etag).toBe(`etag-${sentBefore + 2}`);
  } finally {
    gate.release();
    gate.restore();
    await forcing?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});

// Control for the test above: a caller queued before the force save takes its capture is
// answered by that save, because its capture does cover the bytes they asked about.
test("a soon() caller queued before a forced save's capture is answered by it", async () => {
  setText("forced-save-queued-before");
  // The preparer loads on demand: one plain save gets it in place, so the hold below
  // catches a preparation that really is sliced.
  expect((await save.savePage()).ok).toBe(true);
  // Typed after that save, so the save the callers queue behind really goes out and its
  // aborted request leaves the page's fate unknown.
  setText("forced-save-queued-before-edit");
  const gate = holdSlices();
  const restoreClock = stepClock();
  let forcing;
  try {
    const queued = await queuedBehindSaved(gate);
    const answers = queued.answers;
    // The attempt queued behind the save on the wire is kept rather than sent, so the
    // callers are still waiting when the force save below takes its capture.
    await keptWhenFateUnknown(gate, queued);
    for (let i = 0; i < 200 && saveCore.isSaveInProgress(); i++) await sleep(20);
    expect(saveCore.isSaveInProgress()).toBe(false);
    expect(answers).toHaveLength(0);

    const sentBefore = posts.length;
    forcing = save.savePageForce();
    expect(gate.released).toBe(true);
    const forced = await forcing;
    forcing = null;
    expect(forced).toMatchObject({ ok: true });
    expect(posts[sentBefore]).toContain("forced-save-queued-before-edit");

    await sleep(100);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toBe(forced);
  } finally {
    gate.release();
    gate.restore();
    await forcing?.catch(() => {});
    restoreClock();
    await idleLane();
  }
});
