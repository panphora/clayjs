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
 *   - only on a page clean at that moment: a page holding an edit keeps the start
 *     seed, since the base must not absorb work the settle could not see;
 *   - only for a lane still holding exactly what start left: a frame applied, a
 *     landed relay, an own save or a disk frame since then gave it a newer base;
 *   - start after the settle seeds immediately, exactly as before.
 *
 * The settle is stricter so a user edit it cannot see today does not end up in
 * the refreshed base. Its signal is not the save-provenance bit: that one is
 * consumed at the send, so an edit whose save is already in flight would be
 * absorbed into the refresh, and a save refused afterwards would merge against a
 * base that already holds the edit. This signal is a dirty-relevant change in the
 * SAME TURN as a trusted gesture (a drop, a toolbar click, a Cmd+B keydown), which
 * a save never clears. The recency window around a gesture is deliberately not
 * used here: a module mounting a few hundred ms after a click mutates inside it
 * and would leave the page dirty with no edit, a false conflict in waiting. An
 * input inside a no-save / stripped region does not count either (the dirty gate
 * already ignores those). The refresh is also skipped while this tab has a save
 * outstanding, since what an unconfirmed save carries is not yet common history.
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

  expect(gate.pageMaybeDirty()).toBe(true);
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
  // the time the settle runs: only the settle's signal proves the edit was human.
  await tick();
  userGesture.consumeUserDriven();

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(true);
  expect(sync.lastHtml).toBe(seed);
  sync.stop();
});

test("a click followed later by module DOM does not block the refresh", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  await cleanBody('<div class="content-editor"></div>');
  const sync = makeSync();
  sync.start("index.html");

  // The click, then a module that mounts its DOM long after the gesture's turn:
  // still inside the recency window, but not the person editing.
  userGesture._simulateGestureTurn();
  await wait(50);
  document.querySelector(".content-editor").insertAdjacentHTML(
    "beforeend",
    '<div class="ql-container">editor</div>'
  );

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(gate.pageMaybeDirty()).toBe(false);
  expect(sync.lastHtml).toContain("ql-container");
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
