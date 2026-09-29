import { jest } from "@jest/globals";

/**
 * Revert to mine, text and attributes: the clashing range goes back as an ordinary
 * local edit through a DOM Range at the spot the engine reported, rebased across
 * whatever the page typed since; an attribute goes back by its namespace and name.
 * The command acknowledges exactly the ids it restored, then saves once through
 * savePage(). Every record here comes from a real merge through a real LiveSync
 * apply of the 07 fixture bodies; each test first asserts the loss it needs.
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

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };

let LiveSync;
let conflicts;
let beginApply;
let completeApply;
let failApply;
let snapshot;
let gate;
let save;
let etag;
let revert;

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let saveResponse = () => respond(200, { msg: "Saved" });

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  ({ beginApply, completeApply, failApply } = await import("../../src/sync/conflicts.js"));

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/admin-contenteditable.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  revert = await import("../../src/sync/conflict-revert.js");
  await etag.seedEtag();
});

beforeEach(async () => {
  saveResponse = () => respond(200, { msg: "Saved" });
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/save")) return saveResponse(options);
    if (method === "POST" && u.includes("/_/sync")) return respond(200, { success: true });
    return respond(404, "");
  });
  if (save.isSaveConflicted()) await save.savePageForce();
  document.documentElement.removeAttribute("autosave");
  document.documentElement.setAttribute("savestatus", "saved");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
});

afterEach(() => {
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

function startSync() {
  const sync = makeSync();
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  return sync;
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const saveCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes("/_/save"));
const saveBodies = () => saveCalls().map(([, options]) => String(options?.body || ""));
const body = () => document.body.innerHTML;

async function settle(html) {
  document.body.innerHTML = html;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

/**
 * The standard loss: the page was saved as `base`, this tab edited it to `local`,
 * and a peer frame built on `base` brought `remote`. Returns the new record ids.
 */
async function lose(sync, base, local, remote, seq = 5) {
  await settle(base);
  sync.lastHtml = captureFrame();
  document.body.innerHTML = local;
  await Promise.resolve();
  const frame = sync.lastHtml.replace(`<body>${base}</body>`, `<body>${remote}</body>`);
  expect(frame).not.toBe(sync.lastHtml);
  const before = new Set(conflicts.list().map((r) => r.id));
  await sync._doApplyUpdate(frame, seq, null);
  const ids = conflicts.list().map((r) => r.id).filter((id) => !before.has(id));
  expect(ids.length).toBeGreaterThan(0);
  expect(body()).toBe(remote);
  return ids;
}

const textOf = (id) => conflicts.get(id).recovery.text;

// ---------------------------------------------------------------------------
// the projection matches the engine
// ---------------------------------------------------------------------------

test("the current projection of every text fixture equals the engine's merged scope text", async () => {
  const sync = makeSync();
  const cases = [
    [`<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`],
    [`<p id="p">One <b>quick</b> fox</p>`, `<p id="p">One <b>slow</b> fox</p>`, `<p id="p">One <b>fast</b> fox</p>`],
    [`<p id="p">🦊 One <a href="/x">quick</a> fox and quick dog</p>`, `<p id="p">🦊 One <a href="/x">slow</a> fox and slow dog</p>`, `<p id="p">🦊 One <a href="/x">fast</a> fox and fast dog</p>`],
    [`<p id="p">one <img id="i" src="a"> quick <br> two</p>`, `<p id="p">one <img id="i" src="a"> slow <br> two</p>`, `<p id="p">one <img id="i" src="a"> fast <br> two</p>`],
    [`<textarea id="t">old</textarea>`, `<textarea id="t">mine</textarea>`, `<textarea id="t">theirs</textarea>`],
    [`<template id="t"><p id="p">One quick fox.</p></template>`, `<template id="t"><p id="p">One slow fox.</p></template>`, `<template id="t"><p id="p">One fast fox.</p></template>`],
  ];
  for (const [base, local, remote] of cases) {
    const ids = await lose(sync, base, local, remote);
    const plan = revert.prepareRevert(ids);
    expect(plan.blocked.size).toBe(0);
    for (const op of plan.ops) {
      expect(op.kind).toBe("text");
      expect(op.f.text).toBe(textOf(op.id).merged.text);
      expect(op.s).toBe(textOf(op.id).merged.start);
      expect(op.e).toBe(textOf(op.id).merged.end);
    }
    conflicts.acknowledge(ids, { reason: "accepted" });
  }
  sync.stop();
});

// ---------------------------------------------------------------------------
// R1: text, with later disjoint edits
// ---------------------------------------------------------------------------

test("R1 restores the word and keeps a prefix and suffix typed since", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const p = document.getElementById("p");
  p.firstChild.data = "Note: One fast fox sleeps. Awake.";
  await Promise.resolve();

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.blockedIds).toEqual([]);
  expect(result.saveResult.ok).toBe(true);
  expect(body()).toBe(`<p id="p">Note: One slow fox sleeps. Awake.</p>`);
  expect(document.getElementById("p")).toBe(p);
  expect(conflicts.size).toBe(0);
  expect(saveCalls()).toHaveLength(1);
  expect(saveBodies()[0]).toContain("Note: One slow fox sleeps. Awake.");
  sync.stop();
});

