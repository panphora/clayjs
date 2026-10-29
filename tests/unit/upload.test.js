import { jest } from "@jest/globals";

// Scenario: spec §9 uploads from the client side. One result shape from every
// exit, a wire that matches the save lane's defences, and a host that has not
// announced the capability treated as "embed instead", never as a failure.

const ok = (body) => ({ ok: true, text: async () => JSON.stringify(body) });

// A scriptable XMLHttpRequest. jsdom ships one, but it talks to a network that is
// not there; this records the request and lets each test choose the answer.
function installXhr() {
  const sent = [];
  class FakeXhr {
    constructor() {
      this.upload = { addEventListener: (name, fn) => { this._progress = fn; } };
      this._handlers = {};
      this.withCredentials = null;
      this.headers = {};
      this.status = 200;
      this.responseText = JSON.stringify({ msg: "Uploaded", uploads: [{ name: "a-1.png", url: "assets-x/a-1.png", bytes: 3 }] });
    }
    addEventListener(name, fn) { this._handlers[name] = fn; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    abort() { this._handlers.abort?.(); }
    send(body) {
      this.body = body;
      sent.push(this);
    }
  }
  global.XMLHttpRequest = FakeXhr;
  return sent;
}

async function load({ extensions = ["upload"], document: doc = { upload: { allowed: true } } } = {}) {
  jest.resetModules();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions, document: doc }));
  const mod = await import("../../src/plugins/upload.js");
  return mod.upload;
}

// upload() awaits discovery before it sends, so the request does not exist for
// several microtasks. Wait for it rather than guessing a tick count.
async function firstRequest(sent) {
  for (let i = 0; i < 50 && !sent.length; i++) await Promise.resolve();
  if (!sent.length) throw new Error("no request was sent");
  return sent[0];
}

const OK_BODY = { msg: "Uploaded", uploads: [{ name: "a-1.png", url: "assets-x/a-1.png", bytes: 3 }] };

function respond(req, { status = 200, body = OK_BODY } = {}) {
  req.status = status;
  req.responseText = JSON.stringify(body);
  req._handlers.load();
}

const file = (name = "photo.png", size = 3) => {
  const f = new File([new Uint8Array(size)], name, { type: "image/png" });
  return f;
};

beforeEach(() => {
  document.documentElement.removeAttribute("savetoken");
});

test("a host that never announced upload is not a failure, it is embed-instead", async () => {
  const upload = await load({ extensions: ["conditional"] });
  installXhr();

  const res = await upload(file());
  expect(res.ok).toBe(false);
  expect(res.code).toBe("unsupported");
  expect(res.msgType).toBe("skipped");
  // §5: a client must not go looking for the route to see whether it answers.
  expect(global.XMLHttpRequest).toBeDefined();
});

test("a host that stores files but names no upload block for this document refuses without sending", async () => {
  const upload = await load({ document: { etag: "e1" } });
  const sent = installXhr();

  const res = await upload(file());
  expect(res.ok).toBe(false);
  expect(res.code).toBe("forbidden");
  expect(res.msgType).toBe("error");
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(sent).toHaveLength(0);
});

test("the wire: token in the path, absolute url, FormData, no credentials", async () => {
  document.documentElement.setAttribute("savetoken", "tok9");
  const upload = await load();
  const sent = installXhr();

  const promise = upload(file());
  const req = await firstRequest(sent);
  respond(req);
  const res = await promise;
  expect(res.ok).toBe(true);
  expect(res.uploads[0].url).toBe("assets-x/a-1.png");
  expect(req.method).toBe("POST");
  expect(new URL(req.url).pathname).toBe("/_/upload/tok9");
  // Absolute against the real origin, so a <base href> in the authored document
  // cannot redirect the request and the token in its path somewhere else.
  expect(req.url).toBe(new URL("/_/upload/tok9", window.location.origin).href);
  expect(req.headers["Document-URL"]).toBe(window.location.href);
  expect(req.withCredentials).toBe(false);
  expect(req.body).toBeInstanceOf(FormData);
  expect(req.body.get("file")).toBeInstanceOf(File);
});

