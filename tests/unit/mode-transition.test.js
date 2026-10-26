/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The public transaction: `clay.setMode` runs the whole live controller for a document
 * that signed `<html clay-mode-switch="live">` and whose edit plan this release can
 * start and take back. Every other document keeps the guarded reload it has today.
 *
 * The tests below switch through the real loader, the real controller, the real adapter
 * decision and the real save code. Only the host is a fixture: a POST is a save, a GET
 * is a host-meta or template lookup that 404s.
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

const API_TAG = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const VIEW_PARAMS = "exclude=richclay,source";
const DRAFT_PARAMS = "plugins=visitor-drafts&exclude=richclay,source";

let posts = [];

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
  posts = [];
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if ((options.method || "GET") !== "POST") return notFound();
    posts.push(String(options.body ?? ""));
    return okResponse();
  });
}

// A participant whose lease records every call, so a case can say what the controller
// did to it and in what order.
function participant(id, log, { order = 1000, lease = {}, prepare = null } = {}) {
  return {
    id,
    order,
    prepare: async (context) => {
      log.push(`${id}:prepare`);
      if (prepare) await prepare(context);
      return {
        enable: () => log.push(`${id}:enable`),
        quiesce: async () => log.push(`${id}:quiesce`),
        resume: () => log.push(`${id}:resume`),
        dispose: () => log.push(`${id}:dispose`),
        ...lease,
      };
    },
  };
}

async function bootPage({
  url = "/notes.html",
  params = VIEW_PARAMS,
  edit = false,
  owner = false,
  draft = false,
  declared = false,
  resources = "",
  queue = null,
} = {}) {
  jest.resetModules();
  installRouter();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (owner) document.cookie = "isAdminOfCurrentResource=true; path=/";
  if (edit) window.clayEditMode = true;
  window.history.replaceState({}, "", url);
  sessionStorage.clear();
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (declared) root.setAttribute("clay-mode-switch", "live");
  if (draft) root.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = draft ? API_TAG : "";
  document.body.innerHTML = `${resources}<div id="content">start</div>`;
  window.clay = queue ? { modeParticipants: queue } : {};
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  // The page's accepted baseline settles a quiet moment after boot; comparing an edit
  // against a moving baseline would test the fixture, not the switch.
  const save = await import("../../src/core/save.js").catch(() => null);
  if (save) await until(() => save.baselineSettled());
  return window.clay;
}

// `setMode` is imported directly by the keyboard toggle as well as exposed on `clay`,
// so the fake location replaces the window's own before the module reads it.
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

const receipt = () => sessionStorage.getItem(`clay:doc:${location.pathname}:mode-receipt`);

// A live entry starts on a page whose save module was imported in view, where the boot
// settle declines to run. The entry's own adoption is a later step; a case that exits
// settles the page's accepted baseline here, so the exit's barrier has something to
// compare the page against.
const settleEntry = async () => {
  const save = await import("../../src/core/save.js");
  if (!save.baselineSettled()) save.adoptEntryBaseline();
};

test("a declared document enters edit and leaves it without a reload", async () => {
  const log = [];
  const clay = await bootPage({ owner: true, declared: true, queue: [participant("template:board", log)] });

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
    expect(fake.reload).not.toHaveBeenCalled();
    expect(clay.mode).toBe("edit");
    expect(clay.modeLifecycle.canWrite()).toBe(true);
    await settleEntry();

    await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(clay.mode).toBe("view");
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  expect(log).toEqual([
    "template:board:prepare",
    "template:board:enable",
    "template:board:quiesce",
    "template:board:dispose",
  ]);
  // Neither direction left a receipt for a reload that never happened.
  expect(receipt()).toBeNull();
});

test("an undeclared document keeps the guarded reload", async () => {
  const log = [];
  const clay = await bootPage({ owner: true, queue: [participant("template:board", log)] });

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(log).toEqual([]);
  expect(clay.mode).toBe("view");
  expect(JSON.parse(receipt())).toMatchObject({ mode: "edit", internal: true });
});

test("a declared document whose edit plan asks for a module with no adapter keeps the guarded reload", async () => {
  const log = [];
  // Sortable is a real lease, but this release has no adapter registered for its path,
  // so the document cannot be started and taken back without a reload.
  const clay = await bootPage({
    owner: true,
    declared: true,
    params: "plugins=sortable&exclude=richclay,source",
    queue: [participant("template:board", log)],
  });

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, reloading: true });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(log).toEqual([]);
  expect(clay.mode).toBe("view");
});

test("a declared document whose queued participant is not a participant keeps the guarded reload", async () => {
  const log = [];
  const clay = await bootPage({ owner: true, declared: true, queue: [{ id: "template:broken" }, participant("template:board", log)] });

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, reloading: true });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });

  expect(log).toEqual([]);
});

test("a declared document's authored resources are the first lease of the session", async () => {
  const style = '<style id="s" type="inert/" editmode:resource>.x { color: red; }</style>';
  const clay = await bootPage({ owner: true, declared: true, resources: style });
  const live = () => document.querySelector('style[editmode\\:resource]');

  await clay.setMode("edit");
  expect(live().hasAttribute("type")).toBe(false);

  await settleEntry();
  await clay.setMode("view");
  // Back to the spelling the file was served with, so a reader pays for nothing.
  expect(live().getAttribute("type")).toBe("inert/");
});

