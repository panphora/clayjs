/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

jest.setTimeout(120000);

/**
 * D1: a controlled attribute the author did not write last on its element made a no-input
 * entry write the file, and every later entry was refused `pending-input`.
 *
 * Entering edit mode takes the attribute over: `viewmode:disabled` loses its `disabled`,
 * `editmode:contenteditable` swaps `inert-contenteditable` for the active spelling, and
 * `editmode:onclick` does the same with `onclick`. The save transforms put the inert
 * attribute back, and an attribute written again lands at the END of the list. The saved
 * clone then differs from the entry baseline by attribute order alone: one unwanted write,
 * and leaving rewrote the live DOM in the authored order (`restoreAuthoredOrder`), so the
 * page on screen no longer matched the baseline the host accepted and every later entry
 * was refused. The transforms now hand the clone its authored order too, read from the
 * clone's live original.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};

const until = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};

function okResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: async () => JSON.stringify({ msg: "Saved" }),
  };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
}

// The bytes every file write carried, in the order they went out. Only `/_/save` is a file
// write; the page data lane posts elsewhere and is not a second save.
let written = [];

async function bootPage(body, { autosave = false } = {}) {
  jest.resetModules();
  written = [];
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if ((options.method || "GET").toUpperCase() === "POST" && /\/_\/save$/.test(new URL(String(url), window.location.origin).pathname)) {
      written.push(String(options.body ?? ""));
    }
    return (options.method || "GET").toUpperCase() === "POST" ? okResponse() : notFound();
  });

  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", "/notes.html");
  sessionStorage.clear();
  localStorage.clear();
  window.scrollTo = () => {};

  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("clay-mode-switch", "live");
  if (autosave) root.setAttribute("autosave", "");
  document.head.innerHTML = "<title>Notes</title>";
  // clays the page out of the way of this test: richclay would mount its own regions and
  // source would map the file, and neither is what attribute order depends on.
  document.body.innerHTML = body;
  window.clay = {};

  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));

  const save = await import("../../src/core/save.js");
  await until(() => save.baselineSettled());
  await flush();
  return window.clay;
}

const enter = async (clay) => {
  const result = await clay.setMode("edit");
  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  await flush();
};

const leave = async (clay) => {
  const result = await clay.setMode("view");
  expect(result).toEqual({ ok: true, mode: "view", changed: true });
  await flush();
};

const type = async (text) => {
  document.getElementById("text").textContent = text;
  await flush();
};

const page = (element) => `
  <main>
    <div id="text" editmode:contenteditable>start</div>
    ${element}
  </main>`;

// Each controlled attribute, authored NOT last on its element: the case is the marker that
// makes clay take the attribute over, the value edit mode writes while active, and then an
// ordinary authored attribute that the inert form must stay in front of.
const CASES = [
  {
    name: "disabled before value",
    element: '<input id="field" viewmode:disabled="" disabled="" value="v">',
    saved: '<input id="field" viewmode:disabled="" disabled="" value="v">',
    live: (el) => expect(el.hasAttribute("disabled")).toBe(false),
  },
  {
    name: "inert-contenteditable before class",
    element: '<div id="content" editmode:contenteditable="" inert-contenteditable="plaintext-only" class="c">start</div>',
    saved: '<div id="content" editmode:contenteditable="" inert-contenteditable="plaintext-only" class="c">start</div>',
    live: (el) => {
      expect(el.getAttribute("contenteditable")).toBe("plaintext-only");
      expect(el.hasAttribute("inert-contenteditable")).toBe(false);
    },
  },
  {
    name: "inert-onclick before class",
    element: '<button id="act" editmode:onclick="" inert-onclick="window.__a=1" class="b">Act</button>',
    saved: '<button id="act" editmode:onclick="" inert-onclick="window.__a=1" class="b">Act</button>',
    live: (el) => {
      expect(el.getAttribute("onclick")).toBe("window.__a=1");
      expect(el.hasAttribute("inert-onclick")).toBe(false);
    },
  },
];

test.each(CASES)("$name: three entries with no typing write nothing and every entry is admitted", async (kase) => {
  const clay = await bootPage(page(kase.element));
  const warning = await import("../../src/core/unsaved-warning.js");
  try {
    await enter(clay);
    kase.live(document.getElementById(kase.element.match(/id="([^"]+)"/)[1]));
    expect(warning.hasUnsavedChanges()).toBe(false);
    await leave(clay);
    expect(written).toHaveLength(0);

    // Two more cycles: the page on screen is the page the host holds, so each entry is
    // admitted instead of being refused `pending-input`.
    for (let cycle = 0; cycle < 2; cycle++) {
      await enter(clay);
      expect(warning.hasUnsavedChanges()).toBe(false);
      await leave(clay);
    }
    expect(written).toHaveLength(0);
  } finally {
    if (clay.mode === "edit") await leave(clay);
  }
});

test.each(CASES)("$name: one typed edit writes once and keeps the authored attribute order", async (kase) => {
  const clay = await bootPage(page(kase.element));
  try {
    await enter(clay);
    await type("typed once");
    await leave(clay);

    expect(written).toHaveLength(1);
    expect(written[0]).toContain(kase.saved);
  } finally {
    if (clay.mode === "edit") await leave(clay);
  }
});

test.each(CASES)("$name: an autosave page waiting in edit writes nothing", async (kase) => {
  const clay = await bootPage(page(kase.element), { autosave: true });
  try {
    await enter(clay);
    await sleep(5000);
    await flush();
    expect(written).toHaveLength(0);

    // And the entry after it is admitted, so the quiet edit left nothing owing either.
    await leave(clay);
    expect(written).toHaveLength(0);
    await enter(clay);
    expect(clay.mode).toBe("edit");
  } finally {
    if (clay.mode === "edit") await leave(clay);
  }
});
