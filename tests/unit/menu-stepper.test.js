import { jest } from "@jest/globals";
import { hostOf, rootOf, $, $$, active } from "./helpers/editor-ui.js";
import { MENU_SAFETY } from "../../src/plugins/menu/shell-style.js";

// Scenario: a document adds a row like "Switch look < Ruled 1/3 >". Its two arrows
// keep the menu open, and a new value lands in the same live region without moving
// focus. No document uses the row yet. The menu's safety sheet comes first, so a
// page skin cannot hide focus, break hidden or shrink a touch target.

const SLOT = "/notes.html";
const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const BODY = '<div id="content">start</div><header><div clay-menu-slot></div></header>';
const VISITOR_BODY = '<div id="slot"><div clay-menu-slot></div></div><h1 id="title">start</h1>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ cookie = true, draft = false, visitor = false, body = BODY } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (draft) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  window.history.replaceState({}, "", SLOT);
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = visitor ? VISITOR_BODY : body;
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
    visitor
      ? "plugins=visitor-drafts,visitor-menu&exclude=richclay,source"
      : draft
        ? "plugins=menu,visitor-drafts&exclude=richclay,source"
        : "plugins=menu&exclude=richclay,source",
  );
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

const listOf = () => $(".clay-menu-list", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const stepperOf = () => $('[part~="stepper"]', "menu");
const stepsOf = () => $$('[part~="step"]', "menu");
const valueOf = () => $(".clay-menu-stepper-value", "menu");
const styleTexts = () => Array.from(rootOf("menu").querySelectorAll("style"), (style) => style.textContent);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

const addStepper = (value, { prev = jest.fn(), next = jest.fn() } = {}) => {
  window.clay.menu.addItem({
    id: "doc.look",
    stepper: {
      label: "Switch look",
      value,
      prev,
      next,
      prevLabel: "Previous look",
      nextLabel: "Next look",
    },
  });
  return { prev, next };
};

test("a stepper item shows its label, its value and two arrow buttons", async () => {
  await boot();
  addStepper("Ruled 1/3");
  window.clay.menu.open();

  const row = stepperOf();
  expect(row).not.toBeNull();
  expect(row.textContent).toContain("Switch look");
  expect(valueOf().textContent).toBe("Ruled 1/3");

  const [back, forward] = stepsOf();
  expect(stepsOf().length).toBe(2);
  expect(back.getAttribute("aria-label")).toBe("Previous look");
  expect(forward.getAttribute("aria-label")).toBe("Next look");
  expect(back.querySelector("svg")).not.toBeNull();
  expect(forward.querySelector("svg")).not.toBeNull();
  expect(listOf().hidden).toBe(false);
});

test("each arrow runs its function and leaves the menu open", async () => {
  await boot();
  const { prev, next } = addStepper("Ruled 1/3");
  window.clay.menu.open();

  const [back, forward] = stepsOf();
  click(back);
  expect(prev).toHaveBeenCalledTimes(1);
  expect(listOf().hidden).toBe(false);

  click(forward);
  expect(next).toHaveBeenCalledTimes(1);
  expect(listOf().hidden).toBe(false);
});

test("a new value updates in place, keeps the live region and keeps focus", async () => {
  await boot();
  addStepper("Ruled 1/3");
  window.clay.menu.open();

  const shown = valueOf();
  const [back, forward] = stepsOf();
  forward.focus();
  expect(active()).toBe(forward);

  addStepper("Plain 2/3");

  expect(valueOf()).toBe(shown);
  expect(shown.textContent).toBe("Plain 2/3");
  expect(shown.getAttribute("aria-live")).toBe("polite");
  expect(stepsOf()).toEqual([back, forward]);
  expect(active()).toBe(forward);
  expect(listOf().hidden).toBe(false);
});

test("ArrowDown and ArrowUp move through the two arrows as menu items", async () => {
  await boot();
  addStepper("Ruled 1/3");
  window.clay.menu.open();

  const [back, forward] = stepsOf();
  back.focus();
  press(back, "ArrowDown");
  expect(active()).toBe(forward);

  press(forward, "ArrowUp");
  expect(active()).toBe(back);
});

test("the safety sheet comes first for an owner", async () => {
  await boot();
  expect(MENU_SAFETY.startsWith("@layer clay-menu-safety")).toBe(true);

  const texts = styleTexts();
  expect(texts.length).toBeGreaterThan(1);
  expect(texts[1]).toBe(MENU_SAFETY);
});

test("the safety sheet comes first for a visitor", async () => {
  await boot({ cookie: false, draft: true, visitor: true });
  expect(hostOf("menu")).not.toBeNull();
  expect(gooOf()).not.toBeNull();

  const texts = styleTexts();
  expect(texts.length).toBeGreaterThan(1);
  expect(texts[1]).toBe(MENU_SAFETY);
});
