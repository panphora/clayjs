import { jest } from "@jest/globals";
import { ephemeral } from "../../src/lib/ephemeral.js";

/**
 * The like plugin paints the host's counts into a `.like-count` span, toggles this
 * visitor's like through /_/reactions, and stays inert on a host without likes.
 *
 * The plugin keeps its state and its document click listener in module scope, so
 * every test loads a fresh module instance. The previous instance's click listener
 * and MutationObserver are removed before the next test runs, which leaves each
 * test's request log and DOM its own.
 */

let like;
let calls;
let responses;
let cleanups = [];
let realRaf;

function respond(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

// A host without likes answers its own HTML page at 200; a host error can answer
// HTML too, which is a failure with a status.
function htmlResponse(status) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.reject(new SyntaxError("not json")) });
}

function defaultResponses(options = {}) {
  if (options.method === "PUT") {
    const body = JSON.parse(options.body);
    return respond(200, { ok: true, item: body.item, action: "like", on: body.on, count: body.on ? 3 : 1, formToken: "t1" });
  }
  return respond(200, { counts: { "post-1": { like: 2 }, "post-9": { like: 4 } }, formToken: "t1" });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Set the body, then load a fresh plugin instance that starts on those elements. */
async function load(html = "") {
  document.body.innerHTML = html;
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  const listeners = [];
  document.addEventListener = (type, fn, options) => {
    if (type === "click") listeners.push(fn);
    add(type, fn, options);
  };
  const RealObserver = window.MutationObserver;
  const observers = [];
  window.MutationObserver = function (callback) {
    const observer = new RealObserver(callback);
    observers.push(observer);
    this.observe = observer.observe.bind(observer);
    this.disconnect = observer.disconnect.bind(observer);
    this.takeRecords = observer.takeRecords.bind(observer);
  };
  window.MutationObserver.prototype = RealObserver.prototype;
  jest.resetModules();
  global.fetch = jest.fn((url, options = {}) => {
    calls.push({ url, options });
    return responses(options);
  });
  try {
    ({ like } = await import("../../src/plugins/like.js"));
    // The plugin reads the totals as it starts, so wait for that read to settle.
    await flush();
    await flush();
  } finally {
    delete document.addEventListener;
    window.MutationObserver = RealObserver;
  }
  cleanups.push(() => {
    for (const fn of listeners) remove("click", fn);
    for (const observer of observers) observer.disconnect();
  });
  return like;
}

const reactionCalls = (method) => calls.filter((c) => c.url === "/_/reactions" && (c.options.method || "GET") === method);
const puts = () => reactionCalls("PUT").map((c) => JSON.parse(c.options.body));
const likedKey = () => `clay-liked:${location.pathname}`;

function click(el) {
  return el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

beforeAll(() => {
  realRaf = window.requestAnimationFrame;
  // The plugin paints a late element on the next frame; a frame a test can await.
  window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  global.crypto.randomUUID ??= () => "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  globalThis.structuredClone ??= (value) => JSON.parse(JSON.stringify(value));
});

afterAll(() => {
  window.requestAnimationFrame = realRaf;
});

beforeEach(() => {
  calls = [];
  localStorage.clear();
  window.clay = { toast: jest.fn(), ephemeral };
  responses = defaultResponses;
});

afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup();
  cleanups = [];
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

test("a host without likes leaves the elements inert", async () => {
  responses = () => htmlResponse(200);
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  expect(like.counts()).toBeNull();
  expect(el.querySelector(".like-count")).toBeNull();
  click(el);
  await flush(); await flush();
  expect(puts()).toEqual([]);
  expect(el.hasAttribute("ephemeral")).toBe(false);
});

test("a host without likes leaves the click alone too", async () => {
  responses = () => htmlResponse(200);
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  await flush(); await flush();
  expect(event.defaultPrevented).toBe(false);
  expect(reactionCalls("GET")).toHaveLength(1);
  expect(puts()).toHaveLength(0);
});

test.each([404, 405])("a local host that refuses the totals with a plain %i leaves clicks alone", async (status) => {
  responses = () => htmlResponse(status);
  await load('<a href="#next" like="post-1">&#9829;</a>');
  const el = document.querySelector("a");
  for (let i = 0; i < 2; i++) {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    await flush(); await flush();
    expect(event.defaultPrevented).toBe(false);
  }
  expect(reactionCalls("GET")).toHaveLength(1);
  expect(puts()).toHaveLength(0);
  expect(window.clay.toast).not.toHaveBeenCalled();
});

test("the totals are painted into one count span, however often they are read", async () => {
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  await like.refresh();
  const spans = el.querySelectorAll("span.like-count");
  expect(spans).toHaveLength(1);
  expect(spans[0].getAttribute("clay")).toBe("editor-ui");
  expect(spans[0].textContent).toBe("2");

  await like.refresh();
  expect(el.querySelectorAll("span.like-count")).toHaveLength(1);
  expect(el.querySelector(".like-count").textContent).toBe("2");
});

test("a click puts the like with the visitor, the token and the document URL", async () => {
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  const liked = jest.fn();
  el.addEventListener("clay:like", liked);
  click(el);
  await flush(); await flush();

  const [put] = reactionCalls("PUT");
  expect(put.options.method).toBe("PUT");
  expect(put.options.credentials).toBe("omit");
  expect(put.options.headers["Document-URL"]).toBe(window.location.href);
  const body = JSON.parse(put.options.body);
  expect(body).toMatchObject({ item: "post-1", action: "like", on: true, formToken: "t1" });
  expect(body.visitor).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  expect(el.querySelector(".like-count").textContent).toBe("3");
  expect(el.getAttribute("ephemeral")).toContain("liked");
  expect(liked).toHaveBeenCalledTimes(1);
  expect(liked.mock.calls[0][0].detail).toEqual({ item: "post-1", on: true, count: 3 });
});

test("a second click takes the like back", async () => {
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  click(el);
  await flush(); await flush();
  click(el);
  await flush(); await flush();

  expect(puts().map((body) => body.on)).toEqual([true, false]);
  expect(el.getAttribute("ephemeral") || "").not.toContain("liked");
});

test("an empty like attribute falls back to the element id", async () => {
  await load('<button like="" id="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  expect(el.querySelector(".like-count").textContent).toBe("2");
  click(el);
  await flush(); await flush();
  expect(puts()).toHaveLength(1);
  expect(puts()[0].item).toBe("post-1");
});

test("a refused token is replaced once, silently", async () => {
  let refusals = 1;
  responses = (options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      if (refusals-- > 0) return respond(400, { ok: false, code: "form-token", formToken: "t2" });
      return respond(200, { ok: true, item: body.item, action: "like", on: body.on, count: 5, formToken: "t2" });
    }
    return respond(200, { counts: { "post-1": { like: 2 } }, formToken: "t1" });
  };
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  click(el);
  await flush(); await flush(); await flush();

  expect(puts().map((body) => body.formToken)).toEqual(["t1", "t2"]);
  expect(el.querySelector(".like-count").textContent).toBe("5");
  expect(window.clay.toast).not.toHaveBeenCalled();
});

test("a failed toggle toasts the error unless the page cancels the event", async () => {
  responses = (options = {}) => (
    options.method === "PUT"
      ? respond(500, { ok: false, error: "The like could not be saved." })
      : respond(200, { counts: { "post-1": { like: 2 } }, formToken: "t1" })
  );
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  const failed = jest.fn();
  el.addEventListener("clay:like-failed", failed);
  click(el);
  await flush(); await flush();
  expect(failed.mock.calls[0][0].detail).toEqual({ item: "post-1", error: "The like could not be saved." });
  expect(window.clay.toast).toHaveBeenCalledWith("The like could not be saved.", "error");

  el.addEventListener("clay:like-failed", (event) => event.preventDefault());
  click(el);
  await flush(); await flush();
  expect(window.clay.toast).toHaveBeenCalledTimes(1);
});

test("a failed first read recovers on the next click", async () => {
  let reads = 0;
  responses = (options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      return respond(200, { ok: true, item: body.item, action: "like", on: body.on, count: 3, formToken: "t1" });
    }
    reads += 1;
    if (reads === 1) return Promise.reject(new TypeError("Failed to fetch"));
    return respond(200, { counts: { "post-1": { like: 2 } }, formToken: "t1" });
  };
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  expect(reactionCalls("GET")).toHaveLength(1);
  expect(el.querySelector(".like-count")).toBeNull();

  click(el);
  await flush(); await flush(); await flush();
  expect(reactionCalls("GET")).toHaveLength(2);
  expect(puts()).toHaveLength(1);
  expect(puts()[0]).toMatchObject({ item: "post-1", on: true });
  expect(el.querySelector(".like-count").textContent).toBe("3");
});

test("an element added after load gets its count on the next frame", async () => {
  await load('<button like="post-1">&#9829;</button>');
  const el = document.createElement("button");
  el.setAttribute("like", "post-9");
  document.body.append(el);
  expect(el.querySelector(".like-count")).toBeNull();
  for (let tick = 0; tick < 10 && !el.querySelector(".like-count"); tick++) await flush();
  expect(el.querySelector(".like-count")?.textContent).toBe("4");
  expect(reactionCalls("GET")).toHaveLength(1);
});

test("an element added for an item the totals lack reads the totals again on the next frame", async () => {
  let reads = 0;
  responses = (options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      return respond(200, { ok: true, item: body.item, action: "like", on: body.on, count: 8, formToken: "t1" });
    }
    reads += 1;
    const counts = reads === 1 ? { "post-1": { like: 2 } } : { "post-1": { like: 2 }, "post-9": { like: 7 } };
    return respond(200, { counts, formToken: "t1" });
  };
  let now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  await load('<button like="post-1">&#9829;</button>');
  expect(reactionCalls("GET")).toHaveLength(1);

  now += 6000;
  const el = document.createElement("button");
  el.setAttribute("like", "post-9");
  document.body.append(el);
  for (let tick = 0; tick < 10 && !el.querySelector(".like-count"); tick++) await flush();
  expect(el.querySelector(".like-count")?.textContent).toBe("7");
  expect(reactionCalls("GET")).toHaveLength(2);

  click(el);
  await flush(); await flush();
  expect(puts()).toHaveLength(1);
  expect(puts()[0]).toMatchObject({ item: "post-9", on: true });
});

