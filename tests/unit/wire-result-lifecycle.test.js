import { jest } from "@jest/globals";

let wire;
let resetHostMeta;
let sockets;
let requests;

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

function host({ extensions = ["wire"], helpers = [] } = {}) {
  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/meta")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          spec: 1,
          extensions,
          document: { helpers },
        }),
      };
    }
    const body = JSON.parse(init.body);
    requests.push(body);
    return { ok: true, status: 200, json: async () => ({ delivered: 1 }) };
  });
}

function frame(data) {
  sockets[0].onmessage({ data: JSON.stringify(data) });
}

const settle = () => jest.advanceTimersByTimeAsync(1);

beforeAll(async () => {
  sockets = [];
  requests = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ wire } = await import("../../src/plugins/wire.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  sockets = [];
  requests = [];
  resetHostMeta();
  host();
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  jest.useRealTimers();
});

test("a named request selects data coordination before dispatch", async () => {
  wire.send({ query: "clay" }, { id: "structured-body", helper: "search" });
  await settle();

  expect(requests).toEqual([{
    type: "wire/request",
    id: "structured-body",
    payload: { query: "clay" },
    helper: "search",
    document: "none",
  }]);
});

test("a structured result is the done payload and does not wait for a document landing", async () => {
  const handle = wire.send({}, { id: "structured-result", helper: "search" });
  await settle();
  frame({
    type: "wire/ack",
    id: handle.id,
    payload: { mode: "jsonl", budgetMs: 300000 },
  });
  frame({ type: "wire/done", id: handle.id, payload: { matches: ["one"] } });

  await expect(handle.done).resolves.toMatchObject({
    state: "done",
    helper: "search",
    result: { matches: ["one"] },
    error: null,
  });
});

test("a silent structured helper can answer after the raw inactivity deadline", async () => {
  const handle = wire.send({}, { id: "structured-silent", helper: "search" });
  await settle();
  frame({
    type: "wire/ack",
    id: handle.id,
    payload: { mode: "jsonl", budgetMs: 300000 },
  });

  await jest.advanceTimersByTimeAsync(150000);
  expect(handle.state).toBe("acked");

  frame({ type: "wire/done", id: handle.id, payload: null });
  await expect(handle.done).resolves.toMatchObject({ state: "done", result: null });
});

test("structured progress does not extend the accepted host budget", async () => {
  const handle = wire.send({}, { id: "structured-budget", helper: "search" });
  await settle();
  frame({
    type: "wire/ack",
    id: handle.id,
    payload: { mode: "jsonl", budgetMs: 300000 },
  });

  await jest.advanceTimersByTimeAsync(250000);
  frame({ type: "wire/status", id: handle.id, text: "still working" });
  await jest.advanceTimersByTimeAsync(65000);

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "helper_timeout",
    errorSource: "client",
  });
  expect(requests.at(-1)).toEqual({ type: "wire/cancel", id: handle.id });
});

test("raw acknowledgement and status frames retain the 120 second inactivity deadline", async () => {
  const handle = wire.send({}, { id: "raw-timeout" });
  await settle();
  frame({ type: "wire/ack", id: handle.id });
  await jest.advanceTimersByTimeAsync(60000);
  frame({ type: "wire/status", id: handle.id, text: "editing" });
  await jest.advanceTimersByTimeAsync(119999);
  expect(handle.state).toBe("acked");
  await jest.advanceTimersByTimeAsync(1);

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "the agent stopped responding",
  });
  expect(requests).not.toContainEqual({ type: "wire/cancel", id: handle.id });
});

