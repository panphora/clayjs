/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The save barrier and the document-operation permit.
 *
 * An exit has closed input admission before the barrier runs, so no ordinary save can go
 * out. The barrier is the one write that still may: it carries a permit minted for the
 * mode generation it is leaving, it fastens the work no save can write, and it answers
 * "settled" only for bytes that include everything the page still holds. Every refusal
 * leaves the page exactly as it was — no baseline, no capture, no aborted request.
 *
 * Requests are held by hand here, so a case can put input on the page while a save is on
 * the wire, answer 412 or 500, or never answer at all.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 5; i++) await sleep(0);
};

const until = async (predicate) => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return true;
    await sleep(5);
  }
  return false;
};

let save, core, snapshot, warning, unsaved, transition;
let posts = [];
let order = [];
let held = [];
let gets = [];
let holdPosts = false;
let holdGets = false;
let registrations = [];
let sessions = [];

const register = (options) => {
  const handle = unsaved.registerUnsavedState(options);
  registrations.push(handle);
  return handle;
};

const track = (session) => {
  sessions.push(session);
  return session;
};

function okResponse(body = { msg: "Saved" }, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
}

// Every POST is a save; everything else is a host-meta or template GET. Both can be held.
function installRouter() {
  posts = [];
  order = [];
  held = [];
  gets = [];
  holdPosts = false;
  holdGets = false;
  globalThis.fetch = window.fetch = jest.fn((url, options = {}) => {
    const method = options.method || "GET";
    if (method !== "POST") {
      if (!holdGets) return Promise.resolve(notFound());
      return new Promise((resolve) => gets.push({ url: String(url), resolve }));
    }
    posts.push(String(options.body ?? ""));
    order.push("post");
    if (!holdPosts) return Promise.resolve(okResponse());
    return new Promise((resolve, reject) => held.push({ body: String(options.body ?? ""), resolve, reject }));
  });
}

const answerGet = (index, html) => gets[index].resolve({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: () => null },
  text: async () => html,
});

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.head.innerHTML = '<style data-name="barrier-saved" clay="no-data">.item { color: red; }</style>';
  document.body.innerHTML = '<div id="content">start</div>';
  installRouter();
  core = await import("../../src/core/save-core.js");
  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
  warning = await import("../../src/core/unsaved-warning.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
  transition = await import("../../src/core/mode-transition.js");
  save.setSaveGeneration(1);
  document.body.appendChild(document.createElement("span"));
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
  await sleep(50);
}, 20000);

afterEach(() => {
  for (const handle of registrations) handle.dispose();
  registrations = [];
  for (const session of sessions) session.stop();
  sessions = [];
  if (save.isSaveConflicted()) save.conflictResolvedBySync(null);
  core.resetSaveAttempts();
  save.setSaveGeneration(1);
  holdPosts = false;
  holdGets = false;
});

// The page's accepted state: one real save of what is on screen now.
async function acceptedBaseline(text) {
  document.getElementById("content").textContent = text;
  await flush();
  await save.savePage();
  await flush();
  posts.length = 0;
  order.length = 0;
  held.length = 0;
}

const edit = async (text) => {
  document.getElementById("content").textContent = text;
  await flush();
};

test("a clean page settles the barrier with zero writes, and an edit is written once", async () => {
  await acceptedBaseline("barrier clean base");

  const clean = await transition.runSaveBarrier();
  expect(clean).toMatchObject({ ok: true, state: "clean" });
  expect(posts.length).toBe(0);

  // The positive control for every other case: the same barrier does write when there
  // is something to write.
  await edit("the exit's own edit");
  const written = await transition.runSaveBarrier();
  expect(written).toMatchObject({ ok: true, state: "saved" });
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("the exit's own edit");
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
  expect(warning.hasUnsavedChanges()).toBe(false);
});

test("the barrier is the one write a closed save session admits", async () => {
  await acceptedBaseline("permit base");
  const session = track(save.saveSession());
  session.start();
  await edit("typed between modes");
  session.quiesce();

  expect(save.savesAdmitted()).toBe(false);
  expect((await save.savePage()).msgType).toBe("skipped");
  expect((await save.savePageForce()).msgType).toBe("skipped");
  expect(posts.length).toBe(0);

  const result = await transition.runSaveBarrier();
  expect(result).toMatchObject({ ok: true, state: "saved" });
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("typed between modes");
});

