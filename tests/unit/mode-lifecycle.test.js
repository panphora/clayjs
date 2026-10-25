import { jest } from "@jest/globals";

// Scenario: `clay.mode` stays a string, `clay.isEditMode` and `clay.canEdit` are
// getters over the live mode facts, and `clay.modeLifecycle` is the registration
// facade in front of a controller that is a dynamic target. A plain view answers all
// of it without ever loading `core/mode-lifecycle.js`; an explicit initial edit drains
// the preboot queue before input, and a live switch prepares, enables, quiesces and
// disposes one lease per participant.
//
// Every case gets its own module registry: the facts module caches its boot answer.

const API_TAG = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const VIEW_PARAMS = "exclude=richclay,source";
const DRAFT_PARAMS = "plugins=visitor-drafts&exclude=richclay,source";

function setOwnerCookie(value) {
  document.cookie = `isAdminOfCurrentResource=${value}; path=/`;
}

async function bootPage({ url = "/notes.html", params = VIEW_PARAMS, edit = false, owner = false, draft = false, queue = null } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  setOwnerCookie("");
  if (owner) setOwnerCookie("true");
  if (edit) window.clayEditMode = true;
  window.history.replaceState({}, "", url);
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (draft) root.setAttribute("visitor-drafts", "draft-slot-1");
  document.head.innerHTML = draft ? API_TAG : "";
  document.body.innerHTML = '<div id="content">start</div>';
  window.clay = queue ? { modeParticipants: queue } : {};
  window.fetch = jest.fn(async () => new Response("", { status: 404 }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return window.clay;
}

// A participant whose lease records every call, so a case can say what the controller
// did to it and in what order.
function participant(id, log, { order = 1000, prepare, ready, quiesce } = {}) {
  const lease = {
    enable: () => log.push(`${id}:enable`),
    quiesce: async () => {
      log.push(`${id}:quiesce`);
      if (quiesce) return quiesce();
    },
    resume: () => log.push(`${id}:resume`),
    dispose: () => log.push(`${id}:dispose`),
  };
  const prepareFn = async (context) => {
    log.push(`${id}:prepare`);
    if (prepare) await prepare(context);
    return ready ? { ...lease, ready } : lease;
  };
  return { participant: { id, order, prepare: prepareFn }, lease };
}

const lifecycleOf = () => import("../../src/core/mode-lifecycle.js");

test("a plain view answers the facade and never drains the preboot queue", async () => {
  const log = [];
  const clay = await bootPage({ queue: [participant("template:board", log).participant] });

  expect(clay.mode).toBe("view");
  expect(typeof clay.mode).toBe("string");
  expect(clay.isEditMode).toBe(false);
  expect(clay.canEdit).toBe(false);
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  expect(clay.modeLifecycle.state).toEqual({
    mode: "view",
    phase: "idle",
    destination: "host",
    generation: 0,
    reason: null,
  });
  expect(Object.isFrozen(clay.modeLifecycle.state)).toBe(true);
  // The queue survives assembly untouched, and nothing prepared from it: no editor is
  // built for a reader who never asked to edit.
  expect(window.clay.modeParticipants).toHaveLength(1);
  expect(log).toEqual([]);
});

test("an explicit initial edit drains the preboot queue, in order, before input", async () => {
  const log = [];
  const later = participant("template:kanban", log, { order: 2000 });
  const earlier = participant("template:board", log, { order: 1000 });
  const contexts = [];
  earlier.participant.prepare = (context) => {
    log.push("template:board:prepare");
    contexts.push(context);
    return earlier.lease;
  };

  const clay = await bootPage({
    edit: true,
    // A promise queued before the loader begins, beside a plain entry.
    queue: [Promise.resolve(later.participant), earlier.participant],
  });

  expect(clay.mode).toBe("edit");
  expect(typeof clay.mode).toBe("string");
  expect(clay.isEditMode).toBe(true);
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  expect(clay.modeLifecycle.state).toEqual({
    mode: "edit",
    phase: "idle",
    destination: "host",
    generation: 1,
    reason: null,
  });
  // Ordered by `order`, not by queue position, and enabled only after every prepare.
  expect(log).toEqual(["template:board:prepare", "template:kanban:prepare", "template:board:enable", "template:kanban:enable"]);
  expect(contexts[0].destination).toBe("host");
  expect(contexts[0].signal).toBeInstanceOf(AbortSignal);
  expect(contexts[0].isCurrent()).toBe(true);
});

test("an initial draft activates as a draft, and its destination is the draft slot", async () => {
  const log = [];
  const clay = await bootPage({ draft: true, params: DRAFT_PARAMS, queue: [participant("template:journal", log).participant] });

  expect(clay.mode).toBe("draft");
  expect(clay.isEditMode).toBe(true);
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  expect(clay.modeLifecycle.state).toMatchObject({ mode: "draft", phase: "idle", destination: "draft" });
  expect(log).toEqual(["template:journal:prepare", "template:journal:enable"]);
});

test("a failing prepare disposes what it built, blocks admission, and boot still finishes", async () => {
  const log = [];
  const good = participant("template:board", log);
  const broken = participant("template:kanban", log, {
    order: 2000,
    prepare: () => {
      throw Object.assign(new Error("no editor"), { code: "load-failed" });
    },
  });
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});

  const clay = await bootPage({ edit: true, queue: [good.participant, broken.participant] });

  expect(clay.mode).toBe("edit");
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  expect(clay.modeLifecycle.state).toMatchObject({ phase: "blocked", reason: "load-failed" });
  expect(log).toEqual(["template:board:prepare", "template:kanban:prepare", "template:board:dispose"]);
  errors.mockRestore();
});

