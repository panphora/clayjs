/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The plan importer: the half of a live entry that fetches what the view boot did not.
 *
 * It runs on the loader's own record and import cache, because two importers that each
 * keep their own cache evaluate a module twice and start two singletons. So the proofs
 * here are counts and order: one thunk call per path across a boot and three entries, the
 * plan's own order kept, an installation and an attachment happening once, a failure
 * retried rather than cached, and an overlapping boot tail and entry sharing one import.
 *
 * A few real module paths are mocked so they can be counted without starting a real
 * editor, a real vendor fetch or a real save. Everything else is real: the loader, its
 * record and handle, the importer, and the plugin members.
 */

let state;

function fresh() {
  state = {
    evaluations: {},
    calls: {},
    order: [],
    installs: [],
    events: [],
    after: {},
    probes: {},
    menuGate: Promise.resolve(),
  };
}

// An evaluation counter for a mocked module path: the factory runs when the module is
// evaluated, so a path evaluated twice reads 2 here whatever the importer believed.
const counted = (path, make) => () => {
  state.evaluations[path] = (state.evaluations[path] || 0) + 1;
  state.after[path]?.();
  return make();
};

jest.unstable_mockModule("../../src/core/admin-attrs.js", counted("core/admin-attrs.js", () => ({
  install: () => state.installs.push("core/admin-attrs.js"),
})));

jest.unstable_mockModule("../../src/core/unsaved-warning.js", counted("core/unsaved-warning.js", () => ({
  hasUnsavedChanges: () => false,
})));

jest.unstable_mockModule("../../src/core/save.js", counted("core/save.js", () => ({
  savePage: function savePage() {},
  savePageForce: {},
  saveOverwritingConflict: {},
  flushSave: () => {},
  savePageSoon: () => {},
})));

jest.unstable_mockModule("../../src/plugins/undo.js", counted("plugins/undo.js", () => ({ undo: {} })));
jest.unstable_mockModule("../../src/plugins/unsent.js", counted("plugins/unsent.js", () => ({ unsent: {} })));
jest.unstable_mockModule("../../src/plugins/sortable.js", counted("plugins/sortable.js", () => ({
  ready: Promise.resolve(),
  sortable: {},
})));
jest.unstable_mockModule("../../src/plugins/menu.js", counted("plugins/menu.js", async () => {
  await state.menuGate;
  return { ready: Promise.resolve() };
}));

// An edit plan with a module of each kind: core paths boot's view plan never imports, an
// immediate plugin whose member the next import can see, and a late path boot's tail did
// import (menu) beside one it dropped as edit-only (sortable).
const PLAN = {
  core: ["core/admin-attrs.js", "core/unsaved-warning.js", "core/save.js"],
  plugins: ["plugins/undo.js", "plugins/unsent.js"],
  late: ["plugins/menu.js", "plugins/sortable.js"],
};

const VIEW_PARAMS = "plugins=menu&exclude=richclay,source";

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
}

// A declared document booted in view, with the loader's handle captured on the way to the
// mode dispatcher. Counting wraps the module thunks themselves, so a second import of a
// path is visible even when the module cache would have answered it.
async function bootDeclared({ menuGate = null, manifest = null, loadEditHints = null } = {}) {
  fresh();
  if (menuGate) state.menuGate = menuGate;
  jest.resetModules();
  document.documentElement.innerHTML = "<head><title>Notes</title></head><body><p>Hi</p></body>";
  delete window.clay;
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", "/notes.html");
  sessionStorage.clear();
  document.documentElement.setAttribute("clay-mode-switch", "live");
  window.clay = {};
  globalThis.fetch = jest.fn(async () => notFound());

  const logic = await import("../../src/loader-logic.js");
  for (const path of Object.keys(logic.MODULES)) {
    const thunk = logic.MODULES[path];
    logic.MODULES[path] = (...args) => {
      state.calls[path] = (state.calls[path] || 0) + 1;
      state.order.push(path);
      state.probes[path]?.();
      return thunk(...args);
    };
  }

  let handle = null;
  const editModeThunk = logic.MODULES["core/edit-mode.js"];
  logic.MODULES["core/edit-mode.js"] = async () =>
    new Proxy(await editModeThunk(), {
      get: (target, key) => (key === "noteLiveSwitch" ? (value) => { handle = value; } : target[key]),
    });

  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(VIEW_PARAMS), resolve, manifest, null, loadEditHints));
  if (!handle) throw new Error("the declared document did not hand its handle to the dispatcher");
  return handle;
}

