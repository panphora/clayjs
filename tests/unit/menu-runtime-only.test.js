import { jest } from "@jest/globals";
import { $, $$, hostOf } from "./helpers/editor-ui.js";

// Scenario: everything the menu draws lives only at runtime. The dock, the list, the
// first-use notice, the note, the roster, the people panel and its name field, the drag
// spots, the recall toast, the SEO sheet and all four style tags are mounted at once and
// then looked for in every capture the page has: the save, the comparison and the sync
// frame. None of it is there, and none of it marks the page dirty or records undo work.
// Every case boots through the real loader with `plugins=menu,undo`.

const SLOT = "/notes.html";
const HEAD = '<title>Start title</title><meta name="description" content="Start description">';
const BODY = '<div id="content">start</div>';

const ADA = { id: "p_ada", name: "Ada Lovelace", you: false };
const MARTA = { id: "me1", name: "Marta Cole", you: true };
const THREE = { people: [ADA, MARTA], anonymous: 1 };
const PROBE_NOTE = "probe note";
const PROBE_TITLE = "A title that was never applied";

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ edit = true, roster = true, body = BODY, head = HEAD } = {}) {
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
  document.head.innerHTML = head;
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
  const params = new URLSearchParams("plugins=menu,undo&exclude=richclay,source");
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
}

// The store is imported lazily by the menu, so a state set before that import settles
// would be a state nobody is listening for yet.
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

const dockOf = () => $(".clay-menu-dock", "menu");
const gripOf = () => $(".clay-menu-grip", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const listOf = () => $(".clay-menu-list", "menu");
const noteOf = () => $(".clay-menu-note", "menu");
const rosterOf = () => $(".clay-roster", "menu");
const panelOf = () => $(".clay-people", "menu");
const spotsOf = () => $(".clay-menu-spots", "menu");
const sheetOf = () => $(".clay-seo", "seo");
const itemOf = (id) => $(`[role="menuitem"][data-menu-id="${id}"]`, "menu");
const meRowOf = () => $(".clay-people-me-row", "menu");
const buttonsIn = (el) => [...el.querySelectorAll("button")];
const buttonNamed = (el, label) => buttonsIn(el).find((button) => button.textContent === label);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

function pointer(type, { x = 0, y = 0, id = 1 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  return event;
}

function viewport(width, height) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function layoutDock(dock) {
  dock.getBoundingClientRect = () => ({ left: 850, top: 10, width: 100, height: 40, right: 950, bottom: 50 });
}

function setValue(key, value) {
  const input = $(`.clay-seo [data-key="${key}"]`, "seo");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function captures() {
  const snapshot = await import("../../src/core/snapshot.js");
  return {
    save: await window.clay.getHTML(),
    comparison: snapshot.captureForComparisonAndDirty({ flushUndo: false }).forComparison,
    sync: snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false })),
  };
}

