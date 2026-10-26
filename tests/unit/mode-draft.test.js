/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * Draft isolation: a visitor's draft is its own destination, and V4 adds no way out of it.
 * `clay.setMode` keeps today's answer -- `not-allowed` -- so a declared draft document
 * never reaches the switch module, never drains its preboot queue, and never navigates.
 */

const API_TAG = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const DRAFT_PARAMS = "plugins=visitor-drafts&exclude=richclay,source";

// Recorded, not swapped for something useful: a draft must never ask for the module at all.
const switchImports = [];

jest.unstable_mockModule("../../src/core/mode-switch.js", () => {
  switchImports.push(true);
  return {
    liveAllowed: () => {
      switchImports.push(true);
      return false;
    },
    openResources: () => switchImports.push(true),
  };
});

function participant(id, log) {
  return {
    id,
    order: 1000,
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

async function bootDraft({ url = "/notes.html", declared = false, queue = null } = {}) {
  jest.resetModules();
  switchImports.length = 0;
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", url);
  sessionStorage.clear();
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", "draft-slot-1");
  if (declared) root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = API_TAG;
  document.body.innerHTML = '<div id="content">start</div>';
  window.clay = queue ? { modeParticipants: queue } : {};
  window.fetch = jest.fn(async () => ({ ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(DRAFT_PARAMS), resolve));
  return window.clay;
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

const receipt = () => sessionStorage.getItem(`clay:doc:${location.pathname}:mode-receipt`);

test("a declared draft refuses both directions, twice, and keeps its own destination", async () => {
  const log = [];
  const clay = await bootDraft({ declared: true, queue: [participant("template:board", log)] });

  expect(clay.mode).toBe("draft");
  expect(clay.isEditMode).toBe(true);

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
    await expect(clay.setMode("view")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
    await expect(clay.setMode("edit")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(clay.modeLifecycle.state).toEqual({
    mode: "draft",
    phase: "idle",
    destination: "draft",
    generation: 1,
    reason: null,
  });
  // A draft may write: it is an idle edit that saves into the visitor's own slot.
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  expect(receipt()).toBeNull();
  // The draft session prepared and enabled at boot; a refused switch adds nothing.
  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(switchImports).toEqual([]);
});

test("an explicit ?editmode=true on a draft document still opens the draft, and setMode still refuses", async () => {
  const log = [];
  const clay = await bootDraft({ url: "/notes.html?editmode=true", declared: true, queue: [participant("template:board", log)] });

  expect(clay.mode).toBe("draft");
  expect(clay.isEditMode).toBe(true);
  expect(clay.modeLifecycle.state.destination).toBe("draft");

  await withFakeLocation(async (fake) => {
    await expect(clay.setMode("view")).resolves.toEqual({ ok: false, mode: "draft", code: "not-allowed" });
    expect(fake.reload).not.toHaveBeenCalled();
  });

  expect(log).toEqual(["template:board:prepare", "template:board:enable"]);
  expect(switchImports).toEqual([]);
});

test("a declared draft keeps the session it booted with", async () => {
  const log = [];
  const clay = await bootDraft({
    declared: true,
    queue: [participant("template:board", log), participant("template:kanban", log)],
  });

  const booted = log.slice();
  await clay.setMode("edit");
  await clay.setMode("view");

  // The draft session booted with is the one still running: the refused switches neither
  // prepare another lease nor dispose the one the visitor is typing into.
  expect(log).toEqual(booted);
  expect(clay.mode).toBe("draft");
  expect(clay.modeLifecycle.state.generation).toBe(1);
  expect(switchImports).toEqual([]);
});
