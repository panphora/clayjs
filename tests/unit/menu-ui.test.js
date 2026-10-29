import { jest } from "@jest/globals";

// Scenario: the rebuilt menu dock draws fixed slots, separators, kbd hints, disabled
// items, pairs and a version line, keeps focus across a re-render, and still puts
// nothing into the saved file. Every case boots through the real loader with
// `plugins=menu`, because that is where the plugin is named.

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

const dockOf = () => document.querySelector(".clay-menu-dock");
const menuRoot = () => document.querySelector(".clay-menu");
const listOf = () => document.querySelector(".clay-menu-list");
const gooOf = () => document.querySelector(".clay-menu-goo");
const itemButtons = () => [...document.querySelectorAll('[role="menuitem"]')];
const labelsOf = () => itemButtons().map((button) => button.textContent);
const buttonOf = (id) => document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

test("the dock holds a capsule with fixed children, the list, the note and its stylesheet", async () => {
  await boot();

  const dock = dockOf();
  expect(dock).not.toBeNull();
  expect(dock.getAttribute("clay")).toBe("editor-ui");
  expect(dock.dataset.corner).toBe("top-right");

  const capsule = menuRoot();
  expect(capsule).not.toBeNull();
  expect([...capsule.children].map((child) => child.className)).toEqual([
    "clay-menu-grip",
    "clay-menu-edit",
    "clay-menu-divider",
    "clay-menu-goo",
  ]);

  expect(dock.contains(listOf())).toBe(true);
  expect(dock.contains(document.querySelector(".clay-menu-note"))).toBe(true);

  const style = document.getElementById("clay-menu-style");
  expect(style).not.toBeNull();
  expect(style.parentElement).toBe(document.head);
  expect(style.getAttribute("clay")).toBe("editor-ui");
});

test("fixed slots beat registration order, with one separator between each group", async () => {
  await boot();
  const menu = window.clay.menu;

  menu.addItem({ id: "upgrade", label: "Upgrade to version 2" });
  menu.addItem({ id: "thirdparty", label: "Third" });
  menu.addItem({ id: "clay.hide", label: "Hide menu" });
  menu.addItem({ id: "clay.download", label: "Download a copy" });
  menu.addItem({ id: "clay.cms", label: "Open the CMS (Edit content)" });

  expect(labelsOf()).toEqual([
    "Open the CMS (Edit content)",
    "SEO settings…",
    "Download a copy",
    "Hide menu",
    "Third",
    "Upgrade to version 2",
  ]);

  const list = listOf();
  const separators = [...list.querySelectorAll(".clay-menu-sep")];
  expect(separators).toHaveLength(5);
  for (const separator of separators) expect(separator.getAttribute("role")).toBe("separator");

  expect(list.firstElementChild.classList.contains("clay-menu-sep")).toBe(false);
  expect(list.lastElementChild.classList.contains("clay-menu-sep")).toBe(false);
  expect(list.children).toHaveLength(11);

  itemButtons().forEach((button, index) => {
    if (index === 0) return;
    expect(button.previousElementSibling.classList.contains("clay-menu-sep")).toBe(true);
  });
});

test("keys render as a kbd after the label", async () => {
  await boot();

  window.clay.menu.addItem({ id: "clay.ai", label: "Ask AI…", keys: "⌘J" });

  const button = buttonOf("clay.ai");
  const kbd = button.querySelector("kbd");
  expect(kbd).not.toBeNull();
  expect(kbd.textContent).toBe("⌘J");
  expect(button.textContent.startsWith("Ask AI…")).toBe(true);
});

test("a disabled item is skipped by the keyboard and by clicks", async () => {
  await boot();
  const ran = jest.fn();
  const menu = window.clay.menu;

  menu.addItem({ id: "clay.x", label: "Nope", disabled: true, run: ran });
  menu.addItem({ id: "after", label: "After", run: () => {} });

  const disabled = buttonOf("clay.x");
  expect(disabled.getAttribute("aria-disabled")).toBe("true");

  const goo = gooOf();
  goo.focus();
  press(goo, "Enter");
  expect(listOf().hidden).toBe(false);

  click(disabled);
  expect(ran).not.toHaveBeenCalled();
  expect(listOf().hidden).toBe(false);

  expect(document.activeElement).toBe(buttonOf("seo"));
  press(buttonOf("seo"), "ArrowDown");
  expect(document.activeElement).toBe(buttonOf("clay.download"));
  press(buttonOf("clay.download"), "ArrowDown");
  expect(document.activeElement).toBe(buttonOf("clay.hide"));
  press(buttonOf("clay.hide"), "ArrowDown");
  expect(document.activeElement).toBe(buttonOf("after"));

  press(buttonOf("after"), "ArrowUp");
  expect(document.activeElement).toBe(buttonOf("clay.hide"));
});

