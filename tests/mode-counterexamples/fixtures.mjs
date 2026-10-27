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

// A document whose authored attributes and `clay="freeze"` region are its own: entering
// and leaving edit must hand back these exact bytes.
const FREEZE_PAGE = {
  params: "exclude=richclay,source",
  body:
    '<article data-kind="note" data-authored="kept" class="note">' +
    '<h1 id="title">Untitled</h1>' +
    '<div id="content">start</div>' +
    '<section clay="freeze" data-locked="yes"><p>Authored &amp; frozen</p><figure data-attr="1">' +
    '<img src="/a.png" alt="a"><figcaption>Caption</figcaption></figure></section>' +
    "</article>",
  path: "/notes.html",
};

const UNSENT_PAGE = {
  params: "exclude=richclay,source&plugins=unsent",
  body:
    '<article data-id="note"><h1 id="title">Untitled</h1><div id="content">start</div>' +
    '<input id="draft" unsent="description" value=""></article>',
  path: "/notes.html",
};

const PAGE_HOST_HEAD =
  '<script type="application/json" merge="page" clay="live">{"v":1,"g":0,"y":{"seed":"AAACQQMEAQAIQgALJwAoAQUAJwAoAIUkHGF0dHJzdGl0bGVsZXZlbHRmbG93YXR0cnNwMXRFAQEEBQIBBwEAAAEBAQACQQACQQEBBwB9AXcHaGVhZGluZ3YBAWJ3BXRpdGxldwlwYXJhZ3JhcGh2AQFidwJwMQA="}}</script>' +
  '<script type="application/json" merge="page.tools" clay="live">{}</script>';

const PAGE_HOST = {
  params: "plugins=page",
  head: PAGE_HOST_HEAD,
  body:
    '<article class="page" clay="freeze" data-page="1" data-rev="093360993130d818">' +
    '<h1 data-id="title"></h1>\n<p data-id="p1"></p></article>',
  path: "/notes.html",
};

// What a host answers its own page's GET with: the document it saved, head and body.
const servedDocument = (page) => `<!DOCTYPE html><html><head>${page.head ?? ""}</head><body>${page.body}</body></html>`;

// A visitor's draft page: the plugin asked for, the root slot it writes into, a rules
// tag, and no owner cookie, so it boots in draft mode.
const DRAFT_PAGE = {
  params: "plugins=visitor-drafts&exclude=richclay,source",
  head: '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>',
  body: '<article><h1 id="title">Untitled</h1><div id="content">start</div></article>',
  path: "/notes.html",
  attrs: { "visitor-drafts": "draft-slot-1", autosave: "" },
};

