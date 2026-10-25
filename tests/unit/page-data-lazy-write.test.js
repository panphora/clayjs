import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { createPageDataApi } from "../../src/core/page-data.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function response({ status = 200, etag = '"E1"', data = { title: "Hello" }, error } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Request failed",
    headers: { get: (name) => name.toLowerCase() === "etag" ? etag : null },
    json: async () => error || data,
  };
}

function state(overrides = {}) {
  return {
    dirty: false,
    saveInProgress: false,
    saveUnknown: false,
    conflicted: false,
    externalHold: false,
    held: 0,
    released: 0,
    etag: '"E1"',
    ...overrides,
  };
}

function writeModules(page, overrides = {}) {
  return {
    isEditMode: true,
    baselineSettled: () => true,
    isSaveInProgress: () => page.saveInProgress,
    saveFateIsUnknown: () => page.saveUnknown,
    savesHeld: () => page.externalHold || page.held > 0,
    isSaveConflicted: () => page.conflicted,
    hasUnsavedChanges: () => page.dirty,
    lastSeenEtag: () => page.etag,
    seedEtag: async () => page.etag,
    holdAllSaves: (reason) => {
      page.held++;
      page.holdReason = reason;
    },
    releaseAllSaves: ({ reason }) => {
      page.held--;
      page.released++;
      page.releaseReason = reason;
    },
    ...overrides,
  };
}

function harness(options = {}) {
  const page = options.state || state();
  const modules = options.modules || writeModules(page);
  const fetchImpl = options.fetchImpl || jest.fn(async () => response());
  const loadWriteModules = options.loadWriteModules || jest.fn(async () => modules);
  const api = createPageDataApi({
    supports: options.supports || (async () => true),
    token: options.token || (() => null),
    fetchImpl,
    getLocation: options.getLocation || (() => ({
      origin: "https://example.test",
      pathname: "/nested/my%20page.htmlclay",
    })),
    eventTarget: document,
    loadWriteModules,
    syncTimeoutMs: options.syncTimeoutMs ?? 20,
    httpTimeoutMs: options.httpTimeoutMs ?? 50,
  });
  api.setLiveSync(options.sync || { isDestroyed: false, sse: { readyState: 1 } });
  return { api, state: page, fetchImpl, modules, loadWriteModules };
}

test("the reader answers without the write engine and never loads its modules", async () => {
  const loadWriteModules = jest.fn(async () => {
    throw new Error("the reader must not load write modules");
  });
  const fetchImpl = jest.fn(async () => response({ etag: '"R1"', data: { title: "Read" } }));
  const { api } = harness({ fetchImpl, loadWriteModules });

  await expect(api.readData()).resolves.toEqual({ data: { title: "Read" }, etag: '"R1"' });
  expect(loadWriteModules).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1].method).toBe("GET");

  const source = readFileSync(new URL("../../src/core/page-data.js", import.meta.url), "utf8");
  expect(source).not.toMatch(/^import .*page-data-write/m);
  expect(source).toContain('import("./page-data-write.js")');
});

