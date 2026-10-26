/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * Fix 6: every feature that hangs off a session follows the committed mode, never the mode
 * the tab happened to boot with.
 *
 * A tab that booted in view leaves three pieces of editor-only machinery decided at boot:
 * RichClay's legacy window.__hyperclayEditMode, the view-mode `[trigger-save]` notice, and
 * the authored form of every `[editmode:onclick]` control. After a live entry each has to
 * behave exactly as it does on an explicit edit boot, and after a live exit as it does in
 * view. The tests below switch through the real loader, the real controller and the real
 * plugins; only the host is a fixture.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 5; i++) await sleep(0);
};

const until = async (predicate) => {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return true;
    await sleep(5);
  }
  return false;
};

// The plan the plain cases boot with: the two plugins whose boot decision a case measures
// are named by that case itself (richclay mounts regions, source maps the file).
const PLAIN_PARAMS = "exclude=richclay,source";

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

function installRouter() {
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) =>
    (options.method || "GET") === "POST" ? okResponse() : notFound()
  );
}

async function bootPage({ url = "/notes.html", params = PLAIN_PARAMS, body = '<div id="content">start</div>' } = {}) {
  jest.resetModules();
  installRouter();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", url);
  sessionStorage.clear();
  window.scrollTo = () => {};
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "";
  document.body.innerHTML = body;
  window.clay = {};
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  // The page's accepted baseline settles a quiet moment after boot; comparing an edit
  // against a moving baseline would test the fixture, not the switch.
  const save = await import("../../src/core/save.js").catch(() => null);
  if (save) await until(() => save.baselineSettled());
  return window.clay;
}

// First in the file on purpose: the notice a view boot installs is page-lifetime and is
// never removed, so a boot earlier in this document would answer the same clicks.
test("the view-mode save notice is silent once the tab is editing", async () => {
  const clay = await bootPage();
  const button = document.createElement("button");
  button.setAttribute("trigger-save", "");
  document.getElementById("content").appendChild(button);

  let attempts = 0;
  document.addEventListener("clay:view-save-attempt", () => { attempts++; });

  // The listener a view boot installs is the one that answers here.
  button.click();
  expect(attempts).toBe(1);

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  button.click();
  await flush();
  expect(attempts).toBe(1);

  // ...and an exit puts it back on duty.
  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  button.click();
  expect(attempts).toBe(2);
});

test("a live entry makes RichClay's regions editable, and the exit hands them back read-only", async () => {
  const clay = await bootPage({
    params: "exclude=source",
    body: '<main><div id="region" editable><h2>Team plan</h2><p>$12 per seat.</p></div></main>',
  });
  const region = document.getElementById("region");
  expect(clay.mode).toBe("view");
  expect(region.getAttribute("contenteditable")).toBeNull();
  expect(window.__hyperclayEditMode).toBe(false);

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  await flush();
  expect(window.__hyperclayEditMode).toBe(true);
  expect(region.getAttribute("contenteditable")).toBe("true");

  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  await flush();
  expect(window.__hyperclayEditMode).toBe(false);
  expect(region.getAttribute("contenteditable")).toBeNull();
});

test("a live entry on a URL that asked for view leaves no editmode parameter behind", async () => {
  // The parameter was how a person asked for a mode in the URL, and the committed mode is
  // the answer: RichClay reads the parameter ahead of the facts, so a live entry under
  // `?editmode=false` left its regions read-only until the URL said otherwise (Opus 9).
  const clay = await bootPage({
    url: "/notes.html?editmode=false&keep=1#frag",
    params: "exclude=source",
    body: '<main><div id="region" editable><h2>Team plan</h2><p>$12 per seat.</p></div></main>',
  });
  const region = document.getElementById("region");
  expect(clay.mode).toBe("view");
  expect(region.getAttribute("contenteditable")).toBeNull();

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  await flush();
  expect(region.getAttribute("contenteditable")).toBe("true");
  // Every other parameter and the hash stay; only the answered request goes.
  expect(window.location.pathname).toBe("/notes.html");
  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("#frag");

  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  await flush();
  expect(region.getAttribute("contenteditable")).toBeNull();
  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("#frag");
});

test("a clean cycle gives an [editmode:onclick] control back the attribute order the file served", async () => {
  const clay = await bootPage({
    body: '<div id="content"><button id="btn" inert-onclick="run()" editmode:onclick>Save</button></div>',
  });
  const btn = document.getElementById("btn");
  const order = () => Array.from(btn.attributes, (attribute) => attribute.name);
  expect(order()).toEqual(["id", "inert-onclick", "editmode:onclick"]);

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  expect(btn.getAttribute("onclick")).toBe("run()");

  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  expect(btn.getAttribute("onclick")).toBeNull();
  expect(btn.getAttribute("inert-onclick")).toBe("run()");
  expect(order()).toEqual(["id", "inert-onclick", "editmode:onclick"]);
});

test("a boot that the URL put in edit keeps its editmode parameter, so a reload stays in edit", async () => {
  const clay = await bootPage({
    url: "/notes.html?editmode=true&keep=1#frag",
    params: "exclude=source",
    body: '<main><div id="region" editable><h2>Team plan</h2><p>$12 per seat.</p></div></main>',
  });
  await flush();
  expect(clay.mode).toBe("edit");
  expect(window.location.search).toBe("?editmode=true&keep=1");
  expect(window.location.hash).toBe("#frag");
});