export const FIXTURES = {
  // A live-declared document that boots in view and saves into the host.
  "persist-host": { page: PAGE, lanes: false },
  // The same page, plus tab B over a shared local channel.
  "lane-peer": { page: PAGE, lanes: true },
  // The same page with the unsent-draft plugin and a field outside the save domain.
  "unsent-host": { page: UNSENT_PAGE, lanes: false },
  // A page whose entry loads the source plugin, so a case can hold that chunk.
  "source-host": { page: { ...PAGE, params: "exclude=richclay" }, lanes: false },
  // The same page, with authored attributes and a frozen region of its own.
  "freeze-host": { page: FREEZE_PAGE, lanes: false },
  // The draft page as an ordinary visitor gets it, except that its localStorage keeps
  // nothing: every draft write throws, the way a full or turned-off store does.
  "draft-host": { page: DRAFT_PAGE, lanes: false, owner: false, storage: "failing" },
  // The page editor: plugins=page over a tag and an article, on a host that advertises
  // the `page` extension and serves the document it saved.
  "page-host": {
    page: PAGE_HOST,
    lanes: false,
    peer: true,
    pageHost: true,
    host: {
      extensions: ["page"],
      answerMeta: true,
      served: { path: PAGE_HOST.path, html: servedDocument(PAGE_HOST), etag: "etag-1" },
    },
  },
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

// A host's own stream: the page sync opens one and this one never leaves the process,
// so the article is the file the host served and no frame arrives unasked.
class StubEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onerror = null;
    this.onmessage = null;
    this.listeners = new Map();
    // A host's stream opens on connect; without this the reader never runs its
    // startup check and `plugins/page-view.js` never settles `acquired`.
    setTimeout(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      this.onopen?.();
      this.emit("open");
    }, 0);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    const at = listeners.indexOf(listener);
    if (at !== -1) listeners.splice(at, 1);
  }
  dispatchEvent() {
    return true;
  }
  close() {
    this.readyState = 2;
  }
}

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
export function createHost(record, { extensions = ["conditional"], answerMeta = false, served = null } = {}) {
  const posts = [];
  const holds = new Map();
  // The document this host serves: the one it was given, replaced by every body it
  // accepts, so a second boot is served what the first one left.
  let servedHtml = served ? served.html : null;

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

  // Every write the host accepts is stamped with a fresh etag, so the stamp a case reads
  // back is the one that names the bytes this host just stored.
  let stored = 1;
  const saveAnswer = (result) => {
    if (result === "unknown") {
      record("save-outcome-unknown", {});
      throw abortError("the save answer never arrived");
    }
    if (result === "rejected") {
      record("save-response", { status: 500, etag: null });
      return jsonResponse(500, { msg: "the host refused the save" });
    }
    const etag = `etag-${++stored}`;
    record("save-response", { status: 200, etag });
    return jsonResponse(200, { msg: "Saved", etag }, { etag });
  };

  const metaAnswer = (result) => {
    if (result === "unknown") throw abortError("the metadata answer never arrived");
    if (result === "rejected") return jsonResponse(500, { msg: "no discovery" });
    return jsonResponse(200, {
      spec: 1,
      extensions,
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

  // The account of every request that actually left: what it carried and what came back.
  // The oracle pairs a response's stamp with the bytes it stored from these, never from
  // the page's own bookkeeping.
  const calls = [];
  const send = (call) => {
    calls.push(call);
    return call;
  };

  const fetchFn = async (input, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const url = new URL(String(input), window.location.href);
    const headers = options.headers ?? {};
    if (method === "POST") {
      const body = String(options.body ?? "");
      posts.push(body);
      const call = send({
        kind: "save",
        method,
        path: url.pathname,
        body,
        ifMatch: headers["If-Match"] ?? null,
        status: null,
        etag: null,
      });
      record("save-request-sent", { path: url.pathname });
      const result = await parkSave();
      const answer = saveAnswer(result);
      call.status = answer.status;
      call.etag = answer.headers.get("etag");
      if (served && call.status === 200) servedHtml = body;
      return answer;
    }
    if (url.pathname === META_PATH) {
      record("metadata-request", { path: url.pathname });
      if (!held("metadata")) {
        if (!answerMeta) return notFound();
        const answer = metaAnswer("accepted");
        send({ kind: "metadata", method, path: url.pathname, body: null, ifMatch: null, status: answer.status, etag: null });
        return answer;
      }
      const answer = metaAnswer((await wait("metadata")) ?? "accepted");
      send({ kind: "metadata", method, path: url.pathname, body: null, ifMatch: null, status: answer.status, etag: null });
      return answer;
    }
    if (served && method === "GET" && url.pathname === served.path) {
      if (servedHtml === null) return notFound();
      const answer = jsonResponse(200, servedHtml, { etag: served.etag });
      send({ kind: "document", method, path: url.pathname, body: null, ifMatch: null, status: answer.status, etag: served.etag });
      return answer;
    }
    return notFound();
  };

  return { fetch: fetchFn, posts, calls, hold, release, held, wait, servedDocument: () => servedHtml };
}

/**
 * The page's own listeners and editors, counted as they stand.
 *
 * The handlers are wrapped, not the code: a registration that was removed, or one whose
 * signal aborted, is not living, and an editor is the editor root the page mounted. A
 * case reads the counts at cycle boundaries and compares them; nothing here is the
 * driver's idea of what should be alive.
 */
export function createResourceCounter() {
  const registrations = [];
  const restorers = [];
  for (const where of ["document", "window"]) {
    const owner = where === "document" ? document : window;
    const add = owner.addEventListener;
    const remove = owner.removeEventListener;
    owner.addEventListener = function (type, handler, options) {
      const registration = { where, type, handler, options, owner, remove, ended: false };
      registrations.push(registration);
      options?.signal?.addEventListener?.("abort", () => {
        registration.ended = true;
      });
      return add.call(this, type, handler, options);
    };
    owner.removeEventListener = function (type, handler, options) {
      for (let index = registrations.length - 1; index >= 0; index--) {
        const registration = registrations[index];
        if (registration.where === where && registration.type === type && registration.handler === handler) {
          registration.ended = true;
          break;
        }
      }
      return remove.call(this, type, handler, options);
    };
    restorers.push(() => {
      owner.addEventListener = add;
      owner.removeEventListener = remove;
    });
  }

  const snapshot = () => {
    const live = { documentListeners: 0, windowListeners: 0, editors: 0 };
    for (const registration of registrations) {
      if (registration.ended) continue;
      if (registration.where === "document") live.documentListeners++;
      else live.windowListeners++;
    }
    live.editors = document.querySelectorAll(".ProseMirror").length;
    return live;
  };

  return {
    snapshot,
    // The boot this counter watched is over: what it registered on the document and the
    // window goes with it, so the next case's page is not answered by the last one's code.
    stop() {
      for (const registration of registrations.reverse()) {
        if (registration.ended) continue;
        registration.ended = true;
        try {
          registration.remove.call(registration.owner, registration.type, registration.handler, registration.options);
        } catch {}
      }
      for (const restore of restorers.reverse()) restore();
    },
  };
}

/**
 * Boot the named fixture's page through the real loader. Real timers are in force here:
 * a case installs its fake clock after the page is up.
 */
export async function bootPage(fixture, { mode, host, resetModules, served = null }) {
  const spec = FIXTURES[fixture];
  // A reload is served the bytes the host last accepted, so the page boots from those
  // rather than from the fixture's authored copy.
  const page = served === null ? spec.page : (() => {
    const parsed = new DOMParser().parseFromString(served, "text/html");
    return { ...spec.page, head: parsed.head.innerHTML, body: parsed.body.innerHTML };
  })();
  const { params, body, path, head = "", attrs = {} } = page;
  const pageHost = spec.pageHost === true;
  const realEventSource = globalThis.EventSource;
  const channel = pageHost ? installChannelPair() : null;
  if (pageHost) globalThis.EventSource = window.EventSource = StubEventSource;
  resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (spec.owner !== false) document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", mode === "edit" ? `${path}?editmode=true` : path);
  localStorage.clear();
  sessionStorage.clear();
  const realStorage = [window, globalThis].map((owner) => [owner, Object.getOwnPropertyDescriptor(owner, "localStorage")]);
  const restoreStorage = () => {
    for (const [owner, descriptor] of realStorage) {
      if (descriptor) Object.defineProperty(owner, "localStorage", descriptor);
    }
  };
  if (spec.storage === "failing") {
    const failing = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {}, clear: () => {} };
    for (const owner of [window, globalThis]) {
      Object.defineProperty(owner, "localStorage", { configurable: true, writable: true, value: failing });
    }
  }
  const root = document.documentElement;
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
  root.setAttribute("clay-mode-switch", "live");
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  window.clay = {};
  globalThis.fetch = window.fetch = host.fetch;
  const resources = createResourceCounter();
  try {
    const { boot } = await import("../../src/loader.js");
    await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
    // The lane's lock callback waits CLOSE_WAIT_MS on a real timer before it starts the
    // room, and that timer is already ticking when the page is up: a case's fake clock
    // would never fire it, so the wait happens here, on the real one.
    if (pageHost) await new Promise((resolve) => setTimeout(resolve, 600));
  } catch (error) {
    resources.stop();
    channel?.stop();
    restoreStorage();
    if (pageHost) globalThis.EventSource = window.EventSource = realEventSource;
    throw error;
  }
  return {
    clay: window.clay,
    channel,
    resources: {
      snapshot: resources.snapshot,
      stop() {
        resources.stop();
        channel?.stop();
        restoreStorage();
        if (pageHost) globalThis.EventSource = window.EventSource = realEventSource;
      },
    },
  };
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
 * One fake channel and one fake lock over the whole document: the participants a case
 * builds meet on it, and a page that boots its own lane (the page editor does) joins the
 * same one, so a peer's frames reach the page under test.
 */
export function installChannelPair() {
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
  return {
    channels,
    stop() {
      globalThis.BroadcastChannel = window.BroadcastChannel = realChannel;
      if (realLocks) Object.defineProperty(navigator, "locks", realLocks);
      else delete navigator.locks;
    },
  };
}

/**
 * Tab A and tab B: two real lane participants over one fake channel, each with its own
 * store, lane and Yjs document. Tab B's edits reach tab A the way another tab's do.
 *
 * A `peer` pair is the second tab alone, over the channel (and the page seed) of a page
 * that booted its own lane: tab B's frames reach the page under test instead of a tab
 * this harness built.
 */
export async function createLanePair({ settle = async () => {}, channel = installChannelPair(), seed = null, peer = false } = {}) {
  const initial = seed ?? seedValue(LANE_BLOCKS);

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

  const a = peer ? null : tab(11);
  await settle(50);
  const b = tab(12);
  await settle(50);
  return {
    a,
    b,
    stop() {
      for (const entry of [a, b].filter(Boolean)) {
        try {
          entry.provider.dispose();
          entry.lane.stop();
          entry.ydoc.destroy();
        } catch {}
      }
      channel.stop();
    },
  };
}
