import postcss from "postcss";
import { installSkin } from "../../src/ui/vendor-skin.js";
import { RUNTIME_ONLY } from "../../src/ui/bevel-controls.js";
import { CSS as RICHCLAY, ROOTS as RICHCLAY_ROOTS } from "../../src/ui/skins/richclay.js";
import { CSS as CMS } from "../../src/ui/skins/cms.js";
import { CSS as TOGGLE_CSS, ROOTS as TOGGLE_ROOTS } from "../../src/ui/skins/cms-toggle.js";
import { CSS as QUICKCROP, ROOTS as QUICKCROP_ROOTS } from "../../src/ui/skins/quickcrop.js";

/**
 * A skin's layer is placed where its name first appears, and important declarations
 * in the earliest layer win, so the skin has to sit ahead of every other stylesheet
 * in <head>, stay out of the saved file, and never be doubled.
 */

const PAGE_HEAD = '<meta charset="utf-8"><link rel="stylesheet" href="page.css"><style>button { all: unset !important }</style>';

beforeEach(() => {
  document.head.innerHTML = PAGE_HEAD;
});

const skins = () => [...document.head.querySelectorAll("style[data-clay-skin]")];

test("goes in ahead of every other node in <head>, runtime-only and unmarked", () => {
  const el = installSkin("richclay", RICHCLAY);
  expect(document.head.firstChild).toBe(el);
  expect(el.tagName).toBe("STYLE");
  expect(el.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(el.getAttribute("data-clay-skin")).toBe("richclay");
  expect(el.hasAttribute("class")).toBe(false);
  expect(el.hasAttribute("id")).toBe(false);
  expect(el.textContent).toBe(RICHCLAY);
  const first = postcss.parse(el.textContent).nodes[0];
  expect([first.type, first.name, first.params]).toEqual(["atrule", "layer", "clay-skin"]);
});

test("a second install reuses the element", () => {
  const a = installSkin("richclay", RICHCLAY);
  const b = installSkin("richclay", RICHCLAY);
  expect(b).toBe(a);
  expect(skins()).toHaveLength(1);
  expect(document.head.firstChild).toBe(a);
});

test("two skins both sit ahead of the page's stylesheets", () => {
  installSkin("richclay", RICHCLAY);
  installSkin("cms", CMS);
  const nodes = [...document.head.childNodes];
  expect(skins()).toHaveLength(2);
  const lastSkin = Math.max(...skins().map((el) => nodes.indexOf(el)));
  const firstOther = nodes.findIndex((node) => !(node.nodeType === 1 && node.hasAttribute("data-clay-skin")));
  expect(lastSkin).toBeLessThan(firstOther);
});

test("moves back to the front when something was put ahead of it", () => {
  const el = installSkin("richclay", RICHCLAY);
  const intruder = document.createElement("style");
  intruder.textContent = "@layer page { button { color: red !important } }";
  document.head.insertBefore(intruder, document.head.firstChild);
  installSkin("richclay", RICHCLAY);
  expect(document.head.firstChild).toBe(el);
});

test.each([
  ["richclay", "../../src/plugins/richclay.js", [["richclay", RICHCLAY, RICHCLAY_ROOTS]]],
  ["cms", "../../src/plugins/cms.js", [["cms", CMS, null], ["cms-toggle", TOGGLE_CSS, TOGGLE_ROOTS]]],
  ["quickcrop", "../../src/plugins/quickcrop.js", [["quickcrop", QUICKCROP, QUICKCROP_ROOTS]]],
])("the %s plugin puts its skin first in <head> when it loads, with its roots' scheme where it has roots", async (name, path, skins) => {
  await import(path);
  // Every plugin installs at least the skin named after it; the CMS installs two.
  expect(skins.some(([skin]) => skin === name)).toBe(true);
  for (const [skin, css, roots] of skins) {
    const el = document.head.querySelector(`style[data-clay-skin="${skin}"]`);
    expect(el).not.toBeNull();
    expect(el.textContent).toBe(roots ? `${css}\n@layer clay-skin{:is(${roots.join(", ")}){color-scheme:light dark !important}}` : css);
    expect(el.getAttribute("clay")).toBe(RUNTIME_ONLY);
    expect(el.previousElementSibling === null || el.previousElementSibling.hasAttribute("data-clay-skin")).toBe(true);
  }
});

test("a skin given its roots gives them the page's scheme, the reader's when the page declares none, and re-reads it after a frame", () => {
  document.documentElement.style.colorScheme = "";
  try {
    const el = installSkin("richclay", RICHCLAY, { roots: [".richclay-toolbar", ".richclay-dialog"] });
    expect(el.textContent.startsWith(RICHCLAY)).toBe(true);
    expect(el.textContent).toContain(":is(.richclay-toolbar, .richclay-dialog){color-scheme:light dark !important}");
    document.documentElement.style.colorScheme = "dark";
    document.dispatchEvent(new CustomEvent("clay:sync-applied"));
    expect(el.textContent).toContain(":is(.richclay-toolbar, .richclay-dialog){color-scheme:dark !important}");
  } finally {
    document.documentElement.style.colorScheme = "";
  }
});

test("without roots the skin text is exactly the module's", () => {
  expect(installSkin("cms", CMS).textContent).toBe(CMS);
});

test("the CMS toggle skin sets the documented hooks, raised edges and a pressed state", () => {
  for (const part of [
    "--hcms-toggle-bg:", "--hcms-toggle-color:", ".hcms-toggle__main", ".hcms-toggle__arrow",
    ":hover:not(:active)", ":active{border-color:",
  ]) {
    expect(TOGGLE_CSS).toContain(part);
  }
});

test("after a live-sync frame every skin is back ahead of the page's stylesheets", () => {
  const el = installSkin("richclay", RICHCLAY);
  const intruder = document.createElement("style");
  intruder.textContent = "@layer page { button { color: red !important } }";
  document.head.insertBefore(intruder, document.head.firstChild);
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));
  const nodes = [...document.head.childNodes];
  expect(nodes.indexOf(el)).toBeLessThan(nodes.indexOf(intruder));
  expect(el.previousElementSibling === null || el.previousElementSibling.hasAttribute("data-clay-skin")).toBe(true);
});
