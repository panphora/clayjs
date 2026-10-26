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

test("a declared document whose edit plan asks for a module with no support row keeps the guarded reload", async () => {
  const log = [];
  // Wire has no support row yet, so the document cannot be started and taken back
  // without a reload.
  const clay = await bootPage({
    owner: true,
    declared: true,
    params: "plugins=quickcrop&exclude=richclay,source",
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

// ---------------------------------------------------------------------------
// 17b-4c: a declared document with no reader switches live with real saves.
// ---------------------------------------------------------------------------

const SORTABLE_PARAMS = "plugins=sortable,undo&exclude=richclay,source";
const BOARD = '<ul sortable id="board"><li>a</li><li>b</li></ul>';

// One turn of the real event loop, for work jest's fake timers must not hold: a dynamic
// import resolves on one. The real timer is captured before any test installs the fake one.
const realSetTimeout = globalThis.setTimeout;
const turn = () => new Promise((resolve) => realSetTimeout(resolve, 0));

// Every listener, observer and Sortable instance the page is running right now. The
// transition owns those: an entry starts one session's worth and an exit hands all of it
// back, so the counts are how a case says "one session" without reading the code.
//
// A listener is keyed by its target, type, handler and capture flag rather than counted
// as a running total, because a vendor that hands back a subscription it never took would
// otherwise read as a removal.
function resourceCounter() {
  const target = EventTarget.prototype;
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const observe = MutationObserver.prototype.observe;
  const disconnect = MutationObserver.prototype.disconnect;
  const ids = new WeakMap();
  let next = 0;
  const idOf = (value) => {
    if (!ids.has(value)) ids.set(value, ++next);
    return ids.get(value);
  };
  const live = new Set();
  const keyOf = (context, type, handler, options) => {
    if (!handler || (typeof handler !== "object" && typeof handler !== "function")) return null;
    if (!context || (typeof context !== "object" && typeof context !== "function")) return null;
    // jsdom's selector engine arms a `:hover` matcher on every document it is first used
    // on, including the throwaway ones a snapshot parse makes. Those are not the page's.
    if (context.nodeType === 9 && context !== document) return null;
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    return `${idOf(context)}|${type}|${idOf(handler)}|${capture}`;
  };
  const observers = new Set();
  target.addEventListener = function (type, handler, options) {
    const key = keyOf(this, type, handler, options);
    if (key) live.add(key);
    return add.call(this, type, handler, options);
  };
  target.removeEventListener = function (type, handler, options) {
    const key = keyOf(this, type, handler, options);
    if (key) live.delete(key);
    return remove.call(this, type, handler, options);
  };
  MutationObserver.prototype.observe = function (...args) {
    observers.add(this);
    return observe.apply(this, args);
  };
  MutationObserver.prototype.disconnect = function (...args) {
    observers.delete(this);
    return disconnect.apply(this, args);
  };
  return {
    snapshot: () => ({
      listeners: live.size,
      observers: observers.size,
      instances: [...document.querySelectorAll("[sortable]")].filter((el) => window.Sortable?.get?.(el)).length,
    }),
    stop() {
      target.addEventListener = add;
      target.removeEventListener = remove;
      MutationObserver.prototype.observe = observe;
      MutationObserver.prototype.disconnect = disconnect;
    },
  };
}

// The plugin announcements of one page, in order.
function pluginReadyLog() {
  const seen = [];
  const onReady = (event) => seen.push(event.detail?.plugin);
  document.addEventListener("clay:plugin-ready", onReady);
  seen.stop = () => document.removeEventListener("clay:plugin-ready", onReady);
  return seen;
}

test("a view-boot entry imports the edit core and gives the page a save", async () => {
  const clay = await bootPage({ owner: true, declared: true });
  expect(clay.mode).toBe("view");
  expect(clay.save).toBeUndefined();
  expect(clay.getHTML).toBeUndefined();

  const { MODULES } = await import("../../src/loader-logic.js");
  const imported = [];
  const thunks = {};
  for (const path of ["core/persist.js", "core/save.js", "core/autosave.js"]) {
    thunks[path] = MODULES[path];
    MODULES[path] = () => {
      imported.push(path);
      return thunks[path]();
    };
  }
  try {
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  } finally {
    for (const path of Object.keys(thunks)) MODULES[path] = thunks[path];
  }

  // The edit core arrived on the way in, in the plan's own order.
  expect(imported).toEqual(["core/persist.js", "core/save.js", "core/autosave.js"]);
  expect(typeof clay.save).toBe("function");
  expect(typeof clay.hasUnsavedChanges).toBe("function");
  expect(typeof clay.getHTML).toBe("function");
  expect(clay.mode).toBe("edit");
  expect(clay.modeLifecycle.canWrite()).toBe(true);

  // The entry adopted the page as its baseline: a clean page is clean, and the exit's
  // barrier has something to compare it with.
  const save = await import("../../src/core/save.js");
  const { bytesUnsaved } = await import("../../src/core/unsaved-warning.js");
  expect(save.baselineSettled()).toBe(true);
  expect(bytesUnsaved()).toBe(false);
});

test("a view-boot session saves one real edit once, and the exit writes nothing more", async () => {
  const clay = await bootPage({ owner: true, declared: true, params: SORTABLE_PARAMS, resources: BOARD });
  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });

  posts = [];
  document.getElementById("content").textContent = "typed in a live session";
  await flush();
  const answer = await clay.save();
  await flush();

  expect(answer).toBeTruthy();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toContain("typed in a live session");

  // A committed exit after the write is the barrier alone: the page is clean, so nothing
  // else reaches the host.
  const written = posts.length;
  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  await flush();
  expect(posts).toHaveLength(written);
});

test("a rejected edit-core import reloads once, and the next ask retries the same thunk", async () => {
  const clay = await bootPage({ owner: true, declared: true });
  const { MODULES } = await import("../../src/loader-logic.js");
  const thunk = MODULES["core/save.js"];
  let calls = 0;
  MODULES["core/save.js"] = () => {
    calls++;
    return calls === 1 ? Promise.reject(new Error("the save module is not on this network")) : thunk();
  };

  try {
    await withFakeLocation(async (fake) => {
      // Nothing was prepared, so nothing changed: the guarded reload the document had
      // before it declared live switching.
      await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true, reloading: true });
      expect(fake.reload).toHaveBeenCalledTimes(1);
      expect(calls).toBe(1);
      expect(clay.mode).toBe("view");
      expect(clay.modeLifecycle.state).toMatchObject({ phase: "idle", reason: null });

      // The failed import was not kept: the same thunk is asked again, and this time the
      // page switches without a reload.
      await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
      expect(calls).toBe(2);
      expect(fake.reload).toHaveBeenCalledTimes(1);
      expect(clay.modeLifecycle.canWrite()).toBe(true);
    });
  } finally {
    MODULES["core/save.js"] = thunk;
  }

  expect(clay.mode).toBe("edit");
});