test("an unknown item does not read the totals again within five seconds of a read", async () => {
  await load('<button like="post-1">&#9829;</button><button like="post-3">&#9829;</button>');
  expect(reactionCalls("GET")).toHaveLength(1);
  const el = document.querySelectorAll("button")[1];
  click(el);
  await flush(); await flush();
  click(el);
  await flush(); await flush();
  expect(reactionCalls("GET")).toHaveLength(1);
  expect(puts()).toHaveLength(0);
});

test("two overlapping toggles on different items both stay liked", async () => {
  const deferred = [];
  let putCount = 0;
  responses = (options = {}) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      putCount += 1;
      const bodyOut = { ok: true, item: body.item, action: "like", on: body.on, count: body.on ? 5 : 4, formToken: "t1" };
      if (putCount <= 2) return new Promise((resolve) => deferred.push({ body, resolve: () => resolve({ ok: true, status: 200, json: () => Promise.resolve(bodyOut) }) }));
      return respond(200, bodyOut);
    }
    return respond(200, { counts: { "post-1": { like: 4 }, "post-2": { like: 4 } }, formToken: "t1" });
  };
  await load('<button like="post-1">&#9829;</button><button like="post-2">&#9829;</button>');
  const [first, second] = document.querySelectorAll("button");
  click(first);
  click(second);
  await flush();
  expect(deferred.map((entry) => entry.body.item)).toEqual(["post-1", "post-2"]);

  deferred[1].resolve();
  await flush(); await flush();
  deferred[0].resolve();
  await flush(); await flush();

  expect(first.getAttribute("ephemeral")).toContain("liked");
  expect(second.getAttribute("ephemeral")).toContain("liked");
  const stored = JSON.parse(localStorage.getItem(likedKey()));
  expect(stored).toEqual(expect.arrayContaining(["post-1", "post-2"]));

  click(first);
  await flush(); await flush();
  expect(puts().map((body) => body.on)).toEqual([true, true, false]);
});