test("a permit is bound to its own mode generation", async () => {
  await acceptedBaseline("generation base");
  const session = track(save.saveSession());
  session.start();
  await edit("generation edit");
  session.quiesce();

  save.setSaveGeneration(2);
  const stale = await transition.runSaveBarrier({ generation: 1 });
  expect(stale).toMatchObject({ ok: false, code: "stale-document" });
  expect(posts.length).toBe(0);

  // The same binding one layer down: a permit minted for generation 1 admits nothing
  // once generation 2 owns the page, and one minted for 2 does.
  const old = save.openSavePermit(1);
  const current = save.openSavePermit(2);
  expect(save.savesAdmitted(old)).toBe(false);
  expect(save.savesAdmitted(current)).toBe(true);
  save.closeSavePermit(old);
  save.closeSavePermit(current);

  const settled = await transition.runSaveBarrier({ generation: 2 });
  expect(settled).toMatchObject({ ok: true, state: "saved" });
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("generation edit");
});

test("a registered model is fastened before the bytes, and a composer refuses the barrier", async () => {
  await acceptedBaseline("sources base");
  let modelPending = true;
  register({
    id: "model",
    isPending: () => modelPending,
    flush: async () => {
      order.push("flush:model");
      modelPending = false;
      return { ok: true };
    },
  });
  await edit("with a model value");

  const result = await transition.runSaveBarrier();
  expect(result).toMatchObject({ ok: true, state: "saved" });
  expect(order).toEqual(["flush:model", "post"]);
  expect(posts[0]).toContain("with a model value");
  expect(unsaved.pendingIds()).toEqual([]);

  // A composer has no flush: it waits for its person, and the barrier refuses rather
  // than blurring it or sending the page without it.
  await acceptedBaseline("composer base");
  register({ id: "composer", isPending: () => true });
  await edit("text beside an open composer");

  const refused = await transition.runSaveBarrier();
  expect(refused).toMatchObject({ ok: false, code: "pending-input", pending: ["composer"] });
  expect(posts.length).toBe(0);
  expect(warning.hasUnsavedChanges()).toBe(true);
});

test("an accepted write is one answer carrying the host's stamp", async () => {
  await acceptedBaseline("accepted base");
  holdPosts = true;
  await edit("accepted bytes");

  const barrier = transition.runSaveBarrier();
  expect(await until(() => held.length === 1)).toBe(true);
  held[0].resolve(okResponse({ msg: "Saved", etag: '"E7"' }));

  expect(await barrier).toMatchObject({ ok: true, state: "saved", etag: '"E7"' });
  expect(posts.length).toBe(1);
});

test("a 412 is a conflict, not a failed save, and the bytes stay", async () => {
  await acceptedBaseline("conflict base");
  holdPosts = true;
  await edit("conflicted edit");
  const dirty = save.getLastSavedDirty();

  const barrier = transition.runSaveBarrier();
  expect(await until(() => held.length === 1)).toBe(true);
  held[0].resolve(okResponse({ msg: "This document changed since you last loaded it.", code: "conflict" }, 412));

  expect(await barrier).toMatchObject({ ok: false, code: "conflict" });
  expect(save.isSaveConflicted()).toBe(true);
  expect(posts.length).toBe(1);
  expect(save.getLastSavedDirty()).toBe(dirty);
  expect(warning.hasUnsavedChanges()).toBe(true);
});

test("a refused save is save-failed, and nothing advances", async () => {
  await acceptedBaseline("failure base");
  holdPosts = true;
  await edit("the host refused this");
  const dirty = save.getLastSavedDirty();

  const barrier = transition.runSaveBarrier();
  expect(await until(() => held.length === 1)).toBe(true);
  held[0].resolve(okResponse({ msg: "The host is down" }, 500));

  expect(await barrier).toMatchObject({ ok: false, code: "save-failed" });
  expect(save.getLastSavedDirty()).toBe(dirty);
  expect(warning.hasUnsavedChanges()).toBe(true);
});

