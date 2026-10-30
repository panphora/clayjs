import { jest } from "@jest/globals";
import { hostOf, $ } from "./helpers/editor-ui.js";

// Scenario: a document carries several looks for the same markup, each a
// <style clay-variant="A">. The block without media="not all" is the saved look, and
// the pill in the dock steps through them: in edit mode the step is saved, in view mode
// it previews this tab only. Keep deletes every other look.

const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';
const RECEIPT_KEY = "clay:doc:/notes.html:variants-choose";

const LOOKS = (active = "A") =>
  ["A", "B", "C"]
    .map((name) => `<style clay-variant="${name}"${name === active ? "" : ' media="not all"'}>body { --look: ${name}; }</style>`)
    .join("");

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ edit = false, looks = LOOKS(), receipt = null, plugins = "menu", autosave = false } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (autosave) document.documentElement.setAttribute("autosave", "");
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  if (receipt !== null) sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
  document.head.innerHTML = looks;
  document.body.innerHTML = BODY;
  posts.length = 0;
  window.fetch = async (url, init = {}) => {
    if ((init.method || "GET").toUpperCase() === "POST") posts.push(String(url));
    return {
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
    };
  };
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

const posts = [];

async function settled(check, ms = 4000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out waiting for the boot baseline to settle");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const looks = () => [...document.querySelectorAll("head style[clay-variant]")];
const named = (name) => looks().find((style) => style.getAttribute("clay-variant") === name);
const pillOf = () => $(".clay-variants", "menu");
const nameOf = () => $(".clay-variants-name", "menu");
const useOf = () => $(".clay-variants-use", "menu");
const keepOf = () => $(".clay-variants-keep", "menu");
const stepOf = (by) => $(`.clay-variants [data-step="${by}"]`, "menu");
const keepItemOf = () => $('[role="menuitem"][data-menu-id="clay.variants.keep"]', "menu");
const previewCopy = () => document.querySelector('head style[clay="editor-ui"][data-clay-variant-preview]');
const dialog = () => document.querySelector("[data-clay-modal]");
const dialogButton = (label) => [...(dialog()?.querySelectorAll("button") ?? [])].find((button) => button.textContent === label);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

test("three looks in edit mode show the pill before the capsule, with Keep and no Use", async () => {
  await boot({ edit: true });

  const pill = pillOf();
  expect(pill).not.toBeNull();
  expect(pill.parentElement.className).toBe("clay-menu-dock");
  expect(pill.nextElementSibling.className).toBe("clay-menu");
  expect(nameOf().textContent).toBe("Variant A (1/3)");
  expect(keepOf().hidden).toBe(false);
  expect(useOf().hidden).toBe(true);
});

test("the next arrow in edit mode saves the look, announces it, and wraps", async () => {
  await boot({ edit: true });
  const changes = [];
  document.addEventListener("clay:variant-change", (event) => changes.push(event.detail));

  click(stepOf(1));
  await flush();

  expect(named("B").hasAttribute("media")).toBe(false);
  expect(named("A").getAttribute("media")).toBe("not all");
  expect(named("C").getAttribute("media")).toBe("not all");
  expect(nameOf().textContent).toBe("Variant B (2/3)");
  expect(changes.length).toBeGreaterThan(0);
  expect(changes[changes.length - 1].active).toBe("B");

  click(stepOf(1));
  await flush();
  click(stepOf(1));
  await flush();
  expect(nameOf().textContent).toBe("Variant A (1/3)");

  click(stepOf(-1));
  await flush();
  expect(nameOf().textContent).toBe("Variant C (3/3)");
  expect(named("C").hasAttribute("media")).toBe(false);
});

test("view mode previews the next look in this tab and never writes the file", async () => {
  await boot({ edit: false });

  expect(pillOf()).not.toBeNull();
  click(stepOf(1));
  await flush();

  expect(named("A").hasAttribute("media")).toBe(false);
  expect(named("B").getAttribute("media")).toBe("not all");
  expect(named("C").getAttribute("media")).toBe("not all");

  const copy = previewCopy();
  expect(copy).not.toBeNull();
  expect(copy.dataset.clayVariantPreview).toBe("B");
  expect(copy.textContent).toBe(named("B").textContent);

  expect(window.clay.variants.shown).toBe("B");
  expect(window.clay.variants.active).toBe("A");
  expect(useOf().hidden).toBe(false);
  expect(keepOf().hidden).toBe(true);

  if (named("A").sheet) expect(named("A").sheet.disabled).toBe(true);

  click(stepOf(-1));
  await flush();

  expect(previewCopy()).toBeNull();
  expect(window.clay.variants.shown).toBe("A");
});

test("one look draws no pill and no Keep item", async () => {
  await boot({ edit: true, looks: '<style clay-variant="A">body { --look: A; }</style>' });

  expect(hostOf("menu")).not.toBeNull();
  expect(pillOf()).toBeNull();
  expect(keepItemOf()).toBeNull();
});

test("Keep asks first, then leaves the one look as an ordinary style block", async () => {
  await boot({ edit: true });
  const [a, b, c] = looks();

  click($(".clay-menu-goo", "menu"));
  await flush();

  expect(keepItemOf()).not.toBeNull();
  expect(keepItemOf().textContent).toBe("Keep Variant A, remove the others\u2026");

  const kept = window.clay.variants.keep();
  await flush();

  expect(dialog()).not.toBeNull();
  click(dialogButton("Confirm"));
  await expect(kept).resolves.toEqual({ ok: true });
  await flush();

  expect([a.isConnected, b.isConnected, c.isConnected]).toEqual([true, false, false]);
  expect(a.hasAttribute("clay-variant")).toBe(false);
  expect(a.hasAttribute("media")).toBe(false);
  expect(a.textContent).toBe("body { --look: A; }");
  expect(pillOf()).toBeNull();
  expect(keepItemOf()).toBeNull();
});

test("closing the Keep dialog leaves every look as it was", async () => {
  await boot({ edit: true });
  const [a, b, c] = looks();

  const kept = window.clay.variants.keep();
  await flush();

  expect(dialog()).not.toBeNull();
  click(dialogButton("Cancel"));
  await expect(kept).resolves.toEqual({ ok: false, code: "cancelled" });
  await flush();

  expect([a.isConnected, b.isConnected, c.isConnected]).toEqual([true, true, true]);
  expect(a.hasAttribute("media")).toBe(false);
  expect(b.getAttribute("media")).toBe("not all");
  expect(c.getAttribute("media")).toBe("not all");
});

test("a receipt left in this browser's session is the look edit mode opens on, saved once the boot settles", async () => {
  await boot({ edit: true, receipt: "C", autosave: true });

  // Before the boot baseline settles the choice only paints: written now, it would be
  // taken for load-time churn and become the saved state without being sent.
  expect(nameOf().textContent).toBe("Variant C (3/3)");
  expect(previewCopy()?.dataset.clayVariantPreview).toBe("C");
  expect(named("A").hasAttribute("media")).toBe(false);

  await settled(() => window.clay.variants.active === "C");
  await flush();
  expect(previewCopy()).toBeNull();
  await settled(() => posts.length > 0);
  expect(named("C").hasAttribute("media")).toBe(false);
  expect(named("A").getAttribute("media")).toBe("not all");
  expect(named("B").getAttribute("media")).toBe("not all");
  expect(window.clay.variants.active).toBe("C");
  expect(window.clay.storage.session.get("variants-choose")).toBeUndefined();
});

test("two looks left without media both paint: the first is the saved one, the other is switched off", async () => {
  await boot({ edit: false, looks: LOOKS("A").replace('clay-variant="B" media="not all"', 'clay-variant="B"') });

  expect(named("A").hasAttribute("media")).toBe(false);
  expect(named("B").hasAttribute("media")).toBe(false);
  expect(window.clay.variants.active).toBe("A");
  if (named("B").sheet) expect(named("B").sheet.disabled).toBe(true);
});

test("choosing a look refuses outside edit mode, and refuses a name the page does not carry", async () => {
  await boot({ edit: false });
  expect(window.clay.variants.choose("B")).toEqual({ ok: false, code: "not-editing" });

  await boot({ edit: true });
  expect(window.clay.variants.choose("Z")).toEqual({ ok: false, code: "unknown-variant" });
});

test("a page without autosave saves a step and a Keep, as the SEO panel's Done does", async () => {
  await boot({ edit: true });
  await settled(() => document.documentElement.getAttribute("savestatus") === "saved");
  posts.length = 0;

  click(stepOf(1));
  await flush();
  expect(window.clay.variants.active).toBe("B");
  await settled(() => posts.length > 0, 1000);

  posts.length = 0;
  const kept = window.clay.variants.keep();
  await flush();
  click(dialogButton("Confirm"));
  await kept;
  await settled(() => posts.length > 0, 1000);
});

test("a look change and Keep are undo entries: Cmd+Z after Keep brings every look back and the pill with it", async () => {
  await boot({ edit: true, plugins: "menu,undo", autosave: true });
  await settled(() => document.documentElement.getAttribute("savestatus") === "saved");
  document.body.querySelector("#content").textContent = "an earlier edit";
  await flush();

  click(stepOf(1));
  await flush();
  expect(window.clay.variants.active).toBe("B");

  window.clay.undo.undo();
  await flush();
  expect(window.clay.variants.active).toBe("A");
  expect(nameOf().textContent).toBe("Variant A (1/3)");
  window.clay.undo.redo();
  await flush();
  expect(window.clay.variants.active).toBe("B");

  const kept = window.clay.variants.keep();
  await flush();
  click(dialogButton("Confirm"));
  await kept;
  await flush();
  expect(looks()).toHaveLength(0);
  expect(pillOf()).toBeNull();

  window.clay.undo.undo();
  await flush();
  expect(looks().map((style) => style.getAttribute("clay-variant"))).toEqual(["A", "B", "C"]);
  expect(window.clay.variants.active).toBe("B");
  expect(nameOf().textContent).toBe("Variant B (2/3)");
  expect(document.body.querySelector("#content").textContent).toBe("an earlier edit");
});

test("an owner in view mode on a page with looks is offered the menu in edit, even without it in plugins", async () => {
  await boot({ edit: false, plugins: "undo" });
  expect(window.clay.editPlugins).toContain("menu");
});
