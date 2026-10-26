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

async function prepare({ url = SLOT, cookie = false, token = false, draft = false, viewonly = false, hook = null } = {}) {
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
  if (viewonly) document.documentElement.setAttribute("viewonly", "");
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

const okMeta = (document) => response({ body: JSON.stringify({ spec: 1, extensions: [], document }) });

function hold() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function bootEditor({ hook = null, live = false, writable = true } = {}) {
  dropListeners();
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", `${SLOT}?editmode=true`);
  if (live) document.documentElement.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "";
  document.body.innerHTML = MENU_BODY;
  window.fetch = async (input) =>
    String(input).includes("/_/meta")
      ? okMeta({ writable })
      : response({ ok: false, status: 404 });
  window.clay = {};
  if (hook) window.clay._requestHostMode = hook;
  const params = new URLSearchParams("plugins=menu&exclude=richclay,source");
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, params, resolve));
  await settle();
}

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

test("a live-declared editor hands the exit to the shell and never leaves the page", async () => {
  const hook = accept();
  await bootEditor({ hook, live: true });
  const editMode = await import("../../src/core/edit-mode.js");
  expect(editMode.mode).toBe("edit");

  const announced = jest.fn();
  document.addEventListener("clay:modechange", announced);

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("view")).resolves.toEqual({
      ok: true,
      mode: "view",
      changed: true,
      reloading: true,
    });
    await settle();
    window.dispatchEvent(new Event("pagehide"));

    expect(hook).toHaveBeenCalledWith("view");
    expect(announced).not.toHaveBeenCalled();
    expect(editMode.modeLifecycle.state.phase).toBe("idle");
    expect(fake.reload).not.toHaveBeenCalled();
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

test("with no hint the shell is asked first and its success is the answer", async () => {
  const hook = accept();
  await prepare({ hook });
  const editMode = await import("../../src/core/edit-mode.js");
  expect(editMode.canEdit).toBe(false);

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({
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

test("the real save flush writes pending text while a delegated exit waits", async () => {
  const held = hold();
  const hook = jest.fn(() => held.promise);
  await bootEditor({ hook });
  const editMode = await import("../../src/core/edit-mode.js");
  const save = await import("../../src/core/save.js");
  save.releaseBootSettle();
  expect(save.baselineSettled()).toBe(true);

  const posts = [];
  window.fetch = jest.fn(async (input, options = {}) => {
    if (options.method === "POST") {
      posts.push(String(options.body));
      return response({ body: JSON.stringify({ msg: "Saved" }) });
    }
    if (String(input).includes("/_/meta")) return okMeta({ writable: true });
    return response({ ok: false, status: 404 });
  });

  const content = document.querySelector("#content");
  content.textContent = "pending user text";
  content.dispatchEvent(new Event("input", { bubbles: true }));

  const pending = editMode.setMode("view");
  const transition = await import("../../src/core/mode-transition.js");
  expect(transition.operationKind()).toBeNull();
  expect(editMode.modeLifecycle.state.phase).toBe("idle");

  await expect(window.clay.save.flush({ timeoutMs: 3000 })).resolves.toMatchObject({ state: "saved" });
  expect(posts.some((body) => body.includes("pending user text"))).toBe(true);
  expect(editMode.modeLifecycle.state.phase).toBe("idle");

  held.resolve({ ok: false, reason: "host-timeout" });
  await expect(pending).resolves.toMatchObject({ ok: false, mode: "edit", code: "host-timeout" });
});

test("a pending delegated edit makes the opposing request busy and asks the shell once", async () => {
  const held = hold();
  const hook = jest.fn(() => held.promise);
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");

  const pending = editMode.setMode("edit");
  await settle();

  await expect(editMode.setMode("view")).resolves.toEqual({ ok: false, mode: "view", code: "busy" });
  expect(hook).toHaveBeenCalledTimes(1);

  held.resolve({ ok: true, mode: "edit", changed: true, reloading: true });
  await expect(pending).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
  expect(hook).toHaveBeenCalledTimes(1);
});

test("two edit calls that both fall back on host-unsupported share one fetch and one reload", async () => {
  const hook = jest.fn(async () => ({ ok: false, mode: "edit", changed: false, reason: "host-unsupported" }));
  await prepare({ cookie: true, hook });
  const editMode = await import("../../src/core/edit-mode.js");
  const fetches = jest.fn(async () => response({ ok: false, status: 404 }));
  window.fetch = fetches;

  await withFakeLocation(async (fake) => {
    const first = editMode.setMode("edit");
    const second = editMode.setMode("edit");
    const [a, b] = await Promise.all([first, second]);

    expect(a).toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
    expect(b).toEqual(a);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
});

test("two local edit calls share one fetch and one reload, and the opposing ask is busy", async () => {
  await prepare({ cookie: true });
  const editMode = await import("../../src/core/edit-mode.js");
  const held = hold();
  const fetches = jest.fn(async () => held.promise);
  window.fetch = fetches;

  await withFakeLocation(async (fake) => {
    const first = editMode.setMode("edit");
    const second = editMode.setMode("edit");
    await settle();

    await expect(editMode.setMode("view")).resolves.toEqual({ ok: false, mode: "view", code: "busy" });

    held.resolve(okMeta({ writable: true }));
    await expect(first).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
    await expect(second).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
});

test("an entry whose page moved to another document cancels and reloads nothing", async () => {
  await prepare({ cookie: true });
  const editMode = await import("../../src/core/edit-mode.js");
  const held = hold();
  window.fetch = async () => held.promise;

  await withFakeLocation(async (fake) => {
    const entering = editMode.setMode("edit");
    await settle();

    fake.pathname = "/other.html";
    fake.href = "http://localhost/other.html";
    held.resolve(okMeta({ writable: true }));

    await expect(entering).resolves.toEqual({ ok: false, mode: "view", code: "cancelled" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
  expect(sessionStorage.getItem("clay:doc:/other.html:mode-receipt")).toBeNull();
});

test("with no hint and no shell the host's own answer enters edit", async () => {
  await prepare();
  const editMode = await import("../../src/core/edit-mode.js");
  expect(editMode.canEdit).toBe(false);
  window.fetch = async (input) =>
    String(input).includes("/_/meta")
      ? okMeta({ writable: true })
      : response({ ok: false, status: 404 });

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(JSON.parse(sessionStorage.getItem(RECEIPT_KEY()))).toMatchObject({
    mode: "edit",
    canEdit: true,
    internal: true,
  });
});

test("a viewonly document refuses entry even when the host answers true", async () => {
  await prepare({ viewonly: true });
  const editMode = await import("../../src/core/edit-mode.js");
  window.fetch = async (input) =>
    String(input).includes("/_/meta")
      ? okMeta({ writable: true })
      : response({ ok: false, status: 404 });

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "view", code: "not-allowed" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("the shortcut toasts what a workspace timeout means", async () => {
  const hook = jest.fn(async () => ({ ok: false, reason: "host-timeout" }));
  await prepare({ cookie: true, hook });
  const toast = jest.fn();

  await withFakeLocation(async (fake) => {
    await load();
    window.clay.toast = toast;
    press();
    await settle();

    expect(toast).toHaveBeenCalledWith("The workspace didn't answer, so this page stays as it was.", "error");
    expect(fake.reload).not.toHaveBeenCalled();
  });
});

test("a menu refusal says what the shell said instead of blaming the save", async () => {
  const hook = jest.fn(async () => ({ ok: false, reason: "host-timeout" }));
  await bootMenu({ hook });

  await withFakeLocation(async (fake) => {
    document.querySelector(".clay-menu-edit").click();
    await settle();

    const note = document.querySelector(".clay-menu-note");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe("The workspace didn't answer, so this page stays as it was.");
    expect(note.textContent).not.toBe("Couldn't save, so this page stays in edit mode.");
    expect(fake.reload).not.toHaveBeenCalled();
  });
});

test("a menu refusal with an unknown code falls back to a general message", async () => {
  const hook = jest.fn(async () => ({ ok: false, reason: "host-refused" }));
  await bootMenu({ hook });

  await withFakeLocation(async () => {
    document.querySelector(".clay-menu-edit").click();
    await settle();

    expect(document.querySelector(".clay-menu-note").textContent).toBe("Couldn't switch modes.");
  });
});

test("a busy or cancelled refusal says nothing", async () => {
  const busy = jest.fn(async () => ({ ok: false, reason: "busy" }));
  await bootMenu({ hook: busy });

  await withFakeLocation(async (fake) => {
    document.querySelector(".clay-menu-edit").click();
    await settle();

    const note = document.querySelector(".clay-menu-note");
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe("");
    expect(fake.reload).not.toHaveBeenCalled();
  });

  await prepare({ cookie: true });
  const toast = jest.fn();
  const held = hold();
  window.fetch = async () => held.promise;

  await withFakeLocation(async (fake) => {
    await load();
    window.clay.toast = toast;
    press();
    await settle();

    fake.pathname = "/other.html";
    fake.href = "http://localhost/other.html";
    held.resolve(okMeta({ writable: true }));
    await settle();

    expect(toast).not.toHaveBeenCalled();
    expect(fake.reload).not.toHaveBeenCalled();
  });
});

test("the SEO sheet's Edit toasts the permission refusal", async () => {
  const hook = jest.fn(async () => ({ ok: false, reason: "permission-denied" }));
  await bootMenu({ hook, edit: false });
  const toast = jest.fn();
  window.clay.toast = toast;

  document.querySelector(".clay-menu-goo").click();
  await settle();
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((button) => button.dataset.menuId === "seo");
  expect(item).toBeDefined();
  item.click();
  await settle();

  await withFakeLocation(async (fake) => {
    document.querySelector(".clay-seo-edit").click();
    await settle();

    expect(toast).toHaveBeenCalledWith("You don't have permission to edit this document.", "error");
    expect(fake.reload).not.toHaveBeenCalled();
  });
});
