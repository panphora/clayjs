/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * One participant queue. Everything an application registers, however it registers it —
 * the `clay.modeLifecycle.register` API, a preboot `window.clay = { modeParticipants }`,
 * or a raw push after boot — lands in the one array the readiness check validates and the
 * controller drains. The check validates without draining, so a malformed queue is left
 * exactly as it was for the guarded reload. A registration taken back after a drain stays
 * out of the next entry.
 */

const API_TAG = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const VIEW_PARAMS = "exclude=richclay,source";

function setOwnerCookie(value) {
  document.cookie = `isAdminOfCurrentResource=${value}; path=/`;
}

async function bootPage({ url = "/notes.html", params = VIEW_PARAMS, owner = false, declared = true, queue = null } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  setOwnerCookie("");
  if (owner) setOwnerCookie("true");
  window.history.replaceState({}, "", url);
  sessionStorage.clear();
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (declared) root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "";
  document.body.innerHTML = `${API_TAG}<div id="content">start</div>`;
  window.clay = queue ? { modeParticipants: queue } : {};
  window.fetch = jest.fn(async () => new Response("", { status: 404 }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return window.clay;
}

// A participant whose lease records every call, so a case can say what the controller did
// to it and in what order.
function participant(id, log, { order = 1000 } = {}) {
  return {
    id,
    order,
    prepare: async () => {
      log.push(`${id}:prepare`);
      return {
        enable: () => log.push(`${id}:enable`),
        quiesce: async () => log.push(`${id}:quiesce`),
        resume: () => log.push(`${id}:resume`),
        dispose: () => log.push(`${id}:dispose`),
      };
    },
  };
}

// `setMode` falls back to a reload for a document it cannot switch, so the fake location
// is how a case tells the two answers apart.
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

test("an API registration is visible on window.clay.modeParticipants", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  const entry = participant("template:board", log);

  clay.modeLifecycle.register(entry);

  expect(window.clay.modeParticipants).toEqual([entry]);
  expect(window.clay.modeParticipants[0].id).toBe("template:board");
});

test("a preboot queue and an API registration are one array", async () => {
  const log = [];
  const preboot = [participant("template:board", log)];
  const clay = await bootPage({ owner: true, queue: preboot });

  clay.modeLifecycle.register(participant("template:late", log, { order: 2000 }));

  expect(window.clay.modeParticipants).toBe(preboot);
  expect(window.clay.modeParticipants.map((entry) => entry.id)).toEqual(["template:board", "template:late"]);
});

test("a valid raw push after boot is prepared on the next entry", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  window.clay.modeParticipants.push(participant("template:board", log));

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });

  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(clay.mode).toBe("edit");
});

test("a malformed entry fails the readiness check, leaves the queue unchanged, and takes the guarded reload", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  const decision = await import("../../src/core/mode-switch.js");
  expect(decision.liveAllowed([])).toBe(true);

  const broken = { id: "template:broken" };
  window.clay.modeParticipants.push(participant("template:board", log), broken);
  const queued = [...window.clay.modeParticipants];

  expect(decision.liveAllowed([])).toBe(false);
  expect(window.clay.modeParticipants).toEqual(queued);

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, reloading: true });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
  expect(log).toEqual([]);
  expect(clay.mode).toBe("view");
});

test("duplicate ids fail the readiness check", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  const decision = await import("../../src/core/mode-switch.js");
  const entry = participant("template:board", log);

  window.clay.modeParticipants.push(entry, { ...entry, order: 2000 });
  expect(decision.liveAllowed([])).toBe(false);

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toMatchObject({ ok: true, reloading: true });
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
  expect(log).toEqual([]);
});

test("unregister after a drain keeps that participant out of the next entry", async () => {
  const log = [];
  const clay = await bootPage({ owner: true });
  const unregister = clay.modeLifecycle.register(participant("template:board", log));

  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
  // The exit runs the save barrier, which needs an accepted state to compare the page
  // with: this page booted in view, where the boot settle declines to run.
  const save = await import("../../src/core/save.js");
  if (!save.baselineSettled()) save.adoptEntryBaseline();
  await expect(clay.setMode("view")).resolves.toEqual({ ok: true, mode: "view", changed: true });
  expect(log).toEqual(["template:board:prepare", "template:board:enable", "template:board:quiesce", "template:board:dispose"]);

  unregister();
  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });

  // The entry that followed the drain never saw it again.
  expect(log).toEqual(["template:board:prepare", "template:board:enable", "template:board:quiesce", "template:board:dispose"]);
  expect(window.clay.modeParticipants).toEqual([]);
});

test("the public registration refuses an id in the clay: space the built-ins reserve", async () => {
  const clay = await bootPage({ owner: true });

  expect(() => clay.modeLifecycle.register({ id: "clay:x", prepare() {} })).toThrow(TypeError);
  expect(() => clay.modeLifecycle.register({ id: "clay:x", prepare() {} })).toThrow(/"clay:x" is reserved/);
  expect(window.clay.modeParticipants).toEqual([]);

  // ClayJS's own registration of `clay:resources` is not the public road and still works:
  // the entry that follows starts its authored-resource lease.
  await expect(clay.setMode("edit")).resolves.toEqual({ ok: true, mode: "edit", changed: true });
});
