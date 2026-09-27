import { jest } from "@jest/globals";
import { HyperMorph } from "../../src/vendor/hyper-morph.vendor.js";

/**
 * Regressions from the round-2 review (2026-09-26) of live sync on hyper-morph
 * 1.0's mergeDocument. Each test is a reviewer's probe, ported; the probe's
 * seat and label are in the test name.
 *
 *   R2-1  a clean peer apply never advanced the disk lane's base, so the next
 *         disk frame read the peer's content as this tab's edit and put it back;
 *   R2-2  a save response landing after a later disk frame (or a frame whose
 *         await outlasted a save) rewound the disk lane's base;
 *   R2-3  an authored id shared by several elements pre-empted the sender's
 *         map, so cloned cards paired by nothing and one was emptied silently;
 *   R2-4  a conflict the frame won marked the page dirty for exactly one frame;
 *         the next clean frame, or the convergence save, cleared it;
 *   R2-5  an element paired by authored id never adopted the sender's synthetic
 *         id, so a 1.4.0 receiver replaced the card on the next frame;
 *   R2-6  a clean tab merged the lane's base against a fresh capture and read
 *         every non-round-tripping DOM shape as a local edit;
 *   A13   typing during an awaited apply was never scheduled for autosave;
 *   F2    a dirty tab re-creates the children of no-watch (and the other
 *         remote-wins) regions on every frame: hyper-morph's asBase view hands
 *         the base node to provenance, so apply finds no live twin. Fixed in
 *         hyper-morph (HM-G, Group N).
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
let Legacy;
let snapshot;
let gate;
let save;
let autosaveState;

const ROOT_ATTRS = ["autosave", "editmode", "pageowner", "savestatus", "documentid"];
const THROTTLE_MS = 1300;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  const legacy = await import("./legacy-1.4.0/legacy-live.js");
  Legacy = legacy.LiveSync;
  legacy.liveSync.stop();

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

// A tab as it stands after boot: both lanes seeded from the page as served.
function startSync() {
  const sync = makeSync();
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

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

async function settleBaselines() {
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

async function settle(body) {
  document.body.innerHTML = body;
  await settleBaselines();
}

function closeWarns() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const texts = (selector) => [...document.querySelectorAll(selector)].map((el) => el.textContent);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A frame whose apply awaits: an external script the test releases by hand.
function scriptFrame(html, src) {
  return html.replace("</body>", `<script src="${src}"></script></body>`);
}
function releaseScript(src) {
  document.querySelector(`script[src="${src}"]`).dispatchEvent(new Event("load"));
}

// ---------------------------------------------------------------------------
// R2-1 a clean peer apply moves the disk lane's base
// ---------------------------------------------------------------------------

describe("R2-1 a clean peer apply advances the disk lane's base", () => {
  const B0 = '<section data-id="a"><p>a0</p></section><section data-id="b"><p>price is ten</p></section>';

  test("Codex R2C: a saved peer frame then a disk revert; the peer change does not come back", async () => {
    const sync = makeSync();
    await settle('<p data-id="a">a0</p><p data-id="b">b0</p>');
    sync.lastHtml = captureFrame();
    sync._diskBase = captureDisk();
    const seen = onApplied();
    await sync._doApplyUpdate(sync.lastHtml.replace("a0", "a1"), 201, null, "peer-saved");
    expect(gate.pageMaybeDirty()).toBe(false);

    await sync._doApplyExternal(diskDoc('<p data-id="a">a0</p><p data-id="b">b1</p>'), 202, "disk-reverted");
    seen.stop();

    expect(texts("p")).toEqual(["a0", "b1"]);
    expect(seen[1].report.localDiverged).toBe(false);
    expect(seen[1].report.conflicts).toEqual([]);
    sync.stop();
  });

  test("Opus P1a: a peer adds a paragraph and saves; the file then drops it; the drop lands", async () => {
    await settle(B0);
    const sync = startSync();
    await sync._doApplyUpdate(
      sync.lastHtml.replace("<p>price is ten</p>", "<p>price is ten</p><p>added by peer</p>"),
      10,
      null
    );
    expect(gate.pageMaybeDirty()).toBe(false);

    const seen = onApplied();
    await sync._doApplyExternal(diskDoc(B0), 11);
    seen.stop();

    expect(document.body.innerHTML).toBe(B0);
    expect(seen[0].report.localDiverged).toBe(false);
    expect(seen[0].report.conflicts).toEqual([]);
    expect(gate.pageMaybeDirty()).toBe(false);
    sync.stop();
  });

  test("Opus P1c: the file drops the peer's paragraph and edits the line above it in one write", async () => {
    await settle(B0);
    const sync = startSync();
    await sync._doApplyUpdate(
      sync.lastHtml.replace("<p>price is ten</p>", "<p>price is ten</p><p>added by peer</p>"),
      10,
      null
    );

    const seen = onApplied();
    await sync._doApplyExternal(diskDoc(B0.replace("price is ten", "price is ten euros")), 11);
    seen.stop();

    expect(texts('[data-id="b"] p')).toEqual(["price is ten euros"]);
    expect(seen[0].report.conflicts).toEqual([]);
    sync.stop();
  });

  test("Astra R2-A: a stamped peer edit then a disk revert by authored id; the tab stays clean", async () => {
    await settle('<p id="p">price is ten</p>');
    const sync = startSync();
    await sync._doApplyUpdate(sync.lastHtml.replace("ten", "twelve"), 1, null, "saved-twelve");
    expect(document.querySelector("#p").textContent).toBe("price is twelve");

    await sync._doApplyExternal(diskDoc('<p id="p">price is ten</p>'), 2, "saved-ten");

    expect(document.querySelector("#p").textContent).toBe("price is ten");
    expect(gate.pageMaybeDirty()).toBe(false);
    expect(closeWarns()).toBe(false);
    sync.stop();
  });

  test("Opus P1e: the next unrelated save does not write the peer's paragraph back to disk", async () => {
    window.clay = { testMode: true };
    await settle(B0);
    const sync = startSync();
    await sync._doApplyUpdate(
      sync.lastHtml.replace("<p>price is ten</p>", "<p>price is ten</p><p>added by peer</p>"),
      10,
      null
    );
    await sync._doApplyExternal(diskDoc(B0), 11);
    expect(closeWarns()).toBe(false);

    document.querySelector('[data-id="a"] p').textContent = "a-typed";
    await Promise.resolve();
    const result = await save.savePage();

    expect(result.ok).toBe(true);
    expect(save.getLastSavedBytes()).toContain("a-typed");
    expect(save.getLastSavedBytes()).not.toContain("added by peer");
    sync.stop();
  });
});

// ---------------------------------------------------------------------------
// R2-2 the disk lane's base is monotonic: a writer for an older moment loses
// ---------------------------------------------------------------------------

describe("R2-2 a save and a frame race for the disk lane's base; the later moment wins", () => {
  const body = (a, b) => `<p data-id="a">${a}</p><p data-id="b">${b}</p>`;

  test("Codex R2D: a save during an awaited disk merge keeps its base over the older frame", async () => {
    window.clay = { testMode: true };
    await settle(body("a0", "b0"));
    const sync = startSync();
    document.querySelector('[data-id="a"]').textContent = "a1";
    await Promise.resolve();

    const older = scriptFrame(diskDoc(body("a0", "b1")), "/round2-fixture.js");
    const pending = sync._doApplyExternal(older, 210, "older-disk");
    await wait(0);
    expect(sync.isPaused).toBe(true);
    const saved = await save.savePageForce();
    expect(saved.ok).toBe(true);
    expect(sync._diskBase).toContain("a1");
    releaseScript("/round2-fixture.js");
    await pending;

    expect(sync._diskBase).toContain("a1");
    // The file now holds a1 (this tab's save). The writer reverts a and edits b.
    await sync._doApplyExternal(older.replace("b1", "b2"), 211, "newer-disk");
    expect(texts("p")).toEqual(["a0", "b2"]);
    sync.stop();
  });

  test("Opus P3: a save response that lands after a later disk frame applied does not rewind the base", async () => {
    window.clay = { testMode: true };
    await settle('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>');
    const sync = startSync();
    document.querySelector('[data-id="a"] p').textContent = "a1";
    await Promise.resolve();
    const saving = save.savePage();
    // The file took S (a1), then an agent appended a note: E's frame beats S's response.
    const E = diskDoc(
      '<section data-id="a"><p>a1</p></section><section data-id="b"><p>b0</p><p data-id="r">agent note</p></section>'
    );
    await sync._doApplyExternal(E, 50);
    await saving;
    expect(sync._diskBase).toBe(E);

    const E2 = diskDoc('<section data-id="a"><p>a1</p></section><section data-id="b"><p>b0</p></section>');
    const seen = onApplied();
    await sync._doApplyExternal(E2, 51);
    seen.stop();

    expect(document.body.innerHTML).not.toContain("agent note");
    expect(seen[0].report.localDiverged).toBe(false);
    sync.stop();
  });

  test("a save that succeeds advances the base; a failed save leaves it alone", async () => {
    await settle('<p data-id="p">p0</p>');
    const sync = startSync();
    window.clay = { testMode: true };
    document.querySelector("p").textContent = "p1";
    expect((await save.savePageForce()).ok).toBe(true);
    const base = sync._diskBase;
    expect(base).toContain("p1");

    delete window.clay;
    document.querySelector("p").textContent = "p2";
    expect((await save.savePageForce()).ok).toBe(false);
    expect(sync._diskBase).toBe(base);
    expect(gate.pageMaybeDirty()).toBe(true);
    sync.stop();
  });
});

// ---------------------------------------------------------------------------
// R2-3 a duplicated authored id yields to the sender's map
// ---------------------------------------------------------------------------

describe("R2-3 cloned cards sharing one data-id pair by synthetic id", () => {
  const card = (t, b) => `<article data-id="card" class="card"><h3>${t}</h3><p>${b}</p></article>`;

  // The peer moves the third card to the top and writes its body; the frame and
  // map are what that peer would relay.
  async function peerMovesThirdCard(receiver) {
    const peer = makeSync();
    const [c1, c2, c3] = document.querySelectorAll("article");
    for (const el of document.querySelectorAll("*")) {
      const id = receiver.identity.idOf(el);
      if (id) peer.identity.adopt(el, id);
    }
    const col = document.querySelector('[data-id="col"]');
    col.insertBefore(c3, c1);
    c3.querySelector("p").textContent = "call the plumber";
    const clone = snapshot.captureSnapshot({ flushUndo: false });
    const frame = snapshot.serializeForSync(clone);
    const map = peer.identity.exportMap(clone, snapshot.originalSnapshotNode);
    col.append(c3);
    c3.querySelector("p").textContent = "empty";
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    peer.stop();
    return { frame, map, c1, c2, c3 };
  }

  test("Opus P7b: a dirty receiver keeps every card whole, in the peer's order, with its own edit", async () => {
    await settle(`<div data-id="col">${card("New card", "empty")}${card("New card", "empty")}${card("New card", "empty")}</div>`);
    const receiver = startSync();
    const { frame, map, c1, c2, c3 } = await peerMovesThirdCard(receiver);
    c2.querySelector("h3").textContent = "Dentist";
    await Promise.resolve();

    const seen = onApplied();
    await receiver._doApplyUpdate(frame, 91, map);
    seen.stop();

    const cards = [...document.querySelectorAll("article")];
    expect(cards).toEqual([c3, c1, c2]);
    expect(cards.map((a) => a.children.length)).toEqual([2, 2, 2]);
    expect(texts("article h3")).toEqual(["New card", "New card", "Dentist"]);
    expect(texts("article p")).toEqual(["call the plumber", "empty", "empty"]);
    expect(seen[0].report.conflicts).toEqual([]);
    receiver.stop();
  });

  test("Opus P7d: a clean receiver keeps every card whole, and its next save writes three full cards", async () => {
    window.clay = { testMode: true };
    await settle(`<h1 data-id="t">Board</h1><div data-id="col">${card("New card", "empty")}${card("New card", "empty")}${card("New card", "empty")}</div>`);
    const receiver = startSync();
    const { frame, map } = await peerMovesThirdCard(receiver);

    const seen = onApplied();
    await receiver._doApplyUpdate(frame, 92, map);
    seen.stop();
    expect([...document.querySelectorAll("article")].map((a) => a.children.length)).toEqual([2, 2, 2]);
    expect(seen[0].report.localDiverged).toBe(false);
    expect(gate.pageMaybeDirty()).toBe(false);

    document.querySelector("h1").textContent = "Board (renamed)";
    await Promise.resolve();
    await save.savePage();
    const saved = save.getLastSavedBytes() || "";
    expect(saved).not.toContain('<article data-id="card" class="card"></article>');
    expect((saved.match(/<article/g) || []).length).toBe(3);
    expect(saved).toContain("call the plumber");
    receiver.stop();
  });
});

// ---------------------------------------------------------------------------
// R2-4 a lost conflict keeps the page dirty until this tab saves
// ---------------------------------------------------------------------------

describe("R2-4 an unresolved conflict stays dirty across later frames", () => {
  test("Codex R2E: a later unrelated peer frame leaves the gate dirty and the baseline untouched", async () => {
    const sync = makeSync();
    await settle('<p data-id="a">budget is fine</p><p data-id="b">b0</p>');
    sync.lastHtml = captureFrame();
    const first = sync.lastHtml.replace("budget is fine", "budget is approved");
    document.querySelector('[data-id="a"]').textContent = "budget is over by 20 percent";
    await Promise.resolve();

    const seen = onApplied();
    await sync._doApplyUpdate(first, 220, null);
    expect(seen[0].report.conflicts.length).toBeGreaterThan(0);
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(sync.unresolvedConflicts).toHaveLength(seen[0].report.conflicts.length);
    expect(sync.unresolvedConflicts[0].local).toContain("over by 20 percent");

    await sync._doApplyUpdate(first.replace("b0", "b1"), 221, null);
    seen.stop();

    expect(texts("p")).toEqual(["budget is approved", "b1"]);
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(save.getLastSavedContents()).not.toContain("budget is approved");
    expect(sync.unresolvedConflicts).toHaveLength(seen[0].report.conflicts.length);
    sync.stop();
  });

  test("Codex CONFLICT-WARNING: the close warning survives the second frame", async () => {
    const sync = makeSync();
    await settle('<p data-id="a">budget is fine</p><p data-id="b">b0</p>');
    sync.lastHtml = captureFrame();
    const remote = sync.lastHtml.replace("budget is fine", "budget is approved");
    document.querySelector('[data-id="a"]').textContent = "budget is over by 20 percent";
    await Promise.resolve();

    await sync._doApplyUpdate(remote, 410, null);
    expect(closeWarns()).toBe(true);
    await sync._doApplyUpdate(remote.replace("b0", "b1"), 411, null);
    expect(closeWarns()).toBe(true);
    sync.stop();
  });

  test("Astra R2-B: a later unrelated disk frame leaves the gate dirty and the close warning up", async () => {
    await settle('<p id="p">budget is fine</p><p id="q">q0</p>');
    const sync = startSync();
    document.querySelector("#p").textContent = "budget is over";
    await Promise.resolve();
    const first = diskDoc('<p id="p">budget is approved</p><p id="q">q0</p>');
    await sync._doApplyExternal(first, 1, "e1");
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(closeWarns()).toBe(true);

    await sync._doApplyExternal(first.replace("q0", "q1"), 2, "e2");

    expect(texts("p")).toEqual(["budget is approved", "q1"]);
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(closeWarns()).toBe(true);
    expect(save.getLastSavedDirty()).not.toContain("approved");
    sync.stop();
  });

  test("Astra R2-G: the convergence save does not run over a lost conflict on an autosave page", async () => {
    await settle('<p id="p">budget is fine</p><p id="q">q0</p>');
    const sync = startSync();
    window.clay = { testMode: true };
    autosaveState.setAutosaveActive(true);
    document.querySelector("#p").textContent = "budget is over";
    document.querySelector("#q").textContent = "q local";
    await Promise.resolve();
    // Past the shared throttle window, so a save the merge wrongly schedules
    // runs at once rather than hiding behind a trailing timer.
    await wait(THROTTLE_MS);

    const seen = onApplied();
    await sync._doApplyExternal(diskDoc('<p id="p">budget is approved</p><p id="q">q0</p>'), 1);
    seen.stop();
    await wait(50);

    expect(seen[0].report.conflicts.length).toBeGreaterThan(0);
    expect(seen[0].report.localDiverged).toBe(true);
    expect(save.getLastSavedContents()).not.toContain("approved");
    expect(save.getLastSavedContents()).not.toContain("q local");
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(closeWarns()).toBe(true);
    sync.stop();
  });

  test("this tab's own save is what resolves it: the list empties and the next clean frame clears the gate", async () => {
    window.clay = { testMode: true };
    await settle('<p data-id="a">budget is fine</p><p data-id="b">b0</p>');
    const sync = startSync();
    const first = sync.lastHtml.replace("budget is fine", "budget is approved");
    document.querySelector('[data-id="a"]').textContent = "budget is over";
    await Promise.resolve();
    await sync._doApplyUpdate(first, 1, null);
    expect(sync.unresolvedConflicts.length).toBeGreaterThan(0);

    expect((await save.savePageForce()).ok).toBe(true);
    expect(sync.unresolvedConflicts).toEqual([]);
    expect(gate.pageMaybeDirty()).toBe(false);

    await sync._doApplyUpdate(first.replace("b0", "b1"), 2, null);
    expect(gate.pageMaybeDirty()).toBe(false);
    expect(save.getLastSavedContents()).toContain("b1");
    sync.stop();
  });
});

// ---------------------------------------------------------------------------
// R2-5 an element paired by authored id adopts the sender's synthetic id
// ---------------------------------------------------------------------------

describe("R2-5 mixed versions: a 1.4.0 receiver keys on synthetic ids alone", () => {
  const board =
    '<div data-id="colA"><article data-id="c1"><h3>one</h3><p>first card</p></article>' +
    '<article data-id="c2"><h3>two</h3><p>alpha beta gamma delta</p></article></div>' +
    '<div data-id="colB"><article data-id="c3"><h3>three</h3><p>third card</p></article></div>';

  // Codex MIXED-CONTROL. The 1.4.0 tab relays its map; the sender applies that
  // frame, moves and rewrites a card, and relays. The 1.4.0 tab must see the
  // card it already holds, not a new element.
  test.each([
    ["new", false],
    ["new", true],
    ["old", false],
    ["old", true],
  ])("sender=%s receiverDirty=%s: the receiver keeps the card node and its listener", async (version, dirty) => {
    const sender = version === "new" ? makeSync() : new Legacy();
    sender.clientId = "sender";
    if (version === "new") sender.identity = HyperMorph.createIdentityStore("sender");
    sender.lane = "live";
    sender._requestFrame = () => null;
    const old = new Legacy();
    old.clientId = "receiver";
    old.lane = "live";
    old._requestFrame = () => null;

    await settle(board);
    const oldBody = document.body;
    const oldCard = document.querySelector('[data-id="c2"]');
    let listenerCalls = 0;
    oldCard.addEventListener("review-local", () => listenerCalls++);
    const initial = snapshot.captureSnapshot({ flushUndo: false });
    const oldMap = old._buildIdentityMap(document.documentElement, initial);
    const initialFrame = snapshot.serializeForSync(initial);
    old.lastHtml = initialFrame;
    old._lastIdentityMap = oldMap;

    // The sender's tab, on a copy of the same page.
    document.body = oldBody.cloneNode(true);
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    sender._resolveProfile = () => new Promise(() => {});
    sender.start("index.html");
    await sender._doApplyUpdate(initialFrame, 301, oldMap);
    const card = document.querySelector('[data-id="c2"]');
    document.querySelector('[data-id="colB"]').appendChild(card);
    card.querySelector("p").textContent = "completely rewritten by the other tab";
    const outgoing = snapshot.captureSnapshot({ flushUndo: false });
    const frame = snapshot.serializeForSync(outgoing);
    const map =
      version === "new"
        ? sender.identity.exportMap(outgoing, snapshot.originalSnapshotNode)
        : sender._buildIdentityMap(document.documentElement, outgoing);
    sender.stop();

    // Back in the 1.4.0 tab.
    document.body = oldBody;
    await Promise.resolve();
    await settleBaselines();
    if (dirty) {
      oldCard.querySelector("h3").textContent = "two (local)";
      await Promise.resolve();
    }
    await old._doApplyUpdate(frame, 302, map);
    const cards = [...document.querySelectorAll('[data-id="c2"]')];
    cards[0]?.dispatchEvent(new Event("review-local"));
    old.stop();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBe(oldCard);
    expect(cards[0].parentElement.dataset.id).toBe("colB");
    if (dirty) expect(cards[0].querySelector("h3").textContent).toBe("two (local)");
    expect(listenerCalls).toBe(1);
  });

  test("the receiving 1.5 tab adopts the synthetic id the sender's map gives an authored-id element", async () => {
    await settle('<article data-id="c1"><p>one</p></article>');
    const sync = startSync();
    const peer = HyperMorph.createIdentityStore("peer");
    const clone = snapshot.captureSnapshot({ flushUndo: false });
    const frame = snapshot.serializeForSync(clone).replace("one", "one edited");
    const map = peer.exportMap(clone, snapshot.originalSnapshotNode);
    const peerId = peer.idOf(document.querySelector("article"));
    expect(Object.values(map)).toContain(peerId);
    expect(sync.identity.idOf(document.querySelector("article"))).not.toBe(peerId);

    await sync._doApplyUpdate(frame, 5, map);

    expect(sync.identity.idOf(document.querySelector("article"))).toBe(peerId);
    sync.stop();
  });
});

// ---------------------------------------------------------------------------
// R2-6 a clean tab is its own base
// ---------------------------------------------------------------------------

describe("R2-6 a clean tab does not read non-round-tripping DOM as its own edit", () => {
  // Pressing Enter in a contenteditable <p> makes Chrome put a <div> inside the
  // <p>: a tree the HTML parser cannot produce, so it never survives a round trip.
  async function settleNested() {
    document.body.innerHTML = '<p data-id="n" contenteditable="true">line one</p><section data-id="b"><p>b0</p></section>';
    const div = document.createElement("div");
    div.textContent = "line two";
    document.querySelector('[data-id="n"]').appendChild(div);
    await settleBaselines();
  }

  test("Opus P6a: peer lane, autosave page: an unrelated peer edit is not diverged and saves nothing", async () => {
    window.clay = { testMode: true };
    autosaveState.setAutosaveActive(true);
    await settleNested();
    const sync = startSync();
    await wait(THROTTLE_MS);
    let saves = 0;
    const onSaved = () => saves++;
    document.addEventListener("clay:save-saved", onSaved);

    const seen = onApplied();
    await sync._doApplyUpdate(sync.lastHtml.replace("b0", "b-peer"), 80, null);
    seen.stop();
    await wait(50);
    document.removeEventListener("clay:save-saved", onSaved);

    expect(seen[0].report.localDiverged).toBe(false);
    expect(saves).toBe(0);
    expect(texts('[data-id="b"] p')).toEqual(["b-peer"]);
    expect(gate.pageMaybeDirty()).toBe(false);
    sync.stop();
  });

  test("Opus P6b: disk lane, manual-save page: an unrelated disk edit is not diverged and raises no close warning", async () => {
    await settleNested();
    const sync = startSync();

    const seen = onApplied();
    await sync._doApplyExternal(sync._diskBase.replace("b0", "b-disk"), 81);
    seen.stop();

    expect(seen[0].report.localDiverged).toBe(false);
    expect(texts('[data-id="b"] p')).toEqual(["b-disk"]);
    expect(closeWarns()).toBe(false);
    sync.stop();
  });

  test("Opus P2a: a page with a <noscript>: an unrelated disk edit is not diverged, the noscript keeps its text", async () => {
    // A scripting browser holds <noscript> markup as one text node; jsdom's
    // innerHTML does not, so that state is built by hand.
    document.body.innerHTML = '<noscript></noscript><section data-id="a"><p>a0</p></section>';
    document.querySelector("noscript").textContent = "<p class='n'>no js</p>";
    await settleBaselines();
    const sync = startSync();

    const seen = onApplied();
    await sync._doApplyExternal(sync._diskBase.replace("a0", "a-disk"), 5);
    seen.stop();

    expect(seen[0].report.localDiverged).toBe(false);
    expect(seen[0].report.decisions.filter((d) => d.source === "local")).toEqual([]);
    expect(texts('[data-id="a"] p')).toEqual(["a-disk"]);
    // jsdom parses the frame's <noscript> as markup (a scripting browser keeps
    // it as text), so only the words are compared.
    expect(document.querySelector("noscript").textContent).toContain("no js");
    expect(closeWarns()).toBe(false);
    sync.stop();
  });

  test("Opus P6c: a script-built table (tr straight under table): an unrelated peer edit is not diverged", async () => {
    document.body.innerHTML = '<table data-id="t"></table><section data-id="b"><p>b0</p></section>';
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>1</td>";
    document.querySelector("table").appendChild(tr);
    await settleBaselines();
    const sync = startSync();

    const seen = onApplied();
    await sync._doApplyUpdate(sync.lastHtml.replace("b0", "b-peer"), 85, null);
    seen.stop();

    expect(seen[0].report.localDiverged).toBe(false);
    expect(gate.pageMaybeDirty()).toBe(false);
    expect(texts('[data-id="b"] p')).toEqual(["b-peer"]);
    sync.stop();
  });

  test("a clean tab still merges [merge] JSON three-way: a key the peer deleted stays deleted", async () => {
    await settle('<script type="application/json" merge="data">{"a":1,"b":2}</script><p>x</p>');
    const sync = startSync();

    await sync._doApplyUpdate(sync.lastHtml.replace('{"a":1,"b":2}', '{"a":1}'), 180, null);

    expect(JSON.parse(document.querySelector("script[merge]").textContent)).toEqual({ a: 1 });
    sync.stop();
  });
});

// ---------------------------------------------------------------------------
// Astra R2-I, pinned: a stale peer frame does not undo a committed disk edit
// ---------------------------------------------------------------------------

test("Astra R2-I (pinned as is): a dirty disk merge, then a peer frame from before it; the disk edit stays", async () => {
  await settle('<p id="p">price is ten</p><p id="q">q0</p>');
  const sync = startSync();
  const peerBase = sync.lastHtml;
  document.querySelector("#q").textContent = "q local";
  await Promise.resolve();
  await sync._doApplyExternal(sync._diskBase.replace("ten", "twelve"), 1, "e1");
  expect(document.querySelector("#p").textContent).toBe("price is twelve");

  // The peer relayed from the pre-disk state: its frame still says "ten".
  // Three-way against lastHtml, the frame did not change p, so the committed
  // "twelve" stays. Astra expected "ten" here; see the handoff's open question.
  await sync._doApplyUpdate(peerBase.replace("</body>", '<p id="r">peer addition</p></body>'), 2, null, "e2");

  expect(texts("p")).toEqual(["price is twelve", "q local", "peer addition"]);
  sync.stop();
});

// ---------------------------------------------------------------------------
// F2 remote-wins regions on a dirty tab (hyper-morph; pinned as failing)
// ---------------------------------------------------------------------------

describe("F2 a no-watch region's children survive a frame that did not touch them", () => {
  const WIDGET =
    '<div no-watch id="widget"><span id="tick">tick 1</span><button id="btn">go</button></div>' +
    '<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>';

  async function frameOverWidget(lane, dirty) {
    await settle(WIDGET);
    const sync = startSync();
    const btn = document.querySelector("#btn");
    let clicks = 0;
    btn.addEventListener("click", () => clicks++);
    if (dirty) {
      document.querySelector('[data-id="b"] p').textContent = "b local";
      await Promise.resolve();
    }
    const seen = onApplied();
    if (lane === "peer") await sync._doApplyUpdate(sync.lastHtml.replace("a0", "a1"), 5, null);
    else await sync._doApplyExternal(sync._diskBase.replace("a0", "a1"), 5);
    seen.stop();
    document.querySelector("#btn").click();
    sync.stop();
    const underWidget = seen[0].report.applied.filter(
      (a) => a.node && a.node.nodeType === 1 && a.node.closest("#widget")
    );
    return { sameButton: document.querySelector("#btn") === btn, clicks, underWidget, a: texts('[data-id="a"] p')[0] };
  }

  test.each(["peer", "disk"])("%s lane, clean tab: the button is the same node and still listens", async (lane) => {
    const r = await frameOverWidget(lane, false);
    expect(r.a).toBe("a1");
    expect(r.sameButton).toBe(true);
    expect(r.clicks).toBe(1);
    expect(r.underWidget).toEqual([]);
  });

  // hyper-morph's `view()` hands provenance the BASE node for a remote-wins
  // region, so apply finds no live twin and re-creates the children. Flips to
  // passing once the vendor carries the fix described in the handoff.
  test.each(["peer", "disk"])("%s lane, dirty tab: the button is the same node and still listens", async (lane) => {
    const r = await frameOverWidget(lane, true);
    expect(r.a).toBe("a1");
    expect(r.sameButton).toBe(true);
    expect(r.clicks).toBe(1);
    expect(r.underWidget).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A13 typing during an awaited apply is scheduled for autosave
// ---------------------------------------------------------------------------
// autosave.js is imported inside the first test and stays registered for the
// rest of the file, so these run last.

describe("Astra 13 typing during an awaited apply reaches disk on an autosave page", () => {
  test("disk lane: contenteditable typing during the wait is saved once the apply resumes", async () => {
    window.clay = { testMode: true };
    autosaveState.setAutosaveActive(true);
    await settle('<p id="p" contenteditable="true">notes</p><p id="q">q0</p>');
    const sync = startSync();
    await wait(THROTTLE_MS);

    const inflight = sync._doApplyExternal(scriptFrame(sync._diskBase.replace("q0", "q1"), "/a13-disk.js"), 1);
    await wait(0);
    expect(sync.isPaused).toBe(true);
    const p = document.querySelector("#p");
    Object.defineProperty(p, "isContentEditable", { value: true, configurable: true });
    p.firstChild.data = "notes typed during wait";
    p.dispatchEvent(new Event("input", { bubbles: true }));
    releaseScript("/a13-disk.js");
    await inflight;
    await wait(50);

    expect(texts("p")).toEqual(["notes typed during wait", "q1"]);
    expect(save.getLastSavedBytes()).toContain("notes typed during wait");
    expect(save.getLastSavedBytes()).toContain("q1");
    expect(gate.pageMaybeDirty()).toBe(false);
    sync.stop();
  });

  test("Astra R2-J: peer lane, real autosave module, fake timers", async () => {
    await settle('<p id="p" contenteditable="true">notes</p><p id="q">q0</p>');
    const sync = makeSync();
    sync.lastHtml = captureFrame();
    sync._diskBase = captureDisk();
    document.documentElement.setAttribute("autosave", "");
    await Promise.resolve();
    window.clay = { testMode: true };
    jest.useFakeTimers();
    try {
      await import("../../src/core/autosave.js");
      await jest.advanceTimersByTimeAsync(1600);
      const control = document.querySelector("#p");
      Object.defineProperty(control, "isContentEditable", { value: true, configurable: true });
      control.firstChild.data = "notes before wait";
      control.dispatchEvent(new Event("input", { bubbles: true }));
      await jest.advanceTimersByTimeAsync(1600);
      expect(save.getLastSavedDirty()).toContain("notes before wait");
      const initial = snapshot.captureForComparisonAndDirty();
      save.setLastSavedBaselines(initial.forComparison, initial.forDirty);
      sync.lastHtml = captureFrame();
      sync._diskBase = captureDisk();
      gate.gateClearIfUnchanged(gate.gateCaptureToken());
      expect(autosaveState.autosaveActive()).toBe(true);
      expect(gate.pageMaybeDirty()).toBe(false);

      const inflight = sync._doApplyUpdate(scriptFrame(sync.lastHtml.replace("q0", "q1"), "/round2-typing.js"), 1, null);
      const p = document.querySelector("#p");
      Object.defineProperty(p, "isContentEditable", { value: true, configurable: true });
      p.firstChild.data = "notes typed during wait";
      p.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(gate.pageMaybeDirty()).toBe(true);
      releaseScript("/round2-typing.js");
      await jest.advanceTimersByTimeAsync(1);
      await inflight;
      await jest.advanceTimersByTimeAsync(11000);

      expect(save.getLastSavedDirty()).toContain("notes typed during wait");
    } finally {
      jest.useRealTimers();
      sync.stop();
    }
  });
});
