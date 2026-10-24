import { jest } from "@jest/globals";

// Scenario: a document that loads `plugins=menu` shows anyone who can edit a small
// fixed group in the top right, an Edit switch and claygoo, and nothing from it ever
// reaches the saved file, a sync frame, the dirty check or undo. Every case boots
// through the real loader, because that is where the plugin is named and where
// `clay.menu` is attached.

const SLOT = "/notes.html";
const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const BODY = '<div id="content">start</div>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ cookie = true, draft = false, edit = false, body = BODY, introBottom = null } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (draft) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
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

const menuRoot = () => document.querySelector(".clay-menu");
const listOf = () => document.querySelector(".clay-menu-list");
const gooOf = () => document.querySelector(".clay-menu-goo");
const editOf = () => document.querySelector(".clay-menu-edit");
const itemButtons = () => [...document.querySelectorAll('[role="menuitem"]')];

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

test("mounts for an owner in view: switch, claygoo and clay.menu", async () => {
  await boot();

  const root = menuRoot();
  expect(root).not.toBeNull();
  expect(root.getAttribute("clay")).toBe("editor-ui");
  expect(root.hasAttribute("clay-mode-toggle")).toBe(true);

  expect(editOf().getAttribute("role")).toBe("switch");
  expect(editOf().getAttribute("aria-checked")).toBe("false");
  expect(editOf().querySelector(".clay-menu-track .clay-menu-thumb")).not.toBeNull();

  expect(gooOf().getAttribute("aria-haspopup")).toBe("menu");
  expect(gooOf().getAttribute("aria-expanded")).toBe("false");
  expect(gooOf().getAttribute("aria-label")).toBe("Clay menu");
  expect(gooOf().querySelector("svg")).not.toBeNull();

  expect(listOf().getAttribute("role")).toBe("menu");
  expect(listOf().hidden).toBe(true);

  expect(typeof window.clay.menu.addItem).toBe("function");
  expect(typeof window.clay.menu.open).toBe("function");
  expect(typeof window.clay.menu.close).toBe("function");

  // 02's note stays off because the document now carries its own toggle.
  expect(document.querySelector("[clay-mode-toggle]")).not.toBeNull();
  expect(document.querySelector(".clay-mode-note")).toBeNull();

  const style = document.getElementById("clay-menu-style");
  expect(style.getAttribute("clay")).toBe("editor-ui");
});

test("mounts in edit mode with the switch on", async () => {
  await boot({ edit: true });

  expect(menuRoot()).not.toBeNull();
  expect(editOf().getAttribute("aria-checked")).toBe("true");
});

test("does not mount without permission", async () => {
  await boot({ cookie: false });

  expect(window.clay.canEdit).toBe(false);
  expect(menuRoot()).toBeNull();
  expect(window.clay.menu).toBeUndefined();
});

test("does not mount in a visitor's draft", async () => {
  await boot({ draft: true });

  expect(window.clay.isDraftMode).toBe(true);
  expect(menuRoot()).toBeNull();
  expect(window.clay.menu).toBeUndefined();
});

test("a click on the switch calls setMode('edit') once and stays busy while it resolves", async () => {
  await boot();
  const edit = editOf();
  let settle;
  const setMode = jest.spyOn(window.clay, "setMode").mockImplementation(
    () => new Promise((resolve) => { settle = resolve; }),
  );

  click(edit);
  await flush();

  expect(setMode).toHaveBeenCalledTimes(1);
  expect(setMode).toHaveBeenCalledWith("edit");
  expect(edit.getAttribute("aria-busy")).toBe("true");
  expect(edit.disabled).toBe(true);

  click(edit);
  await flush();
  expect(setMode).toHaveBeenCalledTimes(1);

  settle({ ok: true, mode: "edit", changed: true, reloading: true });
  await flush();
  expect(edit.getAttribute("aria-busy")).toBe("true");
});