test("a write that never answers times out, and keeps its own outcome on the wire", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  await acceptedBaseline("timeout base");
  holdPosts = true;
  await edit("held on the wire");
  const dirty = save.getLastSavedDirty();

  try {
    const barrier = transition.runSaveBarrier({ timeoutMs: 80 });
    expect(await until(() => held.length === 1)).toBe(true);

    expect(await barrier).toMatchObject({ ok: false, code: "timeout" });
    expect(save.getLastSavedDirty()).toBe(dirty);

    // The request was not aborted to manufacture an answer: the host's answer still
    // lands, and it still counts.
    held[0].resolve(okResponse());
    expect(await until(() => save.getLastSavedDirty() === snapshot.captureForDirtyCheck())).toBe(true);
    expect(posts.length).toBe(1);
    expect(warning.hasUnsavedChanges()).toBe(false);
  } finally {
    console.error.mockRestore();
  }
});

test("an unknown fate is save-unknown, not a failed save", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  await acceptedBaseline("unknown base");
  holdPosts = true;
  await edit("outcome unknown");
  const dirty = save.getLastSavedDirty();

  try {
    const barrier = transition.runSaveBarrier();
    expect(await until(() => held.length === 1)).toBe(true);
    held[0].reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));

    expect(await barrier).toMatchObject({ ok: false, code: "save-unknown" });
    expect(core.saveFateIsUnknown()).toBe(true);
    expect(save.getLastSavedDirty()).toBe(dirty);
  } finally {
    console.error.mockRestore();
  }
});

test("input typed while the request is on the wire is written too", async () => {
  await acceptedBaseline("second input base");
  holdPosts = true;
  await edit("first");

  const barrier = transition.runSaveBarrier();
  expect(await until(() => held.length === 1)).toBe(true);
  await edit("second");
  // The retry the barrier needs is answered at once; only the first request is held.
  holdPosts = false;
  held[0].resolve(okResponse());

  expect(await barrier).toMatchObject({ ok: true, state: "saved" });
  expect(posts.length).toBe(2);
  expect(posts[1]).toContain("second");
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
  expect(warning.hasUnsavedChanges()).toBe(false);
});

test("a simultaneous whole-document replacement and a barrier exclude each other", async () => {
  await acceptedBaseline("replace base");

  // A replacement asked for while the barrier is writing is refused outright: it writes
  // nothing and does not even fetch its template.
  holdPosts = true;
  await edit("mid-barrier edit");
  const barrier = transition.runSaveBarrier();
  expect(await until(() => held.length === 1)).toBe(true);
  expect(await core.replacePageWith("/other-template.html")).toMatchObject({ ok: false, msgType: "skipped" });
  expect(gets.length).toBe(0);
  holdPosts = false;
  held[0].resolve(okResponse());
  expect(await barrier).toMatchObject({ ok: true });

  // And the other way round: while a replacement is fetching, the barrier is busy and
  // writes nothing of its own.
  holdGets = true;
  const replacing = core.replacePageWith("/next-template.html");
  expect(await until(() => gets.length === 1)).toBe(true);
  await edit("an edit during the replacement");

  expect(await transition.runSaveBarrier()).toMatchObject({ ok: false, code: "busy" });
  expect(posts.length).toBe(1);

  answerGet(0, "<html><body><p>next</p></body></html>");
  expect(await replacing).toMatchObject({ ok: true });

  // Both released the slot, so the page can settle again.
  holdGets = false;
  expect(await transition.runSaveBarrier()).toMatchObject({ ok: true });
});

test("a barrier run under a token its caller owns does not claim a second slot", async () => {
  await acceptedBaseline("owned token base");
  await edit("the exit's own edit under an owned token");

  // The mode controller takes the document-operation slot for the whole exit and hands
  // the barrier that same token. If the barrier claimed its own, every exit would answer
  // busy to itself.
  const owned = core.claimDocumentOperation("mode");
  expect(owned).toBeTruthy();
  try {
    expect(await transition.runSaveBarrier({ operation: owned })).toMatchObject({ ok: true, state: "saved" });
    expect(posts.length).toBe(1);
    expect(posts[0]).toContain("the exit's own edit under an owned token");
    // The slot is still the caller's: another operation is refused until it lets go.
    expect(core.operationKind()).toBe("mode");
    expect(core.claimDocumentOperation("upgrade")).toBeNull();
  } finally {
    core.releaseDocumentOperation(owned);
  }
  expect(core.operationKind()).toBeNull();

  // The standalone call still claims its own slot and releases it.
  await edit("written by a standalone barrier");
  expect(await transition.runSaveBarrier()).toMatchObject({ ok: true, state: "saved" });
  expect(core.operationKind()).toBeNull();
});

