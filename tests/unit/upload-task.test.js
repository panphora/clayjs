import { jest } from "@jest/globals";

// Scenario: one upload with an identity. A task keeps one stable id, counts attempts
// only on an explicit retry, and settles each attempt once — so a cancelled request,
// a timeout and a late answer cannot each add their own ending to the same upload.

const ok = (body) => ({ ok: true, text: async () => JSON.stringify(body) });

const OK_BODY = {
  msg: "Uploaded",
  uploads: [{ name: "a-1.png", url: "assets-x/a-1.png", bytes: 3, access: "document" }]
};

// A scriptable XMLHttpRequest: it records the request and lets each test choose the
// answer, the moment, and whether sending throws.
function installXhr({ throwOnSend = false, throwOnConstruct = false } = {}) {
  const sent = [];
  class FakeXhr {
    constructor() {
      if (throwOnConstruct) throw new Error("no transport here");
      this.upload = { addEventListener: (name, fn) => { this._progress = fn; } };
      this._handlers = {};
      this.withCredentials = null;
      this.headers = {};
      this.status = 200;
      this.responseText = JSON.stringify(OK_BODY);
    }
    addEventListener(name, fn) { this._handlers[name] = fn; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    // A real abort dispatches synchronously, which is exactly the ordering the
    // transport has to survive.
    abort() { this._handlers.abort?.(); }
    send(body) {
      if (throwOnSend) throw new Error("send blew up");
      this.body = body;
      sent.push(this);
    }
  }
  global.XMLHttpRequest = FakeXhr;
  return sent;
}

async function load({ extensions = ["upload"], upload: block = { allowed: true, access: "document" } } = {}) {
  jest.resetModules();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions, document: { upload: block } }));
  return import("../../src/plugins/upload-task.js");
}

async function untilRequest(sent, index = 0) {
  for (let i = 0; i < 50 && sent.length <= index; i++) await Promise.resolve();
  if (sent.length <= index) throw new Error("no request was sent");
  return sent[index];
}

// Discovery is awaited before anything is sent, so a test that wants to sit between
// the two holds the answer open instead of racing it.
function holdDiscovery() {
  let release;
  global.fetch = () => new Promise((resolve) => {
    release = resolve;
  });
  return () => release(ok({ spec: 1, extensions: ["upload"], document: { upload: { allowed: true, access: "document" } } }));
}

function respond(req, { status = 200, body = OK_BODY } = {}) {
  req.status = status;
  req.responseText = JSON.stringify(body);
  req._handlers.load();
}

const file = (name = "photo.png", size = 3) => new File([new Uint8Array(size)], name, { type: "image/png" });

beforeEach(() => {
  document.documentElement.removeAttribute("savetoken");
});

test("a task reports uploading, then succeeded with what the host stored", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const seen = [];
  task.subscribe((snapshot) => seen.push([snapshot.state, snapshot.attempt, snapshot.percent]));

  const req = await untilRequest(sent);
  respond(req);
  const res = await task.result;

  expect(res.ok).toBe(true);
  expect(res.uploads[0].url).toBe("assets-x/a-1.png");
  // Subscribing calls back at once, so a UI mounts with the current state rather
  // than an empty one that never lasted.
  expect(seen).toEqual([["uploading", 1, null], ["succeeded", 1, null]]);
  expect(task.state).toBe("succeeded");
  expect(task.id).toBe("upload-1");
});

test("100% transmitted is not success: the attempt is still uploading until the host answers", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const req = await untilRequest(sent);
  req._progress({ lengthComputable: true, loaded: 10, total: 10 });

  const during = task.snapshot();
  expect([during.state, during.percent]).toEqual(["uploading", 100]);

  respond(req);
  await task.result;
  expect(task.state).toBe("succeeded");
});

test("without a total, progress stays indeterminate rather than a made-up percentage", async () => {
  const { start } = await load();
  const sent = installXhr();
  const task = start(file());
  await untilRequest(sent);
  const snapshot = task.snapshot();
  expect([snapshot.loaded, snapshot.total, snapshot.percent]).toEqual([0, null, null]);
});