test("each factory instance keeps its own engine, so one failure does not block the other", async () => {
  const failed = harness({ fetchImpl: jest.fn(async () => { throw new TypeError("connection lost"); }) });
  const healthy = harness({ state: state({ etag: '"E2"' }) });
  healthy.fetchImpl.mockImplementation(async () => response({ etag: '"E2"', data: { title: "Right" } }));

  await expect(failed.api.writeData({ title: "Maybe" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
    unknownOutcome: true,
  });

  await expect(healthy.api.writeData({ title: "Right" })).resolves.toEqual({
    data: { title: "Right" },
    etag: '"E2"',
  });

  await expect(failed.api.writeData({ title: "Again" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
  });
  expect(failed.state.held).toBe(0);
  expect(healthy.state.held).toBe(0);
});

test("each factory instance refuses its own second write while the first is running", async () => {
  const reply = deferred();
  const started = deferred();
  const busy = harness({
    fetchImpl: jest.fn(() => {
      started.resolve();
      return reply.promise;
    }),
  });
  const idle = harness();

  const writing = busy.api.writeData({ title: "One" });
  await started.promise;
  await expect(busy.api.writeData({ title: "Two" })).rejects.toMatchObject({ code: "DataWriteInProgress" });
  await expect(idle.api.writeData({ title: "Other" })).resolves.toMatchObject({ etag: '"E1"' });

  reply.resolve(response({ etag: '"E1"', data: { title: "One" } }));
  await expect(writing).resolves.toEqual({ data: { title: "One" }, etag: '"E1"' });
});

test("a lane replaced while the write engine loads is the one the write checks", async () => {
  const created = deferred();
  const loadWriteModules = jest.fn(() => created.promise);
  const page = state({ etag: '"E2"' });
  const fetchImpl = jest.fn(async () => response({ etag: '"E2"', data: { title: "After" } }));
  const { api } = harness({
    state: page,
    modules: writeModules(page),
    fetchImpl,
    loadWriteModules,
    sync: { isDestroyed: true, sse: { readyState: 3 } },
  });

  const writing = api.writeData({ title: "After" });
  api.setLiveSync({ isDestroyed: false, sse: { readyState: 1 } });
  created.resolve(writeModules(page));

  await expect(writing).resolves.toEqual({ data: { title: "After" }, etag: '"E2"' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a lane dropped while the write engine loads refuses the write before the POST", async () => {
  const created = deferred();
  const loadWriteModules = jest.fn(() => created.promise);
  const fetchImpl = jest.fn(async () => response());
  const { api, modules, state: page } = harness({ fetchImpl, loadWriteModules });

  const writing = api.writeData({ title: "No" });
  api.setLiveSync({ isDestroyed: false, sse: { readyState: 0 } });
  created.resolve(modules);

  await expect(writing).rejects.toMatchObject({ code: "SyncRequired" });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(page.held).toBe(0);
});

test("a failed write-module import is retried by the next write", async () => {
  const page = state({ etag: '"E2"' });
  const modules = writeModules(page);
  const loadWriteModules = jest.fn()
    .mockRejectedValueOnce(new Error("chunk unavailable"))
    .mockResolvedValue(modules);
  const fetchImpl = jest.fn(async () => response({ etag: '"E2"', data: { title: "After" } }));
  const { api } = harness({ state: page, modules, fetchImpl, loadWriteModules });

  await expect(api.writeData({ title: "After" })).rejects.toThrow("chunk unavailable");
  expect(fetchImpl).not.toHaveBeenCalled();

  await expect(api.writeData({ title: "After" })).resolves.toEqual({
    data: { title: "After" },
    etag: '"E2"',
  });
  expect(loadWriteModules).toHaveBeenCalledTimes(2);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a view page refuses the write before the write engine loads", async () => {
  const page = state();
  const modules = writeModules(page, { isEditMode: false });
  const loadWriteModules = jest.fn(async () => modules);
  const fetchImpl = jest.fn(async () => response());
  const { api } = harness({ state: page, modules, fetchImpl, loadWriteModules });

  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({
    code: "DataWriteUnavailable",
    message: "Page data writes require an editable page.",
  });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(page.held).toBe(0);
});

test("a draft page refuses the write before the write engine loads", async () => {
  const root = document.documentElement;
  const head = document.head.innerHTML;
  root.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';

  jest.resetModules();
  try {
    const draftMode = await import("../../src/core/draft-mode.js");
    draftMode.noteBootParams(new URLSearchParams("plugins=visitor-drafts"));
    const { createPageDataApi: createFresh } = await import("../../src/core/page-data.js");
    const page = state();
    const loadWriteModules = jest.fn(async () => writeModules(page));
    const fetchImpl = jest.fn(async () => response());
    const api = createFresh({
      supports: async () => true,
      token: () => null,
      fetchImpl,
      getLocation: () => ({ origin: "https://example.test", pathname: "/notes.html" }),
      eventTarget: document,
      loadWriteModules,
      syncTimeoutMs: 20,
      httpTimeoutMs: 50,
    });
    api.setLiveSync({ isDestroyed: false, sse: { readyState: 1 } });

    await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code: "DataUnavailableInDraft" });
    await expect(api.readData()).rejects.toMatchObject({ code: "DataUnavailableInDraft" });
    expect(loadWriteModules).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  } finally {
    root.removeAttribute("visitor-drafts");
    document.head.innerHTML = head;
    jest.resetModules();
  }
});

test("one successful conditional write sends its ETag and releases the save hold", async () => {
  const page = state({ etag: '"E8"' });
  const calls = [];
  const fetchImpl = jest.fn(async (url, init) => {
    calls.push({ url, init });
    return response({ etag: '"E8"', data: { title: "Written" } });
  });
  const { api } = harness({ state: page, modules: writeModules(page), fetchImpl });

  await expect(api.writeData({ title: "Written" }, { ifMatch: '"E7"' })).resolves.toEqual({
    data: { title: "Written" },
    etag: '"E8"',
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://example.test/_/api/nested/my%20page.htmlclay");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers).toEqual({ "Content-Type": "application/json", "If-Match": '"E7"' });
  expect(page.held).toBe(0);
  expect(page.released).toBe(1);
  expect(page.releaseReason).toBe(page.holdReason);
});