const settle = async (ticks = 20) => {
  for (let i = 0; i < ticks; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

async function importer() {
  return import("../../src/core/mode-switch.js");
}

afterEach(() => {
  delete window.clay;
  jest.restoreAllMocks();
});

test("every planned module evaluates once across a view boot and three entries", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();

  const first = await importPlan(handle, PLAN, {});
  const second = await importPlan(handle, PLAN, {});
  const third = await importPlan(handle, PLAN, {});

  // The first entry loads the plugins boot had not; the later ones have nothing left.
  expect(first).toEqual(["plugins/undo.js", "plugins/unsent.js", "plugins/sortable.js"]);
  expect(second).toEqual([]);
  expect(third).toEqual([]);

  for (const path of [...PLAN.core, ...PLAN.plugins, ...PLAN.late]) {
    expect({ path, evaluations: state.evaluations[path] }).toEqual({ path, evaluations: 1 });
    expect({ path, calls: state.calls[path] }).toEqual({ path, calls: 1 });
  }
});

test("the plan's own order is kept: core, then plugins, then the late tail", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();

  state.order.length = 0;
  await importPlan(handle, PLAN, {});

  // Menu is already loaded, so it is skipped rather than imported again; everything else
  // arrives in the order the plan lists it.
  expect(state.order).toEqual([
    "core/admin-attrs.js",
    "core/unsaved-warning.js",
    "core/save.js",
    "plugins/undo.js",
    "plugins/unsent.js",
    "plugins/sortable.js",
  ]);
});

test("a core module's install runs once, on the entry that imports it", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();

  await importPlan(handle, PLAN, {});
  expect(state.installs).toEqual(["core/admin-attrs.js"]);

  await importPlan(handle, PLAN, {});
  expect(state.installs).toEqual(["core/admin-attrs.js"]);
});

test("a plugin's member is attached before the next import starts", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();

  let undoAttached = null;
  state.probes["plugins/unsent.js"] = () => { undoAttached = typeof window.clay.undo; };
  await importPlan(handle, PLAN, {});

  expect(undoAttached).toBe("object");
  expect(window.clay.unsent).toEqual({});
});

test("a rejected import is retried with the same thunk on the next entry and then succeeds", async () => {
  const handle = await bootDeclared();
  const logic = await import("../../src/loader-logic.js");
  const { importPlan } = await importer();

  const thunk = logic.MODULES["plugins/sortable.js"];
  let attempts = 0;
  let failing = true;
  logic.MODULES["plugins/sortable.js"] = () => {
    attempts++;
    if (failing) return Promise.reject(new Error("offline"));
    return thunk();
  };
  const kept = logic.MODULES["plugins/sortable.js"];

  await expect(importPlan(handle, PLAN, {})).rejects.toThrow("offline");
  expect(handle.loaded["plugins/sortable.js"]).toBeUndefined();
  expect(logic.MODULES["plugins/sortable.js"]).toBe(kept);

  failing = false;
  const loaded = await importPlan(handle, PLAN, {});

  expect(attempts).toBe(2);
  expect(loaded).toEqual(["plugins/sortable.js"]);
  expect(state.evaluations["plugins/sortable.js"]).toBe(1);
  expect(window.clay.sortable).toEqual({});
});