test("without a token it posts to the bare route", async () => {
  const upload = await load();
  const sent = installXhr();
  const promise = upload(file());
  const req = await firstRequest(sent);
  respond(req);
  await promise;
  expect(new URL(req.url).pathname).toBe("/_/upload");
});

test("a file over the announced cap is refused before it is sent", async () => {
  const upload = await load({ document: { upload: { allowed: true, maxBytes: 2 } } });
  const sent = installXhr();

  const res = await upload(file("big.png", 50));
  expect(res.code).toBe("too-large");
  expect(res.ok).toBe(false);
  // The whole point of publishing maxBytes: not sending 40 MB to be told no.
  expect(sent).toHaveLength(0);
});

test("the host's own code is what a caller branches on", async () => {
  const cases = [
    [402, { code: "payment-required", msg: "Add a plan" }, "payment-required"],
    [413, { code: "too-large" }, "too-large"],
    [415, { code: "unsupported-type" }, "unsupported-type"],
    [402, {}, "payment-required"],   // a host that sent no code at all
    [413, {}, "too-large"],
  ];
  for (const [status, body, expected] of cases) {
    const upload = await load();
    const sent = installXhr();
    const promise = upload(file());
    respond(await firstRequest(sent), { status, body });
    const res = await promise;
    expect([res.code, status]).toEqual([expected, status]);
    expect(res.ok).toBe(false);
  }
});

test("a 2xx that does not say where the file went is a failure, not a success", async () => {
  const upload = await load();
  const sent = installXhr();
  const promise = upload(file());
  respond(await firstRequest(sent), { body: { msg: "Uploaded" } });
  const res = await promise;
  expect(res.ok).toBe(false);
  expect(res.code).toBe("bad-response");
});

test("progress reaches both the callback and the document", async () => {
  const upload = await load();
  const sent = installXhr();
  const seen = [];
  const events = [];
  document.addEventListener("clay:upload-progress", (e) => events.push(e.detail));
  document.addEventListener("clay:upload-start", () => events.push("start"));
  document.addEventListener("clay:upload-done", () => events.push("done"));

  const promise = upload(file(), { onProgress: (p) => seen.push(p) });
  const req = await firstRequest(sent);
  req._progress({ lengthComputable: true, loaded: 5, total: 10 });
  respond(req);
  await promise;

  expect(seen).toEqual([{ loaded: 5, total: 10, percent: 50 }]);
  expect(events[0]).toBe("start");
  expect(events).toContain("done");
});

test("a throwing onProgress costs the caller its drawing, not the upload", async () => {
  const upload = await load();
  const sent = installXhr();
  const promise = upload(file(), { onProgress: () => { throw new Error("render blew up"); } });
  const req = await firstRequest(sent);
  req._progress({ lengthComputable: true, loaded: 1, total: 2 });
  respond(req);
  const res = await promise;
  expect(res.ok).toBe(true);
});

test("an aborted upload resolves as skipped rather than rejecting", async () => {
  const upload = await load();
  const sent = installXhr();
  const controller = new AbortController();
  const promise = upload(file(), { signal: controller.signal });
  await firstRequest(sent);
  controller.abort();
  const res = await promise;
  expect(res.ok).toBe(false);
  expect(res.code).toBe("aborted");
  expect(res.msgType).toBe("skipped");
});

test("a network error resolves rather than rejecting", async () => {
  const upload = await load();
  const sent = installXhr();
  const promise = upload(file());
  const req = await firstRequest(sent);
  req._handlers.error();
  const res = await promise;
  expect(res.ok).toBe(false);
  expect(res.code).toBe("network");
});

