import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveModules } from "../../src/loader-logic.js";

/**
 * clay.wire in view mode, which is the mode that matters most: a review page is
 * read-only for everyone but its owner, and the wire has to work there. jsdom
 * has no save token and no admin cookie, so the module under test takes the
 * view-mode path with no setup at all, and the save protection (edit-mode only)
 * is exercised in wire-save-protection.test.js instead.
 *
 * jsdom ships no EventSource either; the fake must be installed before the
 * import, even though this module opens nothing until the first send.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let wire;
let sockets;
let order;

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    sockets.push(this);
    order.push("subscribe");
    // A real microtask, never queueMicrotask: fake timers replace that one, and
    // the open would then depend on the clock a test is trying to control.
    Promise.resolve().then(() => this.onopen && this.onopen());
  }
  close() {
    this.closed = true;
  }
}

function reply(body, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn(async () => {
    order.push("post");
    return { ok, status, json: async () => body };
  });
}

function frame(socket, data) {
  socket.onmessage({ data: JSON.stringify(data) });
}

function applied(source, seq) {
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq, source } }));
}

// One tick drains the whole dispatch chain: every step between send() and the
// POST is a microtask, and advancing the fake clock flushes them to exhaustion.
const settle = () => jest.advanceTimersByTimeAsync(1);

beforeAll(async () => {
  sockets = [];
  order = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ wire } = await import("../../src/plugins/wire.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  sockets = [];
  order = [];
  reply({ delivered: 1 });
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  jest.useRealTimers();
});

test("nothing connects until something is sent", () => {
  expect(sockets).toHaveLength(0);
  expect(wire.isBusy()).toBe(false);
});

test("a send subscribes before it posts, and the frame carries what the handler needs", async () => {
  const handle = wire.send({ area: "intro" }, { id: "r1", text: "tighten this" });
  expect(handle.state).toBe("sent");
  await settle();

  // Subscribe first: a handler can acknowledge in single-digit milliseconds and
  // a fresh subscription replays nothing, so posting first loses the ack.
  expect(order).toEqual(["subscribe", "post"]);
  expect(sockets).toHaveLength(1);

  const url = new URL(sockets[0].url);
  expect(url.pathname).toBe("/_/wire/subscribe");
  expect(url.searchParams.get("page-url")).toBe(window.location.href);
  // A page never names a file and never asks for the handler role.
  expect(url.searchParams.get("file")).toBeNull();
  expect(url.searchParams.get("role")).toBeNull();

  const [target, init] = global.fetch.mock.calls[0];
  expect(target).toBe("http://localhost/_/wire/send");
  expect(init.method).toBe("POST");
  expect(init.headers["Page-URL"]).toBe(window.location.href);
  expect(JSON.parse(init.body)).toEqual({
    type: "wire/request",
    id: "r1",
    text: "tighten this",
    payload: { area: "intro" },
  });
});

test("ack, status and done walk a request to done once the change lands", async () => {
  const seen = [];
  const off = wire.on((snap) => seen.push(snap.state));

  const handle = wire.send({}, { id: "r2" });
  await settle();

  frame(sockets[0], { type: "wire/ack", id: "r2" });
  expect(handle.state).toBe("acked");

  frame(sockets[0], { type: "wire/status", id: "r2", text: "editing section 3" });
  expect(wire.get("r2").text).toBe("editing section 3");

  // done means the handler finished writing the FILE, not that this page has
  // rendered it, so the request waits in landing for the disk frame.
  frame(sockets[0], { type: "wire/done", id: "r2" });
  expect(handle.state).toBe("landing");
  expect(sockets[0].closed).toBe(true);

  applied("disk", 9);
  expect(handle.state).toBe("done");
  await expect(handle.done).resolves.toMatchObject({ id: "r2", state: "done", error: null });

  expect(seen).toEqual(["sent", "acked", "acked", "landing", "done"]);
  off();
});

test("a landing that no sync frame ever reports still ends as done", async () => {
  const handle = wire.send({}, { id: "r3" });
  await settle();
  frame(sockets[0], { type: "wire/done", id: "r3" });
  expect(handle.state).toBe("landing");

  // No sync plugin on this page, or a frame that morphed nothing: reporting
  // done late is right, reporting a working agent as failed is not.
  await jest.advanceTimersByTimeAsync(4000);
  expect(handle.state).toBe("done");
});

test("a request nobody took fails at once instead of spinning", async () => {
  reply({ delivered: 0 });
  const handle = wire.send({}, { id: "r4" });
  await settle();

  expect(handle.state).toBe("error");
  await expect(handle.done).resolves.toMatchObject({
    error: "no agent is attached to this file",
  });
});

test("a refused post carries its status into the record", async () => {
  reply(null, { ok: false, status: 429 });
  const handle = wire.send({}, { id: "r5" });
  await settle();

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "the wire refused this request (429)",
  });
});

test("a handler that picks a request up and vanishes times out", async () => {
  const handle = wire.send({}, { id: "r6" });
  await settle();
  await jest.advanceTimersByTimeAsync(15000);

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "the agent never answered",
  });
});

test("a frame for an id this page did not issue is ignored", async () => {
  const handle = wire.send({}, { id: "r7" });
  await settle();

  frame(sockets[0], { type: "wire/done", id: "someone-elses-request" });
  sockets[0].onmessage({ data: "{not json" });

  expect(handle.state).toBe("sent");
  expect(wire.get("someone-elses-request")).toBeUndefined();
});

test("cancel ends the request, tells the handler, and ignores late frames", async () => {
  const handle = wire.send({}, { id: "r8" });
  await settle();

  expect(wire.cancel("r8")).toBe(true);
  expect(handle.state).toBe("cancelled");
  expect(JSON.parse(global.fetch.mock.calls.at(-1)[1].body)).toEqual({
    type: "wire/cancel",
    id: "r8",
  });

  // Cancel means stop completely: a late terminal frame must not reopen a
  // lifecycle the user ended.
  frame(sockets[0], { type: "wire/done", id: "r8" });
  expect(handle.state).toBe("cancelled");
  expect(wire.cancel("r8")).toBe(false);
});

test("the stream closes only after the last open request ends", async () => {
  wire.send({}, { id: "r9" });
  wire.send({}, { id: "r10" });
  await settle();

  expect(sockets).toHaveLength(1);
  expect(wire.isBusy()).toBe(true);

  wire.cancel("r9");
  expect(sockets[0].closed).toBe(false);
  wire.cancel("r10");
  expect(sockets[0].closed).toBe(true);
  expect(wire.isBusy()).toBe(false);
});

// --- loader registration ---------------------------------------------------

test("the loader can load the wire plugin in view mode", () => {
  const plan = resolveModules(new URLSearchParams("plugins=wire"), false);
  expect(plan.plugins).toContain("plugins/wire.js");
});

test("the wire plugin is opt-in, in either mode", () => {
  expect(resolveModules(new URLSearchParams(""), true).plugins).not.toContain("plugins/wire.js");
  expect(resolveModules(new URLSearchParams(""), false).plugins).not.toContain("plugins/wire.js");
});

// The loader attaches each plugin's public member by hand. Without this branch
// the module loads and evaluates, and clay.wire is simply absent.
test("attachPluginMember publishes the plugin on clay.wire", () => {
  const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
  const branch = source.match(/\} else if \(path === "plugins\/wire\.js"\) \{[\s\S]*?\n {2}\}/);
  expect(branch).not.toBeNull();
  expect(branch[0]).toMatch(/^ {4}clay\.wire = mod\.wire \|\| mod\.default;$/m);
});

// --- the deadline ----------------------------------------------------------

// The page subscribes before it posts precisely so a fast handler's ack is not
// missed, which makes an ack arriving mid-POST the ordinary case rather than a
// race. Installing the ack timer after the POST resolved failed those requests
// 15 seconds later, while the agent was still working.
test("an ack that arrives before the POST resolves is not undone by it", async () => {
  let resolvePost;
  global.fetch = jest.fn(() => new Promise((r) => { resolvePost = r; }));

  const handle = wire.send({}, { id: "r11" });
  await settle();

  frame(sockets[0], { type: "wire/ack", id: "r11" });
  expect(handle.state).toBe("acked");

  resolvePost({ ok: true, status: 200, json: async () => ({ delivered: 1 }) });
  await settle();

  await jest.advanceTimersByTimeAsync(20000);
  expect(handle.state).toBe("acked");
});

// Nothing else can end a request: the wire sends no frame when a handler's
// subscription drops. Without a deadline that survives the ack, a killed agent
// left the request open, its promise unresolved, and saving suspended for the
// rest of the session.
test("a handler that acks and then dies is failed rather than left open", async () => {
  const handle = wire.send({}, { id: "r12" });
  await settle();
  frame(sockets[0], { type: "wire/ack", id: "r12" });

  await jest.advanceTimersByTimeAsync(120000);

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "the agent stopped responding",
  });
  expect(sockets[0].closed).toBe(true);
  expect(wire.isBusy()).toBe(false);
});

test("a status frame keeps a working agent's request alive", async () => {
  const handle = wire.send({}, { id: "r13" });
  await settle();
  frame(sockets[0], { type: "wire/ack", id: "r13" });

  for (let i = 0; i < 5; i++) {
    await jest.advanceTimersByTimeAsync(100000);
    frame(sockets[0], { type: "wire/status", id: "r13", text: `still working ${i}` });
  }

  expect(handle.state).toBe("acked");
  expect(wire.get("r13").text).toBe("still working 4");
});

// --- landing correlation ---------------------------------------------------

test("a peer tab's morph does not report an agent's write as landed", async () => {
  const handle = wire.send({}, { id: "r14" });
  await settle();
  frame(sockets[0], { type: "wire/done", id: "r14" });
  expect(handle.state).toBe("landing");

  applied("peer", 3);
  expect(handle.state).toBe("landing");

  applied("disk", 4);
  expect(handle.state).toBe("done");
});

test("one disk frame settles one landing request, not every one", async () => {
  const a = wire.send({}, { id: "r15" });
  const b = wire.send({}, { id: "r16" });
  await settle();
  frame(sockets[0], { type: "wire/done", id: "r15" });
  frame(sockets[0], { type: "wire/done", id: "r16" });

  applied("disk", 5);
  expect(a.state).toBe("done");
  expect(b.state).toBe("landing");

  // Whatever is still waiting ends on its own next frame or its timer.
  await jest.advanceTimersByTimeAsync(4000);
  expect(b.state).toBe("done");
});

// --- request identity ------------------------------------------------------

test("a reused id is refused instead of hijacking the request that holds it", async () => {
  const first = wire.send({}, { id: "r17" });
  await settle();

  const second = wire.send({}, { id: "r17" });
  await expect(second.done).resolves.toMatchObject({
    state: "error",
    error: "a request with this id is already on the wire",
  });
  expect(second.cancel()).toBe(false);
  expect(first.state).toBe("sent");
  expect(wire.list().filter((rec) => rec.id === "r17")).toHaveLength(1);
});
