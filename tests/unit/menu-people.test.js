import { jest } from "@jest/globals";
import { hostOf, $, $$, active, sheetText } from "./helpers/editor-ui.js";

// Scenario: the menu says who is here. The item, the roster beside the capsule and
// the people panel all read one snapshot from the presence store, and the page that
// opted in with <html clay-menu-roster> gets the roster. Nothing any of them draws
// is ever saved, and renaming changes this browser's name rather than the document.

const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';

const ADA = { id: "p_ada", name: "Ada Lovelace", you: false };
const MARTA = { id: "me1", name: "Marta Cole", you: true };
const THREE = { people: [ADA, MARTA], anonymous: 1 };

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ edit = false, roster = false } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (roster) document.documentElement.setAttribute("clay-menu-roster", "");
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  window.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  });
  window.clay = {};
  const params = new URLSearchParams("plugins=menu&exclude=richclay,source");
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

// The store is imported lazily by the menu, so a state set before that import
// settles would be a state nobody is listening for yet.
async function store() {
  const { presence } = await import("../../src/sync/presence-store.js");
  for (let i = 0; i < 100 && presence.listeners.size === 0; i++) await wait(10);
  return presence;
}

async function present(data, { supported = true } = {}) {
  const presence = await store();
  presence.setCapabilities({ supported });
  presence.receive(data);
  await flush();
}

function stubPeople(canRename = true) {
  window.clay.people = { canRename: jest.fn(() => canRename), rename: jest.fn() };
  Object.defineProperty(window.clay, "me", { value: { id: "me1", name: "Marta Cole" }, configurable: true });
  document.dispatchEvent(new CustomEvent("clay:people"));
}

const itemOf = () => $('[role="menuitem"][data-menu-id="clay.people"]', "menu");
const dockOf = () => $(".clay-menu-dock", "menu");
const rosterOf = () => $(".clay-roster", "menu");
const panelOf = () => $(".clay-people", "menu");
const noteOf = () => $(".clay-menu-note", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const facesOf = (el) => [...el.querySelectorAll(".clay-avatar")];
const rowsOf = () => $$(".clay-people-row", "menu");
const meRowOf = () => $(".clay-people-me-row", "menu");
const buttonsIn = (el) => [...el.querySelectorAll("button")];
const buttonNamed = (el, label) => buttonsIn(el).find((button) => button.textContent === label);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function key(el, name) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

async function openFromItem() {
  click(itemOf());
  await flush();
  return panelOf();
}

test("a host that never announced presence gets no item and no roster", async () => {
  await boot({ roster: true });
  stubPeople(true);
  await present(THREE, { supported: false });

  expect(hostOf("menu")).not.toBeNull();
  expect(itemOf()).toBeNull();
  expect(rosterOf()).toBeNull();
});

test("a person alone needs a name they can change before the item appears", async () => {
  await boot();
  stubPeople(false);
  await present({ people: [MARTA], anonymous: 0 });

  expect(itemOf()).toBeNull();

  window.clay.people.canRename.mockReturnValue(true);
  document.dispatchEvent(new CustomEvent("clay:people"));

  expect(itemOf()).not.toBeNull();
  expect(itemOf().textContent).toBe("Who's here");
});

test("three present sum in the item's label", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  expect(itemOf()).not.toBeNull();
  expect(itemOf().textContent).toBe("Who's here (3 people)");
});

test("the roster is opt-in, and sits beside the capsule", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  expect(hostOf("menu")).not.toBeNull();
  expect(rosterOf()).toBeNull();

  await boot({ roster: true });
  stubPeople(true);
  await present(THREE);

  const roster = rosterOf();
  const dock = dockOf();
  expect(roster).not.toBeNull();
  expect([...dock.children].indexOf(roster)).toBeLessThan([...dock.children].indexOf(dock.querySelector(".clay-menu")));

  const faces = facesOf(roster);
  expect(faces).toHaveLength(2);
  expect(faces.map((el) => el.textContent)).toEqual(["AL", "MC"]);
  const rest = [...roster.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join("");
  expect(rest).toBe("1 other");
  expect(roster.getAttribute("aria-label")).toBe("Who's here: Ada Lovelace, Marta Cole and 1 other");
});

test("the panel opens from the item with the sum, the rows and the anonymous line", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  const panel = await openFromItem();

  expect(panel).not.toBeNull();
  expect(panel.getAttribute("role")).toBe("dialog");
  expect($(".clay-people-sum", "menu").textContent).toBe("3 people");
  const rows = rowsOf();
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain("Ada Lovelace");
  expect(rows[1].textContent).toContain("Marta Cole");
  expect(rows[1].textContent).toContain("(you)");
  expect(rows[0].textContent).not.toContain("(you)");
  expect($(".clay-people-anon", "menu").textContent).toBe("1 other person is here without a shared name.");
  expect(active()).toBe($(".clay-people-close", "menu"));

  key($(".clay-people-close", "menu"), "Escape");
  await flush();

  expect(panelOf()).toBeNull();
  expect(active()).toBe(gooOf());
});