test("a pair renders two buttons and only the enabled half runs", async () => {
  await boot();
  const u = jest.fn();

  window.clay.menu.addItem({
    id: "clay.undo",
    pair: [
      { id: "clay.undo.u", label: "Undo", keys: "⌘Z", run: u },
      { id: "clay.undo.r", label: "Redo", keys: "⌘⇧Z", disabled: true },
    ],
  });

  const pair = document.querySelector(".clay-menu-pair");
  expect(pair).not.toBeNull();
  const inside = [...pair.querySelectorAll('[role="menuitem"]')];
  expect(inside).toHaveLength(2);
  expect(inside[1].getAttribute("aria-disabled")).toBe("true");

  click(inside[0]);
  expect(u).toHaveBeenCalledTimes(1);
});

test("a text item renders as a version line, not a menu item", async () => {
  await boot();

  window.clay.menu.addItem({ id: "upgrade", label: "This doc is at latest version (1.4.0)", text: true });

  const line = document.querySelector("p.clay-menu-version");
  expect(line).not.toBeNull();
  expect(line.textContent).toBe("This doc is at latest version (1.4.0)");
  expect(buttonOf("upgrade")).toBeNull();
});

test("focus survives a re-render", async () => {
  await boot();

  window.clay.menu.addItem({ id: "thirdparty", label: "Third" });
  click(gooOf());
  expect(listOf().hidden).toBe(false);

  const seo = buttonOf("seo");
  seo.focus();
  expect(document.activeElement).toBe(seo);

  window.clay.menu.addItem({ id: "upgrade", label: "Upgrade" });
  await flush();

  expect(document.activeElement).toBe(buttonOf("seo"));
  expect(document.activeElement.dataset.menuId).toBe("seo");
});

test("removeItem drops the item and its now-empty section's separator", async () => {
  await boot();

  window.clay.menu.addItem({ id: "thirdparty", label: "Third" });
  expect(buttonOf("thirdparty")).not.toBeNull();
  expect(document.querySelectorAll(".clay-menu-sep")).toHaveLength(3);

  window.clay.menu.removeItem("thirdparty");

  expect(buttonOf("thirdparty")).toBeNull();
  expect(document.querySelectorAll(".clay-menu-sep")).toHaveLength(2);
  expect(labelsOf()).toEqual(["SEO settings…", "Download a copy", "Hide menuCtrl+Shift+."]);
});

test("a badge puts a hidden dot on claygoo and marks the upgrade item", async () => {
  await boot();

  window.clay.menu.addItem({ id: "upgrade", label: "Upgrade", badge: true });

  const dot = document.querySelector(".clay-menu-goo .clay-menu-dot");
  expect(dot).not.toBeNull();
  expect(dot.getAttribute("aria-hidden")).toBe("true");
  expect(buttonOf("upgrade").querySelector("span.clay-menu-upgrade")).not.toBeNull();
});

test("nothing from the dock reaches the saved file", async () => {
  await boot({ edit: true });
  const menu = window.clay.menu;
  menu.addItem({ id: "clay.cms", label: "Open the CMS (Edit content)" });
  menu.addItem({ id: "upgrade", label: "Upgrade to version 2", badge: true });
  menu.addItem({ id: "thirdparty", label: "Third" });
  click(gooOf());
  expect(listOf().hidden).toBe(false);

  const html = await window.clay.getHTML();

  expect(typeof html).toBe("string");
  expect(html).not.toContain("clay-menu-dock");
  expect(html).not.toContain("clay-menu-list");
  expect(html).not.toContain("clay-menu-style");
  expect(html).not.toContain("Open the CMS");
});

test("the stylesheet carries the phone and scheme rules", async () => {
  await boot();

  const css = document.getElementById("clay-menu-style").textContent;

  expect(css).toContain("@media (pointer: coarse), (max-width: 680px)");
  expect(css).toContain("font-size: 16px");
  expect(css).toContain("max-height: calc(100dvh - 72px)");
  expect(css).toContain("light-dark(");
});
