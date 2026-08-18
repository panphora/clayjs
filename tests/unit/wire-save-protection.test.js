import { jest } from "@jest/globals";

/**
 * The edit-mode half of clay.wire: what it does to the save lane around a
 * request. These run against the real save modules, not mocks of them, because
 * every defect this file exists to pin was a wrong assumption about that lane.
 *
 * Two outbound problems, neither of which the scoped live-sync merge touches
 * because that fixes the return path only.
 *
 *   - Save before send, because autosave is debounced: a request sent inside
 *     that window hands the agent a file without the paragraph the user just
 *     typed and is asking about. A save that could not deliver that ends the
 *     request instead of sending it.
 *   - Suspend autosave while the request is in flight, because the save is
 *     last-writer-wins with a backup. An autosave landing inside the watcher's
 *     quiet window makes the server back the agent's bytes up and write the
 *     browser's, and the agent's work ends up existing only in Backups while the
 *     page reports success.
 *
 * window.clayEditMode must be set before the import: is-edit-mode resolves once,
 * at evaluation.
 */

let wire;
let save;
let saveCore;
let sockets;

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    sockets.push(this);
    Promise.resolve().then(() => this.onopen && this.onopen());
  }
  close() {
    this.closed = true;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// The real save posts to /_/save and the wire to /_/wire/send, so one router
// answers both and records the order they went out in.
let calls;
function routeFetch({ saveReply } = {}) {
  global.fetch = jest.fn((url) => {
    const target = String(url);
    if (target.includes("/_/wire/send")) {
      calls.push("wire");
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ delivered: 1 }) });
    }
    calls.push("save");
    if (saveReply) return saveReply();
    return Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ msg: "Saved" }),
    });
  });
}

beforeAll(async () => {
  window.clayEditMode = true;
  sockets = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;

  ({ wire } = await import("../../src/plugins/wire.js"));
  save = await import("../../src/core/save.js");
  saveCore = await import("../../src/core/save-core.js");
});

beforeEach(async () => {
  sockets = [];
  calls = [];
  routeFetch();
  document.body.innerHTML = "<main><p>one</p></main>";
  await Promise.resolve();
  window.clay = { save: save.savePage };
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  delete window.clay;
});

function dirty(text) {
  document.querySelector("main p").textContent = text;
}

test("the page reaches disk before the request goes out", async () => {
  dirty("edit for the flush-order test");

  wire.send({}, { id: "s1" });
  await settle();

  expect(calls).toEqual(["save", "wire"]);
});

test("a save that failed ends the request instead of sending it", async () => {
  dirty("edit for the failed-save test");
  routeFetch({
    saveReply: () =>
      Promise.resolve({ ok: false, status: 500, statusText: "boom", text: async () => "" }),
  });

  const handle = wire.send({}, { id: "s2" });
  await settle();

  // Posting anyway would hand the agent a file without the text it was asked
  // about, silently. An error the UI can show is the better outcome.
  expect(calls).toEqual(["save"]);
  await expect(handle.done).resolves.toMatchObject({ state: "error" });
  expect((await handle.done).error).toMatch(/could not save this page first/);
});

test("the flush waits for a save that is already on the wire", async () => {
  // isSaveInProgress is read from the module. It used to be read off
  // clay.internals, an opt-in satellite that no page the loader builds ever
  // loads, so this wait never happened at all.
  let releaseSave;
  routeFetch({ saveReply: () => new Promise((resolve) => { releaseSave = resolve; }) });

  dirty("edit for the busy-lane test");
  save.savePage();
  await settle();
  expect(saveCore.isSaveInProgress()).toBe(true);

  wire.send({}, { id: "s3" });
  await settle();
  expect(calls).toEqual(["save"]); // nothing posted while the save is in flight

  routeFetch(); // the flush's own save answers normally
  releaseSave({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved" }) });
  await settle();
  await settle();

  expect(calls).toContain("wire");
});

test("autosave is suspended while a request is in flight, and replayed after it", async () => {
  dirty("edit for the suspension test");
  wire.send({}, { id: "s4" });
  await settle();
  expect(calls).toEqual(["save", "wire"]);

  // The user keeps working while the agent has the file. Every autosave path
  // lands in savePageThrottled: the mutation-driven one, the [persist] input
  // timer, and live-sync's convergence save.
  dirty("second edit for the suspension test, typed while the agent was writing");
  const result = await save.savePageThrottled();
  expect(result.msgType).toBe("skipped");
  expect(calls).toEqual(["save", "wire"]);

  // Released, and the save that was skipped is not simply lost: without the
  // replay the user's edit would sit unsaved until something else mutated the
  // page.
  wire.cancel("s4");
  await settle();
  expect(calls.filter((c) => c === "save")).toHaveLength(2);
});

test("two overlapping requests hold the suspension until the last one ends", async () => {
  wire.send({}, { id: "s5" });
  wire.send({}, { id: "s6" });
  await settle();

  wire.cancel("s5");
  dirty("edit for the overlap test");
  expect((await save.savePageThrottled()).msgType).toBe("skipped");

  wire.cancel("s6");
  await settle();
  dirty("released edit for the overlap test");
  expect((await save.savePageThrottled()).ok).toBe(true);
});

// The hold used to be claimed before its lazy import resolved, so a cancel in
// that window released a hold that had not been taken and the import then
// suspended a lane nothing would ever resume: the page stopped autosaving for
// the rest of the session.
test("a cancel before the lazy import resolves leaves nothing suspended", async () => {
  const handle = wire.send({}, { id: "s7" });
  handle.cancel();
  await settle();
  await settle();

  dirty("edit after the cancelled request");
  expect((await save.savePageThrottled()).ok).toBe(true);
  // And it opened no stream on its way out.
  expect(sockets.filter((s) => !s.closed)).toHaveLength(0);
});
