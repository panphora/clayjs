import { jest } from "@jest/globals";

// Scenario: a tab in view keeps nothing typed into it, so the first edit a person
// who can edit makes to a field that would save in edit raises a notice that stays
// until the tab edits. Fields edit mode would unlock raise it on the attempt, a
// keystroke the page already handled never does, and the notice is never page content.

const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
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

const noteRoots = () => [...document.querySelectorAll('clay-editor-ui[data-clay-ui="mode-note"]')].map((host) => host.shadowRoot);
const notice = () => noteRoots().map((root) => root.querySelector(".clay-view-notice")).find(Boolean) ?? null;
const type = (el) => el.dispatchEvent(new Event("input", { bubbles: true }));
const key = (target, k, extra = {}) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
};

const FIELD_BODY = '<section id="entries"><article><textarea persist id="t"></textarea></article></section>';
const INERT_BODY = '<div id="card" editmode:contenteditable>hello</div>';

function inertCard() {
  document.body.innerHTML = INERT_BODY;
  const el = document.getElementById("card");
  if (!el.hasAttribute("editmode:contenteditable")) el.setAttribute("editmode:contenteditable", "");
  const range = document.createRange();
  range.setStart(el.firstChild, 2);
  range.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  return el;
}

afterEach(() => jest.restoreAllMocks());

test("typing in a persist textarea in view raises the notice", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: FIELD_BODY });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).not.toBeNull();
  expect(notice().textContent).toContain("In view mode, so edits won't be saved.");
  expect(notice().querySelector("button").textContent).toBe("Switch to edit");
  expect(notice().getAttribute("role")).toBe("alert");
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a second edit does not add a second notice", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: FIELD_BODY });
  await load();
  await tick();

  const field = document.getElementById("t");
  type(field);
  type(field);

  await tick();
  expect(noteRoots().flatMap((root) => [...root.querySelectorAll(".clay-view-notice")]).length).toBe(1);
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a live contenteditable in saved content raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<div id="c" contenteditable="true">x</div>' });
  await load();
  await tick();

  const el = document.getElementById("c");
  // jsdom does not implement isContentEditable, so the element has to say it itself.
  Object.defineProperty(el, "isContentEditable", { value: true });
  type(el);

  await tick();
  expect(notice()).not.toBeNull();
});

test("a search box without persist never raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<input id="q" type="search">' });
  await load();
  await tick();

  type(document.getElementById("q"));

  await tick();
  expect(notice()).toBeNull();
});

test("a persist field inside editor-ui never raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<div clay="editor-ui"><textarea persist id="t"></textarea></div>' });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).toBeNull();
});

test("a persist field inside no-save never raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<div clay="no-save"><textarea persist id="t"></textarea></div>' });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).toBeNull();
});

test("a visitor who cannot edit never sees it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: false, token: false, body: FIELD_BODY });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).toBeNull();
});

test("edit mode never shows it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ url: `${SLOT}?editmode=true`, cookie: true, body: FIELD_BODY });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).toBeNull();
});

test("a save token alone counts as able to edit", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ token: true, body: FIELD_BODY });
  await load();
  await tick();

  type(document.getElementById("t"));

  await tick();
  expect(notice()).not.toBeNull();
});

test("typing at an inert contenteditable raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true });
  await load();
  await tick();

  inertCard();
  key(document.body, "a");

  await tick();
  expect(notice()).not.toBeNull();
});

test("a keystroke the page already handled does not raise it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true });
  await load();
  await tick();
  document.addEventListener("keydown", (e) => e.preventDefault());

  inertCard();
  key(document.body, "j");

  await tick();
  expect(notice()).toBeNull();
});

test("space and shortcut chords do not raise it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true });
  await load();
  await tick();

  inertCard();
  key(document.body, " ");
  key(document.body, "a", { metaKey: true });
  key(document.body, "a", { ctrlKey: true });

  await tick();
  expect(notice()).toBeNull();
});

test("typing at a viewmode:readonly field raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<input id="r" viewmode:readonly readonly>' });
  await load();
  await tick();

  const el = document.getElementById("r");
  if (!el.hasAttribute("viewmode:readonly")) el.setAttribute("viewmode:readonly", "");
  key(el, "a");

  await tick();
  expect(notice()).not.toBeNull();
});

test("pressing on a viewmode:disabled field raises it", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: '<input id="d" type="checkbox" viewmode:disabled disabled>' });
  await load();
  await tick();

  const el = document.getElementById("d");
  if (!el.hasAttribute("viewmode:disabled")) el.setAttribute("viewmode:disabled", "");
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

  await tick();
  expect(notice()).not.toBeNull();
});

test("Switch to edit asks for edit", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: FIELD_BODY });

  await withFakeLocation(async (fake) => {
    await load();
    await tick();

    type(document.getElementById("t"));
    await tick();
    expect(notice()).not.toBeNull();

    notice().querySelector("button").click();
    await tick();

    expect(fake.reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(RECEIPT_KEY()))).toMatchObject({ mode: "edit" });
  });
});

test("the notice never appears in clay.getHTML()", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await prepare({ cookie: true, body: FIELD_BODY });
  await load();
  await tick();

  type(document.getElementById("t"));
  await tick();
  expect(notice()).not.toBeNull();

  const { getPageContents } = await import("../../src/core/snapshot.js");
  const html = getPageContents();

  expect(html).not.toContain("clay-view-notice");
  expect(html).not.toContain("clay-editor-ui");
});