test("R1 a later edit inside the spot is replaced with it, an insertion at its end stays outside, an edit crossing its edge blocks the id", async () => {
  const sync = makeSync();
  const [inside] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  document.getElementById("p").firstChild.data = "One fst fox sleeps.";
  await Promise.resolve();
  expect((await revert.revertConflicts([inside])).revertedIds).toEqual([inside]);
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p>`);

  const [suffix] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`, 7);
  document.getElementById("p").firstChild.data = "One fastest fox sleeps.";
  await Promise.resolve();
  expect((await revert.revertConflicts([suffix])).revertedIds).toEqual([suffix]);
  expect(body()).toBe(`<p id="p">One slowest fox sleeps.</p>`);

  const [crossing] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`, 6);
  document.getElementById("p").firstChild.data = "OnXst fox sleeps.";
  await Promise.resolve();
  const saves = saveCalls().length;

  const result = await revert.revertConflicts([crossing]);

  expect(result.revertedIds).toEqual([]);
  expect(result.blockedIds).toEqual([crossing]);
  expect(result.saveResult).toBeNull();
  expect(body()).toBe(`<p id="p">OnXst fox sleeps.</p>`);
  expect(conflicts.get(crossing)).not.toBeNull();
  expect(saveCalls()).toHaveLength(saves);
  sync.stop();
});

test("R1 an id nothing can place any more is blocked with the row text, and nothing is acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  document.body.innerHTML = `<p id="q">Something else entirely.</p>`;
  await Promise.resolve();

  const plan = revert.prepareRevert([id]);
  expect(plan.ops).toEqual([]);
  expect(plan.blocked.get(id)).toBe(revert.BLOCKED);
  expect(revert.BLOCKED).toBe("This spot changed again. Review the latest edit or download your copy.");

  const result = await revert.revertConflicts([id, "not-a-record"]);
  expect(result).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(conflicts.size).toBe(1);
  sync.stop();
});

// ---------------------------------------------------------------------------
// R2: repeated words, inline markup, emoji
// ---------------------------------------------------------------------------

test("R2 a repeated word: only the clashing occurrence changes", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">quick fox and quick fox</p>`, `<p id="p">quick fox and slow fox</p>`, `<p id="p">quick fox and fast fox</p>`);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">quick fox and slow fox</p>`);
  sync.stop();
});

test("R2 inline markup: the local fragment's own mark is not nested inside the live one", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One <b>quick</b> fox</p>`, `<p id="p">One <b>slow</b> fox</p>`, `<p id="p">One <b>fast</b> fox</p>`);
  expect(textOf(id).local.fragment).toBe("<b>slow</b>");
  const b = document.querySelector("#p b");

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">One <b>slow</b> fox</p>`);
  expect(document.querySelector("#p b")).toBe(b);
  sync.stop();
});

test("R2 a mark this tab added comes back around the word; a mark the other side added cannot be proven and blocks", async () => {
  const sync = makeSync();
  const [mine] = await lose(sync, `<p id="p">One quick fox</p>`, `<p id="p">One <b>slow</b> fox</p>`, `<p id="p">One fast fox</p>`);
  expect((await revert.revertConflicts([mine])).revertedIds).toEqual([mine]);
  expect(body()).toBe(`<p id="p">One <b>slow</b> fox</p>`);

  const [theirs] = await lose(sync, `<p id="p">One quick fox</p>`, `<p id="p">One slow fox</p>`, `<p id="p">One <b>fast</b> fox</p>`, 6);
  expect(await revert.revertConflicts([theirs])).toEqual({ revertedIds: [], blockedIds: [theirs], saveResult: null });
  expect(body()).toBe(`<p id="p">One <b>fast</b> fox</p>`);
  expect(conflicts.get(theirs)).toBeDefined();
  sync.stop();
});

test("O4 a mark this tab removed from the whole clash blocks; the other side's added outer mark blocks; a wrapper this tab added around a live mark blocks", async () => {
  const sync = makeSync();
  const [removed] = await lose(sync, `<p id="p">One <b>quick</b> fox</p>`, `<p id="p">One slow fox</p>`, `<p id="p">One <b>fast</b> fox</p>`);
  expect(await revert.revertConflicts([removed])).toEqual({ revertedIds: [], blockedIds: [removed], saveResult: null });
  expect(body()).toBe(`<p id="p">One <b>fast</b> fox</p>`);

  const [outer] = await lose(sync, `<p id="p">One <i>quick</i> fox</p>`, `<p id="p">One <i>slow</i> fox</p>`, `<p id="p">One <b><i>fast</i></b> fox</p>`, 6);
  expect((await revert.revertConflicts([outer])).blockedIds).toEqual([outer]);
  expect(body()).toBe(`<p id="p">One <b><i>fast</i></b> fox</p>`);

  const [wrapped] = await lose(sync, `<p id="p">One <i>quick</i> fox</p>`, `<p id="p">One <b><i>slow</i></b> fox</p>`, `<p id="p">One <i>fast</i> fox</p>`, 7);
  expect(await revert.revertConflicts([wrapped])).toEqual({ revertedIds: [], blockedIds: [wrapped], saveResult: null });
  expect(body()).toBe(`<p id="p">One <i>fast</i> fox</p>`);
  sync.stop();
});

test("C8 a link the other side changed since: the stale wrapper never nests inside it; the id blocks", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One <a href="/old">quick</a> fox</p>`, `<p id="p">One <a href="/old">slow</a> fox</p>`, `<p id="p">One <a href="/old">fast</a> fox</p>`);
  await sync._doApplyUpdate(sync.lastHtml.replace('href="/old"', 'href="/new"'), 6, null);
  expect(body()).toBe(`<p id="p">One <a href="/new">fast</a> fox</p>`);

  expect(await revert.revertConflicts([id])).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<p id="p">One <a href="/new">fast</a> fox</p>`);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("C9 a collapsed restore at a mark's edge lands outside the mark the fragment does not carry", async () => {
  const sync = makeSync();
  const [end] = await lose(sync, `<p id="p">One <b>fast</b> dog</p>`, `<p id="p">One <b>fast</b> cat</p>`, `<p id="p">One <b>fast</b></p>`);
  expect(textOf(end).merged.start).toBe(textOf(end).merged.end);
  expect((await revert.revertConflicts([end])).revertedIds).toEqual([end]);
  expect(body()).toBe(`<p id="p">One <b>fast</b> cat</p>`);

  const [start] = await lose(sync, `<p id="p">dog <b>fast</b> one</p>`, `<p id="p">cat <b>fast</b> one</p>`, `<p id="p"><b>fast</b> one</p>`, 6);
  expect((await revert.revertConflicts([start])).revertedIds).toEqual([start]);
  expect(body()).toBe(`<p id="p">cat <b>fast</b> one</p>`);
  sync.stop();
});

