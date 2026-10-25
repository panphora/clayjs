/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * One save session per admitted edit, and the boundaries of its lifetime.
 *
 * A session `start`s when the page admits input, `quiesce`s while an exit is being
 * decided, `resume`s when that exit is refused and `stop`s once it is committed. What it
 * owns is admission: while it is closed neither the automatic lane nor an ordinary save
 * (page, force or soon) writes, and nothing about the page's state moves with them — no
 * capture, no gate token, no baseline. What it must never own is the page's saved bytes:
 * a quiesce is not a reload, so the boot settle does not run again, the accepted bytes
 * stay exactly as the last accepted save left them, and the next real save carries the
 * snapshot's own capture identity.
 *
 * The exit's own flush is the one save that still goes out, because it is the barrier
 * writing the bytes the exit is about to account for.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 5; i++) await sleep(0);
};

const until = async (predicate) => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return true;
    await sleep(10);
  }
  return false;
};

let save, snapshot, warning, gate;
let posts = [];
let captures = [];
let openSessions = [];

const track = (session) => {
  openSessions.push(session);
  return session;
};

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.head.innerHTML = '<style data-name="session-saved" clay="no-data">.item { color: red; }</style>';
  document.body.innerHTML = '<div id="content">start</div>';
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if (options.method !== "POST") {
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "", json: async () => ({}) };
    }
    posts.push(String(options.body ?? ""));
    return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify({ msg: "Saved" }) };
  });
  document.addEventListener("clay:snapshot-ready", (event) => captures.push(event.detail.captureId));
  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
  warning = await import("../../src/core/unsaved-warning.js");
  gate = await import("../../src/lib/dirty-gate.js");
  window.clay.hasUnsavedChanges = warning.hasUnsavedChanges;
  document.body.appendChild(document.createElement("span"));
  for (let i = 0; i < 80 && !save.baselineSettled(); i++) await sleep(50);
  await sleep(50);
}, 20000);

afterEach(() => {
  for (const session of openSessions) session.stop();
  openSessions = [];
});

// The page's accepted state: one real save of what is on screen now.
async function acceptedBaseline(text) {
  document.getElementById("content").textContent = text;
  await flush();
  await save.savePage();
  await flush();
}

const warn = () => {
  const event = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test("a session starts from the accepted bytes, without a second boot settle", async () => {
  await acceptedBaseline("accepted");
  const contents = save.getLastSavedContents();
  const dirty = save.getLastSavedDirty();
  const bytes = save.getLastSavedBytes();
  const capturesBefore = captures.length;
  let settles = 0;
  const onSettle = () => settles++;
  document.addEventListener("clay:baseline-settled", onSettle);

  const session = track(save.saveSession());
  expect(session.phase).toBe("idle");
  session.start();

  document.removeEventListener("clay:baseline-settled", onSettle);
  expect(session.phase).toBe("open");
  expect(session.open).toBe(true);
  expect(save.savesAdmitted()).toBe(true);
  expect(settles).toBe(0);
  expect(save.baselineSettled()).toBe(true);
  expect(save.getLastSavedContents()).toBe(contents);
  expect(save.getLastSavedDirty()).toBe(dirty);
  expect(save.getLastSavedBytes()).toBe(bytes);
  expect(captures.length).toBe(capturesBefore);
});

test("quiesce closes admission: neither lane writes, captures or clears anything", async () => {
  await acceptedBaseline("quiesce base");
  const dirty = save.getLastSavedDirty();
  const contents = save.getLastSavedContents();
  const session = track(save.saveSession());
  session.start();

  document.getElementById("content").textContent = "typed while leaving";
  await flush();
  expect(gate.pageMaybeDirty()).toBe(true);

  const postsBefore = posts.length;
  const capturesBefore = captures.length;
  session.quiesce();
  expect(save.savesAdmitted()).toBe(false);

  const automatic = await save.savePageThrottled();
  const explicit = await save.savePage();
  const forced = await save.savePageForce();

  expect(automatic).toMatchObject({ ok: false, msgType: "skipped" });
  expect(explicit).toMatchObject({ ok: false, msgType: "skipped" });
  expect(forced).toMatchObject({ ok: false, msgType: "skipped" });
  expect(posts.length).toBe(postsBefore);
  expect(captures.length).toBe(capturesBefore);
  expect(save.getLastSavedDirty()).toBe(dirty);
  expect(save.getLastSavedContents()).toBe(contents);

  // The edit is still here, still dirty, and still nobody's but this tab's.
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(save.sessionParked()).toBe(true);
  expect(warning.hasUnsavedChanges()).toBe(true);
});

test("resume is the same session: the parked attempt is replayed and writes the edit", async () => {
  await acceptedBaseline("resume base");
  const session = track(save.saveSession());
  session.start();

  document.getElementById("content").textContent = "typed before the refusal";
  await flush();
  const capturesBefore = captures.length;
  const postsBefore = posts.length;
  session.quiesce();
  expect(await save.savePageThrottled()).toMatchObject({ msgType: "skipped" });
  expect(posts.length).toBe(postsBefore);

  session.resume();
  expect(save.savesAdmitted()).toBe(true);
  const written = () => posts.some((body) => body.includes("typed before the refusal"));
  expect(await until(() => written() && !save.sessionParked())).toBe(true);
  expect(save.sessionParked()).toBe(false);
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());

  // The refusal minted no capture of its own: the next real save carries the identity
  // that follows the last one, exactly as it would have without the session.
  expect(captures.length).toBe(capturesBefore + 1);
  expect(captures[captures.length - 1]).toBe(captures[capturesBefore - 1] + 1);
});

