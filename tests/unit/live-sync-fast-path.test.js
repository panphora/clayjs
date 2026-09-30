import { jest } from "@jest/globals";

/**
 * hyper-morph's fast path through LiveSync: the clean branch of
 * `_mergeIncoming` asks for it (`fastPath: true`), so a clean tab's frame on
 * either lane merges through it, a dirty tab's frame never asks, and a frame
 * the engine cannot narrow (a template anywhere) takes the full merge and
 * still lands. What the engine did is read from `report.stats` on
 * `clay:sync-applied`.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync, save, snapshot, gate;

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

const BOARD =
  '<div class="list" data-id="planning"><p class="card" data-id="one">One</p><p class="card" data-id="two">Two</p></div>' +
  '<div class="list" data-id="dev"><p class="card" data-id="three">Three</p></div>';

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

const fast = (r) => [r.stats.fastPathAttempted, r.stats.fastPathTaken, r.stats.fastPathFallback];
const text = (id) => document.querySelector(`[data-id="${id}"]`).textContent;

/** What a peer running this tab's runtime sends: the frame and its identity map. */
function peerFrame(sync, edit) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  const map = sync.identity.exportMap(clone, snapshot.originalSnapshotNode);
  return [edit(snapshot.serializeForSync(clone)), map];
}

test("a clean tab's peer frame takes the fast path; a dirty tab's frame does not ask for it", async () => {
  const sync = await cleanTab(BOARD);
  const seen = reports();
  const card = document.querySelector('[data-id="two"]');
  const cardId = sync.identity.ensure(card);
  const [first, map1] = peerFrame(sync, (h) => h.replace(">Two<", ">Two edited<"));
  await sync._doApplyUpdate(first, 1, map1, null);
  expect(text("two")).toBe("Two edited");
  expect(document.querySelector('[data-id="two"]')).toBe(card);
  expect(sync.identity.idOf(card)).toBe(cardId);
  expect(sync.lastHtml).toBe(first);
  expect(save.getUnsavedChanges()).toBe(false);

  const [second, map2] = peerFrame(sync, (h) => h.replace(">Three<", ">Three edited<"));
  document.querySelector('[data-id="one"]').textContent = "One mine";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);
  await sync._doApplyUpdate(second, 2, map2, null);
  seen.stop();

  expect(text("one")).toBe("One mine");
  expect(text("three")).toBe("Three edited");
  expect(seen.map(fast)).toEqual([
    [1, 1, null],
    [0, 0, null],
  ]);
  expect(seen[0].identities.length).toBeGreaterThan(0);
  sync.stop();
});

test("a peer frame without an identity map takes the full merge: this tab's synthetic ids stop the branch at the root", async () => {
  const sync = await cleanTab(BOARD);
  const seen = reports();
  await sync._doApplyUpdate(sync.lastHtml.replace(">Two<", ">Two edited<"), 1, null, null);
  seen.stop();
  expect(text("two")).toBe("Two edited");
  expect(fast(seen[0])).toEqual([1, 0, "root-level"]);
  sync.stop();
});

test("a clean tab's disk frame takes the fast path and lands activated", async () => {
  const sync = await cleanTab('<main><section data-id="b"><p>v1</p></section><section><p>other</p></section></main>');
  const seen = reports();
  await sync._doApplyExternal(
    sync._diskBase.replace(
      "<p>v1</p>",
      '<p>v2</p><div editmode:contenteditable inert-contenteditable="true">new</div>'
    ),
    20
  );
  seen.stop();
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("v2");
  const inserted = document.querySelector('[data-id="b"] div');
  expect(inserted.getAttribute("contenteditable")).toBe("true");
  expect(inserted.hasAttribute("inert-contenteditable")).toBe(false);
  expect(fast(seen[0])).toEqual([1, 1, null]);
  expect(save.getUnsavedChanges()).toBe(false);
  sync.stop();
});

test("a template edit takes the full merge on both lanes and lands", async () => {
  const body = "<main><template><p>OLD</p></template><p>x</p></main>";
  const content = () => document.querySelector("template").innerHTML;

  let sync = await cleanTab(body);
  let seen = reports();
  await sync._doApplyUpdate(sync.lastHtml.replace("<p>OLD</p>", "<p>NEW</p>"), 1, null, null);
  seen.stop();
  expect(content()).toBe("<p>NEW</p>");
  expect(fast(seen[0])).toEqual([1, 0, "script-or-template"]);
  sync.stop();

  sync = await cleanTab(body);
  seen = reports();
  await sync._doApplyExternal(sync._diskBase.replace("<p>OLD</p>", "<p>NEW</p>"), 21);
  seen.stop();
  expect(content()).toBe("<p>NEW</p>");
  expect(fast(seen[0])).toEqual([1, 0, "script-or-template"]);
  sync.stop();
});

test("a nested template edit takes the full merge on both lanes, lands, and leaves the tab converged", async () => {
  const body = "<main><h1>title</h1><template><template><p>OLD</p></template></template></main>";
  const inner = () =>
    document.querySelector("template").content.querySelector("template").content.querySelector("p").textContent;

  let sync = await cleanTab(body);
  let seen = reports();
  const [frame, map] = peerFrame(sync, (h) => h.replace("<p>OLD</p>", "<p>NEW</p>"));
  await sync._doApplyUpdate(frame, 1, map, null);
  seen.stop();
  expect(inner()).toBe("NEW");
  expect(fast(seen[0])).toEqual([1, 0, "script-or-template"]);
  expect(seen[0].localDiverged).toBe(false);
  sync.stop();

  sync = await cleanTab(body);
  seen = reports();
  await sync._doApplyExternal(sync._diskBase.replace("<p>OLD</p>", "<p>NEW</p>"), 22);
  seen.stop();
  expect(inner()).toBe("NEW");
  expect(fast(seen[0])).toEqual([1, 0, "script-or-template"]);
  expect(seen[0].localDiverged).toBe(false);
  sync.stop();
});