test("C2 a prefix typed before a clash on the last word: the whole word goes back", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One fox sleeps</p>`, `<p id="p">One fox naps</p>`, `<p id="p">One fox rests</p>`);
  document.getElementById("p").firstChild.data = "Big One fox rests";
  await Promise.resolve();

  expect((await revert.revertConflicts([id])).revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">Big One fox naps</p>`);
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

test("C6 a newer loss covering only part of an older one restores itself and blocks the older", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<p id="p">aa bb cc dd</p>`, `<p id="p">aa mine one dd</p>`, `<p id="p">aa peer two dd</p>`);
  sync.lastHtml = captureFrame();
  document.getElementById("p").firstChild.data = "aa peer new dd";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("aa peer two dd", "aa peer six dd"), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  expect(B).toBeDefined();

  const result = await revert.revertConflicts([A, B]);
  expect(result.revertedIds).toEqual([B]);
  expect(result.blockedIds).toEqual([A]);
  expect(body()).toBe(`<p id="p">aa peer new dd</p>`);
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);
  sync.stop();
});

test("O7 a fragment carrying a script is blocked, and no fragment goes through createContextualFragment", async () => {
  const sync = makeSync();
  const spy = jest.spyOn(Range.prototype, "createContextualFragment");
  const [id] = await lose(sync, `<p id="p">One quick fox</p>`, `<p id="p">One slow<script>window.__m4ran = true</script> fox</p>`, `<p id="p">One fast fox</p>`);
  expect(await revert.revertConflicts([id])).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox</p>`);
  expect(window.__m4ran).toBeUndefined();

  const [plain] = await lose(sync, `<p id="p">One quick fox</p>`, `<p id="p">One <b>slow</b> fox</p>`, `<p id="p">One fast fox</p>`, 6);
  expect((await revert.revertConflicts([plain])).revertedIds).toEqual([plain]);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  sync.stop();
});

