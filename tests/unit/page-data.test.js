import { jest } from "@jest/globals";
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

function harness(options = {}) {
  const state = {
    dirty: false,
    saveInProgress: false,
    saveUnknown: false,
    conflicted: false,
    externalHold: false,
    held: 0,
    released: 0,
    missed: false,
    replays: 0,
    etag: '"E1"',
    seeded: 0,
    ...options.state,
  };
  const fetchImpl = options.fetchImpl || jest.fn(async () => response());
  const modules = {
    isEditMode: true,
    baselineSettled: () => true,
    isSaveInProgress: () => state.saveInProgress,
    saveFateIsUnknown: () => state.saveUnknown,
    savesHeld: () => state.externalHold || state.held > 0,
    isSaveConflicted: () => state.conflicted,
    hasUnsavedChanges: () => state.dirty,
    lastSeenEtag: () => state.etag,
    seedEtag: async () => {
      state.seeded++;
      return state.etag;
    },
    holdAllSaves: (reason) => {
      state.held++;
      state.holdReason = reason;
    },
    releaseAllSaves: ({ reason }) => {
      state.held--;
      state.released++;
      state.releaseReason = reason;
      if (state.missed) state.replays++;
    },
    ...options.modules,
  };
  const api = createPageDataApi({
    supports: options.supports || (async () => true),
    token: options.token || (() => null),
    fetchImpl,
    getLocation: options.getLocation || (() => ({
      origin: "https://example.test",
      pathname: "/nested/my%20page.htmlclay",
      search: "?ignored=1",
      hash: "#ignored",
    })),
    eventTarget: document,
    loadWriteModules: async () => modules,
    syncTimeoutMs: options.syncTimeoutMs ?? 20,
    httpTimeoutMs: options.httpTimeoutMs ?? 50,
  });
  const sync = options.sync || { isDestroyed: false, sse: { readyState: 1 } };
  api.setLiveSync(sync);
  return { api, state, fetchImpl, modules, sync };
}

function applyDisk(etag) {
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "disk", etag },
  }));
}

test("builds default and explicit-rules URLs from the encoded document path only", async () => {
  const fetchImpl = jest.fn(async () => response());
  const { api } = harness({ fetchImpl });

  await api.readData();
  const rules = { title: "h1", items: ["li", { name: ".name" }] };
  await api.readData(rules);

  expect(fetchImpl.mock.calls[0][0]).toBe("https://example.test/_/api/nested/my%20page.htmlclay");
  expect(fetchImpl.mock.calls[1][0]).toBe(
    `https://example.test/nested/my%20page.htmlclay?data=${encodeURIComponent(JSON.stringify(rules))}`
  );
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({
    method: "GET",
    credentials: "same-origin",
    redirect: "error",
  });
});

test("readData returns the projection and document ETag", async () => {
  const { api } = harness({
    fetchImpl: jest.fn(async () => response({ etag: '"R2"', data: { nested: { title: "Hi" } } })),
  });

  await expect(api.readData()).resolves.toEqual({
    data: { nested: { title: "Hi" } },
    etag: '"R2"',
  });
});

test("capability refusals send nothing", async () => {
  const supports = jest.fn(async () => false);
  const { api, fetchImpl } = harness({ supports });

  await expect(api.readData()).rejects.toMatchObject({ code: "DataReadUnsupported" });
  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code: "DataWriteUnsupported" });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("writeData refuses dirty pages before taking the save hold", async () => {
  const { api, state, fetchImpl } = harness({ state: { dirty: true } });

  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code: "UnsavedChanges" });
  expect(state.held).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  ["an in-flight save", { saveInProgress: true }, "SaveInProgress"],
  ["a save with an unknown outcome", { saveUnknown: true }, "SaveOutcomeUnknown"],
  ["an existing all-save hold", { externalHold: true }, "SavesHeld"],
  ["a conflict hold", { conflicted: true }, "SavesHeld"],
])("writeData refuses %s", async (_name, blocked, code) => {
  const { api, state, fetchImpl } = harness({ state: blocked });

  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code });
  expect(state.held).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("writeData refuses when sync is not connected", async () => {
  const { api, state, fetchImpl } = harness({ sync: { isDestroyed: false, sse: { readyState: 0 } } });

  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code: "SyncRequired" });
  expect(state.held).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("a second writeData call is refused while the first is running", async () => {
  const reply = deferred();
  const started = deferred();
  const fetchImpl = jest.fn(() => {
    started.resolve();
    return reply.promise;
  });
  const { api, state } = harness({ fetchImpl });

  const first = api.writeData({ title: "One" });
  await started.promise;
  await expect(api.writeData({ title: "Two" })).rejects.toMatchObject({ code: "DataWriteInProgress" });

  reply.resolve(response({ etag: '"E1"', data: { title: "One" } }));
  await expect(first).resolves.toEqual({ data: { title: "One" }, etag: '"E1"' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.held).toBe(0);
});

test("subscribes before POST and accepts a matching frame that arrives before the response", async () => {
  const fetchImpl = jest.fn(async (_url, init) => {
    applyDisk('"E2"');
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "If-Match": '"E1"',
      "Save-Token": "token-1",
    });
    expect(init.redirect).toBe("error");
    return response({ etag: '"E2"', data: { title: "After" } });
  });
  const { api, state } = harness({ fetchImpl, token: () => "token-1" });

  await expect(api.writeData({ title: "After" })).resolves.toEqual({
    data: { title: "After" },
    etag: '"E2"',
  });
  expect(state.seeded).toBe(0);
  expect(state.held).toBe(0);
  expect(state.holdReason).toMatch(/page data write/);
  expect(state.releaseReason).toBe(state.holdReason);
});

