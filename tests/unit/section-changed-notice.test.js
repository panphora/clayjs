import { jest } from "@jest/globals";

/**
 * "<name> changed this section", and the five ways it stays quiet.
 *
 * The notice fires when an applied frame actually changed the editable region
 * the reader was working in. Both obvious readings of that are wrong and each
 * has a test here: "an ancestor was morphed" is true of `body` on every frame,
 * and "an ancestor was replaced" misses the in-place text change that is the
 * common case. So the region's own content is compared across the morph.
 *
 * jsdom, not web-test-runner. Every assertion is about which frames produce a
 * notice and about what the capture path serializes, and both are DOM work jsdom
 * performs exactly: these tests drive the real `_doApplyUpdate`, so a real
 * hyper-morph runs against the real document, and the two release-blocking
 * assertions run through snapshot.js itself rather than a restatement of it.
 * The browser suite would add nothing here and cannot take a DOM node as an
 * assertion's `actual` without hanging.
 *
 * `document.activeElement` stays on `body` throughout, and that is the real
 * case rather than a shortcut: hyper-morph's `ignoreActiveValue` skips both the
 * value sync and the child morph for the active element, so nothing can change
 * under a caret that is still there. The frame worth reporting is the one that
 * lands on the section the reader just left, which is why the region is
 * remembered after focus moves on.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

// The author stamp the server puts on every live-lane frame. `name` is never
// null on the wire: a person-less edit-link author is labelled "Edit link".
const ADA = { id: "9f3c21ab7e4d5061", name: "Ada Lovelace" };

let LiveSync;
let sectionNotice;
let snapshot;
let gate;
let etag;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  ({ sectionNotice } = await import("../../src/sync/section-notice.js"));
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  etag = await import("../../src/core/etag.js");
});

beforeEach(async () => {
  // Convergence saves would go to the wire; fail them fast.
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.body.innerHTML = "";
  // One notice per test, with no memory of the last one's region.
  sectionNotice.destroy();
  sectionNotice.init();
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

const notice = () => document.querySelector("[data-clay-section-notice]");
const line = () => document.querySelector("[data-clay-section-notice-line]");
const said = () => (line() ? line().textContent : null);
const dismiss = () => document.querySelector("[data-clay-section-notice-dismiss]");

// A real focusin, dispatched rather than driven through .focus(): jsdom will not
// focus a bare contenteditable div, and the element the caret is IN is the one
// hyper-morph refuses to touch anyway.
const focusIn = (el) => el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
const typedInto = (el, html) => {
  el.innerHTML = html;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const settle = () => new Promise((r) => setTimeout(r, 0));
// rAF in jsdom is a ~16ms timer, so a few ticks drain the pending slot.
const drain = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 20));
};

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  return sync;
}

// Two sections: the one the reader was working in, and one they were not.
function page() {
  document.body.innerHTML =
    '<div id="bio" contenteditable><p>mine</p></div>' +
    '<div id="news"><p>theirs</p></div>';
}

// A peer-domain frame of the CURRENT page state: what this tab would have sent
// (and stored as lastHtml) a moment ago.
function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

// A clean tab holding `base`, with the gate quiet, ready to take a frame.
async function readyTab() {
  const sync = makeSync();
  page();
  sync.lastHtml = captureFrame();
  await settle();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  return sync;
}

// =============================================================================
// The notice
// =============================================================================

test("a frame that changed the section the reader was working in names who changed it", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));

  await sync._doApplyUpdate(sync.lastHtml.replace("mine", "hers"), 5, null, null, ADA);

  expect(document.querySelector("#bio p").textContent).toBe("hers");
  expect(said()).toBe("Ada Lovelace changed this section");
  expect(notice().style.getPropertyValue("display")).toBe("flex");
  sync.stop();
});

// The disk lane carries no author on hyperclay today: its two live relays stamp
// one and nothing else does, so a device write morphs peers with no `by`. This
// is the second dispatch site's carry-through proved, not a frame anybody sends.
test("a disk change that did name an author reports it the same way", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));
  sync.currentFile = "index.html";
  sync.resumeId = "r1";
  sync.connect();

  sync.sse.onmessage({
    data: JSON.stringify({
      type: "notification",
      msgType: "info",
      msg: "index.html changed on disk outside this tab",
      seq: 11,
      data: {
        kind: "external-change",
        html:
          '<html><head></head><body><div id="bio" contenteditable><p>hers</p></div>' +
          '<div id="news"><p>theirs</p></div></body></html>',
        by: ADA,
      },
    }),
  });
  await drain();

  expect(document.querySelector("#bio p").textContent).toBe("hers");
  expect(said()).toBe("Ada Lovelace changed this section");
  sync.stop();
});

test("a change outside that section gives no notice, even though the morph reached its ancestors", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));

  await sync._doApplyUpdate(sync.lastHtml.replace("theirs", "updated"), 5, null, null, ADA);

  // The frame applied and `body` — an ancestor of #bio — was morphed. Reporting
  // on that is the wrong reading the region comparison exists to replace.
  expect(document.querySelector("#news p").textContent).toBe("updated");
  expect(document.querySelector("#bio p").textContent).toBe("mine");
  expect(notice()).toBeNull();
  sync.stop();
});

test("the reader's own typing is not somebody else's edit", async () => {
  const sync = makeSync();
  page();
  const bio = document.querySelector("#bio");
  focusIn(bio);
  typedInto(bio, "<p>mine, rewritten</p>");

  // The frame carries what this tab already holds in that section, so the morph
  // leaves it alone. The only thing that could put a peer's name on the reader's
  // own keystrokes is a baseline that never heard about them.
  sync.lastHtml = captureFrame();
  await settle();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  await sync._doApplyUpdate(sync.lastHtml.replace("theirs", "updated"), 6, null, null, ADA);

  expect(document.querySelector("#bio p").textContent).toBe("mine, rewritten");
  expect(document.querySelector("#news p").textContent).toBe("updated");
  expect(notice()).toBeNull();
  sync.stop();
});

test("a reader who was not working in any section is told nothing", async () => {
  const sync = await readyTab();

  await sync._doApplyUpdate(sync.lastHtml.replace("mine", "hers"), 5, null, null, ADA);

  expect(document.querySelector("#bio p").textContent).toBe("hers");
  expect(notice()).toBeNull();
  sync.stop();
});

test("dismissing takes the notice, and the name, back off the page", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));
  await sync._doApplyUpdate(sync.lastHtml.replace("mine", "hers"), 5, null, null, ADA);
  expect(said()).toBe("Ada Lovelace changed this section");

  dismiss().click();

  expect(notice().style.getPropertyValue("display")).toBe("none");
  expect(said()).toBe("");
  expect(document.documentElement.outerHTML).not.toContain(ADA.name);
  sync.stop();
});

// =============================================================================
// Silent in four cases, each its own guard
// =============================================================================

test("silent: the reader's own tab, dropped by sender before anything is queued", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));
  sync.currentFile = "index.html";
  sync.resumeId = "r1";
  sync.connect();

  const frame = { html: sync.lastHtml.replace("mine", "hers"), seq: 7, by: ADA };
  sync.sse.onmessage({ data: JSON.stringify({ ...frame, sender: sync.clientId }) });

  // Read before the queue is drained, not after: a frame that DID apply would
  // leave the slot empty again by then, so the same check after a drain says
  // nothing at all.
  expect(sync._pendingHtml).toBeNull();

  await drain();
  expect(document.querySelector("#bio p").textContent).toBe("mine");
  expect(notice()).toBeNull();

  // The control: the same frame from anybody else does reach the notice, so the
  // sender is the only thing separating the two.
  sync.sse.onmessage({ data: JSON.stringify({ ...frame, seq: 8, sender: "peer" }) });
  await drain();
  expect(said()).toBe("Ada Lovelace changed this section");
  sync.stop();
});

test("silent: a frame with no author to name", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));

  await sync._doApplyUpdate(sync.lastHtml.replace("mine", "hers"), 5, null, null);

  // The frame applied and the region really did change. There is simply nobody
  // to put in the sentence, which is every saved-lane frame there is.
  expect(document.querySelector("#bio p").textContent).toBe("hers");
  expect(notice()).toBeNull();
  sync.stop();
});

test("silent: a frame the peer path held, which dispatches no applied event at all", async () => {
  const sync = makeSync();
  page();
  sync.lastHtml = null; // first frame of a fresh connection: no baseline to merge against

  const bio = document.querySelector("#bio");
  focusIn(bio);
  typedInto(bio, "<p>local-edit</p>");
  await settle();
  expect(gate.pageMaybeDirty()).toBe(true);

  const events = [];
  const onHeld = () => events.push("held");
  const onApplied = () => events.push("applied");
  document.addEventListener("clay:sync-held", onHeld);
  document.addEventListener("clay:sync-applied", onApplied);
  try {
    await sync._doApplyUpdate(
      '<html><head></head><body><div id="bio" contenteditable><p>hers</p></div>' +
        '<div id="news"><p>theirs</p></div></body></html>',
      3,
      null,
      null,
      ADA
    );
  } finally {
    document.removeEventListener("clay:sync-held", onHeld);
    document.removeEventListener("clay:sync-applied", onApplied);
  }

  // The hold returns before the dispatch, so the notice is never asked. It would
  // also have found the region unchanged — a hold morphs nothing — which is the
  // second, independent reason this is quiet.
  expect(events).toEqual(["held"]);
  expect(document.querySelector("#bio p").textContent).toBe("local-edit");
  expect(notice()).toBeNull();
  sync.stop();
});

test("silent: a frame equal to lastHtml, which takes the stamp and returns before applying", async () => {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));
  sync.currentFile = "index.html";
  sync.resumeId = "r1";
  sync.connect();

  sync.sse.onmessage({
    data: JSON.stringify({
      html: sync.lastHtml,
      sender: "peer",
      seq: 9,
      etag: 'W/"v7"',
      by: ADA,
    }),
  });

  // The frame's only news was the stamp, which is taken; the bytes are ones this
  // tab already holds, so nothing is queued. Read before the drain, since a
  // frame that DID apply would have emptied the slot again by then.
  expect(sync._pendingHtml).toBeNull();
  expect(etag.lastSeenEtag()).toBe('W/"v7"');

  await drain();
  expect(notice()).toBeNull();
  sync.stop();
});

// =============================================================================
// The notice is not document content
// =============================================================================

async function showing() {
  const sync = await readyTab();
  focusIn(document.querySelector("#bio"));
  await sync._doApplyUpdate(sync.lastHtml.replace("mine", "hers"), 5, null, null, ADA);
  expect(said()).toBe("Ada Lovelace changed this section");
  return sync;
}

test("every element it creates is marked out of the save, the watch and the snapshot", async () => {
  const sync = await showing();

  const created = [notice(), ...notice().querySelectorAll("*")];
  // Root, line, dismiss button.
  expect(created.length).toBe(3);
  for (const el of created) {
    expect(el.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  }
  sync.stop();
});

test("RELEASE-BLOCKING: no author name and no notice text reaches forSave", async () => {
  const sync = await showing();

  const { forSave } = snapshot.captureForSaveAndComparison();

  expect(forSave).not.toContain("data-clay-section-notice");
  expect(forSave).not.toContain(ADA.name);
  expect(forSave).not.toContain("changed this section");
  // The capture ran over a document that really did hold the notice.
  expect(notice()).not.toBeNull();
  sync.stop();
});

test("RELEASE-BLOCKING: no author name and no notice text reaches the clone peers receive", async () => {
  const sync = await showing();

  // The clone handed to live-sync, emitted BEFORE the save-only strip. A
  // listener may read it and must not write to it, so this only serializes.
  let emitted = null;
  const onReady = (event) => { emitted = event.detail.documentElement.outerHTML; };
  document.addEventListener("clay:snapshot-ready", onReady);
  try {
    snapshot.captureForSaveAndComparison();
  } finally {
    document.removeEventListener("clay:snapshot-ready", onReady);
  }

  expect(emitted).not.toBeNull();
  expect(emitted).not.toContain("data-clay-section-notice");
  expect(emitted).not.toContain(ADA.name);
  expect(emitted).not.toContain("changed this section");
  sync.stop();
});

test("a notice is not an edit", async () => {
  const sync = await readyTab();
  const Mutation = (await import("../../src/lib/mutation.js")).default;

  focusIn(document.querySelector("#bio"));
  const before = snapshot.captureForComparison({ flushUndo: false });

  const observed = [];
  Mutation.onAnyChange({ require: "observed", omitChangeDetails: true }, () => observed.push(1));

  // Built and torn back down while the mutation hub is live.
  sectionNotice.show("Ada Lovelace");
  sectionNotice.hide();
  await settle();

  expect(snapshot.captureForComparison({ flushUndo: false })).toBe(before);
  expect(observed).toEqual([]);

  // The control: the hub is wired up and would have reported a real edit.
  document.querySelector("#news p").textContent = "edited";
  await settle();
  expect(observed.length).toBeGreaterThan(0);
  sync.stop();
});