test("a refused setMode restores the switch, clears busy and shows the reason", async () => {
  await boot();
  const edit = editOf();
  const note = document.querySelector(".clay-menu-note");
  const setMode = jest.spyOn(window.clay, "setMode")
    .mockResolvedValue({ ok: false, mode: "view", code: "save-failed" });

  click(edit);
  await flush();

  expect(edit.getAttribute("aria-checked")).toBe("false");
  expect(edit.hasAttribute("aria-busy")).toBe(false);
  expect(edit.disabled).toBe(false);
  expect(note.hidden).toBe(false);
  expect(note.textContent).toBe("Couldn't save, so this page stays in edit mode.");

  setMode.mockResolvedValue({ ok: false, mode: "view", code: "locked", message: "Someone else is editing this page." });
  click(edit);
  await flush();

  expect(note.textContent).toBe("Someone else is editing this page.");
  expect(edit.getAttribute("aria-checked")).toBe("false");
  expect(edit.disabled).toBe(false);
});

test("claygoo opens the list on click and on Enter", async () => {
  await boot();
  const goo = gooOf();
  const list = listOf();

  click(goo);
  expect(list.hidden).toBe(false);
  expect(goo.getAttribute("aria-expanded")).toBe("true");

  click(goo);
  expect(list.hidden).toBe(true);
  expect(goo.getAttribute("aria-expanded")).toBe("false");

  goo.focus();
  press(goo, "Enter");
  expect(list.hidden).toBe(false);
  expect(goo.getAttribute("aria-expanded")).toBe("true");
});

test("arrow keys move between items, and Escape closes and focuses claygoo", async () => {
  await boot();
  const menu = window.clay.menu;
  menu.addItem({ id: "one", label: "One", run: () => {} });
  menu.addItem({ id: "two", label: "Two", run: () => {} });

  const goo = gooOf();
  goo.focus();
  click(goo);

  press(goo, "ArrowDown");
  expect(document.activeElement).toBe(itemButtons()[0]);

  press(itemButtons()[0], "ArrowDown");
  expect(document.activeElement).toBe(itemButtons()[1]);

  press(itemButtons()[1], "ArrowUp");
  expect(document.activeElement).toBe(itemButtons()[0]);

  const escaped = press(itemButtons()[0], "Escape");
  expect(escaped.defaultPrevented).toBe(true);
  expect(listOf().hidden).toBe(true);
  expect(document.activeElement).toBe(goo);
});

test("Enter runs the focused item and closes the list", async () => {
  await boot();
  const ran = jest.fn();
  window.clay.menu.addItem({ id: "copy", label: "Save a copy", run: ran });
  const goo = gooOf();

  click(goo);
  press(itemButtons()[0], "Enter");

  expect(ran).toHaveBeenCalledTimes(1);
  expect(listOf().hidden).toBe(true);
});

test("a click outside closes the list", async () => {
  await boot();
  click(gooOf());
  expect(listOf().hidden).toBe(false);

  click(document.body);
  expect(listOf().hidden).toBe(true);
});

test("addItem appends items and a duplicate id replaces", async () => {
  await boot();
  const menu = window.clay.menu;
  const labels = () => itemButtons().map((button) => button.textContent);

  menu.addItem({ id: "copy", label: "Save a copy" });
  menu.addItem({ id: "share", label: "Share" });
  expect(labels()).toEqual(["Save a copy", "Share"]);

  menu.addItem({ id: "copy", label: "Download" });
  expect(labels()).toEqual(["Download", "Share"]);
});

test("a badge shows a dot on claygoo", async () => {
  await boot();
  const menu = window.clay.menu;
  const goo = gooOf();
  expect(goo.querySelector(".clay-menu-dot")).toBeNull();

  menu.addItem({ id: "upgrade", label: "Upgrade", badge: true });
  expect(goo.querySelector(".clay-menu-dot")).not.toBeNull();

  menu.addItem({ id: "upgrade", label: "Upgrade" });
  expect(goo.querySelector(".clay-menu-dot")).toBeNull();
});

test("nothing from the menu reaches clay.getHTML()", async () => {
  await boot({ edit: true });
  window.clay.menu.addItem({ id: "copy", label: "Save a copy" });

  const html = window.clay.getHTML();

  expect(html).not.toContain("clay-menu");
  expect(html).not.toContain("--clay-menu-");
  expect(html).not.toContain("Clay menu");
});

test("with a .clay-intro on the page the group sits below its bottom edge", async () => {
  await boot({
    body: '<section class="clay-intro">About this app</section><div id="content">start</div>',
    introBottom: 120,
  });

  const root = menuRoot();
  expect(root).not.toBeNull();
  expect(parseFloat(root.style.top)).toBeGreaterThanOrEqual(120);

  document.querySelector(".clay-intro").remove();
  await flush();
  expect(root.style.top).toBe("");
});
