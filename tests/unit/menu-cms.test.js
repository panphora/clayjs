import { jest } from "@jest/globals";
import { docKey } from "../../src/lib/doc-storage.js";

// Scenario: the CMS opens from the menu. On a page that loads the menu, the menu owns
// the launcher, so the item appears only when the page actually has cms rules, and in
// view mode it enters edit through the same resume receipt Ask AI uses. Every case boots
// through the real loader.

const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

function mountRules() {
  const el = document.createElement("script");
  el.setAttribute("data-rules-name", "cms");
  el.setAttribute("data-rules-version", "1");
  el.setAttribute("type", "application/json");
  el.textContent = JSON.stringify({ title: "h1" });
  document.head.appendChild(el);
  return el;
}

async function boot({ cookie = true, edit = false, plugins = "menu,cms", rules = false, resume = null } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  if (resume != null) sessionStorage.setItem(docKey("menu-resume"), JSON.stringify(resume));
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  if (rules) mountRules();
  window.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  });
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

const listOf = () => document.querySelector(".clay-menu-list");
const noteOf = () => document.querySelector(".clay-menu-note");
const buttonOf = (id) => document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

test("a page without cms rules gets no CMS item", async () => {
  await boot();

  expect(listOf()).not.toBeNull();
  expect(buttonOf("clay.cms")).toBeNull();
});

test("cms rules add the item first, ahead of SEO settings", async () => {
  await boot({ rules: true });

  const item = buttonOf("clay.cms");
  expect(item).not.toBeNull();
  expect(item.textContent).toContain("Open the CMS (Edit content)");

  const labels = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);
  expect(labels[0]).toContain("Open the CMS (Edit content)");
  expect(labels.findIndex((label) => label.includes("SEO settings"))).toBeGreaterThan(0);
});

test("in edit mode the item opens the CMS once", async () => {
  await boot({ edit: true, rules: true });

  const open = jest.fn(async () => ({ ok: true }));
  window.clay.cms = { hasRules: () => true, open };

  click(buttonOf("clay.cms"));
  await flush();

  expect(open).toHaveBeenCalledTimes(1);
});

test("a refused open says so", async () => {
  await boot({ edit: true, rules: true });

  window.clay.cms = { hasRules: () => true, open: jest.fn(async () => ({ ok: false, code: "not-allowed" })) };

  click(buttonOf("clay.cms"));
  await flush();

  expect(noteOf().textContent).toBe("Couldn't open the CMS. Try again.");
  expect(noteOf().hidden).toBe(false);
});

test("from view mode the item enters edit live and then opens the CMS", async () => {
  await boot({ rules: true });

  const setMode = jest.fn(async () => ({ ok: true }));
  window.clay.setMode = setMode;
  const open = jest.fn(async () => ({ ok: true }));
  window.clay.cms = { hasRules: () => true, open };

  click(buttonOf("clay.cms"));
  await flush();

  expect(setMode).toHaveBeenCalledTimes(1);
  expect(setMode).toHaveBeenCalledWith("edit");
  expect(open).toHaveBeenCalledTimes(1);
  expect(window.clay.storage.session.get("menu-resume")).toBeUndefined();
});

test("from view mode a reloading entry leaves its receipt instead of opening", async () => {
  await boot({ rules: true });

  window.clay.setMode = jest.fn(async () => ({ ok: true, reloading: true }));
  const open = jest.fn(async () => ({ ok: true }));
  window.clay.cms = { hasRules: () => true, open };

  click(buttonOf("clay.cms"));
  await flush();

  expect(open).not.toHaveBeenCalled();
  expect(window.clay.storage.session.get("menu-resume")).toBe("cms");
});

test("the floating toggle stays away while the menu owns the launcher", async () => {
  await boot({ rules: true });

  expect(document.querySelector("[data-hcms-toggle-host]")).toBeNull();
});
