import { jest } from "@jest/globals";
import { hostOf, $, $$ } from "./helpers/editor-ui.js";

// Scenario: a person's chosen look must survive a reload, a second tab, a download and an
// upgrade, so `html[look]` is the record that travels and each block's `media` is what
// paints with no script. A document that asks for the menu row with `clay-menu-looks` gets
// a stepper for owners and visitors. `clay.variants` answers either way, because a page's
// own control calls it, and every entry carries a `clay-variant-label`.

const SLOT = "/notes.html";
const RECEIPT_KEY = "clay:doc:/notes.html:variants-choose";

const PLAIN = '<div id="content">start</div>';
const SLOT_BODY = '<header><div clay-menu-slot></div></header><div id="content">start</div>';
const ROW_BODY = '<header><div clay-menu-slot clay-menu-looks></div></header><div id="content">start</div>';

const RULES = (look = true) =>
  `<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"${look ? ',"look":"html@look"' : ""}}</script>`;

const LABELS = { A: "Ruled", B: "Folio", C: "Studio" };

const LOOKS = (active = "A", labelled = false) =>
  ["A", "B", "C"]
    .map(
      (name) =>
        `<style clay-variant="${name}"${labelled ? ` clay-variant-label="${LABELS[name]}"` : ""}${
          name === active ? "" : ' media="not all"'
        }>body { --look: ${name}; }</style>`,
    )
    .join("");

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({
  edit = false,
  visitor = false,
  looks = LOOKS(),
  rules = RULES(),
  body = PLAIN,
  autosave = false,
  look = null,
  plugins,
} = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (!visitor) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (visitor) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  if (autosave) document.documentElement.setAttribute("autosave", "");
  if (look) document.documentElement.setAttribute("look", look);
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  document.head.innerHTML = looks + rules;
  document.body.innerHTML = body;
  window.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  });
  window.clay = {};
  const named = plugins ?? (visitor ? "visitor-drafts,visitor-menu" : "menu");
  const params = new URLSearchParams(`plugins=${named}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

async function settled(check, ms = 4000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out waiting for the boot baseline to settle");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const looks = () => [...document.querySelectorAll("head style[clay-variant]")];
const named = (name) => looks().find((style) => style.getAttribute("clay-variant") === name);
const mediaOf = (name) => named(name)?.getAttribute("media") ?? null;
const look = () => document.documentElement.getAttribute("look");

const listOf = () => $(".clay-menu-list", "menu");
const rowOf = () => $('[part~="stepper"]', "menu");
const stepsOf = () => $$('[part~="step"]', "menu");
const valueOf = () => $(".clay-menu-stepper-value", "menu");
const pillOf = () => $(".clay-variants", "menu");
const rowItemOf = () => $('[data-menu-id="clay.look"]', "menu");
const useItemOf = () => $('[role="menuitem"][data-menu-id="clay.look.use"]', "menu");
const keepItemOf = () => $('[role="menuitem"][data-menu-id="clay.variants.keep"]', "menu");
const dialog = () => document.querySelector("[data-clay-modal]");
const dialogButton = (label) => [...(dialog()?.querySelectorAll("button") ?? [])].find((button) => button.textContent === label);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

test("an embedded owner that asks with clay-menu-looks gets the row and no pill", async () => {
  await boot({ edit: true, body: ROW_BODY });
  window.clay.menu.open();

  expect(rowOf()).not.toBeNull();
  expect(rowItemOf()).not.toBeNull();
  expect(valueOf().textContent).toBe("Variant A 1/3");
  expect(pillOf()).toBeNull();
  expect(listOf().hidden).toBe(false);
});

test("an embedded owner without clay-menu-looks gets no row and no pill, and clay.variants still answers", async () => {
  await boot({ edit: true, body: SLOT_BODY });
  window.clay.menu.open();

  expect(rowOf()).toBeNull();
  expect(pillOf()).toBeNull();
  expect(window.clay.variants.list().map((entry) => entry.name)).toEqual(["A", "B", "C"]);
});

test("a floating owner keeps its pill and draws no row", async () => {
  await boot({ edit: true, body: PLAIN });

  expect(pillOf()).not.toBeNull();
  expect(rowOf()).toBeNull();
});

test("an embedded visitor that asks with clay-menu-looks gets the row and no pill", async () => {
  await boot({ visitor: true, body: ROW_BODY });
  window.clay.menu.open();

  expect(rowOf()).not.toBeNull();
  expect(valueOf().textContent).toBe("Variant A 1/3");
  expect(pillOf()).toBeNull();
});

test("an embedded visitor without clay-menu-looks gets no row and no pill, and clay.variants still answers", async () => {
  await boot({ visitor: true, body: SLOT_BODY });
  window.clay.menu.open();

  expect(rowOf()).toBeNull();
  expect(pillOf()).toBeNull();
  expect(window.clay.variants.list().map((entry) => entry.name)).toEqual(["A", "B", "C"]);
});

test("an owner's arrows step both ways with wraparound and leave the menu open", async () => {
  await boot({ edit: true, body: ROW_BODY });
  window.clay.menu.open();

  click(stepsOf()[0]);
  await flush();
  expect(valueOf().textContent).toBe("Variant C 3/3");
  expect(mediaOf("C")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
  expect(listOf().hidden).toBe(false);

  click(stepsOf()[1]);
  await flush();
  expect(valueOf().textContent).toBe("Variant A 1/3");
  expect(mediaOf("A")).toBe(null);
  expect(listOf().hidden).toBe(false);
});

test("a visitor's arrows step both ways with wraparound and leave the menu open", async () => {
  await boot({ visitor: true, body: ROW_BODY });
  window.clay.menu.open();

  click(stepsOf()[0]);
  await flush();
  expect(valueOf().textContent).toBe("Variant C 3/3");
  expect(look()).toBe("C");
  expect(mediaOf("C")).toBe(null);
  expect(listOf().hidden).toBe(false);

  click(stepsOf()[1]);
  await flush();
  expect(valueOf().textContent).toBe("Variant A 1/3");
  expect(look()).toBe("A");
  expect(mediaOf("A")).toBe(null);
  expect(listOf().hidden).toBe(false);
});

test("a clay-variant-label reads where the row would say Variant A", async () => {
  await boot({ edit: true, body: ROW_BODY, looks: LOOKS("A", true) });
  window.clay.menu.open();

  expect(valueOf().textContent).toBe("Ruled 1/3");
  expect(keepItemOf().textContent).toBe("Keep Ruled, remove the others…");
});

test("clay.variants.list() carries the label for an owner", async () => {
  await boot({ edit: true, body: SLOT_BODY, looks: LOOKS("A", true) });

  expect(window.clay.variants.list()).toEqual([
    { name: "A", label: "Ruled", active: true },
    { name: "B", label: "Folio", active: false },
    { name: "C", label: "Studio", active: false },
  ]);
});

test("clay.variants.list() carries the label for a visitor", async () => {
  await boot({ visitor: true, body: SLOT_BODY, looks: LOOKS("A", true) });

  expect(window.clay.variants.list()).toEqual([
    { name: "A", label: "Ruled", active: true },
    { name: "B", label: "Folio", active: false },
    { name: "C", label: "Studio", active: false },
  ]);
});

test("an owner's choose writes html[look] and flips media, and Keep leaves the kept name in html[look] for an upgrade", async () => {
  await boot({ edit: true, body: PLAIN });

  expect(window.clay.variants.choose("B").ok).toBe(true);
  await flush();
  expect(look()).toBe("B");
  expect(mediaOf("B")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
  expect(mediaOf("C")).toBe("not all");

  const kept = window.clay.variants.keep();
  await flush();
  click(dialogButton("Confirm"));
  await expect(kept).resolves.toEqual({ ok: true });
  await flush();

  expect(look()).toBe("B");
  expect(looks()).toEqual([]);
  expect([...document.querySelectorAll("head style")].map((style) => style.textContent)).toContain("body { --look: B; }");

  document.dispatchEvent(new CustomEvent("clay:sync-applied"));
  await flush();
  expect(look()).toBe("B");
});

test("an owner's choose, undo and redo move html[look] with the blocks", async () => {
  await boot({ edit: true, body: PLAIN, plugins: "menu,undo", autosave: true });
  await settled(() => document.documentElement.getAttribute("savestatus") === "saved");
  document.body.querySelector("#content").textContent = "an earlier edit";
  await flush();

  expect(window.clay.variants.choose("B").ok).toBe(true);
  await flush();
  expect(look()).toBe("B");
  expect(mediaOf("B")).toBe(null);

  window.clay.undo.undo();
  await flush();
  expect(window.clay.variants.active).toBe("A");
  expect(look()).toBe("A");
  expect(mediaOf("A")).toBe(null);
  expect(mediaOf("B")).toBe("not all");

  window.clay.undo.redo();
  await flush();
  expect(window.clay.variants.active).toBe("B");
  expect(look()).toBe("B");
  expect(mediaOf("B")).toBe(null);
});

test("a document with no html@look rule writes no attribute", async () => {
  await boot({ edit: true, body: PLAIN, rules: "" });

  expect(window.clay.variants.choose("B").ok).toBe(true);
  await flush();

  expect(look()).toBe(null);
  expect(mediaOf("B")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
});

test("a saved html[look] paints its block at boot, and an unknown name leaves the saved block alone", async () => {
  await boot({ body: PLAIN, look: "B" });

  expect(mediaOf("B")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
  expect(mediaOf("C")).toBe("not all");

  await boot({ body: PLAIN, look: "Z" });

  expect(mediaOf("A")).toBe(null);
  expect(mediaOf("B")).toBe("not all");
  expect(mediaOf("C")).toBe("not all");
});

test("a visitor's choose sets the attribute, flips media, asks for a save and announces", async () => {
  await boot({ visitor: true, body: ROW_BODY });
  const changes = [];
  document.addEventListener("clay:variant-change", (event) => changes.push(event.detail));
  const soon = jest.fn();
  window.clay.save = { ...(window.clay.save || {}), soon };

  expect(window.clay.variants.choose("B").ok).toBe(true);
  await flush();

  expect(look()).toBe("B");
  expect(mediaOf("B")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
  expect(mediaOf("C")).toBe("not all");
  expect(soon).toHaveBeenCalled();
  expect(changes.length).toBeGreaterThan(0);
  expect(changes[changes.length - 1]).toEqual({ active: "B", shown: "B" });
  expect(valueOf().textContent).toBe("Variant B 2/3");
});

test("clay:drafts-restored paints a new html[look] and takes the hint away", async () => {
  await boot({ visitor: true, body: ROW_BODY });
  const hint = document.createElement("style");
  hint.setAttribute("clay-look-hint", "");
  hint.textContent = "body { --look: C; }";
  document.head.append(hint);
  document.documentElement.setAttribute("look", "C");

  document.dispatchEvent(new CustomEvent("clay:drafts-restored"));
  await flush();

  expect(mediaOf("C")).toBe(null);
  expect(mediaOf("A")).toBe("not all");
  expect(document.querySelector("style[clay-look-hint]")).toBeNull();
  expect(window.clay.variants.shown).toBe("C");
  expect(valueOf().textContent).toBe("Variant C 3/3");
});

test("an owner's view-mode step previews this tab and offers Use this look", async () => {
  await boot({ body: ROW_BODY });

  expect(useItemOf()).toBeNull();
  click(stepsOf()[1]);
  await flush();

  expect(useItemOf()).not.toBeNull();
  expect(window.clay.variants.active).toBe("A");
  expect(window.clay.variants.shown).toBe("B");
  expect(look()).toBe(null);
});
