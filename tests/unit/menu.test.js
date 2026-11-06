import { jest } from "@jest/globals";
import { hostOf, $, $$, active, sheetText } from "./helpers/editor-ui.js";

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

const cssOfMenu = () => sheetText("menu");
const menuRoot = () => $(".clay-menu", "menu");
const listOf = () => $(".clay-menu-list", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const editOf = () => $(".clay-menu-edit", "menu");
const itemButtons = () => $$('[role="menuitem"]', "menu");

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
  expect(hostOf("menu").hasAttribute("clay-mode-toggle")).toBe(true);

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
  expect(document.querySelector('clay-editor-ui[data-clay-ui="mode-note"]')).toBeNull();

  expect(hostOf("menu").getAttribute("clay")).toBe("editor-ui");
});

test("mounts in edit mode with the switch on", async () => {
  await boot({ edit: true });

  expect(menuRoot()).not.toBeNull();
  expect(editOf().getAttribute("aria-checked")).toBe("true");
});

test("does not mount without permission", async () => {
  await boot({ cookie: false });

  expect(window.clay.canEdit).toBe(false);
  expect(hostOf("menu")).toBeNull();
  expect(window.clay.menu).toBeUndefined();
});

test("does not mount in a visitor's draft", async () => {
  await boot({ draft: true });

  expect(window.clay.isDraftMode).toBe(true);
  expect(hostOf("menu")).toBeNull();
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
  const note = $(".clay-menu-note", "menu");
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
  expect(active()).toBe(itemButtons()[0]);

  press(itemButtons()[0], "ArrowDown");
  expect(active()).toBe(itemButtons()[1]);

  press(itemButtons()[1], "ArrowUp");
  expect(active()).toBe(itemButtons()[0]);

  const escaped = press(itemButtons()[0], "Escape");
  expect(escaped.defaultPrevented).toBe(true);
  expect(listOf().hidden).toBe(true);
  expect(active()).toBe(goo);
});

test("Enter runs the focused item and closes the list", async () => {
  await boot();
  const ran = jest.fn();
  window.clay.menu.addItem({ id: "copy", label: "Save a copy", run: ran });
  const goo = gooOf();

  click(goo);
  press(itemButtons().find((button) => button.dataset.menuId === "copy"), "Enter");

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
  expect(labels()).toEqual(["SEO settings…", "Download a copy", "Save a copy", "Share"]);

  menu.addItem({ id: "copy", label: "Download" });
  expect(labels()).toEqual(["SEO settings…", "Download a copy", "Download", "Share"]);
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
  expect(hostOf("menu")).not.toBeNull();
  window.clay.menu.addItem({ id: "copy", label: "Save a copy" });

  const html = window.clay.getHTML();

  expect(html).not.toContain("clay-menu");
  expect(html).not.toContain("clay-editor-ui");
  expect(html).not.toContain("data-clay-ui");
  expect(html).not.toContain("--clay-menu-");
  expect(html).not.toContain("Clay menu");
});

test("with a .clay-intro on the page the group sits below its bottom edge", async () => {
  await boot({
    body: '<section class="clay-intro">About this app</section><div id="content">start</div>',
    introBottom: 120,
  });

  const root = $(".clay-menu-dock", "menu");
  expect(root).not.toBeNull();
  expect(parseFloat(root.style.top)).toBeGreaterThanOrEqual(120);

  document.querySelector(".clay-intro").remove();
  await flush();
  expect(root.style.top).toBe("");
});