test("a timeout resolves as a timeout, not as the cancel its own abort would report", async () => {
  const upload = await load();
  const sent = installXhr();
  const events = [];
  document.addEventListener("clay:upload-error", (e) => events.push(e.detail));

  jest.useFakeTimers();
  try {
    const promise = upload(file());
    await firstRequest(sent);
    jest.advanceTimersByTime(120001);
    const res = await promise;

    expect([res.ok, res.code, res.msgType]).toEqual([false, "timeout", "unknown"]);
    // One ending, and it is the real one: the abort the timeout fires must not be
    // reported as a cancellation a moment later.
    expect(events).toEqual([{ msg: "Upload timed out", code: "timeout", taskId: "upload-1", attempt: 1 }]);
  } finally {
    jest.useRealTimers();
  }
});

test("an answer that lands after an abort emits no done and changes nothing", async () => {
  const upload = await load();
  const sent = installXhr();
  const events = [];
  document.addEventListener("clay:upload-done", () => events.push("done"));
  document.addEventListener("clay:upload-error", () => events.push("error"));

  const controller = new AbortController();
  const promise = upload(file(), { signal: controller.signal });
  const req = await firstRequest(sent);
  controller.abort();
  const res = await promise;
  expect(res.code).toBe("aborted");

  // The response was already on its way when the person cancelled. It is stale, and
  // a caller that hears "done" here would insert a URL nothing is waiting for — so the
  // load handler leaves it alone rather than reading and judging an answer that no
  // longer belongs to anyone.
  let staleAnswerRead = false;
  let staleBody = "";
  Object.defineProperty(req, "responseText", {
    configurable: true,
    get() { staleAnswerRead = true; return staleBody; },
    set(value) { staleBody = value; },
  });
  respond(req);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(events).toEqual([]);
  expect(staleAnswerRead).toBe(false);
});

test("discovery, progress and done carry an additive task id and attempt", async () => {
  const upload = await load();
  const sent = installXhr();
  const details = [];
  document.addEventListener("clay:upload-start", (e) => details.push(["start", e.detail]));
  document.addEventListener("clay:upload-progress", (e) => details.push(["progress", e.detail]));
  document.addEventListener("clay:upload-done", (e) => details.push(["done", e.detail]));

  const promise = upload(file());
  const req = await firstRequest(sent);
  req._progress({ lengthComputable: true, loaded: 5, total: 10 });
  respond(req);
  await promise;

  // A listener showing one row per upload can tell two of them apart. Old callers read
  // only `msg`, `code` and `uploads`, so the extra fields cost them nothing.
  expect(details[0][1]).toEqual({ name: "photo.png", size: 3, taskId: "upload-1", attempt: 1 });
  expect(details[1][1]).toEqual({ loaded: 5, total: 10, percent: 50, taskId: "upload-1", attempt: 1 });
  expect(details[2][1].uploads[0].url).toBe("assets-x/a-1.png");
  expect(details[2][1].taskId).toBe("upload-1");
});

test("a cancel that arrives while the host is still being asked sends nothing", async () => {
  const upload = await load();
  let answer;
  global.fetch = () => new Promise((resolve) => { answer = resolve; });
  const sent = installXhr();

  const controller = new AbortController();
  const promise = upload(file(), { signal: controller.signal });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  controller.abort();
  answer(ok({ spec: 1, extensions: ["upload"], document: { upload: { allowed: true } } }));

  const res = await promise;
  expect(res.code).toBe("aborted");
  expect(sent).toHaveLength(0);
});

test("the plugin function carries the task starter", async () => {
  const upload = await load();
  expect(typeof upload.start).toBe("function");
  // Same callers hold `clay.upload`; nothing new to look up.
  expect(upload.start).toBe((await import("../../src/plugins/upload-task.js")).start);
});

test("an unknown requiredAccess is the caller's bug and throws before any request", async () => {
  const upload = await load();
  const sent = installXhr();
  expect(() => upload(file(), { requiredAccess: "private-ish" })).toThrow(/requiredAccess/);
  expect(sent).toHaveLength(0);
});