test("C7 a null-namespace attribute with a colon goes back through setAttribute, alongside a text loss", async () => {
  const sync = makeSync();
  const ids = await lose(sync, `<p id="p">One quick fox <a id="a" x-on:click="base()" href="/a">Go</a></p>`, `<p id="p">One slow fox <a id="a" x-on:click="mine()" href="/a">Go</a></p>`, `<p id="p">One fast fox <a id="a" x-on:click="theirs()" href="/a">Go</a></p>`);
  expect(ids).toHaveLength(2);
  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds.sort()).toEqual(ids.sort());
  expect(body()).toBe(`<p id="p">One slow fox <a id="a" x-on:click="mine()" href="/a">Go</a></p>`);
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

test("O3 a subject inside a template whose content was rebuilt resolves inside that template only, never to the twin outside it", async () => {
  const sync = makeSync();
  const [text] = await lose(sync, `<template id="t"><p id="p">One quick fox.</p></template><p id="p">One fast fox.</p>`, `<template id="t"><p id="p">One slow fox.</p></template><p id="p">One fast fox.</p>`, `<template id="t"><p id="p">One fast fox.</p></template><p id="p">One fast fox.</p>`);
  const t = document.getElementById("t");
  t.innerHTML = t.innerHTML;
  await Promise.resolve();
  expect((await revert.revertConflicts([text])).revertedIds).toEqual([text]);
  expect(body()).toBe(`<template id="t"><p id="p">One slow fox.</p></template><p id="p">One fast fox.</p>`);

  const [attr] = await lose(sync, `<template id="t"><a id="a" href="/a">Go</a></template><a id="a" href="/a">Go</a>`, `<template id="t"><a id="a" href="/mine">Go</a></template><a id="a" href="/a">Go</a>`, `<template id="t"><a id="a" href="/theirs">Go</a></template><a id="a" href="/a">Go</a>`, 6);
  const t2 = document.getElementById("t");
  t2.innerHTML = t2.innerHTML;
  await Promise.resolve();
  expect((await revert.revertConflicts([attr])).revertedIds).toEqual([attr]);
  expect(body()).toBe(`<template id="t"><a id="a" href="/mine">Go</a></template><a id="a" href="/a">Go</a>`);

  // With the template itself gone from the page, nothing outside it is a candidate.
  const [gone] = await lose(sync, `<template id="t"><p id="p">One quick fox.</p></template><p id="p">One fast fox.</p>`, `<template id="t"><p id="p">One slow fox.</p></template><p id="p">One fast fox.</p>`, `<template id="t"><p id="p">One fast fox.</p></template><p id="p">One fast fox.</p>`, 7);
  document.getElementById("t").remove();
  await Promise.resolve();
  expect(await revert.revertConflicts([gone])).toEqual({ revertedIds: [], blockedIds: [gone], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox.</p>`);
  sync.stop();
});

test("O6 a newer loss on the paragraph that cannot be planned still blocks an older selected one there", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  // The one synthetic record: the engine's missing-output shape, with no live data.
  const applyId = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  const [B] = completeApply(applyId, [{
    kind: "text", node: document.getElementById("p"), base: "fast", local: "slower", remote: "faster",
    recovery: {
      version: 1, key: "text:b:[1,0]:4:8:0", localLost: true, applied: false, unavailable: "missing-output",
      subject: { key: "b:[1,0]", nodeType: 1, base: [[1, 0]], local: [[1, 0]], remote: [[1, 0]], merged: [[1, 0]], live: [] },
      text: { encoding: "html", local: { text: "One slower fox sleeps.", start: 4, end: 10, fragment: "slower" }, merged: { text: "One fast fox sleeps.", start: 4, end: 8, fragment: "fast" }, liveSpan: null, liveScope: null },
    },
  }], { ticket: 99 });
  expect(B).toBeDefined();

  expect(await revert.revertConflicts([A])).toEqual({ revertedIds: [], blockedIds: [A], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox sleeps.</p>`);
  conflicts.acknowledge([B], { reason: "accepted" });
  sync.stop();
});

test("a write that silently does nothing fails its postcondition: nothing acknowledged, nothing saved, the page as it was", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const html = document.documentElement.outerHTML;
  const run = document.getElementById("p").firstChild;
  const spy = jest.spyOn(Range.prototype, "insertNode").mockImplementationOnce(() => {});
  const result = await revert.revertConflicts([id]);
  spy.mockRestore();
  expect(result).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(conflicts.get(id)).toBeDefined();
  expect(saveCalls()).toHaveLength(0);
  expect(document.documentElement.outerHTML).toBe(html);
  expect(document.getElementById("p").firstChild).toBe(run);
  sync.stop();
});

test("R2 emoji before a link and two clashes in one paragraph: both go back, one save", async () => {
  const sync = makeSync();
  const ids = await lose(
    sync,
    `<p id="p">🦊 One <a href="/x">quick</a> fox and quick dog</p>`,
    `<p id="p">🦊 One <a href="/x">slow</a> fox and slow dog</p>`,
    `<p id="p">🦊 One <a href="/x">fast</a> fox and fast dog</p>`
  );
  expect(ids).toHaveLength(2);
  const a = document.querySelector("#p a");

  const result = await revert.revertConflicts(ids);

  expect([...result.revertedIds].sort()).toEqual([...ids].sort());
  expect(body()).toBe(`<p id="p">🦊 One <a href="/x">slow</a> fox and slow dog</p>`);
  expect(document.querySelector("#p a")).toBe(a);
  expect(conflicts.size).toBe(0);
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

// ---------------------------------------------------------------------------
// R3: attributes
// ---------------------------------------------------------------------------

test("R3 href: exactly that attribute, the element and its children untouched", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<a id="a" href="/a" class="c">Go</a>`, `<a id="a" href="/mine" class="c">Go</a>`, `<a id="a" href="/theirs" class="c">Go</a>`);
  const a = document.getElementById("a");
  const text = a.firstChild;

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(a.getAttribute("href")).toBe("/mine");
  expect(a.getAttribute("class")).toBe("c");
  expect(a.firstChild).toBe(text);
  expect(document.getElementById("a")).toBe(a);
  sync.stop();
});

test("R3 an attribute this tab removed is removed again", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<a id="a" href="/a" title="t">Go</a>`, `<a id="a" href="/a">Go</a>`, `<a id="a" href="/a" title="theirs">Go</a>`);
  expect(conflicts.get(id).local).toBeNull();

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<a id="a" href="/a">Go</a>`);
  sync.stop();
});

test("R3 an SVG attribute goes back in its namespace", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<svg id="s"><a id="a" xlink:href="/a">Go</a></svg>`, `<svg id="s"><a id="a" xlink:href="/mine">Go</a></svg>`, `<svg id="s"><a id="a" xlink:href="/theirs">Go</a></svg>`);
  expect(conflicts.get(id).recovery.attribute).toEqual({ namespaceURI: "http://www.w3.org/1999/xlink", localName: "href", qualifiedName: "xlink:href" });

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  const a = document.getElementById("a");
  expect(a.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("/mine");
  expect(a.attributes).toHaveLength(2);
  sync.stop();
});

test("R3 style is whole-attribute scope: the local string comes back", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p" style="color:red">x</p>`, `<p id="p" style="color:blue">x</p>`, `<p id="p" style="color:green">x</p>`);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(document.getElementById("p").getAttribute("style")).toBe("color:blue");
  sync.stop();
});

// ---------------------------------------------------------------------------
// T3 to T5: whole values, comments, templates
// ---------------------------------------------------------------------------

test("T3 a textarea gets its text and its value back", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<textarea id="t">old</textarea>`, `<textarea id="t">mine</textarea>`, `<textarea id="t">theirs</textarea>`);
  expect(textOf(id).encoding).toBe("plain");

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  const t = document.getElementById("t");
  expect(t.textContent).toBe("mine");
  expect(t.value).toBe("mine");
  sync.stop();
});

test("T4 a comment's data goes back", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<div id="d"><!--old--></div>`, `<div id="d"><!--mine--></div>`, `<div id="d"><!--theirs--></div>`);
  const comment = document.getElementById("d").firstChild;
  expect(comment.nodeType).toBe(8);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<div id="d"><!--mine--></div>`);
  expect(document.getElementById("d").firstChild).toBe(comment);
  sync.stop();
});

test("T5 text inside a template's content goes back", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<template id="t"><p id="p">One quick fox.</p></template>`, `<template id="t"><p id="p">One slow fox.</p></template>`, `<template id="t"><p id="p">One fast fox.</p></template>`);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<template id="t"><p id="p">One slow fox.</p></template>`);
  sync.stop();
});

// ---------------------------------------------------------------------------
// empty sides (written to the E4b-fix contract: one collapsed point per empty span)
// ---------------------------------------------------------------------------

test("an empty local side deletes the range", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  expect(textOf(id).local.fragment).toBe("");

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">One fox sleeps.</p>`);
  sync.stop();
});

test("an empty merged side inserts at the gap", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One quick red fox sleeps.</p>`, `<p id="p">One fox sleeps.</p>`);
  expect(textOf(id).merged.start).toBe(textOf(id).merged.end);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">One quick red fox sleeps.</p>`);
  sync.stop();
});

// ---------------------------------------------------------------------------
// what the command never does
// ---------------------------------------------------------------------------