test("accepts a post-response disk frame without an ETag", async () => {
  const fetchImpl = jest.fn(async () => ({
    ...response({ etag: '"E2"', data: { title: "After" } }),
    json: async () => {
      setTimeout(() => applyDisk(null), 0);
      return { title: "After" };
    },
  }));
  const { api, state } = harness({ fetchImpl, syncTimeoutMs: 100 });

  await expect(api.writeData({ title: "After" })).resolves.toEqual({
    data: { title: "After" },
    etag: '"E2"',
  });
  expect(state.held).toBe(0);
});

test("a no-op response with the current ETag needs no sync frame", async () => {
  const { api, state } = harness({
    fetchImpl: jest.fn(async () => response({ etag: '"E1"', data: { title: "Same" } })),
  });

  await expect(api.writeData({ title: "Same" })).resolves.toEqual({
    data: { title: "Same" },
    etag: '"E1"',
  });
  expect(state.held).toBe(0);
});

test("a response matching ifMatch still waits when the live page has an older ETag", async () => {
  const { api, state } = harness({
    syncTimeoutMs: 5,
    fetchImpl: jest.fn(async () => response({ etag: '"E2"', data: { title: "Disk" } })),
  });

  await expect(api.writeData({ title: "Disk" }, { ifMatch: '"E2"' })).resolves.toEqual({
    data: { title: "Disk" },
    etag: '"E2"',
    pageUpdatePending: true,
    message: "Written, page update pending.",
  });
  expect(state.etag).toBe('"E1"');
  expect(state.held).toBe(0);
});

test("a stale ETag is sent once, surfaced intact, and never adopted", async () => {
  const fetchImpl = jest.fn(async (_url, init) => {
    expect(init.headers["If-Match"]).toBe('"OLD"');
    return response({
      status: 412,
      etag: '"CURRENT"',
      error: {
        error: "Precondition Failed",
        message: "The page changed. Nothing was written.",
        details: { current: '"CURRENT"' },
      },
    });
  });
  const { api, state } = harness({ fetchImpl });

  await expect(api.writeData({ title: "No" }, { ifMatch: '"OLD"' })).rejects.toMatchObject({
    status: 412,
    error: "Precondition Failed",
    message: "The page changed. Nothing was written.",
    details: { current: '"CURRENT"' },
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.etag).toBe('"E1"');
  expect(state.held).toBe(0);
});

test("edits made during the POST stay dirty and their held save is replayed", async () => {
  const reply = deferred();
  const started = deferred();
  const fetchImpl = jest.fn(() => {
    started.resolve();
    return reply.promise;
  });
  const { api, state } = harness({ fetchImpl });

  const writing = api.writeData({ title: "Written" });
  await started.promise;
  expect(state.held).toBe(1);

  state.dirty = true;
  state.missed = true;
  applyDisk('"E2"');
  reply.resolve(response({ etag: '"E2"', data: { title: "Written" } }));

  await writing;
  expect(state.dirty).toBe(true);
  expect(state.replays).toBe(1);
  expect(state.held).toBe(0);
});

test("a network failure becomes an unknown outcome and is never resent", async () => {
  const fetchImpl = jest.fn(async () => { throw new TypeError("connection lost"); });
  const { api, state } = harness({ fetchImpl });

  await expect(api.writeData({ title: "Maybe" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
    unknownOutcome: true,
  });
  await expect(api.writeData({ title: "Again" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.held).toBe(0);
});

test("a stalled request is aborted and releases the save hold", async () => {
  let signal;
  const fetchImpl = jest.fn((_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  });
  const { api, state } = harness({ fetchImpl, httpTimeoutMs: 5 });

  await expect(api.writeData({ title: "Maybe" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
    unknownOutcome: true,
  });
  expect(signal.aborted).toBe(true);
  expect(state.held).toBe(0);
  await expect(api.writeData({ title: "Again" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a stalled response body is bounded and releases the save hold", async () => {
  const fetchImpl = jest.fn(async () => ({
    ...response({ etag: '"E2"' }),
    json: () => new Promise(() => {}),
  }));
  const { api, state } = harness({ fetchImpl, httpTimeoutMs: 5 });

  await expect(api.writeData({ title: "Written" })).rejects.toMatchObject({
    code: "DataWriteOutcomeUnknown",
    unknownOutcome: true,
  });
  expect(state.held).toBe(0);
});

test("a successful write whose frame times out reports that the page update is pending", async () => {
  const { api, state } = harness({
    syncTimeoutMs: 5,
    fetchImpl: jest.fn(async () => response({ etag: '"E2"', data: { title: "Written" } })),
  });

  await expect(api.writeData({ title: "Written" })).resolves.toEqual({
    data: { title: "Written" },
    etag: '"E2"',
    pageUpdatePending: true,
    message: "Written, page update pending.",
  });
  expect(state.held).toBe(0);
});

test("writeData refuses when neither the caller nor the page has a trustworthy ETag", async () => {
  const { api, state, fetchImpl } = harness({ state: { etag: null } });

  await expect(api.writeData({ title: "No" })).rejects.toMatchObject({ code: "DataWriteVersionRequired" });
  expect(state.seeded).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});
