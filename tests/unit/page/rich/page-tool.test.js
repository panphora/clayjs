import { createToolClient, capabilityAdvertised } from "../../../../src/page/rich/page-tool.js";

const artifact = { title: "Tool", html: "<b>x</b>", css: "", javascript: "function mount() {}", fallbackHtml: "<b>x</b>", summary: "" };
const context = { title: "Page", outline: ["Heading"], tables: [] };
function setup() {
  let n = 0;
  const pending = new Map(), calls = [], cancelled = [];
  const transport = {
    request(value) { calls.push(value); return new Promise((resolve) => pending.set(value.requestId, resolve)); },
    cancel(id) { cancelled.push(id); },
  };
  const client = createToolClient({ transport, newId: () => `request-${++n}` });
  const deliver = async (id, value) => { await Promise.resolve(); pending.get(id)(value); await Promise.resolve(); };
  return { client, calls, cancelled, deliver };
}

test("request has a stable id and one pending candidate; a new request discards the old", async () => {
  const { client, calls, cancelled, deliver } = setup();
  const first = client.request("first", context);
  await Promise.resolve();
  const second = client.request("second", context, { toolId: "t", rev: "r1" });
  await Promise.resolve();
  expect(calls[0]).toEqual({ protocol: "page-tool/1", requestId: first.requestId, prompt: "first", context, target: null });
  expect(calls[1].target).toEqual({ toolId: "t", rev: "r1" });
  expect(cancelled).toEqual([first.requestId]);
  await expect(client.wait(first)).rejects.toMatchObject({ code: "discarded" });
  await deliver(second.requestId, { requestId: second.requestId, artifact, state: {} });
  await expect(client.wait(second)).resolves.toEqual({ requestId: second.requestId, artifact, state: {} });
});

test("discard ignores a late result and cancels once", async () => {
  const { client, cancelled, deliver } = setup();
  const candidate = client.request("build", context);
  await Promise.resolve();
  client.discard(candidate); client.discard(candidate);
  await deliver(candidate.requestId, { requestId: candidate.requestId, artifact, state: {} });
  expect(cancelled).toEqual([candidate.requestId]);
  await expect(client.wait(candidate)).rejects.toMatchObject({ code: "discarded" });
});

test("aborting a wait does not cancel the job, and a later wait gets its result", async () => {
  const { client, cancelled, deliver } = setup();
  const candidate = client.request("build", context);
  const controller = new AbortController();
  const waiting = client.wait(candidate, { signal: controller.signal });
  controller.abort();
  await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toEqual([]);
  await deliver(candidate.requestId, { requestId: candidate.requestId, artifact, state: {} });
  await expect(client.wait(candidate)).resolves.toMatchObject({ requestId: candidate.requestId });
});

test("invalid result becomes a failure and duplicate completion cannot replace it", async () => {
  const { client, deliver } = setup();
  const candidate = client.request("build", context);
  await deliver(candidate.requestId, { requestId: candidate.requestId, artifact: { ...artifact, extra: "bad" }, state: {} });
  await deliver(candidate.requestId, { requestId: candidate.requestId, artifact, state: {} });
  await expect(client.wait(candidate)).rejects.toMatchObject({ code: "invalid-artifact" });
});

test("context drops trailing table rows before outline entries to fit 16 KB", async () => {
  const { client, calls } = setup();
  client.request("build", { title: "Page", outline: ["A", "B"], tables: [{ id: "t", rows: [{ big: "x".repeat(17000) }, { small: "last" }] }] });
  await Promise.resolve();
  const sent = calls[0].context;
  expect(sent.tables[0].rows).toEqual([]);
  expect(sent.outline).toEqual(["A", "B"]);
  expect(new TextEncoder().encode(JSON.stringify(sent)).length).toBeLessThanOrEqual(16384);
});

test("capability requires the exact extension", () => {
  expect(capabilityAdvertised({ extensions: ["page-tool/1"] })).toBe(true);
  expect(capabilityAdvertised({ extensions: ["page-tool/2"] })).toBe(false);
  expect(capabilityAdvertised({})).toBe(false);
});

test("a reply with neither an artifact nor a failure code is a failure", async () => {
  const client = createToolClient({ transport: { request: async (req) => ({ requestId: req.requestId }), cancel() {} }, newId: () => "only" });
  const candidate = client.request("make it", { title: "t", outline: [], tables: [] });
  await expect(client.wait(candidate)).rejects.toMatchObject({ code: "invalid-result" });
});
