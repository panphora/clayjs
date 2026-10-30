import { jest } from "@jest/globals";
import { $, rootOf } from "./helpers/editor-ui.js";

// Scenario: the dock sits in a corner the reader chooses, by dragging the grip or with
// its arrow keys, and the choice is remembered for this document in this browser. A
// drag is only a drag once it passes the threshold, and a cancelled one leaves
// everything as it was. Every case boots through the real loader with `plugins=menu`.

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
const gripOf = () => $(".clay-menu-grip", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const listOf = () => $(".clay-menu-list", "menu");
const spotsOf = () => $('.clay-menu-spots[clay="editor-ui"]', "menu");
const spotTo = (corner) => $(`.clay-menu-spot[data-to="${corner}"]`, "menu");

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

test("the dock starts in the top-right corner", async () => {
  await boot();

  expect(dockOf().dataset.corner).toBe("top-right");
});

test("the grip's arrow keys move the dock and cancel the key", async () => {
  await boot();
  const grip = gripOf();

  let event = press(grip, "ArrowDown");
  expect(event.defaultPrevented).toBe(true);
  expect(dockOf().dataset.corner).toBe("bottom-right");

  press(grip, "ArrowLeft");
  expect(dockOf().dataset.corner).toBe("bottom-left");

  press(grip, "ArrowUp");
  expect(dockOf().dataset.corner).toBe("top-left");

  event = press(grip, "a");
  expect(event.defaultPrevented).toBe(false);
  expect(dockOf().dataset.corner).toBe("top-left");
});

test("the corner is remembered for this document in this browser", async () => {
  await boot();
  press(gripOf(), "ArrowDown");

  expect(window.clay.storage.local.get("menu-corner")).toBe("bottom-right");

  await boot({ keepStorage: true });

  expect(dockOf().dataset.corner).toBe("bottom-right");
});

test("a stored value that is not a corner falls back to the top-right", async () => {
  await boot();
  window.clay.storage.local.set("menu-corner", "middle");

  await boot({ keepStorage: true });

  expect(dockOf().dataset.corner).toBe("top-right");
});

test("a drag shows the four spots, then lands in the nearest corner and clears its inline sides", async () => {
  viewport(1000, 800);
  await boot();
  const dock = dockOf();
  const grip = gripOf();
  layoutDock(dock);

  grip.dispatchEvent(pointer("pointerdown", { x: 950, y: 20 }));
  grip.dispatchEvent(pointer("pointermove", { x: 100, y: 700 }));

  expect(dock.hasAttribute("data-dragging")).toBe(true);
  const spots = spotsOf();
  expect(spots).not.toBeNull();
  expect(spots.parentNode).toBe(rootOf("menu"));
  expect(spots.querySelectorAll(".clay-menu-spot")).toHaveLength(4);
  expect(spotTo("bottom-left").hasAttribute("data-near")).toBe(true);
  expect([...spots.children].filter((spot) => spot.hasAttribute("data-near"))).toHaveLength(1);

  grip.dispatchEvent(pointer("pointerup", { x: 100, y: 700 }));

  expect(dock.dataset.corner).toBe("bottom-left");
  expect(spotsOf()).toBeNull();
  expect(dock.hasAttribute("data-dragging")).toBe(false);
  for (const side of ["left", "top", "right", "bottom"]) {
    expect(dock.style.getPropertyValue(side)).toBe("");
  }
});

test("a move of two pixels is not a drag", async () => {
  viewport(1000, 800);
  await boot();
  const dock = dockOf();
  const grip = gripOf();
  layoutDock(dock);

  let made = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains("clay-menu-spots")) made += 1;
      }
    }
  });
  observer.observe(rootOf("menu"), { childList: true });

  grip.dispatchEvent(pointer("pointerdown", { x: 950, y: 20 }));
  grip.dispatchEvent(pointer("pointermove", { x: 948, y: 20 }));

  expect(spotsOf()).toBeNull();
  expect(dock.hasAttribute("data-dragging")).toBe(false);
  expect(dock.style.getPropertyValue("left")).toBe("");

  grip.dispatchEvent(pointer("pointerup", { x: 948, y: 20 }));
  await flush();
  observer.disconnect();

  expect(made).toBe(0);
  expect(dock.dataset.corner).toBe("top-right");
  expect(dock.style.getPropertyValue("left")).toBe("");
});

test("a cancelled drag puts the dock back where it was and remembers nothing", async () => {
  viewport(1000, 800);
  await boot();
  const dock = dockOf();
  const grip = gripOf();
  layoutDock(dock);

  grip.dispatchEvent(pointer("pointerdown", { x: 950, y: 20 }));
  grip.dispatchEvent(pointer("pointermove", { x: 100, y: 700 }));
  expect(spotsOf()).not.toBeNull();

  grip.dispatchEvent(pointer("pointercancel", { x: 100, y: 700 }));

  expect(spotsOf()).toBeNull();
  expect(dock.hasAttribute("data-dragging")).toBe(false);
  expect(dock.dataset.corner).toBe("top-right");
  expect(window.clay.storage.local.get("menu-corner")).toBeUndefined();
  expect(dock.style.getPropertyValue("left")).toBe("");
});

test("dragging closes an open list", async () => {
  viewport(1000, 800);
  await boot();
  const dock = dockOf();
  const grip = gripOf();
  layoutDock(dock);

  const goo = gooOf();
  goo.focus();
  press(goo, "Enter");
  expect(listOf().hidden).toBe(false);

  grip.dispatchEvent(pointer("pointerdown", { x: 950, y: 20 }));
  grip.dispatchEvent(pointer("pointermove", { x: 100, y: 700 }));

  expect(listOf().hidden).toBe(true);
});

test("the intro pushes the dock down only while the dock is at the top", async () => {
  await boot({
    body: '<section class="clay-intro">About this app</section><div id="content">start</div>',
    introBottom: 120,
  });

  const dock = dockOf();
  expect(parseFloat(dock.style.top)).toBeGreaterThanOrEqual(120);

  press(gripOf(), "ArrowDown");

  expect(dock.dataset.corner).toBe("bottom-right");
  expect(dock.style.top).toBe("");
});