// The fixed E4b contract: an empty side is one collapsed point, never a span over
// the segment it sits in. Passing on the pre-fix vendor for these shapes; rerun
// them on the second vendor copy.
test("an empty merged side at the segment's edge is a collapsed point: the insertion goes back there", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">alpha beta</p>`, `<p id="p">X alpha beta</p>`, `<p id="p">beta</p>`);
  expect([textOf(id).merged.start, textOf(id).merged.end]).toEqual([0, 0]);
  expect(textOf(id).local.fragment).toBe("X alpha ");

  const result = await revert.revertConflicts([id]);
  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">X alpha beta</p>`);
  sync.stop();
});

test("an empty local side at the segment's edge is a collapsed point: the merged words there are removed", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">alpha beta</p>`, `<p id="p">beta</p>`, `<p id="p">Y alpha beta</p>`);
  expect([textOf(id).local.start, textOf(id).local.end]).toEqual([0, 0]);
  expect(textOf(id).merged.fragment).toBe("Y alpha ");

  const result = await revert.revertConflicts([id]);
  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">beta</p>`);
  sync.stop();
});

test("an emptied segment: the local side is a collapsed point and the merged text goes away again", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">alpha beta</p><p id="q">q</p>`, `<p id="p"></p><p id="q">q</p>`, `<p id="p">alpha gamma</p><p id="q">q</p>`);
  expect([textOf(id).local.start, textOf(id).local.end]).toEqual([0, 0]);
  expect(textOf(id).merged.fragment).toBe("alpha gamma");

  const result = await revert.revertConflicts([id]);
  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p"></p><p id="q">q</p>`);
  sync.stop();
});

test("a claimed id and an unfinished apply come back blocked, never acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const claim = conflicts.claim([id], { owner: "writer" });
  const failed = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  const [incomplete] = (await import("../../src/sync/conflicts.js")).failApply(failed, new Error("x"), { ticket: 9 });

  const result = await revert.revertConflicts([id, incomplete]);

  expect(result).toEqual({ revertedIds: [], blockedIds: [id, incomplete], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox sleeps.</p>`);
  expect(conflicts.size).toBe(2);
  claim.release();
  sync.stop();
});

// A record the engine could not map to the page (E4b-fix: `missing-output`, no live
// data) has nowhere to point at; the revert blocks it. No merge on this vendor
// produces one on demand, so this record is installed directly.
test("a missing-output record is blocked, never guessed", async () => {
  await settle(`<p id="p">One fast fox sleeps.</p>`);
  const applyId = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  const [id] = completeApply(applyId, [{
    kind: "text", node: document.getElementById("p"), base: "quick", local: "slow", remote: "fast",
    recovery: {
      version: 1, key: "text:b:[1,0]:4:9:0", localLost: true, applied: false, unavailable: "missing-output",
      subject: { key: "b:[1,0]", nodeType: 1, base: [[1, 0]], local: [[1, 0]], remote: [[1, 0]], merged: [[1, 0]], live: [] },
      text: { encoding: "html", local: { text: "One slow fox sleeps.", start: 4, end: 8, fragment: "slow" }, merged: { text: "One fast fox sleeps.", start: 4, end: 8, fragment: "fast" }, liveSpan: null, liveScope: null },
    },
  }], { ticket: 3 });
  expect(id).toBeDefined();

  const result = await revert.revertConflicts([id]);

  expect(result).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox sleeps.</p>`);
});

