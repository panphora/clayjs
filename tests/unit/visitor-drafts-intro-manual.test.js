/**
 * A document that asks for `<template visitor-intro="manual">` gets an intro the
 * visitor can hide and bring back from the menu, and that never collapses on its
 * own. Every other document keeps the automatic strip: the x, the scroll collapse
 * and no menu row.
 */
import { jest } from "@jest/globals";
import { draftKey } from "../../src/plugins/visitor-drafts/store.js";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title"}';
const MANUAL = '<template visitor-intro="manual"><p>Track your week.</p></template>';
const AUTOMATIC = "<template visitor-intro><p>Track your week.</p></template>";

const uiKeyFor = (slot) => draftKey(slot) + ":ui";

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

function fakeMenu() {
  const items = new Map();
  return {
    items,
    addItem({ id, label, run }) {
      items.set(id, { label, run });
    },
    removeItem(id) {
      items.delete(id);
    },
    run(id) {
      items.get(id)?.run?.();
    },
  };
}

async function bootPage({ slot, template = MANUAL, url = "/notes.html", ui = null, draft = null, menu = null, keepStorage = false } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", url);
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1>' + template;
  if (!keepStorage) localStorage.clear();
  if (ui) localStorage.setItem(uiKeyFor(slot), JSON.stringify(ui));
  if (draft) localStorage.setItem(draftKey(slot), JSON.stringify(draft));
  window.clay = {};
  if (menu) window.clay.menu = menu;
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(PARAMS), resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { clay: window.clay, uiKey: uiKeyFor(slot) };
}

function intro() {
  return document.querySelector(".clay-intro");
}

function closeButton() {
  const host = intro()?.querySelector('clay-editor-ui[data-clay-ui="intro-close"]');
  return host?.shadowRoot.querySelector(".clay-intro__close") ?? null;
}

const uiMemory = (key) => JSON.parse(localStorage.getItem(key));

test("a fresh visitor sees the manual intro open, with a button that reads Hide intro", async () => {
  const menu = fakeMenu();
  await bootPage({ slot: "manual-open", menu });

  const section = intro();
  expect(section).not.toBeNull();
  expect(document.body.firstElementChild).toBe(section);
  expect(section.textContent).toContain("Track your week.");
  const close = closeButton();
  expect(close.textContent).toBe("Hide intro");
  expect(close.hasAttribute("data-manual")).toBe(true);
  expect(close.hasAttribute("aria-label")).toBe(false);
  expect(close.querySelector("svg")).toBeNull();
  expect(menu.items.has("clay.intro")).toBe(false);
});

test("hiding removes the section, remembers it and offers the row; the row puts the same node back", async () => {
  const menu = fakeMenu();
  const { uiKey } = await bootPage({ slot: "manual-hide", menu });

  const section = intro();
  closeButton().click();

  expect(intro()).toBeNull();
  expect(uiMemory(uiKey).intro.done).toBe("closed");
  expect(menu.items.get("clay.intro").label).toBe("Show intro");

  menu.run("clay.intro");

  expect(intro()).toBe(section);
  expect(document.body.firstElementChild).toBe(section);
  expect(uiMemory(uiKey).intro.done).toBeNull();
  expect(menu.items.has("clay.intro")).toBe(false);
});

test("a closed intro starts closed with nothing built, and ?intro=1 opens it", async () => {
  const menu = fakeMenu();
  await bootPage({ slot: "manual-closed", menu, ui: { v: 1, prompt: {}, intro: { done: "closed" }, src: null } });
  expect(intro()).toBeNull();
  expect(document.getElementById("clay-intro-style")).toBeNull();
  expect(menu.items.get("clay.intro").label).toBe("Show intro");

  const forcedMenu = fakeMenu();
  await bootPage({ slot: "manual-closed", menu: forcedMenu, url: "/notes.html?intro=1", ui: { v: 1, prompt: {}, intro: { done: "closed" }, src: null }, keepStorage: true });
  expect(intro()).not.toBeNull();
  expect(closeButton().textContent).toBe("Hide intro");
  expect(forcedMenu.items.has("clay.intro")).toBe(false);
});

test("a saved draft starts it closed with nothing built and the row present", async () => {
  const menu = fakeMenu();
  const { uiKey } = await bootPage({
    slot: "manual-draft",
    menu,
    draft: { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "draft title" } },
  });

  expect(intro()).toBeNull();
  expect(document.getElementById("clay-intro-style")).toBeNull();
  expect(menu.items.get("clay.intro").label).toBe("Show intro");
  expect(uiMemory(uiKey)).toBeNull();
});

test("a menu that arrives later gets the row when closed, and none when open", async () => {
  const { uiKey } = await bootPage({ slot: "manual-late-closed", ui: { v: 1, prompt: {}, intro: { done: "closed" }, src: null } });
  expect(intro()).toBeNull();

  const menu = fakeMenu();
  window.clay.menu = menu;
  document.dispatchEvent(new CustomEvent("clay:menu-ready"));
  expect(menu.items.get("clay.intro").label).toBe("Show intro");
  menu.run("clay.intro");
  expect(intro()).not.toBeNull();
  expect(uiMemory(uiKey).intro.done).toBeNull();

  const openMenu = fakeMenu();
  await bootPage({ slot: "manual-late-open", menu: openMenu });
  expect(intro()).not.toBeNull();
  openMenu.items.set("clay.intro", { label: "Show intro", run: null });
  document.dispatchEvent(new CustomEvent("clay:menu-ready"));
  expect(openMenu.items.has("clay.intro")).toBe(false);
});

test("scrolling to the end leaves a manual intro alone", async () => {
  const menu = fakeMenu();
  const { uiKey } = await bootPage({ slot: "manual-scroll", menu });
  const section = intro();
  section.getBoundingClientRect = () => ({ bottom: -1, height: 40 });
  window.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  expect(intro()).toBe(section);
  expect(uiMemory(uiKey)).toBeNull();
  expect(menu.items.has("clay.intro")).toBe(false);
});

test("a template with no value keeps the x, the scroll collapse and no row", async () => {
  const menu = fakeMenu();
  const { uiKey } = await bootPage({ slot: "manual-auto", template: AUTOMATIC, menu });

  const close = closeButton();
  expect(close.getAttribute("aria-label")).toBe("Hide this introduction");
  expect(close.hasAttribute("data-manual")).toBe(false);
  expect(close.querySelector("svg")).not.toBeNull();
  expect(menu.items.has("clay.intro")).toBe(false);

  const section = intro();
  section.getBoundingClientRect = () => ({ bottom: -1 });
  window.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(intro()).toBeNull();
  expect(uiMemory(uiKey).intro.done).toBe("scrolled");
  expect(menu.items.has("clay.intro")).toBe(false);
});

test("an inline script in the template runs once across hide and show", async () => {
  delete window.__introRuns;
  const menu = fakeMenu();
  await bootPage({
    slot: "manual-script",
    menu,
    template: '<template visitor-intro="manual"><p>Track your week.</p><script>window.__introRuns = (window.__introRuns || 0) + 1;<\/script></template>',
  });

  expect(window.__introRuns).toBe(1);
  closeButton().click();
  expect(intro()).toBeNull();
  menu.run("clay.intro");
  expect(intro()).not.toBeNull();
  expect(window.__introRuns).toBe(1);
});
