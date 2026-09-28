import { jest } from "@jest/globals";

/**
 * The merge bases live sync seeds, and the one moment they may be taken from.
 *
 * LiveSync.start() used to seed the peer lane's and the disk lane's bases from the
 * page as it stood at start. On a page whose editmode:resource scripts build DOM
 * during boot (the Writer template mounting a Quill editor), start runs before that
 * DOM exists, so the base lacked the editor: the first dirty merge saw both sides
 * "add" one and kept two, and the peer's text was lost. The base is now seeded at
 * the same settle save.js takes its settled baseline, and not before:
 *
 *   - start before the settle seeds nothing (lastHtml stays null, the existing clean
 *     path and the existing hold cover the gap), and the settle then seeds the page
 *     as it stands, including DOM a module built in between;
 *   - a frame that applied, or an own save that landed, before the settle keeps the
 *     base it gave this tab: the settle does not overwrite it;
 *   - start after the settle seeds immediately, exactly as before.
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

async function load() {
  jest.resetModules();
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

test("start before the settle seeds nothing; the settle seeds the page as it then stands, including DOM a module built in between", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  document.body.innerHTML = '<div class="content-editor"></div>';
  const sync = makeSync();
  sync.start("index.html");
  expect(sync.lastHtml).toBeNull();

  document.querySelector(".content-editor").insertAdjacentHTML(
    "beforeend",
    '<div class="ql-container">editor</div>'
  );
  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).not.toBeNull();
  expect(sync.lastHtml).toContain("ql-container");
  sync.stop();
});

test("a frame applied before the settle is not overwritten by the settle seed", async () => {
  await load();
  expect(save.baselineSettled()).toBe(false);

  await cleanBody('<div class="content-editor">as served</div>');
  const sync = makeSync();
  sync.start("index.html");
  expect(sync.lastHtml).toBeNull();

  const frame = captureFrame().replace("as served", "as served, from the peer");
  await sync._doApplyUpdate(frame, 5, null, null);
  expect(sync.lastHtml).toBe(frame);

  await waitForSettle();
  expect(save.baselineSettled()).toBe(true);

  expect(sync.lastHtml).toBe(frame);
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
