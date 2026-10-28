import { jest } from "@jest/globals";

// Scenario: the mode decision asks two questions and answers them once, at module
// evaluation. `canEdit` is the old ladder read as permission; `mode` is whether this
// tab starts editing, which permission alone no longer causes. Every case gets its own
// module load: is-edit-mode.js caches its answer.
//
// One isolated load per case, because a second import in the same file reads the first
// import's answer.

const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const RECEIPT_KEY = () => `clay:doc:${location.pathname}:mode-receipt`;
const realEntriesByType = performance.getEntriesByType;

function prepare({
  url = "/notes.html",
  cookie = false,
  token = false,
  viewonly = false,
  opensIn = null,
  clayEditMode,
  legacyEditMode,
  draft = false,
  receipt = null,
  nav = "navigate",
} = {}) {
  jest.resetModules();
  sessionStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  if (clayEditMode !== undefined) window.clayEditMode = clayEditMode;
  if (legacyEditMode !== undefined) window.__hyperclayEditMode = legacyEditMode;
  window.history.replaceState({}, "", url);
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (token) root.setAttribute("savetoken", "tok-123");
  if (viewonly) root.setAttribute("viewonly", "");
  if (opensIn) root.setAttribute("opens-in", opensIn);
  if (draft) root.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = '<div id="content">start</div>';
  performance.getEntriesByType = (name) => (name === "navigation" ? [{ type: nav }] : []);
  if (receipt) {
    sessionStorage.setItem(
      RECEIPT_KEY(),
      JSON.stringify({ v: 1, path: location.pathname, mode: "edit", canEdit: true, at: Date.now(), internal: false, ...receipt }),
    );
  }
  window.clay = {};
}

async function decide({ draftPlugin = false } = {}) {
  if (draftPlugin) {
    const draftMode = await import("../../src/core/draft-mode.js");
    draftMode.noteBootParams(new URLSearchParams("plugins=visitor-drafts"));
  }
  return import("../../src/core/is-edit-mode.js");
}

async function decideWithRootAttrs(options = {}) {
  prepare(options);
  const mod = await decide(options);
  await import("../../src/core/edit-mode.js");
  return mod;
}

function withFakeLocation(run) {
  const real = window.location;
  const fake = {
    href: real.href,
    pathname: real.pathname,
    search: real.search,
    protocol: real.protocol,
    origin: real.origin,
    reload: jest.fn(),
  };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  return Promise.resolve()
    .then(() => run(fake))
    .finally(() => Object.defineProperty(window, "location", { value: real, configurable: true }));
}

afterEach(() => {
  performance.getEntriesByType = realEntriesByType;
  jest.restoreAllMocks();
});

test("the owner cookie alone opens in view, with permission kept and canedit on the root", async () => {
  const mod = await decideWithRootAttrs({ cookie: true });

  expect(mod.mode).toBe("view");
  expect(mod.isEditMode).toBe(false);
  expect(mod.canEdit).toBe(true);
  expect(document.documentElement.getAttribute("editmode")).toBe("false");
  expect(document.documentElement.getAttribute("canedit")).toBe("true");
});

test("a save token alone opens in view, with permission kept", async () => {
  prepare({ token: true });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(true);
});

test("the owner cookie with ?editmode=true still opens in edit", async () => {
  prepare({ url: "/notes.html?editmode=true", cookie: true });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
  expect(mod.isEditMode).toBe(true);
  expect(mod.canEdit).toBe(true);
});

test("the owner cookie with ?editmode=false opens in view and keeps permission", async () => {
  prepare({ url: "/notes.html?editmode=false", cookie: true });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(true);
});

test("window.clayEditMode = true with no cookie opens in edit", async () => {
  prepare({ clayEditMode: true });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
  expect(mod.canEdit).toBe(true);
});

test("window.clayEditMode = false with the cookie opens in view with no permission", async () => {
  prepare({ clayEditMode: false, cookie: true });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(false);
});

test("opens-in=\"edit\" with a save token opens in edit", async () => {
  prepare({ opensIn: "edit", token: true });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
  expect(mod.canEdit).toBe(true);
});