test("a second entry starts a fresh session, and an edit made in it is written once", async () => {
  const log = [];
  const clay = await bootPage({ edit: true, owner: true, declared: true, queue: [participant("template:board", log)] });
  const first = log.slice();
  expect(clay.mode).toBe("edit");

  await clay.setMode("view");
  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });

  // The second session prepares and enables the same way the first one did.
  const second = log.slice(first.length + 2); // the exit's quiesce and dispose, then the entry
  expect(second).toEqual(first);

  const before = posts.length;
  document.getElementById("content").textContent = "typed in the second session";
  await flush();
  expect(await clay.save()).toBeTruthy();
  await flush();

  expect(posts.length - before).toBe(1);
  expect(posts[posts.length - 1]).toContain("typed in the second session");

  // A committed exit after a real save writes nothing more.
  const written = posts.length;
  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  expect(posts.length).toBe(written);
});

test("clean enter and exit cycles write nothing and hold one session's resources", async () => {
  const log = [];
  let open = 0;
  const tracked = participant("template:board", log, {
    lease: {
      enable() {
        open++;
        log.push("template:board:enable");
      },
      dispose() {
        open--;
        log.push("template:board:dispose");
      },
    },
  });
  const clay = await bootPage({ edit: true, owner: true, declared: true, queue: [tracked] });
  await clay.setMode("view");
  posts = [];

  const generations = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, mode: "edit" });
    expect(open).toBe(1);
    generations.push(clay.modeLifecycle.state.generation);
    await expect(clay.setMode("view")).resolves.toMatchObject({ ok: true, mode: "view" });
    expect(open).toBe(0);
  }

  // No edit, no save: a clean switch is never a write.
  expect(posts).toEqual([]);
  // Each generation is its own session, and nothing is left behind by the last one.
  expect(new Set(generations).size).toBe(3);
  expect(log.filter((entry) => entry.endsWith(":prepare"))).toHaveLength(4);
  expect(log.filter((entry) => entry.endsWith(":dispose"))).toHaveLength(4);
});

test("an explicit initial edit prepares the same session a live first entry does", async () => {
  const initial = [];
  const clay = await bootPage({
    edit: true,
    owner: true,
    declared: true,
    queue: [participant("template:late", initial, { order: 2000 }), participant("template:board", initial, { order: 1000 })],
  });
  expect(clay.mode).toBe("edit");
  const firstSession = initial.slice();

  await clay.setMode("view");
  initial.length = 0;
  await clay.setMode("edit");

  // Same participants, same order, same single enable after every prepare.
  expect(initial).toEqual(firstSession);
});

test("a call for the target being entered joins it, and the opposing one is busy even while view is still committed", async () => {
  const log = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const clay = await bootPage({
    owner: true,
    declared: true,
    queue: [participant("template:board", log, { prepare: () => gate })],
  });

  const entering = clay.setMode("edit");
  const joining = clay.setMode("edit");
  // The entry has not committed: the page is still in view. That is exactly why this ask
  // must not be answered as a no-op — the transition would then run twice.
  expect(clay.mode).toBe("view");
  await expect(clay.setMode("view")).resolves.toEqual({ ok: false, mode: "view", code: "busy" });
  expect(clay.mode).toBe("view");
  expect(clay.modeLifecycle.canWrite()).toBe(false);

  release();
  await expect(entering).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  await expect(joining).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  // One transition, one lease, prepared and enabled once.
  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(clay.mode).toBe("edit");
});

test("a registered pending source refuses the exit, and the clean page it becomes exits", async () => {
  const log = [];
  const clay = await bootPage({ owner: true, declared: true, queue: [participant("template:board", log)] });
  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  await settleEntry();

  const unsaved = await import("../../src/lib/unsaved-state.js");
  // A composer has no flush: it waits for its person, so the barrier refuses rather than
  // writing the page without it.
  const composer = unsaved.registerUnsavedState({ id: "composer", isPending: () => true });

  try {
    await expect(clay.setMode("view")).resolves.toMatchObject({ ok: false, mode: "edit", code: "pending-input", pending: ["composer"] });
    expect(clay.mode).toBe("edit");
    expect(clay.modeLifecycle.canWrite()).toBe(true);
    expect(clay.modeLifecycle.state).toMatchObject({ phase: "idle", reason: "pending-input" });
    expect(log).toEqual(["template:board:prepare", "template:board:enable", "template:board:quiesce", "template:board:resume"]);

    // The positive control: with the composer resolved, the same page exits.
    composer.dispose();
    await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
    expect(clay.mode).toBe("view");
  } finally {
    composer.dispose();
  }
});

test("a switch module that fails to load keeps the guarded reload and leaves no unhandled rejection", async () => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  jest.unstable_mockModule("../../src/core/mode-switch.js", () => {
    throw new Error("the switch module is not on this release");
  });

  try {
    const log = [];
    const clay = await bootPage({ owner: true, declared: true, queue: [participant("template:board", log)] });

    await withFakeLocation(async (fake) => {
      await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, mode: "edit", reloading: true });
      expect(fake.reload).toHaveBeenCalledTimes(1);
      // A rejected import is not cached: the next ask tries the same path again.
      await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, reloading: true });
      expect(fake.reload).toHaveBeenCalledTimes(2);
    });
    await flush();

    expect(log).toEqual([]);
    expect(rejections).toEqual([]);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});
