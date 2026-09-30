import { jest } from "@jest/globals";

/**
 * RichClay strips its runtime state out of every snapshot, so a peer frame
 * carries none of it and the merge removes it from the live editors. They stay
 * bound to their instances and can no longer be typed into, which is what the
 * plugin's `clay:sync-applied` listener repairs.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const BODY = `
<main>
<h1 class="page-title">Surfaces</h1>
<p class="caption">A caption the CMS edits as plain text.</p>
<div class="block" editable><h2>Team plan</h2><p>$12 per seat per month, billed yearly.</p></div>
<div class="block" data-richclay aria-label="Attached editor"><p>Business: $24 per seat per month.</p></div>
<div class="block" editable="toolbar-on-select"><p>Starter: free for up to 3 people.</p></div>
<div class="hidden-panel block">
<div data-richclay aria-label="Editor inside the hidden panel"><p>Attached editor inside a hidden panel.</p></div>
<div editable><p>Editable block inside a hidden panel.</p></div>
</div>
<div class="block rail-block" editable><h2>FAQ</h2><p>Can I cancel any time? Yes.</p></div>
</main>`;

const EDITOR_SELECTOR = "[editable], [data-richclay]";

// The vendor's own chrome carries the editor marker too, so only the author's
// regions count as editors.
const editors = () =>
  [...document.querySelectorAll(EDITOR_SELECTOR)].filter(
    (el) => !el.closest("[data-richclay-toolbar], [data-richclay-float]")
  );

let LiveSync, liveSyncMod, save, snapshot, gate, RichClay;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  liveSyncMod = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncMod);
  liveSyncMod.liveSync.stop();
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.body.innerHTML = BODY;
  window.clay = {
    testMode: true,
    isEditMode: true,
    onSnapshot: snapshot.onSnapshot,
    addDocumentTransform: snapshot.addDocumentTransform,
    morph: liveSyncMod.morph,
  };
  const mod = await import("../../src/plugins/richclay.js");
  RichClay = mod.RichClay || mod.default;
  await new Promise((r) => setTimeout(r, 0));
});

// The plugin imports once, so each test gets its own page and its own mount:
// the previous test's editors (and their instances) go away with the markup.
beforeEach(async () => {
  document.body.innerHTML = BODY;
  RichClay.init();
  await new Promise((r) => setTimeout(r, 0));
});

// Unmount while jsdom is alive: RichClay destroys an editor when its host leaves,
// and that must not run during teardown.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((r) => setTimeout(r, 0));
});

/** A booted clean tab holding the mounted editors, both lanes seeded. */
async function cleanTab() {
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("surfaces.html");
  sync._requestFrame = () => null;
  return sync;
}

/** What a peer running this tab's runtime sends: the frame and its identity map. */
function peerFrame(sync, edit) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  const map = sync.identity.exportMap(clone, snapshot.originalSnapshotNode);
  return [edit(snapshot.serializeForSync(clone)), map];
}

async function applyPeerEdit(noBase) {
  const before = editors();
  const beforeCount = before.length;
  const activeBefore = document.querySelectorAll(".richclay-active").length;
  const editableBefore = before.map((el) => el.getAttribute("contenteditable"));
  expect(beforeCount).toBe(6);
  expect(activeBefore).toBe(beforeCount);

  const sync = await cleanTab();
  const [frame, map] = peerFrame(sync, (h) => h.replace("Starter: free", "Starter: FREE"));
  expect(frame).toContain("Starter: FREE");
  expect(frame).not.toContain("richclay-active");
  expect(frame).not.toContain("contenteditable");
  expect(gate.pageMaybeDirty()).toBe(false);
  if (noBase) {
    sync.lastHtml = null;
    sync._lastIdentityMap = null;
  }

  await sync._doApplyUpdate(frame, 1, map, null);
  await new Promise((r) => setTimeout(r, 0));

  expect(document.body.textContent).toContain("Starter: FREE");
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(editors().length).toBe(beforeCount);
  expect(document.querySelectorAll(".richclay-active").length).toBe(activeBefore);
  expect(editors().map((el) => el.getAttribute("contenteditable"))).toEqual(editableBefore);
  editors().forEach((el, i) => expect(el).toBe(before[i]));
  sync.stop();
}

test("after a peer frame every RichClay editor can still be typed into (with a peer base)", async () => {
  await applyPeerEdit(false);
});

test("after a peer frame every RichClay editor can still be typed into (with no peer base, when every editor is merged)", async () => {
  await applyPeerEdit(true);
});
