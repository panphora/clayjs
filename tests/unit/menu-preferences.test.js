import { jest } from "@jest/globals";
import { $ } from "./helpers/editor-ui.js";

// Scenario: the dock follows the host's answer on whether this caller may edit. Every
// case boots through the real loader with `plugins=menu`.

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

const dockOf = () => $(".clay-menu-dock", "menu");

test("the menu follows a denial and a later grant without an entry", async () => {
  await boot();
  expect(dockOf().hidden).toBe(false);
  const { noteHostWritable } = await import("../../src/core/is-edit-mode.js");

  noteHostWritable(false);
  await flush();
  expect(dockOf().hidden).toBe(true);

  noteHostWritable(true);
  await flush();
  expect(dockOf().hidden).toBe(false);
});
