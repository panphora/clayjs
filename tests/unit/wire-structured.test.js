import { jest } from "@jest/globals";

let wire;
let resetHostMeta;
let sockets;
let requests;

class ContractEventSource {
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

function installHost({ extensions = ["wire"] } = {}) {
  global.fetch = jest.fn(async (url, init = {}) => {
    if (String(url).includes("/_/meta")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ spec: 1, extensions, document: {} }),
      };
    }
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ delivered: 1 }) };
  });
}

function deliver(data) {
  sockets[0].onmessage({ data: JSON.stringify(data) });
}

const settle = () => jest.advanceTimersByTimeAsync(1);

beforeAll(async () => {
  sockets = [];
  requests = [];
  global.EventSource = ContractEventSource;
  window.EventSource = ContractEventSource;
  ({ wire } = await import("../../src/plugins/wire.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  sockets = [];
  requests = [];
  resetHostMeta();
  installHost();
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  jest.useRealTimers();
});

test("success maps progress and the exact result value", async () => {
  const statuses = [];
  const handle = wire.send({ query: "clay" }, {
    id: "contract-success",
    helper: "search",
    onStatus: (status) => statuses.push(status),
  });
  await settle();

  deliver({
    type: "wire/ack",
    id: handle.id,
    payload: { mode: "jsonl", budgetMs: 300000 },
  });
  deliver({
    type: "wire/status",
    id: handle.id,
    text: "Scanning",
    payload: { progress: { completed: 1, total: 2 } },
  });
  deliver({ type: "wire/done", id: handle.id, payload: { answer: 42 } });

  expect(statuses).toEqual([{ text: "Scanning", progress: { completed: 1, total: 2 } }]);
  await expect(handle.done).resolves.toMatchObject({
    state: "done",
    helper: "search",
    result: { answer: 42 },
    error: null,
  });
});

test("application errors retain their source, code and details", async () => {
  const handle = wire.send({}, { id: "contract-application-error", helper: "search" });
  await settle();
  deliver({
    type: "wire/error",
    id: handle.id,
    text: "Query is empty",
    payload: {
      source: "application",
      code: "invalid_request",
      details: { field: "query" },
    },
  });

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    error: "Query is empty",
    errorCode: "invalid_request",
    errorDetails: { field: "query" },
    errorSource: "application",
  });
});

test.each([
  ["crash after result", "helper_crashed"],
  ["malformed output", "helper_bad_output"],
  ["oversized output", "helper_result_too_large"],
])("%s is delivered as a host failure, never as success", async (_, code) => {
  const handle = wire.send({}, { id: `contract-${code}`, helper: "search" });
  await settle();
  deliver({
    type: "wire/error",
    id: handle.id,
    text: `host rejected ${code}`,
    payload: { source: "host", code, details: { field: "record" } },
  });

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    result: null,
    errorCode: code,
    errorDetails: { field: "record" },
    errorSource: "host",
  });
});

test("cancellation uses the existing cancel frame and suppresses a late result", async () => {
  const controller = new AbortController();
  const handle = wire.send({}, {
    id: "contract-cancellation",
    helper: "search",
    signal: controller.signal,
  });
  await settle();
  controller.abort();

  await expect(handle.done).resolves.toMatchObject({ state: "cancelled", result: null });
  expect(requests.at(-1)).toEqual({ type: "wire/cancel", id: handle.id });
  deliver({ type: "wire/done", id: handle.id, payload: { tooLate: true } });
  expect(wire.get(handle.id)).toMatchObject({ state: "cancelled", result: null });
});

test("a silent result after 120 seconds uses virtual time and still succeeds", async () => {
  const handle = wire.send({}, { id: "contract-silent", helper: "search" });
  await settle();
  deliver({
    type: "wire/ack",
    id: handle.id,
    payload: { mode: "jsonl", budgetMs: 300000 },
  });

  await jest.advanceTimersByTimeAsync(150000);
  expect(handle.state).toBe("acked");
  deliver({ type: "wire/done", id: handle.id, payload: { quiet: true } });

  await expect(handle.done).resolves.toMatchObject({
    state: "done",
    result: { quiet: true },
  });
});

test("an explicit null result is present and successful", async () => {
  const handle = wire.send({}, { id: "contract-null", helper: "search" });
  await settle();
  deliver({ type: "wire/done", id: handle.id, payload: null });

  await expect(handle.done).resolves.toMatchObject({
    state: "done",
    result: null,
    error: null,
  });
});

test("an editing request and a data request keep separate document lifecycles", async () => {
  const data = wire.send({}, { id: "contract-data", helper: "search" });
  const edit = wire.send({}, {
    id: "contract-edit",
    helper: "redpen",
    document: "edit",
  });
  await settle();

  expect(requests.filter(({ type }) => type === "wire/request").map(({ document }) => document).sort())
    .toEqual(["edit", "none"]);
  deliver({ type: "wire/done", id: data.id, payload: { matches: [] } });
  deliver({ type: "wire/done", id: edit.id, payload: { changed: true } });

  expect(data.state).toBe("done");
  expect(edit.state).toBe("landing");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk" } }));
  await expect(edit.done).resolves.toMatchObject({
    state: "done",
    result: { changed: true },
  });
});

test("an old page script on the updated runtime keeps the external raw handler contract", async () => {
  const handle = wire.send({ task: "edit" }, { id: "contract-old-page" });
  await settle();

  expect(requests).toEqual([{
    type: "wire/request",
    id: handle.id,
    payload: { task: "edit" },
  }]);
  deliver({ type: "wire/ack", id: handle.id });
  deliver({ type: "wire/status", id: handle.id, text: "editing" });
  deliver({ type: "wire/done", id: handle.id });

  expect(handle.state).toBe("landing");
  expect(wire.get(handle.id)).toMatchObject({ text: "editing", result: null });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk" } }));
  await expect(handle.done).resolves.toMatchObject({ state: "done", result: null });
});

test("a new helper page detects an old runtime before sending", () => {
  const oldRuntime = { send: jest.fn() };
  const sendFromHelperPage = (runtime) => {
    if (!runtime || typeof runtime.helpers !== "function") return "unsupported";
    runtime.send({}, { helper: "search" });
    return "sent";
  };

  expect(sendFromHelperPage(oldRuntime)).toBe("unsupported");
  expect(oldRuntime.send).not.toHaveBeenCalled();
  expect(typeof wire.helpers).toBe("function");
});

test("the new runtime refuses a named request when the old host lacks support", async () => {
  installHost({ extensions: [] });
  const handle = wire.send({}, { id: "contract-old-host", helper: "search" });
  await settle();

  await expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "helper_protocol_unsupported",
    errorSource: "client",
  });
  expect(requests).toEqual([]);
  expect(sockets).toEqual([]);
});