test("opens-in=\"edit\" with nothing behind it opens in view with no permission", async () => {
  prepare({ opensIn: "edit" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(false);
});

test("viewonly with the owner cookie opens in view with no permission", async () => {
  prepare({ viewonly: true, cookie: true });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(false);
});

test("viewonly with ?editmode=true still opens in edit", async () => {
  prepare({ viewonly: true, url: "/notes.html?editmode=true" });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
  expect(mod.canEdit).toBe(true);
});

test("an edit receipt for this tab's reload opens in edit", async () => {
  prepare({ receipt: { mode: "edit", internal: false }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
  expect(mod.isEditMode).toBe(true);
});

test("the same edit receipt on a link click opens in view and is consumed", async () => {
  prepare({ receipt: { mode: "edit", internal: false }, nav: "navigate" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(sessionStorage.getItem(RECEIPT_KEY())).toBeNull();
});

test("an internal edit receipt opens in edit even on a navigate", async () => {
  prepare({ receipt: { mode: "edit", internal: true }, nav: "navigate" });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
});

test("a receipt older than 30 s opens in view", async () => {
  prepare({ receipt: { mode: "edit", internal: true, at: Date.now() - 31000 }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
});

test("a receipt for another document opens in view", async () => {
  prepare({ receipt: { mode: "edit", internal: true, path: "/other.html" }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
});

test("?editmode=true with an internal view receipt opens in view and keeps permission", async () => {
  prepare({ url: "/notes.html?editmode=true", receipt: { mode: "view", internal: true, canEdit: true } });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(true);
});

test("a reload with a view receipt keeps permission with no cookie or token", async () => {
  prepare({ receipt: { mode: "view", internal: false, canEdit: true }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(true);
});

test("opens-in=\"edit\" outranks the view receipt a reload left on hide", async () => {
  prepare({ opensIn: "edit", token: true, receipt: { mode: "view", internal: false, canEdit: true }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("edit");
});

test("a switch to view the person made survives the reload on an opens-in=\"edit\" page", async () => {
  prepare({ opensIn: "edit", token: true, receipt: { mode: "view", internal: true, canEdit: true }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
});

test("a receipt's canEdit is ignored under window.clayEditMode = false", async () => {
  prepare({ clayEditMode: false, receipt: { mode: "view", internal: false, canEdit: true }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(false);
});

test("a receipt's canEdit is ignored under viewonly", async () => {
  prepare({ viewonly: true, receipt: { mode: "view", internal: false, canEdit: true }, nav: "reload" });
  const mod = await decide();

  expect(mod.mode).toBe("view");
  expect(mod.canEdit).toBe(false);
});

test("a draft-eligible visitor still lands in draft mode", async () => {
  prepare({ draft: true });
  const mod = await decide({ draftPlugin: true });
  await import("../../src/core/edit-mode.js");

  expect(mod.isDraftMode).toBe(true);
  expect(mod.mode).toBe("draft");
  expect(mod.isEditMode).toBe(true);
  expect(mod.canEdit).toBe(false);
  expect(document.documentElement.getAttribute("editmode")).toBe("true");
  expect(document.documentElement.getAttribute("draftmode")).toBe("true");
});

test("canedit is absent from clay.getHTML()", async () => {
  prepare({ url: "/notes.html?editmode=true", cookie: true });
  window.fetch = jest.fn(async () => new Response("", { status: 404 }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));

  expect(window.clay.canEdit).toBe(true);
  expect(document.documentElement.getAttribute("canedit")).toBe("true");
  expect(window.clay.getHTML()).not.toContain("canedit");
});

test("setMode('edit') from view writes an internal edit receipt and reloads without touching the URL", async () => {
  prepare({ cookie: true });
  const decided = await decide();
  const editMode = await import("../../src/core/edit-mode.js");
  expect(decided.mode).toBe("view");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
    expect(fake.href).toBe("http://localhost/notes.html");
  });

  expect(JSON.parse(sessionStorage.getItem(`clay:doc:/notes.html:mode-receipt`))).toMatchObject({
    v: 1,
    path: "/notes.html",
    mode: "edit",
    canEdit: true,
    internal: true,
  });
});

test("setMode('view') with a failing flush answers save-failed and does not navigate", async () => {
  prepare({ url: "/notes.html?editmode=true", cookie: true });
  const decided = await decide();
  window.clay = { save: { flush: jest.fn(async () => ({ state: "failed" })) } };
  const editMode = await import("../../src/core/edit-mode.js");
  expect(decided.mode).toBe("edit");

  await withFakeLocation(async (fake) => {
    await expect(editMode.setMode("view")).resolves.toEqual({
      ok: false,
      mode: "edit",
      code: "save-failed",
      state: "failed",
    });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(`clay:doc:/notes.html:mode-receipt`)).toBeNull();
});

test("setMode in draft mode is not-allowed", async () => {
  prepare({ draft: true });
  await decide({ draftPlugin: true });
  const editMode = await import("../../src/core/edit-mode.js");

  await expect(editMode.setMode("edit")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
  await expect(editMode.setMode("view")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
});
