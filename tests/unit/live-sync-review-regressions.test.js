import { jest } from "@jest/globals";

/**
 * Regressions from the 2026-09-25 review of the live-sync switchover to
 * hyper-morph's three-way merge. One test per finding, each built from the
 * reviewer's probe:
 *
 *   R1  root library attrs (editmode, pageowner, savestatus) on the snapshot
 *       root made every dirty merge read as diverged;
 *   R2  the disk lane's base never advanced, so a later disk revert was lost;
 *   R4  activation of the merged document rewrote a local plaintext-only card;
 *   R5  churn in a no-watch region counted as local work;
 *   R6  a synthetic id map shadowed an authored data-id and duplicated a card;
 *   R7  a runtime contenteditable lock lost to the file's inert form;
 *   R8  the disk lane merged against the relayed (not saved) state and reverted
 *       a typed edit;
 *   R9  a conflict the remote won marked the page clean;
 *   R11 a frame carrying <html autosave> turned a manual-save tab into an
 *       auto-writer;
 *   R12 a clean tab merged [merge] JSON two-way and resurrected a deleted key.
 *
 * jsdom ships no EventSource; the fake must be installed before importing
 * live-sync.js (its singleton auto-starts, and this file runs in edit mode).
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let snapshot;
let gate;
let save;
let autosaveState;

const ROOT_ATTRS = ["autosave", "editmode", "pageowner", "savestatus"];

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  // Registers the save-domain transforms (contenteditable -> inert-contenteditable
  // and the rest), as a real edit-mode page does before save.js: the disk lane
  // merges all three sides in the file's own form, so a capture taken without
  // them is in the wrong domain and activation rewrites local content.
  await import("../../src/core/admin-attrs.js");

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  autosaveState = await import("../../src/lib/autosave-state.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  for (const a of ROOT_ATTRS) document.documentElement.removeAttribute(a);
  autosaveState.setAutosaveActive(false);
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
  for (const a of ROOT_ATTRS) document.documentElement.removeAttribute(a);
  autosaveState.setAutosaveActive(false);
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

// The peer lane's base: what this tab would have relayed a moment ago.
function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

// The disk lane's base: the bytes a save of the current page would write.
function captureDisk() {
  return snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;
}

function diskDoc(bodyInner) {
  return `<!DOCTYPE html><html><head></head><body>${bodyInner}</body></html>`;
}

function onApplied() {
  const seen = [];
  const handler = (e) => seen.push(e.detail);
  document.addEventListener("clay:sync-applied", handler);
  seen.stop = () => document.removeEventListener("clay:sync-applied", handler);
  return seen;
}

async function settle(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

test("R1 an echo merge with editmode/pageowner/savestatus on the root is not diverged and clears the gate", async () => {
  document.documentElement.setAttribute("editmode", "true");
  document.documentElement.setAttribute("pageowner", "true");
  document.documentElement.setAttribute("savestatus", "saved");
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section>');
  sync.lastHtml = captureFrame();
  document.querySelector('[data-id="a"] p').textContent = "a1";
  await Promise.resolve();
  const frame = sync.lastHtml.replace("a0", "a1");

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 8, null);
  seen.stop();

  expect(seen[0].report.localDiverged).toBe(false);
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(document.documentElement.getAttribute("editmode")).toBe("true");
  sync.stop();
});

test("R2 the disk base advances: a later disk frame that reverts an earlier one lands", async () => {
  window.clay = { testMode: true };
  const sync = makeSync();
  await settle(
    '<section data-id="a"><p>a0</p></section><section data-id="b"><p>price is ten</p></section>'
  );
  sync._diskBase = captureDisk();
  document.querySelector('[data-id="a"] p').textContent = "a-local";
  await Promise.resolve();

  await sync._doApplyExternal(
    diskDoc('<section data-id="a"><p>a0</p></section><section data-id="b"><p>price is twelve</p></section>'),
    70
  );
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("price is twelve");
  await sync._doApplyExternal(
    diskDoc('<section data-id="a"><p>a0</p></section><section data-id="b"><p>price is ten</p></section>'),
    71
  );

  expect(document.querySelector('[data-id="b"] p').textContent).toBe("price is ten");
  expect(document.querySelector('[data-id="a"] p').textContent).toBe("a-local");
  sync.stop();
});

test("R4 a card this tab added keeps its plaintext-only contenteditable through a disk frame", async () => {
  const sync = makeSync();
  await settle(
    '<ul><li data-id="c1"><span editmode:contenteditable contenteditable="plaintext-only">card one</span></li></ul><p data-id="p">p0</p>'
  );
  sync._diskBase = captureDisk();
  const li = document.createElement("li");
  li.innerHTML = '<span editmode:contenteditable contenteditable="plaintext-only">card two</span>';
  document.querySelector("ul").appendChild(li);
  await Promise.resolve();

  await sync._doApplyExternal(
    diskDoc(
      '<ul><li data-id="c1"><span editmode:contenteditable inert-contenteditable="plaintext-only">card one</span></li></ul><p data-id="p">p-disk</p>'
    ),
    100
  );

  const spans = [...document.querySelectorAll("span")].map((s) => [
    s.textContent,
    s.getAttribute("contenteditable"),
  ]);
  expect(spans).toEqual([
    ["card one", "plaintext-only"],
    ["card two", "plaintext-only"],
  ]);
  expect(document.querySelector('[data-id="p"]').textContent).toBe("p-disk");
  sync.stop();
});

test("R5 churn in a no-watch region is not local work", async () => {
  const sync = makeSync();
  await settle('<div no-watch><span>tick 1</span></div><section data-id="a"><p>a0</p></section>');
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("a0", "a1");
  document.querySelector("[no-watch] span").textContent = "tick 2";
  document.querySelector('[data-id="a"] p').textContent = "a1";
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 110, null);
  seen.stop();

  expect(seen[0].report.localDiverged).toBe(false);
  sync.stop();
});

describe("R6 an authored data-id outranks a synthetic id", () => {
  const board = (a, b) => `<div data-id="colA">${a}</div><div data-id="colB">${b}</div>`;
  const card = (id, title, body) =>
    `<article data-id="${id}"><h3>${title}</h3><p>${body}</p></article>`;

  test("peer lane: a boot-seeded tab takes a fresh peer's move of a card it edited", async () => {
    const receiver = makeSync();
    const peer = makeSync();
    await settle(
      board(card("c1", "one", "first card") + card("c2", "two", "alpha beta gamma delta"), card("c3", "three", "third card"))
    );
    const savedBody = document.body.innerHTML;
    document.body.innerHTML = board(
      card("c1", "one", "first card"),
      card("c3", "three", "third card") + card("c2", "two", "completely rewritten by the other tab")
    );
    const clone = snapshot.captureSnapshot({ flushUndo: false });
    const frame = snapshot.serializeForSync(clone);
    const map = peer.identity.exportMap(clone, snapshot.originalSnapshotNode);
    document.body.innerHTML = savedBody;
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    receiver.start("index.html");
    receiver._requestFrame = () => null;
    document.querySelector('[data-id="c2"] h3').textContent = "two (local)";
    await Promise.resolve();

    await receiver._doApplyUpdate(frame, 130, map);

    const c2s = [...document.querySelectorAll('[data-id="c2"]')].map(
      (el) => el.parentElement.dataset.id + ":" + el.textContent
    );
    expect(c2s).toEqual(["colB:two (local)completely rewritten by the other tab"]);
    receiver.stop();
    peer.stop();
  });

  test("disk lane: a boot-seeded tab takes the file's move of a card it edited", async () => {
    const sync = makeSync();
    await settle(
      board(card("c1", "one", "first card") + card("c2", "two", "alpha beta gamma delta"), card("c3", "three", "third card"))
    );
    sync.start("index.html");
    sync._requestFrame = () => null;
    document.querySelector('[data-id="c2"] h3').textContent = "two (local)";
    await Promise.resolve();

    await sync._doApplyExternal(
      diskDoc(
        board(
          card("c1", "one", "first card"),
          card("c3", "three", "third card") + card("c2", "two", "completely rewritten by the agent now")
        )
      ),
      120
    );

    const c2s = [...document.querySelectorAll('[data-id="c2"]')].map(
      (el) => el.parentElement.dataset.id + ":" + el.textContent
    );
    expect(c2s).toEqual(["colB:two (local)completely rewritten by the agent now"]);
    sync.stop();
  });
});

test("R7 a runtime contenteditable lock survives an unrelated disk edit", async () => {
  const sync = makeSync();
  await settle('<h1 data-id="t" editmode:contenteditable contenteditable="true">Title</h1><p data-id="p">p0</p>');
  sync._diskBase = captureDisk();
  document.querySelector("h1").setAttribute("contenteditable", "false");
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyExternal(
    diskDoc('<h1 data-id="t" editmode:contenteditable inert-contenteditable="true">Title</h1><p data-id="p">p-disk</p>'),
    140
  );
  seen.stop();

  expect(document.querySelector("h1").getAttribute("contenteditable")).toBe("false");
  expect(document.querySelector("p").textContent).toBe("p-disk");
  expect(seen[0].report.conflicts).toEqual([]);
  sync.stop();
});

test("R8 a typed edit whose save was refused survives the disk frame that caused the refusal", async () => {
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>');
  sync._diskBase = captureDisk();
  document.querySelector('[data-id="a"] p').textContent = "a-typed";
  await Promise.resolve();
  // The relay went out (lastHtml carries the edit); the save itself was refused.
  sync.lastHtml = captureFrame();

  await sync._doApplyExternal(
    diskDoc('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b-agent</p></section>'),
    150
  );

  expect(document.querySelector('[data-id="a"] p').textContent).toBe("a-typed");
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b-agent");
  expect(gate.pageMaybeDirty()).toBe(true);
  sync.stop();
});

test("R9 a conflict the file won leaves the page dirty and reports the lost text", async () => {
  const sync = makeSync();
  await settle('<p data-id="p">Meeting notes: budget is fine.</p>');
  sync._diskBase = captureDisk();
  document.querySelector("p").textContent = "Meeting notes: budget is over by 20 percent, flag to Sam.";
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyExternal(diskDoc('<p data-id="p">Meeting notes: budget is approved.</p>'), 161);
  seen.stop();

  expect(document.querySelector("p").textContent).toBe("Meeting notes: budget is approved.");
  expect(seen[0].report.conflicts.length).toBeGreaterThan(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(save.getLastSavedContents()).not.toContain("approved");
  sync.stop();
});

test("R11 autosave follows the boot decision, not an attribute a frame carries", async () => {
  window.clay = { testMode: true };
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>');
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("b0", "b-peer").replace("<html", "<html autosave");
  document.querySelector('[data-id="a"] p').textContent = "a-local";
  await Promise.resolve();

  await sync._doApplyUpdate(frame, 170, null);
  await new Promise((r) => setTimeout(r, 30));

  expect(save.getLastSavedContents()).not.toContain("a-local");
  sync.stop();
});

describe("R12 a clean tab merges [merge] JSON three-way", () => {
  test("peer lane: a key the peer deleted stays deleted", async () => {
    const sync = makeSync();
    await settle('<script type="application/json" merge="data">{"a":1,"b":2}</script><p>x</p>');
    sync.lastHtml = captureFrame();
    const frame = sync.lastHtml.replace('{"a":1,"b":2}', '{"a":1}');

    await sync._doApplyUpdate(frame, 180, null);

    expect(JSON.parse(document.querySelector("script[merge]").textContent)).toEqual({ a: 1 });
    sync.stop();
  });

  test("disk lane: a key the file dropped stays dropped", async () => {
    const sync = makeSync();
    await settle('<script type="application/json" merge="data">{"a":1,"b":2}</script><p>x</p>');
    sync._diskBase = captureDisk();

    await sync._doApplyExternal(
      diskDoc('<script type="application/json" merge="data">{"a":1}</script><p>x</p>'),
      181
    );

    expect(JSON.parse(document.querySelector("script[merge]").textContent)).toEqual({ a: 1 });
    sync.stop();
  });
});