test("a duplicate participant id throws", async () => {
  const log = [];
  const clay = await bootPage();
  const { participant: first } = participant("template:board", log);

  clay.modeLifecycle.register(first);

  expect(() => clay.modeLifecycle.register({ ...first })).toThrow(/duplicate participant id "template:board"/);
  expect(() => clay.modeLifecycle.register({ id: "", prepare() {} })).toThrow(/needs an id and a prepare/);
});

test("registering is refused outside an idle view", async () => {
  const log = [];
  const clay = await bootPage({ edit: true, queue: [participant("template:board", log).participant] });

  expect(() => clay.modeLifecycle.register(participant("template:late", log).participant)).toThrow(/not idle in view/);
});

test("an unregistered participant is never prepared by the live switch", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  const { participant: entry } = participant("template:board", log);

  const unregister = clay.modeLifecycle.register(entry);
  unregister();
  const lifecycle = await lifecycleOf();
  const result = await lifecycle.requestMode("edit");

  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  expect(log).toEqual([]);
  expect(clay.mode).toBe("edit");
});

test("asking for the target already being entered joins that same transition", async () => {
  const log = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const clay = await bootPage({ owner: true });
  clay.modeLifecycle.register(participant("template:board", log, { prepare: () => gate }).participant);
  const lifecycle = await lifecycleOf();

  const first = lifecycle.requestMode("edit");
  const second = lifecycle.requestMode("edit");
  expect(second).toBe(first);
  expect(clay.modeLifecycle.state.phase).toBe("entering");
  expect(clay.modeLifecycle.canWrite()).toBe(false);

  release();
  await expect(first).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  // One lease, prepared once.
  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(clay.modeLifecycle.canWrite()).toBe(true);
});

test("asking for the other target mid-transition answers busy and leaves it running", async () => {
  const log = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const clay = await bootPage({ owner: true });
  clay.modeLifecycle.register(participant("template:board", log, { prepare: () => gate }).participant);
  const lifecycle = await lifecycleOf();

  const entering = lifecycle.requestMode("edit");
  expect(lifecycle.requestMode("view")).toEqual({ ok: false, mode: "view", code: "busy" });

  release();
  await entering;
  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(clay.mode).toBe("edit");
});

test("a refused exit resumes the same leases and keeps edit", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  clay.modeLifecycle.register(participant("template:board", log).participant);
  const lifecycle = await lifecycleOf();
  await lifecycle.requestMode("edit");
  delete window.clay.save;
  window.clay.save = {
    flush: async () => {
      throw Object.assign(new Error("could not save"), { code: "save-failed" });
    },
  };

  const refused = await lifecycle.requestMode("view");

  expect(refused).toMatchObject({ ok: false, mode: "edit", code: "save-failed" });
  expect(clay.mode).toBe("edit");
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  expect(clay.modeLifecycle.state).toMatchObject({ phase: "idle", reason: "save-failed" });
  expect(log).toEqual(["template:board:prepare", "template:board:enable", "template:board:quiesce", "template:board:resume"]);
});

test("a committed exit disposes only after the barrier, and the getters follow the facts", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  clay.modeLifecycle.register(participant("template:board", log).participant);
  const lifecycle = await lifecycleOf();
  const flushes = [];
  window.clay.save = {
    flush: async () => {
      flushes.push(log.slice());
      return { state: "saved" };
    },
  };

  await lifecycle.requestMode("edit");
  expect(clay.mode).toBe("edit");
  expect(clay.isEditMode).toBe(true);

  const result = await lifecycle.requestMode("view");

  expect(result).toEqual({ ok: true, mode: "view", changed: true });
  expect(clay.mode).toBe("view");
  expect(typeof clay.mode).toBe("string");
  expect(clay.isEditMode).toBe(false);
  expect(clay.canEdit).toBe(true);
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  // The barrier sees the leases already quiesced, and disposal follows it.
  expect(flushes).toEqual([["template:board:prepare", "template:board:enable", "template:board:quiesce"]]);
  expect(log.slice(-2)).toEqual(["template:board:quiesce", "template:board:dispose"]);
  expect(clay.modeLifecycle.state).toMatchObject({ mode: "view", phase: "idle" });
  // A fresh frozen snapshot each read, never the same mutable object.
  expect(clay.modeLifecycle.state).not.toBe(clay.modeLifecycle.state);
});