test("unsubscribe stops the snapshots and nothing else", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const seen = [];
  const off = task.subscribe((snapshot) => seen.push(snapshot.state));
  off();
  respond(await untilRequest(sent));
  await task.result;

  expect(seen).toEqual(["uploading"]);
});

test("a cancel that arrives while the host is still being asked sends nothing", async () => {
  const { start } = await load();
  const release = holdDiscovery();
  const sent = installXhr();

  const task = start(file());
  for (let i = 0; i < 10; i++) await Promise.resolve();
  task.cancel();
  release();

  const res = await task.result;
  expect([res.ok, res.code]).toEqual([false, "aborted"]);
  expect(task.state).toBe("cancelled");
  expect(sent).toHaveLength(0);
});

test("a cancelled attempt keeps its ending, and retry is a second attempt of the same task", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const first = await untilRequest(sent);
  task.cancel();
  expect(await task.result).toMatchObject({ ok: false, code: "aborted" });
  expect(task.state).toBe("cancelled");

  // The bytes may be on the host already, so a cancel deletes nothing; asking again
  // is the explicit act, and it does not reprompt for the file.
  const retried = task.retry();
  const second = await untilRequest(sent, 1);
  respond(second);
  expect(await retried).toMatchObject({ ok: true });
  expect(task.id).toBe("upload-1");
  expect(task.attempt).toBe(2);
  expect(task.state).toBe("succeeded");
  expect(sent).toHaveLength(2);

  // First attempt's request stays where it was.
  first._handlers.load?.();
  expect(task.result).toBe(retried);
});

test("a double retry starts one request, not two", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const req = await untilRequest(sent);
  req._handlers.error();
  await task.result;
  expect(task.state).toBe("failed");

  const a = task.retry();
  const b = task.retry();
  expect(a).toBe(b);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(sent).toHaveLength(2);
});

test("an attempt's late callback cannot affect the attempt now running", async () => {
  const { start } = await load();
  const sent = installXhr();

  const task = start(file());
  const progress = [];
  task.subscribe((snapshot) => progress.push([snapshot.attempt, snapshot.loaded]));
  const first = await untilRequest(sent);
  first._handlers.error();
  await task.result;

  task.retry();
  const second = await untilRequest(sent, 1);
  second._progress({ lengthComputable: true, loaded: 1, total: 4 });

  // The first request answers now, with bytes and then a body. Neither belongs to
  // the attempt the person is watching.
  first._progress({ lengthComputable: true, loaded: 3, total: 4 });
  first._handlers.load?.();
  expect(task.snapshot()).toMatchObject({ attempt: 2, state: "uploading", loaded: 1, percent: 25 });
  expect(progress).toContainEqual([2, 1]);
  expect(progress).not.toContainEqual([2, 3]);

  respond(second);
  expect(await task.result).toMatchObject({ ok: true });
});

test("a refusal from the host fails the attempt without rejecting", async () => {
  const { start } = await load();
  const sent = installXhr();
  const task = start(file());
  respond(await untilRequest(sent), { status: 413, body: { code: "too-large", msg: "Too big" } });
  const res = await task.result;
  expect([res.ok, res.code]).toEqual([false, "too-large"]);
  expect(task.state).toBe("failed");
});

test("a send that throws produces one result instead of a rejected promise", async () => {
  const { start } = await load();
  installXhr({ throwOnSend: true });
  const task = start(file());
  const res = await task.result;
  expect([res.ok, res.msgType]).toEqual([false, "error"]);
  expect(task.state).toBe("failed");
});

test("a transport that cannot even be constructed produces one result", async () => {
  const { start } = await load();
  installXhr({ throwOnConstruct: true });
  const task = start(file());
  const res = await task.result;
  expect([res.ok, res.msgType]).toEqual([false, "error"]);
  expect(res.msg).toMatch(/could not start/);
});

