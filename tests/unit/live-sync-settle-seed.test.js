import { jest } from "@jest/globals";

/**
 * The merge bases live sync seeds at start, and the one moment they are refreshed.
 *
 * LiveSync.start() seeds the peer lane's and the disk lane's bases from the page
 * as it stands, exactly as 1.5.2 did: a clean tab gets both, a dirty tab gets
 * none. Leaving them null until the boot settle was worse than the bug it fixed:
 * a clean tab's first frame lost JSON key deletions, and an edit before the
 * settle left the tab with no base at all, which stranded saves in conflict or
 * dropped a peer's edit.
 *
 * The settle then REFRESHES each lane from the settled page, so DOM an
 * editmode:resource script built during boot (the Writer template mounting a
 * Quill editor) lands in the base instead of being read twice by the first dirty
 * merge. The refresh is narrow:
 *
 *   - only on a tab nobody has touched: no trusted gesture has reached the page
 *     at all by the time of the settle, so there is no one's edit in it to
 *     absorb. Once a person has touched the page the tab keeps its start seed,
 *     exactly as 1.5.2 did;
 *   - only on a page clean at that moment: a page holding an edit keeps the start
 *     seed, since the base must not absorb work the settle could not see;
 *   - only with no save outstanding: what an unconfirmed save carries is not yet
 *     common history;
 *   - only for a lane still holding exactly what start left: a frame applied, a
 *     landed relay, an own save or a disk frame since then gave it a newer base;
 *   - start after the settle seeds immediately, exactly as before.
 *
 * The gesture rule, not the save-provenance or dirty signals, is what makes the
 * refresh safe. Every after-the-fact rule for telling a person's edit from boot
 * setup has a hole: the provenance bit is consumed at the send, so an edit whose
 * save is already in flight looks like boot churn, and a same-turn signal misses a
 * button whose handler edits a macrotask later. An untouched tab cannot hold a
 * person's edit, so refreshing only that one cannot absorb anything, and an
 * input inside a no-save / stripped region does not count either (the dirty gate
 * already ignores those).
 *
 * Every test loads fresh modules: the settle is a one-time event per save.js
 * instance, so a scenario that needs an unsettled page cannot share the registry
 * with one that has already waited it out.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let LiveSync;
let snapshot;
let gate;
let save;
let userGesture;

async function load() {
  jest.resetModules();
  // mutation.js publishes a realm-global hub on window.__clayMutation and every
  // later module instance adopts it, so without this the fresh registry (and the
  // user-gesture instance this file imports) would register on the FIRST test's
  // hub, whose own user-gesture module is the one a simulated gesture would mark.
  delete window.__clayMutation;
  if (window.clay) delete window.clay.Mutation;
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/sync")) return respond(200, { success: true });
    if (method === "POST" && u.includes("/_/save")) return respond(200, { msg: "Saved", etag: "E1" });
    return respond(404, "");
  });

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  // The module's singleton auto-starts on import; nothing here drives it.
  liveSyncModule.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  userGesture = await import("../../src/lib/user-gesture.js");
}

beforeEach(() => {
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  document.body.innerHTML = "";
});

function makeSync(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  return sync;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSettle(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!save.baselineSettled()) {
    if (Date.now() > deadline) throw new Error("save.js never settled");
    await wait(100);
  }
}

// Write the body and hand the gate back a clean bill: a body write is a mutation,
// so without this the page reads as dirty and every merge would take the hold.
async function cleanBody(html) {
  document.body.innerHTML = html;
  await tick();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

test("start before the settle seeds the page at start; the settle refreshes both bases with DOM a module built in between", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<div class="content-editor"></div>';
  const sync = makeSync();
  sync.start("index.html");

  expect(sync.lastHtml).not.toBeNull();
  expect(sync.lastHtml).not.toContain("ql-container");

  document.querySelector(".content-editor").insertAdjacentHTML(
    "beforeend",
    '<div class="ql-container">editor</div>'
  );
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toContain("ql-container");
  expect(sync._diskBase).toContain("ql-container");
  sync.stop();
});

test("a frame applied before the settle keeps its peer base", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<p id="a">one</p>';
  const sync = makeSync();
  sync.start("index.html");

  const frame = captureFrame().replace(">one<", ">peer<");
  await sync._doApplyUpdate(frame, 5, null, null);
  const afterFrame = sync.lastHtml;
  const afterMap = sync._lastIdentityMap;
  expect(afterFrame).toBe(frame);

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  // Only a clean page takes the refresh; a dirty one returns early and the
  // assertions below would hold whatever the lane guard did.
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(sync.lastHtml).toBe(afterFrame);
  expect(sync._lastIdentityMap).toBe(afterMap);
  sync.stop();
});

test("a disk frame applied before the settle keeps its disk base", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<section data-id="b"><p>v1</p></section>';
  const sync = makeSync();
  sync.start("index.html");

  await sync._doApplyExternal(
    '<!DOCTYPE html><html><head></head><body><section data-id="b"><p>v2-from-disk</p></section></body></html>',
    31
  );
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("v2-from-disk");
  const afterFrame = sync._diskBaseTicket;

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(false);
  expect(sync._diskBaseTicket).toBe(afterFrame);
  sync.stop();
});

test("an input before the settle keeps the start seed and does not null it", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<p id="a" contenteditable>one</p>';
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  expect(seed).not.toBeNull();

  const p = document.querySelector("#a");
  // jsdom has no isContentEditable; the input feed keys off it, as other suites
  // in this repo stand in for it.
  Object.defineProperty(p, "isContentEditable", { value: true, configurable: true });
  p.textContent = "typed";
  p.dispatchEvent(new Event("input", { bubbles: true }));
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(true);
  expect(sync.lastHtml).toBe(seed);
  sync.stop();
});

test("a clean frame before the settle keeps a JSON key deletion", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<script type="application/json" merge="data">{"a":1,"b":2}</script>';
  const sync = makeSync();
  sync.start("index.html");

  const frame = captureFrame().replace('{"a":1,"b":2}', '{"a":1}');
  expect(frame).not.toContain('"b":2');
  await sync._doApplyUpdate(frame, 5, null, null);

  const script = document.querySelector('script[type="application/json"]');
  expect(JSON.parse(script.textContent)).toEqual({ a: 1 });
  sync.stop();
});

test("a gesture-driven edit before the settle is not absorbed", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<ul><li id="x">one</li></ul>';
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  expect(seed).not.toBeNull();

  userGesture._simulateGestureTurn();
  document.querySelector("ul").insertAdjacentHTML("beforeend", '<li id="y">two</li>');
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  sync.stop();
});

test("a gesture edit whose save was sent before the settle keeps the start seed", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<ul><li id="x">one</li></ul>';
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  expect(seed).not.toBeNull();

  userGesture._simulateGestureTurn();
  document.querySelector("ul").insertAdjacentHTML("beforeend", '<li id="y">two</li>');
  // The send happens a turn later, so the gesture's own bit is already gone by
  // the time the settle runs: only the page's gesture history proves it was human.
  await tick();
  userGesture.consumeUserDriven();

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  sync.stop();
});

test("a click before the settle keeps the start seed, as 1.5.2 did", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  await cleanBody('<div class="content-editor"></div>');
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  expect(seed).not.toBeNull();
  expect(seed).not.toContain("ql-container");

  // The click, then a module that mounts its DOM long after the gesture's turn.
  // A touched page keeps its start seed whether or not the later DOM was setup.
  userGesture._simulateGestureTurn();
  await wait(50);
  document.querySelector(".content-editor").insertAdjacentHTML(
    "beforeend",
    '<div class="ql-container">editor</div>'
  );

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  expect(sync.lastHtml).not.toContain("ql-container");
  // The settle still captures its own baseline, so a click near boot DOM leaves
  // the page clean: no false dirty, no conflict in waiting.
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

test("an edit a button makes a turn after the gesture is not absorbed", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<ul id="todo"><li id="x">one</li></ul><ul id="done"></ul>';
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  expect(seed).not.toBeNull();
  expect(sync._diskBase).toContain("todo");

  // The gesture's own turn is over by the time the handler runs, so the mutation
  // reads as background boot churn to everything but the gesture history.
  userGesture._simulateGestureTurn();
  setTimeout(() => document.getElementById("done").appendChild(document.getElementById("x")), 0);

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toBe(seed);
  // The start base still holds the item in the first list: a later merge must not
  // read the move as a peer's edit arriving on top of it.
  expect(sync._diskBase).not.toContain('id="done"><li');
  expect(sync._diskBase).toContain('id="todo"><li');
  sync.stop();
});

test("an input inside a no-save region does not block the refresh", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<div class="content-editor"></div><div no-save><input id="q"></div>';
  const sync = makeSync();
  sync.start("index.html");

  document.querySelector(".content-editor").insertAdjacentHTML(
    "beforeend",
    '<div class="ql-container">editor</div>'
  );
  const q = document.querySelector("#q");
  q.value = "typed";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(false);
  expect(sync.lastHtml).toContain("ql-container");
  sync.stop();
});

test("an outstanding save at the settle keeps both start bases", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<div class="content-editor">boot churn</div>';
  const sync = makeSync();
  sync.start("index.html");
  const seed = sync.lastHtml;
  const startTicket = sync._diskBaseTicket;
  expect(seed).not.toBeNull();

  // A save captured its snapshot and no answer has come back yet. What it carried
  // is not common history, and a refusal has to merge against the older base.
  sync._saveTicket = sync._ticket();

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(false);
  expect(sync.lastHtml).toBe(seed);
  expect(sync._diskBaseTicket).toBe(startTicket);
  sync.stop();
});

test("start after the settle seeds immediately", async () => {
  await load();
  document.body.innerHTML = '<div class="content-editor">boot churn</div>';
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  await cleanBody('<div class="content-editor">settled page</div>');
  const sync = makeSync();
  sync.start("index.html");

  expect(sync.lastHtml).not.toBeNull();
  expect(sync.lastHtml).toContain("settled page");
  sync.stop();
});
