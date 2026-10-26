/**
 * @jest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { jest } from "@jest/globals";

/**
 * Boot one load fixture through the real loader and count the resources its boot
 * starts, so an explicit initial edit can be recorded once and every later road into
 * edit compared against it.
 *
 * The fixture is the only host: its root attributes, its head metas and its body are
 * the page, and the query string of its own clay.js script is the loader's params.
 * Inline scripts are inert (innerHTML does not execute them) and the external vendor
 * scripts never load, so the counts describe what clayjs starts, not what the template's
 * own application code starts.
 *
 * `fetch` and `EventSource` are stubs that never leave the process. Everything else
 * (the mode facts, the plan, the module thunks, the save code, the plugins) is real.
 */

const FIXTURE_DIR = new URL("../../fixtures/load/", import.meta.url);

const LISTENER_TARGETS = [
  ["window", () => window],
  ["document", () => document],
  ["Element", () => Element.prototype],
];

function readFixture(name) {
  const html = readFileSync(new URL(name, FIXTURE_DIR), "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = {};
  for (const attribute of Array.from(parsed.documentElement.attributes)) root[attribute.name] = attribute.value;
  const clayScript = parsed.querySelector('script[src*="clay.js"]');
  const params = clayScript
    ? new URL(clayScript.getAttribute("src"), "https://clayjs.com/").search.replace(/^\?/, "")
    : "";
  return { root, head: parsed.head.innerHTML, body: parsed.body.innerHTML, params };
}

function emptyCounts() {
  return {
    posts: 0,
    eventSources: 0,
    listeners: { window: 0, document: 0, Element: 0 },
    observers: 0,
    intervals: 0,
    moduleCalls: {},
  };
}

const sortedObject = (source) =>
  Object.fromEntries(Object.keys(source).sort().map((key) => [key, source[key]]));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function okResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => ({ msg: "Saved" }),
    text: async () => JSON.stringify({ msg: "Saved" }),
  };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", redirected: false, type: "basic", headers: { get: () => null }, json: async () => ({}), text: async () => "" };
}

// A native EventSource would open a socket to the host; this one only records that the
// page asked for a stream and answers the shape its callers read (`readyState`, close).
function stubEventSource(counts, streams) {
  return class StubEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;

    constructor(url) {
      counts.eventSources++;
      streams.instances.push(this);
      streams.standing++;
      streams.peak = Math.max(streams.peak, streams.standing);
      this.url = url;
      this.readyState = 0;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
    }

    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }

    close() {
      if (this.readyState !== 2) streams.standing--;
      this.readyState = 2;
    }
  };
}