test("an import held past the deadline refuses in view without a reload", async () => {
  const clay = await bootPage({ owner: true, declared: true });
  const { MODULES } = await import("../../src/loader-logic.js");
  const thunk = MODULES["core/snapshot.js"];
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  MODULES["core/snapshot.js"] = async () => {
    await held;
    return thunk();
  };

  jest.useFakeTimers({ doNotFake: ["setImmediate", "queueMicrotask", "nextTick"] });
  try {
    await withFakeLocation(async (fake) => {
      const entering = clay.setMode("edit");
      for (let i = 0; i < 200 && clay.modeLifecycle.state.phase !== "entering"; i++) await turn();
      await jest.advanceTimersByTimeAsync(15000);

      // A slow or offline network is a try-again answer, never a reload.
      await expect(entering).resolves.toEqual({ ok: false, mode: "view", code: "timeout" });
      expect(fake.reload).not.toHaveBeenCalled();
      expect(clay.mode).toBe("view");
      expect(clay.modeLifecycle.canWrite()).toBe(false);
    });
  } finally {
    jest.useRealTimers();
    release();
  }

  await flush();
  MODULES["core/snapshot.js"] = thunk;
  expect(clay.mode).toBe("view");
});

test("an explicit initial edit exits by adoption and the page re-enters live", async () => {
  const counter = resourceCounter();
  const ready = pluginReadyLog();
  try {
    const clay = await bootPage({ edit: true, owner: true, declared: true, params: SORTABLE_PARAMS, resources: BOARD });
    // The boot's own late tail starts the drag editor; nothing has adopted it yet.
    expect(await until(() => counter.snapshot().instances === 1)).toBe(true);
    const editing = counter.snapshot();
    posts = [];

    await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
    const view = counter.snapshot();
    // The sessions the import started are taken back: no instance, fewer listeners, and
    // the clean page wrote nothing on the way out.
    expect(view.instances).toBe(0);
    expect(view.listeners).toBeLessThan(editing.listeners);
    expect(posts).toEqual([]);
    expect(clay.modeLifecycle.canWrite()).toBe(false);

    // The next way in is a live entry: the controller prepares and enables one session,
    // and it starts what the boot started.
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
    const liveEntry = counter.snapshot();
    expect(liveEntry.instances).toBe(1);
    expect(clay.modeLifecycle.canWrite()).toBe(true);

    await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
    const secondView = counter.snapshot();
    expect(secondView.instances).toBe(0);
    expect(secondView.listeners).toBeLessThan(liveEntry.listeners);
  } finally {
    ready.stop();
    counter.stop();
  }
});

