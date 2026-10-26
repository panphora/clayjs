/**
 * @jest-environment jsdom
 */

/**
 * The pages and lane participants a counterexample case boots.
 *
 * Every fixture is the production code: the page is the real loader, the real mode
 * controller and the real save code, and the only things a case controls are transport,
 * chunk imports and the clock. Transport lives here, behind one `fetch` that parks an
 * answer until the case releases it; a hold is a promise an answer waits on.
 *
 * Two tabs in jsdom: the loader runs on globals, so one document hosts one full boot
 * (tab A) and the second participant (tab B) is built from the real lane modules over a
 * fake channel, the way `tests/unit/live-local-lane.test.js` builds its tabs.
 */

import { jest } from "@jest/globals";
import * as Y from "../../src/vendor/yjs.vendor.js";
import { createStore } from "../../src/live/store.js";
import { createFastLane } from "../../src/live/fast-lane.js";
import { localTransport } from "../../src/live/local-lane.js";
import { createYProvider, dec } from "../../src/page/ybind/provider.js";
import { NET } from "../../src/page/ybind/layout.js";
import { seedValue } from "../../src/page/ybind/seed.js";

const PAGE = {
  params: "exclude=richclay,source",
  body: '<article><h1 id="title">Untitled</h1><div id="content">start</div></article>',
  path: "/notes.html",
};

export const FIXTURES = {
  // A live-declared document that boots in view and saves into the host.
  "persist-host": { page: PAGE, lanes: false },
  // The same page, plus tab B over a shared local channel.
  "lane-peer": { page: PAGE, lanes: true },
};

export const META_PATH = "/_/meta";
export const SAVE_PATH = "/_/save";
export const LANE_KEY = `clay-live:${PAGE.path}`;
const LANE_BLOCKS = [
  { id: "p", text: "hello" },
  { id: "q", text: "world" },
];

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? "OK" : status === 500 ? "Internal Server Error" : "Not Found",
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const notFound = () => jsonResponse(404, "");

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/**
 * The host: every request the page makes lands here, and a boundary a case holds parks
 * the request until the case releases it.
 *
 * @param {(kind: string, detail: object) => void} record
 */
export function createHost(record) {
  const posts = [];
  const holds = new Map();

  const hold = (boundary) => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    holds.set(boundary, { promise, resolve });
  };

  const release = (boundary, result) => {
    const parked = holds.get(boundary);
    if (!parked) return false;
    holds.delete(boundary);
    parked.resolve(result);
    return true;
  };

  const held = (boundary) => holds.get(boundary) ?? null;

  const wait = async (boundary) => {
    const parked = holds.get(boundary);
    const result = await parked.promise;
    if (holds.get(boundary) === parked) holds.delete(boundary);
    return result;
  };

  const saveAnswer = (result) => {
    if (result === "unknown") {
      record("save-outcome-unknown", {});
      throw abortError("the save answer never arrived");
    }
    if (result === "rejected") {
      record("save-response", { status: 500 });
      return jsonResponse(500, { msg: "the host refused the save" });
    }
    record("save-response", { status: 200 });
    return jsonResponse(200, { msg: "Saved", etag: "etag-1" }, { etag: "etag-1" });
  };

  const metaAnswer = (result) => {
    if (result === "unknown") throw abortError("the metadata answer never arrived");
    if (result === "rejected") return jsonResponse(500, { msg: "no discovery" });
    return jsonResponse(200, {
      spec: 1,
      extensions: [],
      document: { writable: true, path: window.location.pathname, etag: "etag-1" },
    });
  };

  // A save is recorded before it is answered: that is what lets save.request park the
  // request itself and save.response answer it later.
  const parkSave = async () => {
    for (const boundary of ["save.request", "save.response"]) {
      if (held(boundary)) return (await wait(boundary)) ?? "accepted";
    }
    return "accepted";
  };

  const fetchFn = async (input, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const url = new URL(String(input), window.location.href);
    if (method === "POST") {
      posts.push(String(options.body ?? ""));
      record("save-request-sent", { path: url.pathname });
      return saveAnswer(await parkSave());
    }
    if (url.pathname === META_PATH) {
      record("metadata-request", { path: url.pathname });
      if (!held("metadata")) return notFound();
      return metaAnswer((await wait("metadata")) ?? "accepted");
    }
    return notFound();
  };

  return { fetch: fetchFn, posts, hold, release, held, wait };
}

/**
 * Boot the named fixture's page through the real loader. Real timers are in force here:
 * a case installs its fake clock after the page is up.
 */
export async function bootPage(fixture, { mode, host }) {
  const { params, body, path } = FIXTURES[fixture].page;
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", mode === "edit" ? `${path}?editmode=true` : path);
  localStorage.clear();
  sessionStorage.clear();
  const root = document.documentElement;
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
  root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "";
  document.body.innerHTML = body;
  window.clay = {};
  globalThis.fetch = window.fetch = host.fetch;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return window.clay;
}

function fakeLocks() {
  const queue = [];
  let held = false;
  async function grant() {
    if (held || !queue.length) return;
    held = true;
    const { callback, resolve } = queue.shift();
    const result = await callback({ name: LANE_KEY });
    held = false;
    resolve(result);
    grant();
  }
  return {
    request(name, callback) {
      return new Promise((resolve) => {
        queue.push({ callback, resolve });
        Promise.resolve().then(grant);
      });
    },
  };
}

/**
 * Tab A and tab B: two real lane participants over one fake channel, each with its own
 * store, lane and Yjs document. Tab B's edits reach tab A the way another tab's do.
 */
export async function createLanePair({ settle = async () => {} } = {}) {
  const channels = [];
  class FakeChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      channels.push(this);
    }
    postMessage(data) {
      const copy = JSON.parse(JSON.stringify(data));
      for (const other of channels) {
        if (other === this || other.closed || other.name !== this.name) continue;
        setTimeout(() => other.onmessage?.({ data: copy }), 0);
      }
    }
    close() {
      this.closed = true;
    }
  }
  const realChannel = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = window.BroadcastChannel = FakeChannel;
  const realLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: fakeLocks() });

  const initial = seedValue(LANE_BLOCKS);

  const tab = (client) => {
    const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(initial)) });
    const entries = new Map([["page", { store }]]);
    const seed = () =>
      new Map([["page", { value: store.authoritative, ephemeral: false, text: JSON.stringify(initial) }]]);
    const transport = localTransport({ seed, key: LANE_KEY });
    const lane = createFastLane({ transport, entries });
    store.onLocal((ops) => lane.local("page", ops, store.mark));
    const ydoc = new Y.Doc();
    ydoc.clientID = client;
    for (const key of Object.keys(initial.y).sort()) Y.applyUpdateV2(ydoc, dec(initial.y[key]), NET);
    const provider = createYProvider({ store, ydoc });
    lane.start();
    return {
      store,
      lane,
      ydoc,
      provider,
      flow: ydoc.getText("flow"),
      text: () => ydoc.getText("flow").toString(),
    };
  };

  const a = tab(11);
  await settle(50);
  const b = tab(12);
  await settle(50);
  return {
    a,
    b,
    stop() {
      for (const entry of [a, b]) {
        try {
          entry.provider.dispose();
          entry.lane.stop();
          entry.ydoc.destroy();
        } catch {}
      }
      globalThis.BroadcastChannel = window.BroadcastChannel = realChannel;
      if (realLocks) Object.defineProperty(navigator, "locks", realLocks);
      else delete navigator.locks;
    },
  };
}
