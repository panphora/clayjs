import { jest } from "@jest/globals";

// Scenario: inside a workspace frame the shell owns the frame's URL, sandbox and
// replacement, so a mode change from the document is the shell's reload, not the
// document's. The injected bridge installs `window.clay._requestHostMode(mode)`; every
// way into `setMode` — the public API, the keyboard through mode-key.js, the menu switch
// — hands the ask over instead of switching or reloading here. A shell that does not
// take part ("host-unsupported") leaves standalone behaviour exactly as it was.
//
// Every case gets its own module load and its own document/window listeners: both
// is-edit-mode.js and edit-mode.js decide once, at evaluation, and a pagehide listener
// outlives jest.resetModules().

const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const RECEIPT_KEY = () => `clay:doc:${location.pathname}:mode-receipt`;
const SLOT = "/notes.html";
const HEAD = '<title>Start title</title><meta name="description" content="Start description">';
const MENU_BODY = '<div id="content">start</div>';

const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;
const registered = [];
EventTarget.prototype.addEventListener = function (type, fn, options) {
  registered.push([this, type, fn, options]);
  return realAdd.call(this, type, fn, options);
};

function dropListeners() {
  for (const [target, type, fn, options] of registered.splice(0)) realRemove.call(target, type, fn, options);
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function response({ ok = true, status = 200, body = "" } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  };
}

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function prepare({ url = SLOT, cookie = false, token = false, draft = false, hook = null } = {}) {
  dropListeners();
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", url);
  clearRoot();
  if (token) document.documentElement.setAttribute("savetoken", "tok-123");
  if (draft) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = '<div id="content">start</div>';
  window.fetch = async () => response({ ok: false, status: 404 });
  const { storage } = await import("../../src/lib/doc-storage.js");
  window.clay = { storage };
  if (hook) window.clay._requestHostMode = hook;
  return storage;
}

async function load({ draft = false } = {}) {
  if (draft) {
    const draftMode = await import("../../src/core/draft-mode.js");
    draftMode.noteBootParams(new URLSearchParams("plugins=visitor-drafts"));
  }
  return import("../../src/core/mode-key.js");
}

function press(extra = {}) {
  const init = { key: "E", code: "KeyE", shiftKey: true, bubbles: true, cancelable: true, ...extra };
  if (MAC) init.metaKey = true;
  else init.ctrlKey = true;
  const event = new KeyboardEvent("keydown", init);
  document.dispatchEvent(event);
  return event;
}

function withFakeLocation(run) {
  const real = window.location;
  const fake = {
    href: real.href,
    pathname: real.pathname,
    search: real.search,
    protocol: real.protocol,
    origin: real.origin,
    reload: jest.fn(),
  };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  return Promise.resolve()
    .then(() => run(fake))
    .finally(() => Object.defineProperty(window, "location", { value: real, configurable: true }));
}

const accept = () => jest.fn(async (mode) => ({ ok: true, mode, changed: true, reloading: true }));

async function bootMenu({ hook, edit = false, cookie = true } = {}) {
  dropListeners();
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  document.head.innerHTML = HEAD;
  document.body.innerHTML = MENU_BODY;
  window.fetch = async (input, options = {}) => {
    const method = (options && options.method) || "GET";
    if (method === "HEAD") return response({});
    if (String(input).includes("/_/meta")) return response({ body: JSON.stringify({ spec: 1, extensions: [] }) });
    return response({ ok: false, status: 404 });
  };
  window.clay = {};
  if (hook) window.clay._requestHostMode = hook;
  const params = new URLSearchParams("plugins=menu&exclude=richclay,source");
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, params, resolve));
  await settle();
}

afterEach(() => jest.restoreAllMocks());

test("the public setMode hands the change to the shell and reloads nothing", async () => {
  const hook = accept();
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");
  window.clay.setMode = editMode.setMode;

  await withFakeLocation(async (fake) => {
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(hook).toHaveBeenCalledWith("edit");
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("the keyboard shortcut delegates too", async () => {
  const hook = accept();
  await prepare({ cookie: true, hook });

  await withFakeLocation(async (fake) => {
    await load();
    const event = press();
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(hook).toHaveBeenCalledWith("edit");
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("the menu switch delegates too", async () => {
  const hook = accept();
  await bootMenu({ hook });
  expect(document.querySelector(".clay-menu-edit").getAttribute("aria-checked")).toBe("false");

  await withFakeLocation(async (fake) => {
    document.querySelector(".clay-menu-edit").click();
    await settle();

    expect(hook).toHaveBeenCalledWith("edit");
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("a delegated success writes no receipt and announces nothing", async () => {
  const hook = accept();
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");
  const announced = jest.fn();
  document.addEventListener("clay:modechange", announced);

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    window.dispatchEvent(new Event("pagehide"));

    expect(fake.reload).not.toHaveBeenCalled();
    expect(announced).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("a busy refusal starts nothing locally", async () => {
  const hook = jest.fn(async () => ({ ok: false, mode: "edit", changed: false, reason: "busy" }));
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "view", code: "busy" });
    expect(hook).toHaveBeenCalledWith("edit");
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("host-not-ready is a refusal: nothing local reloads", async () => {
  const hook = jest.fn(async () => ({ ok: false, mode: "edit", changed: false, reason: "host-not-ready" }));
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "view", code: "host-not-ready" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("host-unsupported keeps the standalone path: receipt, one reload, changed", async () => {
  const hook = jest.fn(async () => ({ ok: false, mode: "edit", changed: false, reason: "host-unsupported" }));
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(hook).toHaveBeenCalledWith("edit");
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(JSON.parse(sessionStorage.getItem(RECEIPT_KEY()))).toMatchObject({
    v: 1,
    path: SLOT,
    mode: "edit",
    canEdit: true,
    internal: true,
  });
});

test("a rejecting hook answers host-failed and reloads nothing", async () => {
  const hook = jest.fn(async () => { throw new Error("bridge gone"); });
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "view", code: "host-failed" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("in draft mode the hook is never called", async () => {
  const hook = accept();
  await prepare({ draft: true, hook });
  await load({ draft: true });
  const editMode = await import("../../src/core/edit-mode.js");

  await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
  expect(hook).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("without permission the hook is never called", async () => {
  const hook = accept();
  await prepare({ hook });
  const editMode = await import("../../src/core/edit-mode.js");

  await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "view", code: "not-allowed" });
  expect(hook).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("clay.save.flush stays callable while a delegated request is pending", async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const hook = jest.fn(() => held);
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");
  const flush = jest.fn(async () => ({ state: "saved" }));
  window.clay.save = { flush };

  await withFakeLocation(async () => {
    const pending = editMode.setMode("edit");
    await settle();

    await expect(window.clay.save.flush()).resolves.toEqual({ state: "saved" });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(editMode.modeLifecycle.state.phase).toBe("idle");

    release({ ok: true, mode: "edit", changed: true, reloading: true });
    await expect(pending).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});