test("the panel opens from the roster, and an outside click closes it", async () => {
  await boot({ roster: true });
  stubPeople(true);
  await present(THREE);

  click(rosterOf());
  await flush();

  expect(panelOf()).not.toBeNull();
  expect(rosterOf().getAttribute("aria-expanded")).toBe("true");

  click(document.body);
  await flush();

  expect(panelOf()).toBeNull();
  expect(active()).not.toBe($(".clay-people-close", "menu"));
});

test("renaming this browser's name, and what a refusal says", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);
  const rename = window.clay.people.rename;

  await openFromItem();
  expect($(".clay-people-me", "menu")).not.toBeNull();
  click(buttonNamed(meRowOf(), "Change"));
  await flush();

  const input = $(".clay-people-input", "menu");
  expect(input).not.toBeNull();
  expect(input.value).toBe("Marta Cole");

  input.value = "Marta C";
  click(buttonNamed(meRowOf(), "Save"));
  await flush();
  expect(rename).toHaveBeenCalledTimes(1);
  expect(rename).toHaveBeenCalledWith("Marta C");

  rename.mockImplementation(() => {
    throw { code: "not-renamable" };
  });
  click(buttonNamed(meRowOf(), "Change"));
  await flush();
  $(".clay-people-input", "menu").value = "Marta C";
  click(buttonNamed(meRowOf(), "Save"));
  await flush();
  expect(noteOf().textContent).toBe("This name comes from your account, so it can't be changed here.");
  expect(noteOf().hidden).toBe(false);

  rename.mockReset();
  const typed = $(".clay-people-input", "menu");
  typed.value = "Marta C";
  key(typed, "Enter");
  await flush();
  expect(rename).toHaveBeenCalledTimes(1);
  expect(rename).toHaveBeenCalledWith("Marta C");

  click(buttonNamed(meRowOf(), "Change"));
  await flush();
  expect($(".clay-people-input", "menu")).not.toBeNull();
  key($(".clay-people-input", "menu"), "Escape");
  await flush();
  expect(panelOf()).not.toBeNull();
  expect($(".clay-people-input", "menu")).toBeNull();
  expect(buttonNamed(meRowOf(), "Change")).toBeTruthy();
});

test("a name this browser cannot change shows no Change button", async () => {
  await boot();
  stubPeople(false);
  await present(THREE);

  await openFromItem();

  expect($(".clay-people-me", "menu")).not.toBeNull();
  expect($(".clay-people-me-name", "menu").textContent).toBe("Marta Cole");
  expect(buttonNamed(meRowOf(), "Change")).toBeUndefined();
});

test("the corner roster stays empty while the page has a menu", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ spec: 1, extensions: ["sync", "presence"], document: null }),
  }));
  const { presence: chrome } = await import("../../src/sync/presence.js");
  await chrome.update(THREE);
  await flush();

  const stack = document.querySelector("[data-clay-presence]");
  expect(stack === null || stack.style.display === "none").toBe(true);
});

test("nothing the item, the roster or the panel draws is saved", async () => {
  await boot({ edit: true, roster: true });
  stubPeople(true);
  await present(THREE);
  await openFromItem();

  expect(hostOf("menu")).not.toBeNull();
  expect(rosterOf()).not.toBeNull();
  expect(panelOf()).not.toBeNull();

  const html = window.clay.getHTML();
  expect(html).not.toContain("clay-roster");
  expect(html).not.toContain("clay-people");
  expect(html).not.toContain("Ada Lovelace");
  expect(html).not.toContain("Marta Cole");
});

test("opening the menu closes the people panel", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  await openFromItem();
  expect(panelOf()).not.toBeNull();

  click(gooOf());
  await flush();

  expect($(".clay-menu-list", "menu").hidden).toBe(false);
  expect(panelOf()).toBeNull();
});

test("a presence frame keeps focus inside the open panel", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  await openFromItem();
  expect(active()).toBe($(".clay-people-close", "menu"));

  await present(THREE);

  expect(active()).toBe($(".clay-people-close", "menu"));

  key(active(), "Escape");
  await flush();

  expect(panelOf()).toBeNull();
});

test("an unchanged presence frame leaves the open menu's items in place", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  click(gooOf());
  await flush();
  const kept = $('[role="menuitem"][data-menu-id="clay.download"]', "menu");
  expect(kept).not.toBeNull();

  await present(THREE);

  expect(kept.isConnected).toBe(true);
});

test("the rename refusal note paints above the panel", async () => {
  await boot();

  const css = sheetText("menu");

  expect(css).toContain(".clay-menu-note { z-index: 2;");
});
