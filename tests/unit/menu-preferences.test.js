import { jest } from "@jest/globals";

// Scenario: the first-use notice counts opens per browser for the whole origin and can
// be dismissed for good; the Hide menu item and its shortcut hide the dock until the
// page reloads and offer a toast that brings it back, and none of it reaches the saved
// file. Every case boots through the real loader with `plugins=menu`.

const SLOT = "/notes.html";
const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const BODY = '<div id="content">start</div>';
const INTRO_KEY = "clay:menu:intro-v1";

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({
  cookie = true,
  draft = false,
  edit = false,
  body = BODY,
  introBottom = null,
  keepStorage = false,
  path = SLOT,
} = {}) {
  jest.resetModules();
  if (!keepStorage) {
    sessionStorage.clear();
    localStorage.clear();
  }
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (draft) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  window.history.replaceState({}, "", edit ? `${path}?editmode=true` : path);
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = body;
  const intro = document.querySelector(".clay-intro");
  if (intro && introBottom != null) {
    intro.getBoundingClientRect = () => ({ top: 0, bottom: introBottom, height: introBottom, left: 0, right: 0, width: 0 });
  }
  window.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  });
  window.clay = {};
  const params = new URLSearchParams(
    draft ? "plugins=menu,visitor-drafts&exclude=richclay,source" : "plugins=menu&exclude=richclay,source",
  );
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

const dockOf = () => document.querySelector(".clay-menu-dock");
const listOf = () => document.querySelector(".clay-menu-list");
const gooOf = () => document.querySelector(".clay-menu-goo");
const noticeOf = () => document.querySelector(".clay-menu-notice");
const recallOf = () => document.querySelector('.clay-menu-recall[clay="editor-ui"][role="status"]');
const buttonOf = (id) => document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`);
const itemButtons = () => [...document.querySelectorAll('[role="menuitem"]')];

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

function shortcut(props = {}) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Period",
      ctrlKey: true,
      shiftKey: true,
      ...props,
    }),
  );
}

const openList = () => click(gooOf());
const closeList = () => click(gooOf());

afterEach(() => {
  jest.useRealTimers();
});

test("the notice shows on the first three opens and never again", async () => {
  await boot();

  openList();
  expect(noticeOf()).not.toBeNull();
  expect(noticeOf().textContent).toContain("Only editors see this menu.");
  expect(noticeOf().textContent).toContain("Visitors never do.");

  window.clay.menu.open();
  expect(noticeOf()).not.toBeNull();

  closeList();
  expect(noticeOf()).toBeNull();

  openList();
  expect(noticeOf()).not.toBeNull();
  closeList();
  openList();
  expect(noticeOf()).not.toBeNull();
  closeList();
  openList();
  expect(noticeOf()).toBeNull();
});

test("opens are counted per browser, not per document", async () => {
  await boot();

  openList();
  expect(noticeOf()).not.toBeNull();
  closeList();
  openList();
  expect(noticeOf()).not.toBeNull();
  closeList();

  await boot({ keepStorage: true, path: "/other.html" });

  expect(window.location.pathname).toBe("/other.html");
  openList();
  expect(noticeOf()).not.toBeNull();
  closeList();
  openList();
  expect(noticeOf()).toBeNull();
});

test("dismissing the notice keeps it away and moves focus to the first item", async () => {
  await boot();
  openList();

  click(noticeOf().querySelector("button"));

  expect(noticeOf()).toBeNull();
  expect(document.activeElement).toBe(itemButtons()[0]);
  expect(JSON.parse(localStorage[INTRO_KEY]).dismissed).toBe(true);

  closeList();
  openList();
  expect(noticeOf()).toBeNull();
});

test("the Hide menu item hides the dock and offers the recall toast", async () => {
  await boot();
  openList();

  const hide = buttonOf("clay.hide");
  expect(hide).not.toBeNull();
  expect(hide.querySelector("kbd")).not.toBeNull();

  click(hide);

  expect(dockOf().hidden).toBe(true);
  const recall = recallOf();
  expect(recall).not.toBeNull();
  expect(recall.parentElement).toBe(document.body);
  const show = [...recall.querySelectorAll("button")].find((button) => button.textContent === "Show menu");
  expect(show).toBeDefined();
});

test("Show menu brings the dock back and drops the toast", async () => {
  await boot();
  openList();
  click(buttonOf("clay.hide"));

  const show = [...recallOf().querySelectorAll("button")].find((button) => button.textContent === "Show menu");
  click(show);

  expect(dockOf().hidden).toBe(false);
  expect(recallOf()).toBeNull();
  expect(document.activeElement).toBe(gooOf());
});

test("the toast fades at eight seconds and goes 450 ms later, and the dock stays hidden", async () => {
  await boot();
  jest.useFakeTimers();

  openList();
  click(buttonOf("clay.hide"));
  expect(recallOf()).not.toBeNull();

  jest.advanceTimersByTime(7999);
  expect(recallOf()).not.toBeNull();
  expect(recallOf().hasAttribute("data-fading")).toBe(false);

  jest.advanceTimersByTime(1);
  expect(recallOf()).not.toBeNull();
  expect(recallOf().hasAttribute("data-fading")).toBe(true);

  jest.advanceTimersByTime(450);
  expect(recallOf()).toBeNull();
  expect(dockOf().hidden).toBe(true);
});

test("Ctrl+Shift+. hides and restores, and ignores a repeat or a missing shift", async () => {
  await boot();

  shortcut({ shiftKey: false });
  expect(dockOf().hidden).toBe(false);

  shortcut({ repeat: true });
  expect(dockOf().hidden).toBe(false);

  shortcut();
  expect(dockOf().hidden).toBe(true);

  shortcut({ repeat: true });
  expect(dockOf().hidden).toBe(true);

  shortcut();
  expect(dockOf().hidden).toBe(false);
});

test("a hidden dock comes back on the next load", async () => {
  await boot();
  openList();
  click(buttonOf("clay.hide"));
  expect(dockOf().hidden).toBe(true);

  await boot();

  expect(dockOf().hidden).toBe(false);
});

test("a capability change does not reveal a hidden menu", async () => {
  await boot();
  openList();
  click(buttonOf("clay.hide"));
  expect(dockOf().hidden).toBe(true);

  document.dispatchEvent(new Event("clay:capabilitychange"));
  await flush();

  expect(dockOf().hidden).toBe(true);
});

test("nothing from the toast or the notice is saved", async () => {
  await boot({ edit: true });
  openList();
  click(buttonOf("clay.hide"));
  expect(recallOf()).not.toBeNull();

  openList();
  expect(noticeOf()).not.toBeNull();
  expect(recallOf()).not.toBeNull();

  const html = await window.clay.getHTML();

  expect(typeof html).toBe("string");
  expect(html).not.toContain("clay-menu-recall");
  expect(html).not.toContain("clay-menu-notice");
  expect(html).not.toContain("clay-menu-spots");
  expect(listOf()).not.toBeNull();
});