test("three enter and exit cycles hold one session's listeners, observers and instances", async () => {
  const counter = resourceCounter();
  try {
    const clay = await bootPage({ owner: true, declared: true, params: SORTABLE_PARAMS, resources: BOARD });
    const editing = [];
    const viewing = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
      editing.push(counter.snapshot());
      await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
      viewing.push(counter.snapshot());
    }

    // Every session is the same size, and every exit lands on the same view.
    expect(editing.map((counts) => counts.instances)).toEqual([1, 1, 1]);
    expect(new Set(editing.map((counts) => JSON.stringify(counts))).size).toBe(1);
    expect(new Set(viewing.map((counts) => JSON.stringify(counts))).size).toBe(1);
    // A clean switch is never a write.
    expect(posts).toEqual([]);
  } finally {
    counter.stop();
  }
});

test("clay:plugin-ready fires once per plugin across three cycles", async () => {
  const ready = pluginReadyLog();
  try {
    const clay = await bootPage({ owner: true, declared: true, params: SORTABLE_PARAMS, resources: BOARD });

    for (let cycle = 0; cycle < 3; cycle++) {
      await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
      await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
    }

    // Both plugins arrived on the first entry and were announced after its commit; the
    // later entries loaded nothing and announced nothing.
    expect([...ready].sort()).toEqual(["sortable", "undo"]);
  } finally {
    ready.stop();
  }
});

test("an exit whose boot late tail outlasts its deadline gives the tab back in edit", async () => {
  // The drag editor is imported by the boot's own late tail, and the exit cannot wait for
  // it past its own deadline: held that long, the exit fails as `timeout` and the page
  // keeps the session it booted into rather than sitting in `leaving` forever.
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const seen = { evaluated: false, inEdit: null, session: 0 };
  jest.unstable_mockModule("../../src/plugins/sortable.js", async () => {
    await held;
    // The committed mode, read the way every edit-only module reads it at evaluation.
    seen.evaluated = true;
    seen.inEdit = window.clay?.mode === "edit";
    const board = document.getElementById("board");
    if (seen.inEdit && board) {
      seen.session++;
      board.setAttribute("data-session", "1");
    }
    return { ready: Promise.resolve(null), sortable: {}, makeSortable() {}, move() {} };
  });

  const ready = pluginReadyLog();
  const clay = await bootPage({ edit: true, owner: true, declared: true, params: SORTABLE_PARAMS, resources: BOARD });
  try {
    expect(clay.mode).toBe("edit");
    expect(seen.evaluated).toBe(false);

    jest.useFakeTimers({ doNotFake: ["setImmediate", "queueMicrotask", "nextTick"] });
    let exiting;
    try {
      exiting = clay.setMode("view");
      for (let i = 0; i < 200 && clay.modeLifecycle.state.phase !== "leaving"; i++) await turn();
      await jest.advanceTimersByTimeAsync(15000);
      await expect(exiting).resolves.toMatchObject({ ok: false, mode: "edit", code: "timeout" });
    } finally {
      jest.useRealTimers();
    }

    // The deadline, not the import, ended the wait: the tab is back in edit and nothing of
    // the plugin has been attached.
    expect(clay.mode).toBe("edit");
    expect(clay.modeLifecycle.state.phase).toBe("idle");
    expect(clay.sortable).toBeUndefined();
    release();
    await flush();

    // It lands in edit, so it belongs there: it starts its editor.
    expect(seen.evaluated).toBe(true);
    expect(seen.inEdit).toBe(true);
    expect(seen.session).toBe(1);
  } finally {
    release();
    ready.stop();
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

