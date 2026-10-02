import { jest } from "@jest/globals";

/**
 * clay.save.flush: save now, and answer only when the host has accepted the bytes the
 * page holds NOW.
 *
 * The contract is about the bytes, not about a request: a save already on the wire is
 * waited out, an edit made during a request forces another one, and a refusal is
 * reported rather than resolved by overwriting somebody's version.
 */

let saveMod, unsaved;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function okResponse(body = { msg: "Saved" }, status = 200) {
  return { ok: status < 400, status, statusText: "", text: async () => JSON.stringify(body) };
}

// A save whose answer the test releases by hand, so a request can be held on the wire.
function deferredFetch() {
  const calls = [];
  const waiting = [];
  global.fetch = jest.fn((url, options) => {
    calls.push({ url: String(url), options });
    return new Promise((resolve) => waiting.push(resolve));
  });
  return {
    calls,
    answer: (index, response) => waiting[index](response),
  };
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  saveMod = await import("../../src/core/save.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
});

beforeEach(async () => {
  document.body.innerHTML = '<div id="c">start</div>';
  // Establish the file's bytes as this page's, the way a save that landed does.
  global.fetch = jest.fn(async () => okResponse());
  await saveMod.savePage();
  await tick();
  global.fetch.mockClear();
});

// A flush waits out the load-time settle, and the settle fires once per module
// registry: waiting for it here keeps a test's own clock about the flush.
async function settleBaseline() {
  if (saveMod.baselineSettled()) return;
  await new Promise((resolve) => document.addEventListener("clay:baseline-settled", resolve, { once: true }));
}

// First in the file on purpose: the settle has not fired yet when this flush is called,
// which is the only way to observe a flush that waits for it.
test("load-time render churn waits for the baseline and is not saved", async () => {
  expect(saveMod.baselineSettled()).toBe(false);
  global.fetch = jest.fn(async () => okResponse());

  // The page's own script renders from data after boot, the way malleable apps do:
  // churn that is not the person's work, which autosave's settle window also holds.
  const settled = new Promise((resolve) => document.addEventListener("clay:baseline-settled", resolve, { once: true }));
  let settledFirst = false;
  settled.then(() => { settledFirst = true; });
  document.getElementById("c").append(document.createElement("span"));

  const flushed = saveMod.flushSave();
  await expect(flushed).resolves.toEqual({ state: "clean", etag: null });
  expect(settledFirst).toBe(true);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a clean page answers 'clean' without sending anything", async () => {
  global.fetch = jest.fn();
  await expect(saveMod.flushSave()).resolves.toEqual({ state: "clean", etag: null });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a dirty page sends one save and answers with the host's stamp", async () => {
  global.fetch = jest.fn(async () => okResponse({ msg: "Saved", etag: "E1" }));
  document.getElementById("c").textContent = "an edit";

  await expect(saveMod.flushSave()).resolves.toEqual({ state: "saved", etag: "E1" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1].keepalive).toBeUndefined();
});

test("a save already on the wire is waited out, and flush sends its own", async () => {
  const net = deferredFetch();
  document.getElementById("c").textContent = "the other save's bytes";
  const inFlight = saveMod.savePage();
  await tick();
  expect(net.calls).toHaveLength(1);

  // A keystroke while that save is on the wire: the bytes it carries are already stale.
  document.getElementById("c").textContent = "typed while it was in flight";
  const flushed = saveMod.flushSave();
  await tick();
  // Waiting on the save in flight, not sending over it.
  expect(net.calls).toHaveLength(1);

  net.answer(0, okResponse({ msg: "Saved", etag: "E-first" }));
  await inFlight;
  await tick();
  expect(net.calls).toHaveLength(2);
  expect(net.calls[1].options.body).toContain("typed while it was in flight");

  net.answer(1, okResponse({ msg: "Saved", etag: "E-second" }));
  await expect(flushed).resolves.toEqual({ state: "saved", etag: "E-second" });
});

test("an edit made while flush's request is in flight forces another save", async () => {
  const net = deferredFetch();
  document.getElementById("c").textContent = "first version";
  const flushed = saveMod.flushSave();
  await tick();
  expect(net.calls).toHaveLength(1);

  document.getElementById("c").textContent = "second version";
  net.answer(0, okResponse({ msg: "Saved", etag: "E-first" }));
  await tick();
  expect(net.calls).toHaveLength(2);
  expect(net.calls[1].options.body).toContain("second version");

  net.answer(1, okResponse({ msg: "Saved", etag: "E-second" }));
  await expect(flushed).resolves.toEqual({ state: "saved", etag: "E-second" });
});

