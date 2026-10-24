import { jest } from "@jest/globals";
import { trash, DELETED_ATTR } from "../../src/lib/trash.js";

/**
 * `clay.trash`: a soft delete. A record is in the trash while it carries
 * `data-deleted-at`, so a delete is an attribute change: a peer's edit made at
 * the same time merges with it, and Undo restores the attribute instead of an
 * old copy of the record.
 *
 * The sync case uses a real LiveSync frame, as bind-text.test.js does: a peer
 * running this runtime captured its own page and edited it.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const PAGE =
  '<main sap>' +
  '<section id="entries">' +
  '<article data-id="a"><p class="body"></p></article>' +
  "</section>" +
  "</main>";
const BASE = "Walk by the river.";

let LiveSync, snapshot, gate, save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  document.body.innerHTML = PAGE;
  document.querySelector(".body").textContent = BASE;
  const m = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = m);
  m.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
});

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  window.clay = { testMode: true };
  document.body.innerHTML = PAGE;
  document.querySelector(".body").textContent = BASE;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  delete window.clay;
});

const article = () => document.querySelector('[data-id="a"]');
const body = () => document.querySelector(".body");

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

/** What a peer running this runtime sends after editing its own DOM. */
function peerFrame(edit) {
  const doc = new DOMParser().parseFromString(captureFrame(), "text/html");
  edit(doc);
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

async function cleanTab() {
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  sync.lastHtml = captureFrame();
  return sync;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test("trash sets data-deleted-at and fires clay:trashed", () => {
  const el = article();
  const seen = jest.fn();
  document.addEventListener("clay:trashed", seen);

  trash(el, { at: "2026-10-24T09:00:00.000Z" });

  expect(el.getAttribute(DELETED_ATTR)).toBe("2026-10-24T09:00:00.000Z");
  expect(trash.is(el)).toBe(true);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(seen.mock.calls[0][0].target).toBe(el);

  article().removeAttribute(DELETED_ATTR);
  expect(trash.is(article())).toBe(false);
  document.removeEventListener("clay:trashed", seen);
});

test("restore and the returned undo remove the attribute and fire clay:restored", () => {
  const el = article();
  const seen = jest.fn();
  document.addEventListener("clay:restored", seen);

  trash(el);
  expect(trash.is(el)).toBe(true);
  expect(Number.isNaN(Date.parse(el.getAttribute(DELETED_ATTR)))).toBe(false);

  trash.restore(el);
  expect(trash.is(el)).toBe(false);
  expect(seen).toHaveBeenCalledTimes(1);

  const undo = trash(el).undo;
  expect(trash.is(el)).toBe(true);
  undo();
  expect(trash.is(el)).toBe(false);
  expect(seen).toHaveBeenCalledTimes(2);
  document.removeEventListener("clay:restored", seen);
});

test("with the undo plugin loaded, Mod-z after trash restores the record", async () => {
  const { undo } = await import("../../src/plugins/undo.js");
  window.clay = { testMode: true, undo };

  const el = article();
  trash(el);
  expect(trash.is(el)).toBe(true);
  expect(undo.canUndo).toBe(true);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));

  expect(trash.is(el)).toBe(false);
  expect(el.isConnected).toBe(true);
  expect(document.querySelector('[data-id="a"]')).toBe(el);
});

test("a peer frame editing the record's text while this tab trashes it ends trashed with the edit kept", async () => {
  const sync = await cleanTab();
  const el = article();

  trash(el);
  expect(trash.is(el)).toBe(true);
  await flush();
  expect(gate.pageMaybeDirty()).toBe(true);

  const frame = peerFrame((doc) => {
    doc.querySelector(".body").textContent = "Walk by the quiet river.";
  });
  await sync._doApplyUpdate(frame, 1, null, null);
  await new Promise((r) => setTimeout(r, 0));

  expect(body().textContent).toBe("Walk by the quiet river.");
  expect(trash.is(document.querySelector('[data-id="a"]'))).toBe(true);
  expect(document.querySelector('[data-id="a"]').getAttribute(DELETED_ATTR)).toBe(el.getAttribute(DELETED_ATTR));
  sync.stop();
});

test("purge removes the record", () => {
  const el = article();
  trash(el);
  trash.purge(el);
  expect(el.isConnected).toBe(false);
  expect(document.querySelector('[data-id="a"]')).toBeNull();
});
