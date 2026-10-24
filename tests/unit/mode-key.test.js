import { jest } from "@jest/globals";

// Scenario: Mod+Shift+E is the way into edit for a document with no toggle of its
// own, and the first time an owner opens such a document in view a note says so.
// Every case gets its own module load, and its own document listeners: both
// is-edit-mode.js and mode-key.js decide once, at evaluation, and a keydown
// listener outlives jest.resetModules().

const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const RECEIPT_KEY = () => `clay:doc:${location.pathname}:mode-receipt`;
const SLOT = "/notes.html";

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

async function prepare({ url = SLOT, cookie = false, token = false, draft = false, body = null, keepStorage = false } = {}) {
  dropListeners();
  jest.resetModules();
  sessionStorage.clear();
  if (!keepStorage) localStorage.clear();
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", url);
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (token) root.setAttribute("savetoken", "tok-123");
  if (draft) root.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = body ?? '<div id="content">start</div>';
  const { storage } = await import("../../src/lib/doc-storage.js");
  window.clay = { storage };
  return storage;
}

async function load({ draft = false } = {}) {
  if (draft) {
    const draftMode = await import("../../src/core/draft-mode.js");
    draftMode.noteBootParams(new URLSearchParams("plugins=visitor-drafts"));
  }
  return import("../../src/core/mode-key.js");
}

async function tick() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function press(extra = {}) {
  const init = { key: "E", code: "KeyE", shiftKey: true, bubbles: true, cancelable: true, ...extra };
  if (MAC) init.metaKey = true;
  else init.ctrlKey = true;
  const event = new KeyboardEvent("keydown", init);
  if (extra.isComposing) Object.defineProperty(event, "isComposing", { value: true });
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

const note = () => document.querySelector(".clay-mode-note");

afterEach(() => jest.restoreAllMocks());

test("with the owner cookie in view, Mod+Shift+E switches to edit and writes the internal receipt", async () => {
  await prepare({ cookie: true });

  await withFakeLocation(async (fake) => {
    await load();
    const event = press();
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(fake.reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(RECEIPT_KEY()))).toMatchObject({
      v: 1,
      path: SLOT,
      mode: "edit",
      canEdit: true,
      internal: true,
    });
  });
});

test("without permission the shortcut does nothing", async () => {
  await prepare();

  await withFakeLocation(async (fake) => {
    await load();
    const event = press();
    await tick();

    expect(event.defaultPrevented).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
  });
});

test("during composition the shortcut does nothing", async () => {
  await prepare({ cookie: true });

  await withFakeLocation(async (fake) => {
    await load();
    const event = press({ isComposing: true });
    await tick();

    expect(event.defaultPrevented).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
  });
});

test("in draft mode the shortcut does nothing", async () => {
  await prepare({ draft: true });

  await withFakeLocation(async (fake) => {
    await load({ draft: true });
    const event = press();
    await tick();

    expect(event.defaultPrevented).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
  });
});

test("the note shows once for an owner in view", async () => {
  const storage = await prepare({ cookie: true });
  await load();
  await tick();

  expect(note()).not.toBeNull();
  expect(note().textContent).toContain("This page opens in view mode.");
  expect(note().getAttribute("clay")).toBe("editor-ui");
  expect(note().getAttribute("role")).toBe("status");
  expect(document.getElementById("clay-mode-note-style").getAttribute("clay")).toBe("editor-ui");
  expect(storage.local.get("mode-note")).toBe(true);
});

test("a second load on the same document shows no note", async () => {
  await prepare({ cookie: true });
  await load();
  await tick();
  expect(note()).not.toBeNull();

  await prepare({ cookie: true, keepStorage: true });
  await load();
  await tick();

  expect(note()).toBeNull();
});

test("a document with its own toggle gets no note", async () => {
  const storage = await prepare({ cookie: true, body: '<button clay-mode-toggle>Edit</button>' });
  await load();
  await tick();

  expect(note()).toBeNull();
  expect(storage.local.get("mode-note")).toBeUndefined();
});

test("edit mode gets no note", async () => {
  const storage = await prepare({ url: `${SLOT}?editmode=true`, cookie: true });
  await load();
  await tick();

  expect(note()).toBeNull();
  expect(storage.local.get("mode-note")).toBeUndefined();
});

test("a save token alone, with no cookie, shows the note", async () => {
  await prepare({ token: true });
  await load();
  await tick();

  expect(note()).not.toBeNull();
});

test("the note never appears in clay.getHTML()", async () => {
  await prepare({ cookie: true });
  await load();
  await tick();
  expect(note()).not.toBeNull();

  const { getPageContents } = await import("../../src/core/snapshot.js");
  const html = getPageContents();

  expect(html).not.toContain("clay-mode-note");
  expect(html).not.toContain("This page opens in view mode.");
});
