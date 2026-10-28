import { jest } from "@jest/globals";

/**
 * clay.save.soon: a discrete change asks for one save 250 ms after the last call
 * and at most 1 s after the first, and every caller is resolved by that save's
 * result. Typing keeps autosave's own timing; this is the explicit ask.
 */

let save;
let noteHostWritable;

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const okResponse = (body = { msg: "Saved" }) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

const failResponse = () => ({
  ok: false,
  status: 500,
  statusText: "ERR",
  headers: { get: () => null },
  text: async () => JSON.stringify({ msg: "fail" }),
});

const edit = (text) => {
  document.getElementById("c").textContent = text;
};

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  global.fetch = jest.fn(async () => okResponse());
  save = await import("../../src/core/save.js");
  ({ noteHostWritable } = await import("../../src/core/is-edit-mode.js"));
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await new Promise((r) => setTimeout(r, 50));
});

beforeEach(async () => {
  global.fetch = jest.fn(async () => okResponse());
  edit(`clean-${Date.now()}-${Math.random()}`);
  await save.savePage();
  await new Promise((r) => setTimeout(r, 0));
  global.fetch.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  noteHostWritable(null);
  jest.useRealTimers();
});

test("three calls inside 250 ms make one save and all three resolve with its result", async () => {
  edit("three-calls");

  const first = save.savePageSoon();
  const second = save.savePageSoon();
  const third = save.savePageSoon();

  jest.advanceTimersByTime(249);
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  const results = await Promise.all([first, second, third]);
  for (const result of results) expect(result).toBe(results[0]);
  expect(results[0]).toMatchObject({ ok: true, msg: "Saved" });
});

test("calls every 200 ms still save by 1 s", async () => {
  edit("steady-calls");

  const calls = [save.savePageSoon()];
  for (let i = 0; i < 4; i++) {
    jest.advanceTimersByTime(200);
    calls.push(save.savePageSoon());
  }

  jest.advanceTimersByTime(199);
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  const results = await Promise.all(calls);
  for (const result of results) expect(result).toBe(results[0]);
  expect(results[0]).toMatchObject({ ok: true, msg: "Saved" });
});

test("a call during an in-flight save rides savePage's existing queue", async () => {
  const requests = [];
  global.fetch = jest.fn((url, options = {}) => new Promise((resolve) => {
    requests.push({ body: String(options.body ?? ""), resolve });
  }));

  edit("first-edit");
  const first = save.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);

  edit("second-edit");
  let secondResult;
  const second = save.savePageSoon().then((result) => {
    secondResult = result;
    return result;
  });
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);
  expect(secondResult).toBe(undefined);

  requests[0].resolve(okResponse());
  await flush();
  await expect(first).resolves.toMatchObject({ ok: true, msg: "Saved" });
  expect(secondResult).toBe(undefined);

  await flush();
  expect(requests.length).toBe(2);
  expect(requests[1].body).toContain("second-edit");
  requests[1].resolve(okResponse());
  await flush();
  await expect(second).resolves.toMatchObject({ ok: true, msg: "Saved" });
});

test("a queued caller receives the queued write's failure", async () => {
  const requests = [];
  global.fetch = jest.fn((url, options = {}) => new Promise((resolve) => {
    requests.push({ body: String(options.body ?? ""), resolve });
  }));

  edit("first-edit");
  const first = save.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);

  edit("second-edit");
  const second = save.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);

  requests[0].resolve(okResponse());
  await flush();
  await expect(first).resolves.toMatchObject({ ok: true, msg: "Saved" });
  await flush();
  expect(requests.length).toBe(2);
  expect(requests[1].body).toContain("second-edit");

  requests[1].resolve(failResponse());
  await flush();
  await expect(second).resolves.toMatchObject({ ok: false, msgType: "error" });
});

test("a suspended autosave holds the soon timer until it resumes", async () => {
  edit("held-edit");
  const result = save.savePageSoon();
  save.suspendAutosave();

  jest.advanceTimersByTime(250);
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();

  jest.advanceTimersByTime(2000);
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();

  save.resumeAutosave();
  jest.advanceTimersByTime(0);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await expect(result).resolves.toMatchObject({ ok: true, msg: "Saved" });
});

test("a failed save settles every waiter with the failure", async () => {
  global.fetch = jest.fn(async () => failResponse());
  edit("doomed");

  const first = save.savePageSoon();
  const second = save.savePageSoon();
  const third = save.savePageSoon();

  jest.advanceTimersByTime(250);
  await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  const results = await Promise.all([first, second, third]);
  for (const result of results) {
    expect(result).toBe(results[0]);
    expect(result.ok).toBe(false);
    expect(result.msgType).toBe("error");
  }
});

test("in view mode it resolves with the skipped result", async () => {
  jest.resetModules();
  window.clayEditMode = false;
  const viewSave = await import("../../src/core/save.js");
  global.fetch = jest.fn();

  const result = viewSave.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();

  await expect(result).resolves.toMatchObject({ msgType: "skipped", msg: "Not in edit mode" });
  expect(global.fetch).not.toHaveBeenCalled();

  window.clayEditMode = true;
  jest.resetModules();
});

// Round 12 D1: a soon() caller whose timer fires while a save is on the wire queues
// behind that save. When the host answers that it is not writable, the drained save
// is refused before it is captured, and the refusal is those callers' answer: no
// later save is coming to take them.
test("a queued caller hears the host's refusal of the drained save (r12 sn3m)", async () => {
  const requests = [];
  global.fetch = jest.fn((url, options = {}) => new Promise((resolve) => {
    requests.push({ body: String(options.body ?? ""), resolve });
  }));

  edit("refused-edit");
  const first = save.savePage();
  await flush();
  expect(requests.length).toBe(1);

  const queued = save.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);

  noteHostWritable(false);
  requests[0].resolve(okResponse());
  await flush();
  await expect(first).resolves.toMatchObject({ ok: true, msg: "Saved" });

  await expect(queued).resolves.toMatchObject({ ok: false, code: "forbidden", msgType: "forbidden" });
  expect(requests.length).toBe(1);
});

test("a queued caller without a refusal rides the drained save carrying the edit (r12 sn3m control)", async () => {
  const requests = [];
  global.fetch = jest.fn((url, options = {}) => new Promise((resolve) => {
    requests.push({ body: String(options.body ?? ""), resolve });
  }));

  edit("first-edit");
  const first = save.savePage();
  await flush();
  expect(requests.length).toBe(1);

  edit("carried-edit");
  const queued = save.savePageSoon();
  jest.advanceTimersByTime(250);
  await flush();
  expect(requests.length).toBe(1);

  requests[0].resolve(okResponse());
  await flush();
  await expect(first).resolves.toMatchObject({ ok: true, msg: "Saved" });
  await flush();

  expect(requests.length).toBe(2);
  expect(requests[1].body).toContain("carried-edit");
  requests[1].resolve(okResponse());
  await flush();
  await expect(queued).resolves.toMatchObject({ ok: true, msg: "Saved" });
});
