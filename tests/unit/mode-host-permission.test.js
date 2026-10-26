/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * Discovery's answer to "may this caller save here" outranks the load-time hints.
 *
 * ClayJS decides permission once, at module evaluation, from a save token and the owner
 * cookie, and a stale owner cookie looks exactly like a fresh one. `/_/meta` knows the
 * difference: `document.writable` is the host's own answer, and it wins in the one
 * direction that matters, taking back what a hint granted without ever granting anything
 * a hint did not. It never enters edit on its own, a failed refresh leaves the last
 * accepted answer standing, an answer for a document the page has left is ignored, and a
 * denial that lands while someone is editing leaves the editor, and their text, alone.
 */

const SLOT = "/notes.html";
const BODY = '<div id="content" contenteditable="true">start</div>';
const RECEIPT = () => `clay:doc:${location.pathname}:mode-receipt`;

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const response = ({ ok = true, status = 200, body = "" } = {}) => ({
  ok,
  status,
  statusText: ok ? "OK" : String(status),
  headers: { get: () => null },
  text: async () => body,
});

const okMeta = (document) => response({ body: JSON.stringify({ spec: 1, extensions: [], document }) });

let metaAnswer;
let held;
let fetchCalls;

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

function defer() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function boot({ edit = false, url = SLOT, opensIn = null, cookie = true, fake = null, plugins = "menu" } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  if (opensIn) document.documentElement.setAttribute("opens-in", opensIn);
  if (fake) {
    const target = new URL(url, fake.origin);
    fake.href = target.href;
    fake.pathname = target.pathname;
    fake.search = target.search;
  } else {
    window.history.replaceState({}, "", url);
  }
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  window.fetch = async (input) => {
    const target = String(input);
    fetchCalls.push(target);
    if (!target.includes("/_/meta")) return response({ ok: false, status: 404 });
    if (held) return held.promise;
    return metaAnswer;
  };
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await settle();
  return edit;
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

beforeEach(() => {
  metaAnswer = okMeta({ writable: true });
  held = null;
  fetchCalls = [];
});

test("writable:false overrides a stale owner cookie and refuses the switch", async () => {
  metaAnswer = okMeta({ writable: false });
  await boot();

  expect(window.clay.mode).toBe("view");
  expect(window.clay.canEdit).toBe(true);

  await withFakeLocation(async (fake) => {
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: false,
      mode: "view",
      code: "permission-denied",
    });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(sessionStorage.getItem(RECEIPT())).toBeNull();
  expect(window.clay.canEdit).toBe(false);
  expect(window.clay.mode).toBe("view");
});

test("writable:true permits entry but never enters edit by itself", async () => {
  metaAnswer = okMeta({ writable: true });
  await boot();
  const { checkHostPermission } = await import("../../src/core/host-meta.js");

  await withFakeLocation(async (fake) => {
    await expect(checkHostPermission()).resolves.toBe(true);
    expect(window.clay.mode).toBe("view");
    expect(window.clay.isEditMode).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();

    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(JSON.parse(sessionStorage.getItem(RECEIPT()))).toMatchObject({
    mode: "edit",
    canEdit: true,
    internal: true,
  });
});

test.each([
  ["a 404", response({ ok: false, status: 404 })],
  ["a document block with no writable", okMeta({ etag: "e1" })],
])("absent metadata (%s) leaves the hints in charge", async (_name, answer) => {
  metaAnswer = answer;
  await boot();

  await withFakeLocation(async (fake) => {
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(window.clay.canEdit).toBe(true);
});

test("a failed refresh keeps the last accepted answer", async () => {
  metaAnswer = okMeta({ writable: false });
  await boot();

  await withFakeLocation(async (fake) => {
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: false,
      mode: "view",
      code: "permission-denied",
    });

    metaAnswer = response({ ok: false, status: 503 });
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: false,
      mode: "view",
      code: "permission-denied",
    });
    expect(window.clay.canEdit).toBe(false);

    metaAnswer = okMeta({ writable: true });
    await expect(window.clay.setMode("edit")).resolves.toEqual({
      ok: true,
      mode: "edit",
      changed: true,
      reloading: true,
    });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(window.clay.canEdit).toBe(true);
});

test("permission lost while editing keeps the editor and the typed text", async () => {
  metaAnswer = okMeta({ writable: false });

  await withFakeLocation(async (fake) => {
    await boot({ edit: true, opensIn: "edit", fake });

    const content = document.querySelector("#content");
    content.textContent = "typed words";
    content.dispatchEvent(new Event("input", { bubbles: true }));

    expect(fetchCalls.some((target) => target.includes("/_/meta"))).toBe(true);
    expect(window.clay.mode).toBe("edit");
    expect(window.clay.isEditMode).toBe(true);
    expect(window.clay.canEdit).toBe(false);
    expect(fake.reload).not.toHaveBeenCalled();
    expect(content.textContent).toBe("typed words");

    const flush = jest.fn(async () => ({ state: "saved" }));
    window.clay.save = { flush };

    await expect(window.clay.setMode("view")).resolves.toEqual({
      ok: true,
      mode: "view",
      changed: true,
      reloading: true,
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(fake.reload).toHaveBeenCalledTimes(1);
    expect(content.textContent).toBe("typed words");
  });
});

test("an answer that lands after the page moved on is ignored", async () => {
  await boot();
  const { checkHostPermission } = await import("../../src/core/host-meta.js");
  const facts = await import("../../src/core/is-edit-mode.js");

  await expect(checkHostPermission({ fresh: true })).resolves.toBe(true);
  expect(facts.canEdit).toBe(true);

  held = defer();
  const late = checkHostPermission({ fresh: true });
  await settle();
  window.history.pushState({}, "", "/other.html");
  held.resolve(okMeta({ writable: false }));

  await expect(late).resolves.toBe(true);
  expect(facts.canEdit).toBe(true);
  expect(window.clay.canEdit).toBe(true);
  expect(window.clay.mode).toBe("view");
});

test("a switch the host refuses reverts the switch and says why", async () => {
  metaAnswer = okMeta({ writable: false });
  await boot();

  const edit = document.querySelector(".clay-menu-edit");
  expect(edit.getAttribute("aria-checked")).toBe("false");
  edit.click();
  await settle();

  expect(edit.getAttribute("aria-checked")).toBe("false");
  expect(document.querySelector(".clay-menu-note").textContent).toBe(
    "You don't have permission to edit this document.",
  );
});