test("a pending source's flush receives the exit's own permit, deadline and signal", async () => {
  await acceptedBaseline("exit context base");
  const session = track(save.saveSession());
  session.start();
  await edit("written under the exit's permit");
  session.quiesce();
  expect(save.savesAdmitted()).toBe(false);

  let seen = null;
  let admittedDuringFlush = null;
  let abortedDuringFlush = null;
  let pending = true;
  register({
    id: "page:live",
    isPending: () => pending,
    flush: async (context) => {
      seen = context;
      admittedDuringFlush = save.savesAdmitted(context.permit);
      abortedDuringFlush = context.signal.aborted;
      pending = false;
      return { ok: true };
    },
  });

  const started = Date.now();
  const result = await transition.runSaveBarrier({ timeoutMs: 2000 });
  expect(result).toMatchObject({ ok: true, state: "saved" });
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("written under the exit's permit");

  // The source flushed under the exit's own permit: a closed session admits it, and the
  // same permit is revoked when the barrier answers.
  expect(seen).toBeTruthy();
  expect(admittedDuringFlush).toBe(true);
  expect(save.savesAdmitted(seen.permit)).toBe(false);
  // The deadline is the barrier's own absolute one, not a fresh budget for the source.
  expect(seen.deadline - started).toBeGreaterThanOrEqual(2000);
  expect(seen.deadline - started).toBeLessThan(2100);
  expect(seen.timeoutMs).toBeGreaterThan(0);
  expect(seen.timeoutMs).toBeLessThanOrEqual(2000);
  expect(seen.keepalive).toBe(false);
  expect(abortedDuringFlush).toBe(false);
  expect(seen.signal.aborted).toBe(true);
});

test("a source that outlives the deadline is a timeout, and its work is stopped", async () => {
  await acceptedBaseline("outlived deadline base");
  let signal = null;
  let finish = null;
  register({
    id: "page:live",
    isPending: () => true,
    flush: (context) => {
      signal = context.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  await edit("held by a source that never settles");

  const result = await transition.runSaveBarrier({ timeoutMs: 60 });
  expect(result).toMatchObject({ ok: false, code: "timeout", pending: ["page:live"] });
  expect(posts.length).toBe(0);

  // The barrier stopped waiting and stopped the work with it: the signal the source was
  // handed is aborted, so nothing it does late can start a write of its own.
  expect(signal.aborted).toBe(true);
  expect(finish).toBeTruthy();
  finish({ ok: true });
  await flush();
  expect(posts.length).toBe(0);
});

test("a source that fails beside a conflict keeps the conflict refusal", async () => {
  await acceptedBaseline("source conflict base");
  register({
    id: "page:live",
    isPending: () => true,
    flush: async () => {
      holdPosts = true;
      const saving = save.savePage();
      expect(await until(() => held.length === 1)).toBe(true);
      held[0].resolve(okResponse({ msg: "This document changed since you last loaded it.", code: "conflict" }, 412));
      await saving;
      return { ok: false, code: "conflict" };
    },
  });
  await edit("refused beside a conflicted source");

  const result = await transition.runSaveBarrier({ timeoutMs: 2000 });
  expect(result).toMatchObject({ ok: false, code: "conflict", pending: ["page:live"] });
  expect(save.isSaveConflicted()).toBe(true);
  expect(posts.length).toBe(1);
});

test("a source that fails beside an unknown fate keeps the save-unknown refusal", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  await acceptedBaseline("source unknown base");
  register({
    id: "page:live",
    isPending: () => true,
    flush: async () => {
      holdPosts = true;
      const saving = save.savePage();
      expect(await until(() => held.length === 1)).toBe(true);
      held[0].reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
      await saving;
      return { ok: false, code: "save-unknown" };
    },
  });
  await edit("a source whose save may have landed");

  try {
    const result = await transition.runSaveBarrier({ timeoutMs: 2000 });
    expect(result).toMatchObject({ ok: false, code: "save-unknown", pending: ["page:live"] });
    expect(core.saveFateIsUnknown()).toBe(true);
  } finally {
    console.error.mockRestore();
  }
});