const AUTHORED_OPT_IN = /\s*clay-menu-roster(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
const FORBIDDEN_CLASSES = ["clay-menu-", "clay-roster", "clay-people", "clay-seo", "clay-editor-ui"];
const FORBIDDEN_IDS = ["clay-menu-style", "clay-menu-vars", "clay-seo-style", "clay-seo-vars"];
const FORBIDDEN_TEXTS = [
  PROBE_NOTE,
  "Only editors see this menu",
  "Who's here",
  "SEO and social sharing",
  "Ada Lovelace",
  "Marta Cole",
  PROBE_TITLE,
];

async function expectNothingCaptured() {
  const { save, comparison, sync } = await captures();

  for (const [name, html] of Object.entries({ save, comparison, sync })) {
    expect(typeof html).toBe("string");
    // The page opted in with `<html clay-menu-roster>`, which is the author's own
    // attribute and has to survive a save. It is the one clay-menu- string that is an
    // input to the menu rather than something the menu draws, so it comes off before
    // the scan, and only after proving it is the one occurrence.
    expect(html.match(AUTHORED_OPT_IN)).toHaveLength(1);
    const drawn = html.replace(AUTHORED_OPT_IN, "");
    for (const needle of [...FORBIDDEN_CLASSES, ...FORBIDDEN_IDS, ...FORBIDDEN_TEXTS]) {
      expect([name, needle, drawn.includes(needle)]).toEqual([name, needle, false]);
    }
  }
}

const expectDrawn = (selectors) => {
  for (const selector of selectors) {
    expect([selector, $$(selector).length > 0 || $$(selector, "menu").length > 0 || $$(selector, "seo").length > 0]).toEqual([selector, true]);
  }
};

// Opening the menu closes the people panel, so the surfaces are captured in two
// phases: the people panel with its name field, then everything else at once.
test("every surface is drawn and none of it is in a save, a comparison or a sync frame", async () => {
  viewport(1000, 800);
  await boot();
  stubPeople(true);
  await present(THREE);

  click(gooOf());
  expect(listOf().hidden).toBe(false);

  click(itemOf("clay.people"));
  await flush();
  expect(panelOf()).not.toBeNull();
  click(buttonNamed(meRowOf(), "Change"));
  await flush();
  expectDrawn([".clay-roster", ".clay-people", ".clay-people-input", "#clay-menu-vars"]);
  await expectNothingCaptured();

  const dock = dockOf();
  const grip = gripOf();
  layoutDock(dock);
  grip.dispatchEvent(pointer("pointerdown", { x: 950, y: 20 }));
  grip.dispatchEvent(pointer("pointermove", { x: 100, y: 700 }));

  click(gooOf());
  click(itemOf("seo"));
  await flush();
  expect(sheetOf()).not.toBeNull();
  setValue("title", PROBE_TITLE);

  window.clay.menu.note(PROBE_NOTE);

  window.clay.menu.open();
  await flush();

  expectDrawn([
    ".clay-menu-dock",
    ".clay-menu-list",
    ".clay-roster",
    ".clay-menu-spots",
    ".clay-seo",
    ".clay-menu-note",
    "#clay-menu-vars",
    "#clay-seo-vars",
  ]);
  expect(noteOf().hidden).toBe(false);
  expect(noteOf().textContent).toBe(PROBE_NOTE);

  await expectNothingCaptured();
});

test("chrome actions are not edits and record nothing in undo", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  for (let i = 0; i < 40 && window.clay.hasUnsavedChanges(); i++) await wait(10);
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  const historyBefore = window.clay.undo.history.length;

  click(gooOf());
  click(gooOf());

  press(gripOf(), "ArrowDown");
  press(gripOf(), "ArrowLeft");
  press(gripOf(), "ArrowUp");

  click(gooOf());
  click(itemOf("clay.people"));
  await flush();
  expect(panelOf()).not.toBeNull();
  click($(".clay-people-close", "menu"));
  await flush();
  expect(panelOf()).toBeNull();

  click(gooOf());
  click(itemOf("seo"));
  await flush();
  expect(sheetOf()).not.toBeNull();
  click($(".clay-seo-cancel", "seo"));
  await flush();
  expect(hostOf("seo")).toBeNull();

  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(window.clay.undo.history.length).toBe(historyBefore);
});

test("reopening the menu and the panel five times leaves one of each surface", async () => {
  await boot();
  stubPeople(true);
  await present(THREE);

  for (let i = 0; i < 5; i++) {
    click(gooOf());
    click(gooOf());
  }
  for (let i = 0; i < 5; i++) {
    click(itemOf("clay.people"));
    await flush();
    expect(panelOf()).not.toBeNull();
    click($(".clay-people-close", "menu"));
    await flush();
  }

  expect($$(".clay-menu-dock", "menu")).toHaveLength(1);
  expect($$(".clay-people", "menu").length).toBeLessThanOrEqual(1);
  expect(document.querySelectorAll('clay-editor-ui[data-clay-ui="menu"]')).toHaveLength(1);
  expect(document.querySelectorAll("#clay-menu-style")).toHaveLength(0);
  expect(document.querySelectorAll("#clay-menu-vars")).toHaveLength(1);
});