test("the gate is dirty when the save runs, and only the save advances the baseline", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  expect(gate.pageMaybeDirty()).toBe(false);
  const baseline = save.getLastSavedContents();
  expect(baseline).toContain("fast");
  let dirtyAtSend = null;
  let baselineAtSend = null;
  saveResponse = () => {
    dirtyAtSend = gate.pageMaybeDirty();
    baselineAtSend = save.getLastSavedContents();
    return respond(200, { msg: "Saved" });
  };

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(dirtyAtSend).toBe(true);
  expect(baselineAtSend).toBe(baseline);
  expect(save.getLastSavedContents()).toContain("One slow fox sleeps.");
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

test("a no-op revert lets the no-changes guard decide: no fetch, id acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  // The person types the word back and saves before pressing Revert.
  document.getElementById("p").firstChild.data = "One slow fox sleeps.";
  await Promise.resolve();
  expect((await save.savePage()).ok).toBe(true);
  const saves = saveCalls().length;

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(result.saveResult.msgType).toBe("skipped");
  expect(result.saveResult.msg).toBe("No changes to save");
  expect(saveCalls()).toHaveLength(saves);
  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p>`);
  expect(conflicts.size).toBe(0);
  sync.stop();
});

test("the command leaves the peer base and every ticket alone; the landed save moves the base", async () => {
  const sync = startSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const before = {
    lastHtml: sync.lastHtml,
    peer: sync._peerBaseTicket,
    accepted: sync._acceptedSaveTicket,
    morph: sync._morphTicket,
  };
  let release;
  saveResponse = () => new Promise((r) => { release = () => r(respond(200, { msg: "Saved" })); });

  const running = revert.revertConflicts([id]);
  await tick();

  expect(body()).toBe(`<p id="p">One slow fox sleeps.</p>`);
  expect(conflicts.size).toBe(0);
  expect(sync.lastHtml).toBe(before.lastHtml);
  expect(sync._peerBaseTicket).toBe(before.peer);
  expect(sync._acceptedSaveTicket).toBe(before.accepted);
  expect(sync._morphTicket).toBe(before.morph);

  release();
  const result = await running;
  await tick();

  expect(result.saveResult.ok).toBe(true);
  expect(sync.lastHtml).not.toBe(before.lastHtml);
  expect(sync.lastHtml).toContain("One slow fox sleeps.");
  expect(sync._acceptedSaveTicket).toBeGreaterThan(before.accepted);
  sync.stop();
});

// ---------------------------------------------------------------------------
// round 2: marks, block fragments, the recorded scope, footprints, the probe,
// and the invariants the transaction is undone on
// ---------------------------------------------------------------------------

test.each([
  ["both removed", "<b><i>quick</i></b>", "slow", "<b><i>fast</i></b>"],
  ["three removed", "<b><i><u>quick</u></i></b>", "slow", "<b><i><u>fast</u></i></b>"],
  ["the outer one removed", "<b><i>quick</i></b>", "<i>slow</i>", "<b><i>fast</i></b>"],
  ["the inner one removed", "<b><i>quick</i></b>", "<b>slow</b>", "<b><i>fast</i></b>"],
])("N2 N5 C6 nested marks this tab removed (%s): blocked, the page untouched", async (label, base, local, remote) => {
  const sync = makeSync();
  const ids = await lose(sync, `<p id="p">One ${base} fox</p>`, `<p id="p">One ${local} fox</p>`, `<p id="p">One ${remote} fox</p>`);
  const html = document.documentElement.outerHTML;
  expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
  expect(document.documentElement.outerHTML).toBe(html);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test.each([
  ["N1 the other side split the paragraph", `<p id="p">alpha quick beta gamma</p>`, `<p id="p">alpha slow beta gamma</p>`, `<p id="p">alpha fast beta</p><p>gamma</p>`],
  ["N1b the same between a heading and a paragraph", `<h2 id="h">Title</h2><p id="p">alpha quick beta gamma</p><p id="z">tail</p>`, `<h2 id="h">Title</h2><p id="p">alpha slow beta gamma</p><p id="z">tail</p>`, `<h2 id="h">Title</h2><p id="p">alpha fast beta</p><p>gamma</p><p id="z">tail</p>`],
  ["N2b the same after a paragraph that repeats the clash text", `<p id="h">alpha fast beta gamma</p><p id="p">alpha quick beta gamma</p>`, `<p id="h">alpha fast beta gamma</p><p id="p">alpha slow beta gamma</p>`, `<p id="h">alpha fast beta gamma</p><p id="p">alpha fast beta</p><p>gamma</p>`],
])("C3 a local fragment that carries a block (%s) is blocked: no paragraph inside a paragraph, one #p", async (label, base, local, remote) => {
  const sync = makeSync();
  const ids = await lose(sync, base, local, remote);
  expect(ids.map(textOf).some((t) => t && /<p/.test(t.local.fragment))).toBe(true);
  expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
  expect(body()).toBe(remote);
  expect(document.querySelector("p p")).toBeNull();
  expect(document.querySelectorAll("#p")).toHaveLength(1);
  sync.stop();
});

test.each([
  ["N3 a bare run after an identical run", `<div id="d">alpha fast<div>x</div>alpha quick</div>`, `<div id="d">alpha fast<div>x</div>alpha slow</div>`, `<div id="d">alpha fast<div>x</div>alpha fast</div>`],
  ["P3g runs either side of an hr", `<div id="d">Note: fast<hr>Note: quick</div>`, `<div id="d">Note: fast<hr>Note: slow</div>`, `<div id="d">Note: fast<hr>Note: fast</div>`],
  ["P3b a repeated word in a list item with a nested list", `<ul><li id="l">fast dog<ul><li>x</li></ul>quick dog</li></ul>`, `<ul><li id="l">fast dog<ul><li>x</li></ul>slow dog</li></ul>`, `<ul><li id="l">fast dog<ul><li>x</li></ul>fast dog</li></ul>`],
  ["P3f the same with a longer first run", `<ul><li id="l">fast dog walks<ul><li>x</li></ul>quick dog</li></ul>`, `<ul><li id="l">fast dog walks<ul><li>x</li></ul>slow dog</li></ul>`, `<ul><li id="l">fast dog walks<ul><li>x</li></ul>fast dog</li></ul>`],
])("C4 the recorded scope start picks the clashing run, not the first equal text (%s)", async (label, base, local, remote) => {
  const sync = makeSync();
  const ids = await lose(sync, base, local, remote);
  expect((await revert.revertConflicts(ids)).revertedIds).toEqual(ids);
  expect(body()).toBe(local);
  sync.stop();
});

test("C4 when the recorded start is gone and the scope text occurs twice, the id blocks", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<div id="d">alpha fast<div>x</div>alpha quick</div>`, `<div id="d">alpha fast<div>x</div>alpha slow</div>`, `<div id="d">alpha fast<div>x</div>alpha fast</div>`);
  const run = document.getElementById("d").lastChild;
  run.replaceWith(document.createTextNode(run.data));
  await Promise.resolve();
  expect(await revert.revertConflicts([id])).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<div id="d">alpha fast<div>x</div>alpha fast</div>`);
  sync.stop();
});

test.each([
  ["two paragraphs", `<p>One quick fox.</p><p>Two dogs.</p>`],
  ["a heading and a paragraph", `<h1>Title</h1><p>One quick fox.</p>`],
  ["prose, first paragraph", `<p>The quick fox runs home.</p><p>The dog sleeps in the sun.</p>`],
  ["prose, second paragraph", `<p>The dog sleeps in the sun.</p><p>The quick fox runs home.</p>`],
  ["notes", `<h2>Notes</h2><p>We met on Monday and agreed on the quick plan.</p><p>Next we meet on Friday.</p><p>Bring the notes.</p>`],
  ["a list", `<ul><li>buy quick milk</li><li>buy bread</li></ul>`],
  ["paragraphs in a div", `<div><p>First quick line.</p><p>Second line.</p></div>`],
])("N1c N1d an id-less page still restores a plain word clash (%s)", async (label, base) => {
  const sync = makeSync();
  const local = base.replace("quick", "slow");
  const ids = await lose(sync, base, local, base.replace("quick", "fast"));
  expect((await revert.revertConflicts(ids)).revertedIds).toEqual(ids);
  expect(body()).toBe(local);
  sync.stop();
});

test("N1c an id-less pair of paragraphs sharing the clash word: the record spans both, and it blocks rather than guess", async () => {
  const sync = makeSync();
  const ids = await lose(sync, `<p>One quick fox.</p><p>Two quick dogs.</p>`, `<p>One slow fox.</p><p>Two quick dogs.</p>`, `<p>One fast fox.</p><p>Two quick dogs.</p>`);
  expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
  expect(body()).toBe(`<p>One fast fox.</p><p>Two quick dogs.</p>`);
  sync.stop();
});

test("P4 a range crossing a link's edge blocks, and so does a clash inside a link whose href the other side changed", async () => {
  const sync = makeSync();
  const [crossing] = await lose(sync, `<p id="p">One <a href="/old">quick</a> fox sleeps</p>`, `<p id="p">One <a href="/old">slow</a>cat sleeps</p>`, `<p id="p">One <a href="/new">fast</a>dog sleeps</p>`);
  expect(await revert.revertConflicts([crossing])).toEqual({ revertedIds: [], blockedIds: [crossing], saveResult: null });
  expect(body()).toBe(`<p id="p">One <a href="/new">fast</a>dog sleeps</p>`);

  const [inside] = await lose(sync, `<p id="p">One <a href="/old">quick</a> fox</p>`, `<p id="p">One <a href="/old">slow</a> fox</p>`, `<p id="p">One <a href="/new">fast</a> fox</p>`, 6);
  expect(await revert.revertConflicts([inside])).toEqual({ revertedIds: [], blockedIds: [inside], saveResult: null });
  expect(body()).toBe(`<p id="p">One <a href="/new">fast</a> fox</p>`);
  sync.stop();
});

test("C7 a loss blocked by a partial overlap still constrains the older loss under it", async () => {
  const sync = makeSync();
  const [oldest] = await lose(sync, `<p id="p">aa bb cc dd ee</p>`, `<p id="p">aa L1 cc dd ee</p>`, `<p id="p">aa R1 cc dd ee</p>`);
  document.getElementById("p").firstChild.data = "aa L2 X2 dd ee";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("aa R1 cc dd ee", "aa R1 Y2 dd ee"), 6, null);
  const middle = conflicts.list().find((r) => r.id !== oldest).id;
  document.getElementById("p").firstChild.data = "aa R1 L3 Z3 ee";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("aa R1 Y2 dd ee", "aa R1 Y2 RR ee"), 7, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(3);
  const newest = ids.find((id) => id !== oldest && id !== middle);

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual([newest]);
  expect(result.blockedIds.sort()).toEqual([oldest, middle].sort());
  expect(body()).toBe(`<p id="p">aa R1 L3 Z3 ee</p>`);
  expect(conflicts.list().map((r) => r.id).sort()).toEqual([oldest, middle].sort());
  sync.stop();
});

test("C10 a newer loss that cannot be planned constrains its own paragraph only: an attribute on the sibling still goes back", async () => {
  const sync = makeSync();
  const [first] = await lose(sync, `<p id="p" title="base">One fast fox</p><p id="q">One quick cat</p>`, `<p id="p" title="mine">One fast fox</p><p id="q">One quick cat</p>`, `<p id="p" title="theirs">One fast fox</p><p id="q">One quick cat</p>`);
  expect(conflicts.get(first).kind).toBe("attr");
  document.getElementById("q").firstChild.data = "One slow cat";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("One quick cat", "One fast cat"), 6, null);
  const newer = conflicts.list().find((r) => r.id !== first).id;
  document.getElementById("q").firstChild.data = "OnXst cat";
  await Promise.resolve();
  expect(revert.prepareRevert([newer]).blocked.has(newer)).toBe(true);

  expect((await revert.revertConflicts([first])).revertedIds).toEqual([first]);
  expect(document.getElementById("p").title).toBe("mine");
  expect(document.getElementById("q").textContent).toBe("OnXst cat");
  expect(conflicts.list().map((r) => r.id)).toEqual([newer]);
  sync.stop();
});

test("C10 a newer loss that cannot be planned constrains its own paragraph only: an older loss in another paragraph still goes back", async () => {
  const sync = makeSync();
  const [first] = await lose(sync, `<p id="p">One quick fox</p><p id="q">Two brisk cats</p>`, `<p id="p">One slow fox</p><p id="q">Two brisk cats</p>`, `<p id="p">One fast fox</p><p id="q">Two brisk cats</p>`);
  document.getElementById("q").firstChild.data = "Two lazy cats";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("Two brisk cats", "Two wild cats"), 6, null);
  const newer = conflicts.list().find((r) => r.id !== first).id;
  document.getElementById("q").firstChild.data = "TwXzy cats";
  await Promise.resolve();
  expect(revert.prepareRevert([newer]).blocked.has(newer)).toBe(true);

  expect((await revert.revertConflicts([first])).revertedIds).toEqual([first]);
  expect(body()).toBe(`<p id="p">One slow fox</p><p id="q">TwXzy cats</p>`);
  expect(conflicts.list().map((r) => r.id)).toEqual([newer]);
  sync.stop();
});

test("N7b an id-less page: a newer loss whose paragraph a clean frame rebuilt as a heading protects that heading only; the older loss goes back, the newer blocks", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<p>One quick fox.</p><p>Two brisk dogs.</p>`, `<p>One slow fox.</p><p>Two brisk dogs.</p>`, `<p>One fast fox.</p><p>Two brisk dogs.</p>`);
  sync.lastHtml = captureFrame();
  document.body.lastChild.firstChild.data = "Two lazy dogs.";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("Two brisk dogs.", "Two wild dogs."), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  sync.lastHtml = captureFrame();
  await sync._doApplyUpdate(sync.lastHtml.replace("<p>Two wild dogs.</p>", "<h3>Two wild dogs.</h3>"), 7, null);
  expect(body()).toBe(`<p>One fast fox.</p><h3>Two wild dogs.</h3>`);

  expect((await revert.revertConflicts([A])).revertedIds).toEqual([A]);
  expect(body()).toBe(`<p>One slow fox.</p><h3>Two wild dogs.</h3>`);
  expect(await revert.revertConflicts([B])).toEqual({ revertedIds: [], blockedIds: [B], saveResult: null });
  expect(body()).toBe(`<p>One slow fox.</p><h3>Two wild dogs.</h3>`);
  sync.stop();
});