test("a timeout stays a timeout, and the retry after it is a new attempt", async () => {
  const { start } = await load();
  const sent = installXhr();

  jest.useFakeTimers();
  try {
    const task = start(file());
    await untilRequest(sent);
    jest.advanceTimersByTime(120001);

    const res = await task.result;
    expect([res.ok, res.code, res.msgType]).toEqual([false, "timeout", "unknown"]);
    expect(task.state).toBe("failed");

    const retried = task.retry();
    const second = await untilRequest(sent, 1);
    respond(second);
    expect(await retried).toMatchObject({ ok: true });
    expect(task.attempt).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});

test("a succeeded task cannot retry", async () => {
  const { start } = await load();
  const sent = installXhr();
  const task = start(file());
  respond(await untilRequest(sent));
  const done = await task.result;
  expect(task.retry()).toBe(task.result);
  expect(done.ok).toBe(true);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(sent).toHaveLength(1);
});

test("no access advertised means no upload, and no request spent finding out", async () => {
  const sent = installXhr();
  for (const block of [{ allowed: true }, { allowed: true, access: "public" }, { allowed: true, access: "site" }]) {
    const { start } = await load({ upload: block });
    const task = start(file(), { requiredAccess: "document-or-local" });
    const res = await task.result;
    expect([res.ok, res.code]).toEqual([false, "privacy-unsupported"]);
    expect(task.state).toBe("failed");
  }
  expect(sent).toHaveLength(0);
});

test("a local host satisfies document-or-local, a document host satisfies document", async () => {
  const sent = installXhr();
  const local = await load({ upload: { allowed: true, access: "local" } });
  const task = local.start(file(), { requiredAccess: "document-or-local" });
  respond(await untilRequest(sent), { body: { msg: "Uploaded", uploads: [{ url: "local/a.png", access: "local" }] } });
  expect((await task.result).ok).toBe(true);

  const doc = await load({ upload: { allowed: true, access: "document" } });
  const second = doc.start(file(), { requiredAccess: "document" });
  respond(await untilRequest(sent, 1));
  expect((await second.result).ok).toBe(true);
  expect(sent).toHaveLength(2);
});

test("a result that downgrades the promised access is not a success, and keeps the URL for the person", async () => {
  const { start } = await load();
  const sent = installXhr();
  const task = start(file(), { requiredAccess: "document-or-local" });
  respond(await untilRequest(sent), {
    body: { msg: "Uploaded", uploads: [{ name: "a-1.png", url: "assets-x/a-1.png", access: "public" }] }
  });

  const res = await task.result;
  expect([res.ok, res.code]).toEqual([false, "privacy-unsupported"]);
  // Retained deliberately: a person can still copy or download it by hand. What a
  // caller must not do is insert it without knowing it is publicly readable.
  expect(res.uploads[0].url).toBe("assets-x/a-1.png");
});

test("without requiredAccess the host's own access field is not second-guessed", async () => {
  const { start } = await load({ upload: { allowed: true } });
  const sent = installXhr();
  const task = start(file());
  respond(await untilRequest(sent), { body: { msg: "Uploaded", uploads: [{ url: "assets-x/a.png" }] } });
  expect((await task.result).ok).toBe(true);
});

test("disposal cancels the attempt and releases the file and the listeners", async () => {
  const { start } = await load();
  const sent = installXhr();
  const task = start(file());
  const seen = [];
  task.subscribe((snapshot) => seen.push(snapshot.state));
  const req = await untilRequest(sent);

  task.dispose();

  // A failed or cancelled upload holds its File so a retry does not reprompt; a
  // disposed one holds nothing at all.
  expect(task.file).toBeNull();
  expect(await task.result).toMatchObject({ ok: false, code: "aborted" });
  const before = seen.length;
  task.retry();
  req._progress({ lengthComputable: true, loaded: 1, total: 2 });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(seen).toHaveLength(before);
  expect(sent).toHaveLength(1);
});

test("a failed attempt keeps the file so the retry does not reprompt", async () => {
  const { start } = await load();
  const sent = installXhr();
  const chosen = file("keep.png", 4);
  const task = start(chosen);
  (await untilRequest(sent))._handlers.error();
  await task.result;
  expect(task.state).toBe("failed");
  expect(task.file).toBe(chosen);
});

test("misuse throws before a task exists", async () => {
  const { start } = await load();
  expect(() => start(null)).toThrow(/needs a file/);
  expect(() => start(file(), { requiredAccess: "everyone" })).toThrow(/requiredAccess/);
  installXhr();
  expect(global.XMLHttpRequest).toBeDefined();
});