test("a blocked localStorage keeps one visitor id and a working liked set", async () => {
  const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  click(el);
  await flush(); await flush();
  click(el);
  await flush(); await flush();

  expect(puts().map((body) => body.on)).toEqual([true, false]);
  expect(puts()[0].visitor).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  expect(puts()[0].visitor).toBe(puts()[1].visitor);
  expect(getItem).toHaveBeenCalled();
  expect(setItem).toHaveBeenCalled();
});

test("without crypto.randomUUID the visitor id comes from getRandomValues", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
  try {
    await load('<button like="post-1">&#9829;</button>');
    const el = document.querySelector("button");
    click(el);
    await flush(); await flush();
    expect(puts()).toHaveLength(1);
    expect(puts()[0].visitor).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(puts()[0].visitor).not.toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  } finally {
    if (descriptor) Object.defineProperty(globalThis.crypto, "randomUUID", descriptor);
    else delete globalThis.crypto.randomUUID;
  }
});

test("a 502 answered with HTML toasts the status", async () => {
  responses = (options = {}) => (
    options.method === "PUT" ? htmlResponse(502) : respond(200, { counts: { "post-1": { like: 2 } }, formToken: "t1" })
  );
  await load('<button like="post-1">&#9829;</button>');
  const el = document.querySelector("button");
  const failed = jest.fn();
  el.addEventListener("clay:like-failed", failed);
  click(el);
  await flush(); await flush();

  expect(failed).toHaveBeenCalledTimes(1);
  expect(failed.mock.calls[0][0].detail).toEqual({ item: "post-1", error: "The like couldn't be saved (502)." });
  expect(window.clay.toast).toHaveBeenCalledWith("The like couldn't be saved (502).", "error");
});

test("no count span or like state reaches a save", async () => {
  const Mutation = (await import("../../src/lib/mutation.js")).default;
  await load('<button like="post-1" class="post">&#9829;</button>');
  const el = document.querySelector("button");

  const seen = [];
  const unsubscribe = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
    seen.push(...(changes || []));
  });
  click(el);
  await flush(); await flush(); await flush();

  expect(el.querySelector(".like-count")).not.toBeNull();
  expect(el.getAttribute("ephemeral")).toContain("liked");
  expect(seen).toHaveLength(0);

  // The subscription is live: an ordinary saved change still reports.
  el.setAttribute("data-probe", "1");
  await flush(); await flush();
  expect(seen.length).toBeGreaterThan(0);
  el.removeAttribute("data-probe");
  await flush(); await flush();
  unsubscribe();

  const { captureSaveClone, serializeClone } = await import("../../src/core/snapshot.js");
  const html = serializeClone(captureSaveClone({ flushUndo: false, authored: false }));
  expect(html).toContain('<button like="post-1" class="post">♥</button>');
  expect(html).not.toContain("like-count");
  expect(html).not.toContain("ephemeral");
});