test("an overlapping boot late tail and an entry share one import", async () => {
  let openMenu;
  const menuGate = new Promise((resolve) => { openMenu = resolve; });

  const handle = await bootDeclared({ menuGate });
  // The tail is inside its own import of the menu, which the gate holds.
  expect(state.calls["plugins/menu.js"]).toBe(1);
  expect(handle.loaded["plugins/menu.js"]).toBeUndefined();

  const { importPlan } = await importer();
  const pending = importPlan(handle, PLAN, {});
  // The entry runs its core wave and its plugins to the end while the tail's import is
  // still in flight, and it starts no import of its own for the same path.
  await settle();
  expect(state.calls["plugins/undo.js"]).toBe(1);
  expect(state.calls["plugins/unsent.js"]).toBe(1);
  expect(state.calls["plugins/menu.js"]).toBe(1);
  expect(handle.loaded["plugins/menu.js"]).toBeUndefined();

  openMenu();
  expect(await pending).toEqual(["plugins/undo.js", "plugins/unsent.js", "plugins/sortable.js"]);
  expect(state.calls["plugins/menu.js"]).toBe(1);
  expect(state.evaluations["plugins/menu.js"]).toBe(1);
  expect(handle.loaded["plugins/menu.js"]).toBeTruthy();
});

test("an aborted signal stops before the next import", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();
  const controller = new AbortController();
  state.after["core/admin-attrs.js"] = () => controller.abort();

  const error = await importPlan(handle, PLAN, { signal: controller.signal }).catch((err) => err);

  expect(error.name).toBe("AbortError");
  expect(state.calls["core/admin-attrs.js"]).toBe(1);
  expect(state.calls["core/unsaved-warning.js"]).toBeUndefined();
  expect(state.calls["core/save.js"]).toBeUndefined();
  expect(state.calls["plugins/undo.js"]).toBeUndefined();
  expect(handle.loaded["core/save.js"]).toBeUndefined();
});

test("an entry dispatches no clay:plugin-ready, even for the plugins it loads", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();

  document.addEventListener("clay:plugin-ready", (event) => state.events.push(event.detail.plugin));
  await importPlan(handle, PLAN, {});

  expect(state.events).toEqual([]);
  expect(window.clay.sortable).toEqual({});
});

test("an entry preloads what the bootstrap's hint index lists for the plan it imports", async () => {
  const manifest = { base: "https://clayjs.com/", entries: {}, imports: {}, bootImports: {} };
  const hints = { base: "https://clayjs.com/", entries: { "core/save.js": "m/save.js" }, imports: {}, bootImports: {} };
  const handle = await bootDeclared({ manifest, loadEditHints: async () => hints });
  const { importPlan } = await importer();

  await importPlan(handle, PLAN, {});

  const preloaded = [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href);
  expect(preloaded).toContain("https://clayjs.com/m/save.js");
});

test("a failed hint fetch does not veto the entry's imports", async () => {
  const handle = await bootDeclared({ loadEditHints: () => Promise.reject(new Error("offline")) });
  const { importPlan } = await importer();

  expect(await importPlan(handle, PLAN, {})).toEqual([
    "plugins/undo.js",
    "plugins/unsent.js",
    "plugins/sortable.js",
  ]);
});

test("clay.save.replace survives attachEditCore", async () => {
  const handle = await bootDeclared();
  const { importPlan } = await importer();
  const saveModule = await import("../../src/core/save.js");
  const replace = () => {};

  // What an upgrade-capable reader leaves behind: the plugin's temporary save object, with
  // no save function under it yet, because the save module has not landed.
  handle.attach("plugins/upgrade.js", { replace });
  expect(window.clay.save).toEqual({ replace });

  await importPlan(handle, PLAN, {});

  expect(window.clay.save).toBe(saveModule.savePage);
  expect(window.clay.save.replace).toBe(replace);
  expect(window.clay.save.flush).toBe(saveModule.flushSave);
});