test("the session proves whether work arrived while admission was closed", async () => {
  await acceptedBaseline("closed base");
  const session = track(save.saveSession());
  session.start();
  expect(session.changedWhileClosed()).toBe(false);

  session.quiesce();
  expect(session.changedWhileClosed()).toBe(false);

  document.getElementById("content").textContent = "newer bytes";
  await flush();
  expect(session.changedWhileClosed()).toBe(true);
  expect(gate.pageMaybeDirty()).toBe(true);

  session.resume();
  expect(session.changedWhileClosed()).toBe(false);
});

test("the exit's own flush still writes while admission is closed", async () => {
  await acceptedBaseline("flush base");
  const session = track(save.saveSession());
  session.start();

  document.getElementById("content").textContent = "flush me";
  await flush();
  session.quiesce();

  const postsBefore = posts.length;
  const result = await save.flushSave();
  expect(result.state).toBe("saved");
  expect(posts.length).toBe(postsBefore + 1);
  expect(posts[posts.length - 1]).toContain("flush me");
  expect(save.sessionParked()).toBe(false);
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
});

test("stop is idempotent, and parked bytes stay visible to the close warning", async () => {
  await acceptedBaseline("stop base");
  const dirty = save.getLastSavedDirty();
  const session = track(save.saveSession());
  session.start();

  document.getElementById("content").textContent = "never written";
  await flush();
  session.quiesce();
  await save.savePage();

  session.stop();
  session.stop();
  expect(session.phase).toBe("stopped");
  expect(save.savesAdmitted()).toBe(true);
  expect(save.getLastSavedDirty()).toBe(dirty);
  expect(save.sessionParked()).toBe(true);
  expect(warning.hasUnsavedChanges()).toBe(true);
  expect(warn()).toBe(true);

  // Only an accepted save covers those bytes.
  const next = track(save.saveSession());
  next.start();
  const result = await save.savePage();
  expect(result.ok).toBe(true);
  expect(save.sessionParked()).toBe(false);
  expect(warning.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);
});

test("a style adoption in flight is neither re-run nor reset by the session", async () => {
  await acceptedBaseline("style base");
  const { style } = await import("../../src/lib/style.js");
  const session = track(save.saveSession());
  session.start();

  // The stored baselines still carry this name's tag, so the write queues an adoption and
  // opens the window where a fresh comparison reads dirty for the adoption's own reason.
  style("session-saved", ".item { color: teal; }");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);

  session.quiesce();
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);

  await save.styleAdoptionsSettled();
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);
  expect(save.sessionParked()).toBe(false);

  session.resume();
  expect(save.savesAdmitted()).toBe(true);
  expect(warning.hasUnsavedChanges()).toBe(false);
});