test("N8 a newer apply-incomplete record constrains every older selected loss", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const applyId = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  const [X] = failApply(applyId, new Error("resource wait failed"), { ticket: 999 });
  expect(conflicts.get(X).kind).toBe("apply-incomplete");

  expect(await revert.revertConflicts([A])).toEqual({ revertedIds: [], blockedIds: [A], saveResult: null });
  expect(body()).toBe(`<p id="p">One fast fox sleeps.</p>`);
  conflicts.acknowledge([X], { reason: "accepted" });
  sync.stop();
});

test("N9 the attribute probe never builds the live element: a custom element's constructor does not run", async () => {
  window.__m4ctor = 0;
  if (!customElements.get("x-card")) customElements.define("x-card", class extends HTMLElement { constructor() { super(); window.__m4ctor++; } });
  const sync = makeSync();
  const ids = await lose(sync, `<x-card id="c" data-v="old">hi</x-card>`, `<x-card id="c" data-v="mine">hi</x-card>`, `<x-card id="c" data-v="theirs">hi</x-card>`);
  const before = window.__m4ctor;
  expect((await revert.revertConflicts(ids)).revertedIds).toEqual(ids);
  expect(window.__m4ctor).toBe(before);
  expect(document.getElementById("c").getAttribute("data-v")).toBe("mine");
  sync.stop();
});