// clay.registerUnsavedState's contract: an editor's model can be ahead of the page, so
// the page's bytes can already match the file while the page holds work no save can
// write. That is not an answer about the page's bytes, and flush must not hand it back
// as one: it names the condition, sends nothing, and does not spin the lane.
test("work a save cannot write, with clean bytes, is reported as 'blocked'", async () => {
  await settleBaseline();
  const handle = unsaved.registerUnsavedState({ id: "editor-model", isPending: () => true });
  try {
    global.fetch = jest.fn(async () => okResponse({ msg: "Saved", etag: "E1" }));
    const started = Date.now();
    await expect(saveMod.flushSave()).rejects.toMatchObject({
      state: "blocked",
      message: "This document has unsaved work a save cannot write."
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(100);
  } finally {
    handle.dispose();
  }
});

test("a server error rejects with state 'failed'", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false, status: 500, statusText: "Server Error",
    text: async () => JSON.stringify({ msg: "boom" })
  }));
  document.getElementById("c").textContent = "the server said no";

  await expect(saveMod.flushSave()).rejects.toMatchObject({ state: "failed", message: "boom" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("a save still on the wire is given up on at the deadline", async () => {
  const net = deferredFetch();
  document.getElementById("c").textContent = "bytes nobody answers for";
  const inFlight = saveMod.savePage();
  await tick();

  await expect(saveMod.flushSave({ timeoutMs: 20 })).rejects.toMatchObject({
    state: "failed",
    message: "Save timed out."
  });

  // Clear the lane: the save that was on the wire still has to land.
  net.answer(0, okResponse({ msg: "Saved", etag: "E-late" }));
  await inFlight;
  expect(net.calls).toHaveLength(1);
});

test("keepalive rides a body that fits and is left off one that does not", async () => {
  global.fetch = jest.fn(async () => okResponse());

  document.getElementById("c").textContent = "x".repeat(10000);
  await expect(saveMod.flushSave({ keepalive: true })).resolves.toEqual({ state: "saved", etag: null });
  expect(global.fetch.mock.calls[0][1].keepalive).toBe(true);

  document.getElementById("c").textContent = "y".repeat(100000);
  await expect(saveMod.flushSave({ keepalive: true })).resolves.toEqual({ state: "saved", etag: null });
  expect(global.fetch.mock.calls[1][1].keepalive).toBeUndefined();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("work a save cannot write, with dirty bytes, is reported 'blocked' after they land", async () => {
  await settleBaseline();
  const handle = unsaved.registerUnsavedState({ id: "editor-model", isPending: () => true });
  try {
    global.fetch = jest.fn(async () => okResponse({ msg: "Saved", etag: "E1" }));
    document.getElementById("c").textContent = "an edit";

    await expect(saveMod.flushSave()).rejects.toMatchObject({ state: "blocked" });
    // The bytes went out once. The remaining work is the model's, not the page's, so
    // flush reports it instead of looping over saves that would change nothing.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally {
    handle.dispose();
  }
});

test("a drained pending save is waited out, not answered from a skipped request", async () => {
  await settleBaseline();
  const net = deferredFetch();
  document.getElementById("c").textContent = "A";
  const first = saveMod.savePage();
  await tick();
  expect(net.calls).toHaveLength(1);

  // A second save while the lane is busy: remembered as pending, to be drained when
  // the first response lands.
  document.getElementById("c").textContent = "B";
  const second = await saveMod.savePage();
  expect(second.msgType).toBe("skipped");

  let outcome = null;
  const flushed = saveMod.flushSave().then((value) => { outcome = value; }, () => { outcome = "rejected"; });
  await tick();
  expect(net.calls).toHaveLength(1);

  net.answer(0, okResponse({ msg: "Saved", etag: "E1" }));
  await first;
  await tick();
  // The drain put B on the wire, so flush's own request is answered 'skipped' and it
  // still has to wait for the request that carries the bytes.
  expect(net.calls).toHaveLength(2);
  expect(net.calls[1].options.body).toContain("B");
  expect(outcome).toBeNull();

  net.answer(1, okResponse({ msg: "Saved", etag: "E2" }));
  await flushed;
  // 'clean', not 'saved': the drained request carried these bytes, and flush's own was
  // the one that found the lane busy.
  expect(outcome).toEqual({ state: "clean", etag: "E2" });
  expect(net.calls).toHaveLength(2);
});

test("timeoutMs bounds the call, not just the wait for a save already in flight", async () => {
  await settleBaseline();
  // A host behind an open connection that never answers: flush's own request hangs.
  const net = deferredFetch();
  document.getElementById("c").textContent = "bytes nobody answers for";

  try {
    const started = Date.now();
    await expect(saveMod.flushSave({ timeoutMs: 200 })).rejects.toMatchObject({
      state: "failed",
      message: "Save timed out."
    });
    expect(Date.now() - started).toBeLessThan(1000);
  } finally {
    // `failed` means not confirmed, not "did not happen": release the request the
    // flush gave up on so the lane is not left busy for the rest of the file.
    net.answer(0, okResponse({ msg: "Saved", etag: "E-late" }));
    await tick();
  }
});

test("the keepalive cap counts UTF-8 bytes, not code units", async () => {
  await settleBaseline();
  global.fetch = jest.fn(async () => okResponse());

  // 25 000 CJK characters: 25 000 code units, 75 000 bytes. Chromium refuses a
  // keepalive body over 64 KiB, so the hint must stay off.
  document.getElementById("c").textContent = "\u6f22".repeat(25000);
  await expect(saveMod.flushSave({ keepalive: true })).resolves.toEqual({ state: "saved", etag: null });
  expect(global.fetch.mock.calls[0][1].keepalive).toBeUndefined();

  document.getElementById("c").textContent = "x".repeat(10000);
  await expect(saveMod.flushSave({ keepalive: true })).resolves.toEqual({ state: "saved", etag: null });
  expect(global.fetch.mock.calls[1][1].keepalive).toBe(true);
});

test("the keepalive hint belongs to one request and does not leak onto the next", async () => {
  await settleBaseline();
  global.fetch = jest.fn(async () => okResponse());

  document.getElementById("c").textContent = "the unload flush's bytes";
  await expect(saveMod.flushSave({ keepalive: true })).resolves.toEqual({ state: "saved", etag: null });
  expect(global.fetch.mock.calls[0][1].keepalive).toBe(true);

  document.getElementById("c").textContent = "an ordinary save, later";
  await saveMod.savePage();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls[1][1].keepalive).toBeUndefined();
});

test("a flush that finds the bytes clean clears the gate and announces clay:clean", async () => {
  await settleBaseline();
  const gate = await import("../../src/lib/dirty-gate.js");
  const clean = [];
  const onClean = () => clean.push("clean");
  document.addEventListener("clay:clean", onClean);
  try {
    const editor = document.getElementById("c");
    editor.textContent = "an edit";
    await tick();
    editor.textContent = "start";
    await tick();

    global.fetch = jest.fn();
    await expect(saveMod.flushSave()).resolves.toMatchObject({ state: "clean" });
    await tick();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(gate.pageMaybeDirty()).toBe(false);
    expect(clean).toEqual(["clean"]);
  } finally {
    document.removeEventListener("clay:clean", onClean);
  }
});

test("a refusal rejects with state 'conflict' and no follow-up request", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false, status: 412, statusText: "Precondition Failed",
    text: async () => JSON.stringify({ msg: "This document changed since you last loaded it.", code: "conflict" })
  }));
  document.getElementById("c").textContent = "mine, on a file somebody else moved";

  await expect(saveMod.flushSave()).rejects.toMatchObject({
    state: "conflict",
    message: "This document changed since you last loaded it."
  });
  // One request, so overwrite never ran: keeping this tab's version is a person's call.
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

// The refusal above is still holding this page: autosave is suspended until a save
// lands, and flush is deliberately not a way around a conflict.
test("a page left in conflict keeps answering 'conflict' without asking", async () => {
  global.fetch = jest.fn(async () => okResponse({ msg: "Saved", etag: "E-any" }));
  document.getElementById("c").textContent = "still mine";

  await expect(saveMod.flushSave()).rejects.toMatchObject({ state: "conflict" });
  expect(global.fetch).not.toHaveBeenCalled();
});
