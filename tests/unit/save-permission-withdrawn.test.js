/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * R4-1: a page the host has said is no longer writable sends no save request.
 *
 * Discovery's `document.writable` is the host's own answer, and `checkHostPermission`
 * already reads it: false takes `canEdit` away and leaves the editor and its text alone.
 * What it did not do was reach the save lane, so the exit's flush still sent one POST the
 * host answered 403, with the person's text riding on a request nobody would take.
 *
 * Here the answer is given to the real `checkHostPermission`, and every lane is asked
 * afterwards: an explicit save, the automatic one, a force save, and the exit barrier's own
 * flush. All of them refuse locally with the shape a host 403 produces, nothing reaches the
 * wire, and the page still holds its bytes. A later writable answer clears it, and the next
 * save goes out once.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 5; i++) await sleep(0);
};

let save, snapshot, warning, transition, modeFacts, permission;
let posts = [];
let writable = true;
let errors = [];

function okResponse(body = { msg: "Saved" }, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

// Every POST is a save. Everything else is discovery, answered with this document's own
// block, whose `writable` the cases below move.
async function route(url, options = {}) {
  if ((options.method || "GET") === "POST") {
    posts.push(String(options.body ?? ""));
    return okResponse({ msg: "Saved", etag: `"E${posts.length}"` });
  }
  const pathname = new URL(String(url), window.location.href).pathname;
  if (pathname.startsWith("/_/meta")) {
    return okResponse({
      spec: 1,
      extensions: [],
      document: { path: window.location.pathname, writable, etag: '"E0"' },
    });
  }
  return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.body.innerHTML = '<div id="content">start</div>';
  globalThis.fetch = window.fetch = jest.fn(route);
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  warning = await import("../../src/core/unsaved-warning.js");
  transition = await import("../../src/core/mode-transition.js");
  modeFacts = await import("../../src/core/is-edit-mode.js");
  permission = await import("../../src/core/host-permission.js");
  save.setSaveGeneration(1);
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
  await sleep(50);
  document.addEventListener("clay:save-error", (event) => errors.push(event.detail));
}, 20000);

beforeEach(() => {
  posts.length = 0;
  errors.length = 0;
});

const edit = async (text) => {
  document.getElementById("content").textContent = text;
  await flush();
};

test("with no answer learned, a save goes out once", async () => {
  await edit("the first saved text");
  expect(warning.hasUnsavedChanges()).toBe(true);

  const saved = await save.savePage();
  expect(saved.ok).toBe(true);
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("the first saved text");
  expect(warning.hasUnsavedChanges()).toBe(false);
});

test("a denial from the host refuses the exit's flush without sending anything", async () => {
  await edit("typed before the host withdrew");

  writable = false;
  await expect(permission.checkHostPermission({ fresh: true })).resolves.toBe(false);
  expect(modeFacts.canEdit).toBe(false);
  expect(modeFacts.isEditMode).toBe(true);
  expect(posts.length).toBe(0);

  const left = await transition.runSaveBarrier();
  expect(left).toMatchObject({ ok: false, code: "save-failed" });
  expect(posts.length).toBe(0);

  expect(document.getElementById("content").textContent).toBe("typed before the host withdrew");
  expect(warning.hasUnsavedChanges()).toBe(true);
  expect(document.documentElement.getAttribute("savestatus")).toBe("error");
});

test("an explicit save is refused locally, in the shape a host 403 produces", async () => {
  const result = await save.savePage();
  expect(result).toMatchObject({ ok: false, msgType: "forbidden", code: "forbidden", status: 403, sent: false });
  expect(posts.length).toBe(0);
  expect(errors.length).toBe(1);
  expect(errors[0]).toMatchObject({ msg: result.msg, code: "forbidden", status: 403 });
  expect(warning.hasUnsavedChanges()).toBe(true);
});

test("a force save is refused the same way", async () => {
  const result = await save.savePageForce();
  expect(result).toMatchObject({ ok: false, msgType: "forbidden", code: "forbidden" });
  expect(posts.length).toBe(0);
  expect(document.getElementById("content").textContent).toBe("typed before the host withdrew");
});

test("autosave sends nothing while the denial stands", async () => {
  const automatic = await save.savePageThrottled();
  expect(automatic).toMatchObject({ ok: false, msgType: "forbidden" });
  expect(posts.length).toBe(0);

  await edit("typed again with the denial standing");
  save.autosaveScheduler.request();
  await sleep(1600);
  expect(posts.length).toBe(0);
  expect(document.getElementById("content").textContent).toBe("typed again with the denial standing");
  expect(warning.hasUnsavedChanges()).toBe(true);
}, 20000);

test("a writable answer again clears it, and the next save goes out once", async () => {
  writable = true;
  await expect(permission.checkHostPermission({ fresh: true })).resolves.toBe(true);
  expect(modeFacts.canEdit).toBe(true);

  const saved = await save.savePage();
  expect(saved.ok).toBe(true);
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("typed again with the denial standing");
  expect(warning.hasUnsavedChanges()).toBe(false);

  expect((await save.savePage()).msgType).toBe("skipped");
  expect(posts.length).toBe(1);
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
});

// The same refusal seen from the outside: the real loader, the real controller and the real
// save code, only the host a fixture. `clay.setMode` is the leave a person makes, and it has
// to come back refused with the page still theirs.
const until = async (predicate) => {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return true;
    await sleep(5);
  }
  return false;
};

async function bootPage({ url = "/notes.html" } = {}) {
  jest.resetModules();
  posts.length = 0;
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", url);
  sessionStorage.clear();
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "";
  document.body.innerHTML = '<div id="content">start</div>';
  window.clay = {};
  globalThis.fetch = window.fetch = jest.fn(route);
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));
  return window.clay;
}

test("the leave itself is refused: the mode stays edit, nothing is sent, the text stays", async () => {
  writable = true;
  const clay = await bootPage();
  const live = await import("../../src/core/save.js");
  const liveWarning = await import("../../src/core/unsaved-warning.js");
  const livePermission = await import("../../src/core/host-permission.js");
  if (!live.baselineSettled()) live.adoptEntryBaseline();

  await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, mode: "edit" });
  expect(clay.canEdit).toBe(true);
  if (!live.baselineSettled()) live.adoptEntryBaseline();
  await flush();

  document.getElementById("content").textContent = "typed before the host withdrew";
  await flush();
  expect(liveWarning.hasUnsavedChanges()).toBe(true);

  writable = false;
  await expect(livePermission.checkHostPermission({ fresh: true })).resolves.toBe(false);
  expect(clay.canEdit).toBe(false);
  expect(clay.mode).toBe("edit");
  posts.length = 0;

  await expect(clay.setMode("view")).resolves.toMatchObject({ ok: false, mode: "edit", code: "save-failed" });
  expect(posts.length).toBe(0);
  expect(clay.mode).toBe("edit");
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  expect(document.getElementById("content").textContent).toBe("typed before the host withdrew");
  expect(liveWarning.hasUnsavedChanges()).toBe(true);
  expect(await until(() => document.documentElement.getAttribute("savestatus") === "error")).toBe(true);

  writable = true;
  await expect(livePermission.checkHostPermission({ fresh: true })).resolves.toBe(true);
  await expect(clay.setMode("view")).resolves.toMatchObject({ ok: true, mode: "view" });
  expect(posts.length).toBe(1);
  expect(posts[0]).toContain("typed before the host withdrew");
}, 60000);