test("onStatus receives progress and isolates listener failures", async () => {
  const reported = [];
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const first = wire.send({}, {
    id: "structured-status",
    helper: "search",
    onStatus: (status) => reported.push(status),
  });
  await settle();
  frame({
    type: "wire/status",
    id: first.id,
    text: "Scanning",
    payload: { progress: { completed: 4, total: 10, unit: "files" } },
  });

  const second = wire.send({}, {
    id: "structured-status-throws",
    helper: "search",
    onStatus: () => { throw new Error("page callback failed"); },
  });
  await settle();
  frame({ type: "wire/status", id: second.id, text: "Working" });

  expect(reported).toEqual([{
    text: "Scanning",
    progress: { completed: 4, total: 10, unit: "files" },
  }]);
  expect(second.state).toBe("acked");
  expect(error).toHaveBeenCalledWith(
    "clay.wire: an onStatus listener threw",
    expect.any(Error)
  );
  error.mockRestore();
});

test("structured application and host errors keep their source and details", async () => {
  const application = wire.send({}, { id: "application-error", helper: "search" });
  await settle();
  frame({
    type: "wire/error",
    id: application.id,
    text: "Query is empty",
    payload: { source: "application", code: "invalid_request", details: { field: "query" } },
  });
  await expect(application.done).resolves.toMatchObject({
    state: "error",
    error: "Query is empty",
    errorCode: "invalid_request",
    errorDetails: { field: "query" },
    errorSource: "application",
  });

  const cancelled = wire.send({}, { id: "host-cancelled", helper: "search" });
  await settle();
  frame({
    type: "wire/error",
    id: cancelled.id,
    text: "Permission was revoked",
    payload: { source: "host", code: "helper_cancelled" },
  });
  await expect(cancelled.done).resolves.toMatchObject({
    state: "cancelled",
    errorCode: "helper_cancelled",
    errorSource: "host",
  });
});

test("legacy error text stays unclassified even when it says cancelled", async () => {
  const handle = wire.send({}, { id: "legacy-error" });
  await settle();
  frame({ type: "wire/error", id: handle.id, text: "the helper was cancelled upstream" });

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "the helper was cancelled upstream",
    errorCode: null,
    errorSource: null,
  });
});

test("an AbortSignal uses the existing cancellation lifecycle", async () => {
  const controller = new AbortController();
  const handle = wire.send({}, {
    id: "signal-cancel",
    helper: "search",
    signal: controller.signal,
  });
  await settle();
  controller.abort();

  await expect(handle.done).resolves.toMatchObject({ state: "cancelled" });
  expect(requests.at(-1)).toEqual({ type: "wire/cancel", id: handle.id });
  frame({ type: "wire/done", id: handle.id, payload: "late" });
  expect(handle.state).toBe("cancelled");
});

test("a named request is refused before dispatch when discovery lacks wire support", async () => {
  host({ extensions: [] });
  const handle = wire.send({}, { id: "old-host", helper: "search" });
  await settle();

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "helper_protocol_unsupported",
    errorSource: "client",
  });
  expect(requests).toEqual([]);
  expect(sockets).toEqual([]);
});

test("a named request that misses acknowledgement is cancelled before settling", async () => {
  const handle = wire.send({}, { id: "missing-ack", helper: "search" });
  await settle();
  await jest.advanceTimersByTimeAsync(15000);

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "ack_timeout",
    errorSource: "client",
  });
  expect(requests.at(-1)).toEqual({ type: "wire/cancel", id: handle.id });
});

test("helpers reports declared ready, denied and unavailable states", async () => {
  host({
    helpers: [
      { name: "search", state: "ready" },
      { name: "ocr", state: "denied" },
      { name: "missing", state: "unavailable" },
    ],
  });

  await expect(wire.helpers()).resolves.toEqual([
    { name: "search", state: "ready" },
    { name: "ocr", state: "denied" },
    { name: "missing", state: "unavailable" },
  ]);
});

test("invalid coordination is rejected before discovery or dispatch", async () => {
  const handle = wire.send({}, {
    id: "invalid-document",
    helper: "search",
    document: "sometimes",
  });

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "invalid_document",
    errorSource: "client",
  });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(sockets).toEqual([]);
});