export async function bootFixture(name, { mode = "edit", settle = 20, declare = false, params = null, root: extraRoot = null } = {}) {
  const fixture = readFixture(name);
  jest.resetModules();

  const counts = emptyCounts();
  const arrivals = [];
  const onReady = () => arrivals.push("ready");
  const onPlugin = (event) => arrivals.push(event.detail?.plugin);
  document.addEventListener("clay:ready", onReady);
  document.addEventListener("clay:plugin-ready", onPlugin);
  document.addEventListener("clay:plugin-failed", onPlugin);

  const restore = [];

  // The page: the fixture's root attributes, head and body, and a location that asks for
  // the mode this boot measures.
  const root = document.documentElement;
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
  for (const [key, value] of Object.entries({ ...fixture.root, ...extraRoot })) root.setAttribute(key, value);
  if (declare) root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = fixture.head;
  document.body.innerHTML = fixture.body;

  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", mode === "edit" ? `/${name}` : `/${name}?editmode=false`);
  delete window.clay;
  delete window.__hyperclayEditMode;
  delete window.clayEditMode;
  if (mode === "edit") window.clayEditMode = true;
  window.clay = {};

  // The host: a POST is a save, every GET is a 404, and no stream is opened.
  const realFetch = globalThis.fetch;
  const posted = [];
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if ((options.method || "GET").toUpperCase() === "POST") {
      counts.posts++;
      posted.push(String(url));
      return okResponse();
    }
    return notFound();
  });
  restore.push(() => {
    globalThis.fetch = window.fetch = realFetch;
  });

  const realEventSource = globalThis.EventSource;
  const streams = { standing: 0, peak: 0, instances: [] };
  globalThis.EventSource = window.EventSource = stubEventSource(counts, streams);
  restore.push(() => {
    globalThis.EventSource = window.EventSource = realEventSource;
  });

  // Listeners, by target type, read as the ones that can still fire: an explicit remove,
  // an aborted `{signal}` and an element that has left the document each end one. A page
  // that builds and discards a subtree therefore reads the same as one that never did.
  const registrations = [];
  const nearing = (target, type, handler) => {
    for (let i = registrations.length - 1; i >= 0; i--) {
      const registration = registrations[i];
      if (registration.target === target && registration.type === type && registration.handler === handler) {
        registration.ended = true;
        return;
      }
    }
  };
  const countListeners = () => {
    const live = { window: 0, document: 0, Element: 0 };
    for (const registration of registrations) {
      if (registration.ended) continue;
      if (registration.where === "Element" && registration.target?.isConnected === false) continue;
      live[registration.where]++;
    }
    return live;
  };
  const added = [];
  for (const [type, target] of LISTENER_TARGETS) {
    const owner = target();
    const hadAdd = Object.prototype.hasOwnProperty.call(owner, "addEventListener");
    const hadRemove = Object.prototype.hasOwnProperty.call(owner, "removeEventListener");
    const add = owner.addEventListener;
    const remove = owner.removeEventListener;
    const trackedAdd = function (event, handler, options) {
      const registration = { target: this, where: type, type: event, handler, ended: false };
      registrations.push(registration);
      options?.signal?.addEventListener?.("abort", () => { registration.ended = true; });
      added.push(() => remove.call(this, event, handler, options));
      return add.call(this, event, handler, options);
    };
    const trackedRemove = function (event, handler, options) {
      nearing(this, event, handler);
      return remove.call(this, event, handler, options);
    };
    owner.addEventListener = trackedAdd;
    owner.removeEventListener = trackedRemove;
    restore.push(() => {
      if (hadAdd) owner.addEventListener = add;
      else delete owner.addEventListener;
      if (hadRemove) owner.removeEventListener = remove;
      else delete owner.removeEventListener;
    });
  }

  // Mutation observers, observe minus disconnect.
  const observe = MutationObserver.prototype.observe;
  const disconnect = MutationObserver.prototype.disconnect;
  const liveObservers = new Set();
  MutationObserver.prototype.observe = function (...args) {
    counts.observers++;
    liveObservers.add(this);
    return observe.apply(this, args);
  };
  MutationObserver.prototype.disconnect = function () {
    if (liveObservers.delete(this)) counts.observers--;
    return disconnect.call(this);
  };
  restore.push(() => {
    MutationObserver.prototype.observe = observe;
    MutationObserver.prototype.disconnect = disconnect;
  });

  // Intervals, live at the moment the counters are read.
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const liveIntervals = new Set();
  globalThis.setInterval = window.setInterval = function (...args) {
    const handle = realSetInterval(...args);
    liveIntervals.add(handle);
    counts.intervals++;
    return handle;
  };
  globalThis.clearInterval = window.clearInterval = function (handle) {
    if (liveIntervals.delete(handle)) counts.intervals--;
    return realClearInterval(handle);
  };
  restore.push(() => {
    globalThis.setInterval = window.setInterval = realSetInterval;
    globalThis.clearInterval = window.clearInterval = realClearInterval;
  });

  // Timeouts are not counted, only held so a later boot measures its own boot.
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const pendingTimeouts = [];
  const trackedSetTimeout = function (...args) {
    const handle = realSetTimeout(...args);
    pendingTimeouts.push(handle);
    return handle;
  };
  globalThis.setTimeout = window.setTimeout = trackedSetTimeout;
  restore.push(() => {
    globalThis.setTimeout = window.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });

  const search = params === null ? fixture.params : params;
  const logic = await import("../../../src/loader-logic.js");
  const { MODULES, resolveModules } = logic;
  const thunks = {};
  for (const path of Object.keys(MODULES)) {
    const thunk = MODULES[path];
    thunks[path] = thunk;
    MODULES[path] = (...args) => {
      counts.moduleCalls[path] = (counts.moduleCalls[path] || 0) + 1;
      return thunk(...args);
    };
  }
  restore.push(() => {
    for (const path of Object.keys(thunks)) MODULES[path] = thunks[path];
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const remove of added) {
      try {
        remove();
      } catch {}
    }
    for (const observer of [...liveObservers]) {
      try {
        observer.disconnect();
      } catch {}
    }
    for (const handle of [...liveIntervals]) {
      try {
        realClearInterval(handle);
      } catch {}
    }
    for (const handle of pendingTimeouts) {
      try {
        realClearTimeout(handle);
      } catch {}
    }
    for (const undo of [...restore].reverse()) {
      try {
        undo();
      } catch {}
    }
    document.removeEventListener("clay:ready", onReady);
    document.removeEventListener("clay:plugin-ready", onPlugin);
    document.removeEventListener("clay:plugin-failed", onPlugin);
  };

  let boot;
  let plan;
  try {
    ({ boot } = await import("../../../src/loader.js"));
    await new Promise((resolve, reject) => {
      boot(null, new URLSearchParams(search), resolve).catch(reject);
    });

    // The late tail is the loader's last stage and it is not awaited by boot: wait for
    // one announcement per late plugin, then let the page go quiet.
    const facts = await import("../../../src/core/is-edit-mode.js");
    const hasSap = Boolean(document.querySelector("[sap]"));
    const sourceMeta = document.querySelector('meta[name="hyper-source"]');
    plan = resolveModules(new URLSearchParams(search), facts.isEditMode, {
      isDraftMode: facts.isDraftMode,
      hasSap,
      canEdit: facts.canEdit,
      templateSource: sourceMeta ? sourceMeta.getAttribute("content") : null,
    });
    const deadline = Date.now() + 20000;
    while (arrivals.filter((entry) => entry !== "ready").length < plan.late.length) {
      if (Date.now() > deadline) {
        throw new Error(`${name}: the late tail announced ${arrivals.length - 1} of ${plan.late.length} plugins`);
      }
      await sleep(5);
    }
    await sleep(settle);
  } catch (err) {
    stop();
    throw err;
  }

  const counters = () => ({
    posts: counts.posts,
    eventSources: counts.eventSources,
    listeners: countListeners(),
    observers: counts.observers,
    intervals: counts.intervals,
    clayKeys: Object.keys(window.clay || {}).sort(),
    plugins: [...(window.clay?.plugins || [])],
    moduleCalls: sortedObject(counts.moduleCalls),
  });

  // The streams standing open right now and the most that ever stood at once while this
  // boot ran: a switch that opened a second one beside the reader's would raise the peak.
  const eventSources = () => ({ open: streams.standing, peak: streams.peak, all: [...streams.instances] });

  // Where each POST went: a page may write its file and its live data, and they are two
  // different writes.
  const sent = () => [...posted];

  return {
    name,
    mode,
    plan,
    arrivals,
    counters,
    eventSources,
    sent,
    clay: window.clay,
    stop,
  };
}

export const TEMPLATES = ["document.html", "kanban.html", "journal.html"];