describe("embedded in a clay-menu-slot", () => {
  const SKIN = '<style clay-menu-skin="1" media="not all">[part~="button"] { width: 40px; }</style>';
  const ICON = '<template clay-menu-icon><svg class="gear" viewBox="0 0 24 24"><path d="M1 1h2"/></svg></template>';
  const page = (slot = "", attrs = "") => `${BODY}<header><div clay-menu-slot ${attrs}>${slot}</div></header>`;
  const hostParent = () => hostOf("menu").parentElement;

  test("the menu mounts inside the first slot, with no grip and no reserved space", async () => {
    await boot({ edit: true, body: `${page()}<div clay-menu-slot id="second"></div>` });
    expect(hostParent()).toBe(document.querySelector("[clay-menu-slot]"));
    expect(window.clay.menu.embedded).toBe(true);
    expect($(".clay-menu-grip", "menu").hidden).toBe(true);
    expect(document.getElementById("clay-menu-vars").textContent).not.toContain("--clay-menu-width");
    expect(localStorage.getItem("menu-corner")).toBeNull();
  });

  test("with no slot it still floats", async () => {
    await boot({ edit: true });
    expect(hostParent()).toBe(document.body);
    expect(window.clay.menu.embedded).toBe(false);
    expect(document.getElementById("clay-menu-vars").textContent).toContain("--clay-menu-width");
  });

  test("the page replaces the icon and names the button", async () => {
    await boot({ edit: true, body: page(ICON, 'clay-menu-label="Settings"') });
    const button = $(".clay-menu-goo", "menu");
    expect(button.querySelector("svg.gear")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Settings");
    expect(listOf().getAttribute("aria-label")).toBe("Settings");
  });

  test("a hidden switch becomes an Edit mode toggle that follows the mode", async () => {
    await boot({ edit: true, body: page("", "no-edit-switch") });
    expect($(".clay-menu-edit", "menu").hidden).toBe(true);
    window.clay.menu.open();
    const row = () => listOf().querySelector('[data-menu-id="clay.mode"]');
    expect(row().textContent).toBe("Edit mode");
    expect(row().getAttribute("role")).toBe("menuitemcheckbox");
    expect(row().getAttribute("aria-checked")).toBe("true");
    expect(row().querySelector(".clay-menu-track .clay-menu-thumb")).not.toBeNull();

    const setMode = jest.spyOn(window.clay, "setMode").mockImplementation(async () => {
      jest.spyOn(window.clay, "mode", "get").mockReturnValue("view");
      document.dispatchEvent(new CustomEvent("clay:modechange"));
      return { ok: true, mode: "view", changed: true };
    });
    click(row());
    await flush();
    expect(setMode).toHaveBeenCalledWith("view");
    expect(listOf().hidden).toBe(false);
    expect(row().textContent).toBe("Edit mode");
    expect(row().getAttribute("aria-checked")).toBe("false");
  });

  test("the Edit mode toggle sits above the version line, after the other items", async () => {
    await boot({ edit: true, body: page("", "no-edit-switch") });
    window.clay.menu.addItem({ id: "doc.action", label: "A document action" });
    window.clay.menu.addItem({ id: "upgrade", label: "Version 1.4.0", text: true });
    window.clay.menu.addItem({ id: "doc.last", label: "Last", section: "end" });
    window.clay.menu.open();
    const ids = [...listOf().querySelectorAll("[data-menu-id]")].map((el) => el.dataset.menuId);
    expect(ids.indexOf("clay.mode")).toBeGreaterThan(ids.indexOf("doc.action"));
    expect(ids.indexOf("upgrade")).toBe(ids.indexOf("clay.mode") + 1);
    expect(ids.at(-1)).toBe("doc.last");
  });

  test("the arrow keys reach the Edit mode toggle", async () => {
    await boot({ edit: true, body: page("", "no-edit-switch") });
    window.clay.menu.open();
    const row = listOf().querySelector('[data-menu-id="clay.mode"]');
    const shadow = row.getRootNode();
    shadow.querySelector(".clay-menu-goo").focus();
    row.closest(".clay-menu-dock").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }));
    expect(shadow.activeElement.dataset.menuId).toBe("clay.mode");
  });

  test("the switch stays without the attribute", async () => {
    await boot({ edit: true, body: page() });
    expect($(".clay-menu-edit", "menu").hidden).toBe(false);
    window.clay.menu.open();
    expect(listOf().querySelector('[data-menu-id="clay.mode"]')).toBeNull();
  });

  test("sections put items first and last, and a run gets the button as its anchor", async () => {
    await boot({ edit: true, body: page() });
    let anchor = null;
    window.clay.menu.addItem({ id: "last", label: "Last", section: "end" });
    window.clay.menu.addItem({ id: "first", label: "First", section: "start", run: (context) => { anchor = context.anchor; } });
    window.clay.menu.open();
    const ids = [...listOf().children].map((node) => node.dataset.menuId).filter(Boolean);
    expect(ids[0]).toBe("first");
    expect(ids.at(-1)).toBe("last");
    listOf().querySelector('[data-menu-id="first"]').click();
    expect(anchor).toBe($(".clay-menu-goo", "menu"));
  });

  test("a dismissible item goes on its x, and the x keeps the menu open", async () => {
    await boot({ edit: true, body: page() });
    let dismissed = 0;
    window.clay.menu.addItem({ id: "thanks", label: "Thanks", href: "mailto:a@example.com", quiet: true, dismiss: { label: "Remove", run: () => { dismissed += 1; } } });
    window.clay.menu.open();
    const x = listOf().querySelector('[data-menu-id="thanks.dismiss"]');
    expect(x.getAttribute("aria-label")).toBe("Remove");
    expect(listOf().querySelector('a[data-menu-id="thanks"]').getAttribute("part")).toBe("item quiet");
    x.click();
    await flush();
    expect(dismissed).toBe(1);
    expect(listOf().querySelector('[data-menu-id="thanks"]')).toBeNull();
    expect(listOf().hidden).toBe(false);
  });

  test("a skin replaces the default look and keeps the safety layer", async () => {
    await boot({ edit: true, body: `${SKIN}${page()}` });
    const css = cssOfMenu();
    expect(css).toContain('[part~="button"] { width: 40px; }');
    expect(css).not.toContain("height: 34px; padding: 0 4px 0 2px");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("min-height: 44px");
  });

  test("a skin keeps the version line lined up with the menu items", async () => {
    await boot({ edit: true, body: `${SKIN}${page()}` });
    expect(cssOfMenu()).toContain(".clay-menu-version { box-sizing: border-box; margin: 0; padding: 7px 9px; }");
  });

  test("an unknown skin version keeps the default look", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await boot({ edit: true, body: `${SKIN.replace('skin="1"', 'skin="2"')}${page()}` });
    const css = cssOfMenu();
    expect(css).not.toContain('[part~="button"] { width: 40px; }');
    expect(css).toContain("height: 34px; padding: 0 4px 0 2px");
    warn.mockRestore();
  });

  test("the menu never reaches a save, and the slot and its icon do", async () => {
    await boot({ edit: true, body: page(ICON, "no-edit-switch") });
    const html = window.clay.getHTML();
    expect(html).toContain("clay-menu-slot");
    expect(html).toContain("clay-menu-icon");
    expect(html).not.toContain("clay-menu-dock");
    expect(html).not.toContain("clay-editor-ui");
    expect(window.clay.hasUnsavedChanges()).toBe(false);
  });
});