test("S2 a local edit the merge kept enters no ledger", async () => {
  const sync = makeSync();
  const base = `<section id="faq"><h3>FAQ</h3><p>Q1</p></section><p>tail</p>`;
  const local = `<section id="faq"><h3>FAQ</h3><p>Q1 edited here</p></section><p>tail</p>`;
  await settle(base);
  sync.lastHtml = captureFrame();
  document.body.innerHTML = local;
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(`<body>${base}</body>`, "<body><p>tail</p></body>"), 5, null);
  expect(body()).toBe(local);
  expect(conflicts.size).toBe(0);
  sync.stop();
});

test("S9 an emptied block-level unit: the empty side is one collapsed point, and exactly that side goes back", async () => {
  const sync = makeSync();
  const base = `<ul id="u"><li id="a">keep</li><li id="b">quick words</li></ul>`;
  const [emptied] = await lose(sync, base, `<ul id="u"><li id="a">keep</li><li id="b"></li></ul>`, `<ul id="u"><li id="a">keep</li><li id="b">fast words</li></ul>`);
  expect(textOf(emptied).local.start).toBe(textOf(emptied).local.end);
  expect(textOf(emptied).merged.text.slice(textOf(emptied).merged.start, textOf(emptied).merged.end)).toBe("fast words");
  expect((await revert.revertConflicts([emptied])).revertedIds).toEqual([emptied]);
  expect(body()).toBe(`<ul id="u"><li id="a">keep</li><li id="b"></li></ul>`);

  const [filled] = await lose(sync, base, `<ul id="u"><li id="a">keep</li><li id="b">slow words</li></ul>`, `<ul id="u"><li id="a">keep</li><li id="b"></li></ul>`, 6);
  expect(textOf(filled).merged.start).toBe(textOf(filled).merged.end);
  expect(textOf(filled).local.text.slice(textOf(filled).local.start, textOf(filled).local.end)).toBe("slow words");
  expect((await revert.revertConflicts([filled])).revertedIds).toEqual([filled]);
  expect(body()).toBe(`<ul id="u"><li id="a">keep</li><li id="b">slow words</li></ul>`);
  sync.stop();
});

test("B1 a fragment carrying an identity the page still holds elsewhere is undone: byte-identical page, same nodes, nothing acknowledged", async () => {
  const sync = makeSync();
  const ids = await lose(sync, `<p id="p">One quick fox</p><p id="q"><i id="x">x</i></p>`, `<p id="p">One <i id="x">slow</i> fox</p><p id="q"><i id="x">x</i></p>`, `<p id="p">One fast fox</p><p id="q"><i id="x">x</i></p>`);
  const html = document.documentElement.outerHTML;
  const x = document.getElementById("x");
  const run = document.getElementById("p").firstChild;
  expect(revert.prepareRevert(ids).blocked.size).toBe(0);

  expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
  expect(document.documentElement.outerHTML).toBe(html);
  expect(document.getElementById("x")).toBe(x);
  expect(document.getElementById("p").firstChild).toBe(run);
  expect(document.querySelectorAll("#x")).toHaveLength(1);
  expect(conflicts.size).toBe(ids.length);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("B3 a write that reaches outside its spot is undone: the scope must read as before with only the span replaced", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">One quick fox sleeps.</p>`, `<p id="p">One slow fox sleeps.</p>`, `<p id="p">One fast fox sleeps.</p>`);
  const html = document.documentElement.outerHTML;
  const original = Range.prototype.deleteContents;
  const spy = jest.spyOn(Range.prototype, "deleteContents").mockImplementationOnce(function () {
    this.setStart(this.startContainer, 0);
    return original.call(this);
  });
  const result = await revert.revertConflicts([id]);
  spy.mockRestore();
  expect(result).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(document.documentElement.outerHTML).toBe(html);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});
