import { jest } from "@jest/globals";

/**
 * A peer that copies a column sends its own identity map: the copy is a node
 * the edit created (no id) and the column it was copied from keeps the sender's
 * id. This tab's unsaved edit was typed into the original column, so it must
 * stay in that column's node and never follow the look-alike copy. That is
 * hyper-morph 1f630e0 ("identity pairs stay authoritative"), vendored here in
 * a88d9be, read through `LiveSync._doApplyUpdate` on a dirty tab. The third
 * test is the one the engine before a88d9be fails: the copied column arrived
 * empty.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync, save, snapshot, gate, conflicts;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  const m = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = m);
  m.liveSync.stop();
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  conflicts = (await import("../../src/sync/conflicts.js")).conflicts;
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  window.clay = { testMode: true };
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

/** A booted clean tab on `body`, both lanes seeded. */
async function cleanTab(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  return sync;
}

function reports() {
  const list = [];
  const on = (e) => list.push(e.detail.report);
  document.addEventListener("clay:sync-applied", on);
  list.stop = () => document.removeEventListener("clay:sync-applied", on);
  return list;
}

const COLUMN =
  '<main><section class="col"><h2>Todo</h2><ul><li><b>Card one words here</b></li><li><b>Card two words here</b></li></ul></section><p>tail</p></main>';

/**
 * What a peer running this tab's runtime sends after editing its DOM: the
 * sender's copy of the page, edited as a document, with the identity map that
 * edit leaves (nodes the edit created get fresh ids).
 */
function peerEdit(sync, edit) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  edit(clone);
  const map = sync.identity.exportMap(clone, snapshot.originalSnapshotNode);
  return [snapshot.serializeForSync(clone), map];
}

const sections = () => [...document.querySelectorAll("section")];

test("a peer copies the column above the original while this tab edits a card in it: the edit stays in the original node", async () => {
  const sync = await cleanTab(COLUMN);
  const original = document.querySelector("section");
  const card = original.querySelector("b");
  const [frame, map] = peerEdit(sync, (root) => {
    const s = root.querySelector("section");
    s.before(s.cloneNode(true));
  });
  card.firstChild.data += " LOCAL";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);
  const seen = reports();
  await sync._doApplyUpdate(frame, 1, map, null);
  seen.stop();
  expect(sections()).toHaveLength(2);
  expect(sections()[1]).toBe(original);
  expect(original.querySelector("b")).toBe(card);
  expect(card.textContent).toBe("Card one words here LOCAL");
  expect(sections()[0].textContent).not.toContain("LOCAL");
  expect(seen).toHaveLength(1);
  expect(seen[0].conflicts).toEqual([]);
  expect(conflicts.size).toBe(0);
  sync.stop();
});

test("a peer copies the column below and retitles the original while this tab edits a card in it: the edit stays in the retitled original", async () => {
  const sync = await cleanTab(COLUMN);
  const original = document.querySelector("section");
  const card = original.querySelector("b");
  const [frame, map] = peerEdit(sync, (root) => {
    const s = root.querySelector("section");
    s.after(s.cloneNode(true));
    s.querySelector("h2").textContent = "Todo (old)";
  });
  card.firstChild.data += " LOCAL";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);
  const seen = reports();
  await sync._doApplyUpdate(frame, 2, map, null);
  seen.stop();
  expect(sections()).toHaveLength(2);
  expect(sections()[0]).toBe(original);
  expect(original.querySelector("h2").textContent).toBe("Todo (old)");
  expect(original.querySelector("b")).toBe(card);
  expect(card.textContent).toBe("Card one words here LOCAL");
  expect(sections()[1].textContent).not.toContain("LOCAL");
  expect(seen).toHaveLength(1);
  expect(seen[0].conflicts).toEqual([]);
  expect(conflicts.size).toBe(0);
  sync.stop();
});

const TWO_COLUMNS =
  '<main><section class="col" data-id="col-1"><h2>Todo</h2><ul><li><b>Card one words here</b></li><li><b>Card two words here</b></li></ul></section>' +
  '<section class="col" data-id="col-2"><h2>Doing</h2><ul><li><b>Card three words here</b></li></ul></section><p>tail</p></main>';

test("a peer copies a column whose authored id the copy duplicates, while this tab edits another column: the page is the peer's page plus this tab's edit", async () => {
  const sync = await cleanTab(TWO_COLUMNS);
  const card = document.querySelector('[data-id="col-1"] b');
  const [frame, map] = peerEdit(sync, (root) => {
    const s = root.querySelector('[data-id="col-2"]');
    s.before(s.cloneNode(true));
  });
  const expected = new DOMParser()
    .parseFromString(frame, "text/html")
    .querySelector("main")
    .outerHTML.replace("Card one words here", "Card one words here LOCAL");
  card.firstChild.data += " LOCAL";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);
  const seen = reports();
  await sync._doApplyUpdate(frame, 1, map, null);
  seen.stop();
  expect(sections().map((s) => s.querySelectorAll("li").length)).toEqual([2, 1, 1]);
  expect(document.querySelector("main").outerHTML).toBe(expected);
  expect(document.querySelector('[data-id="col-1"] b')).toBe(card);
  expect(seen).toHaveLength(1);
  expect(seen[0].conflicts).toEqual([]);
  expect(conflicts.size).toBe(0);
  sync.stop();
});
