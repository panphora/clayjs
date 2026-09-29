import { jest } from "@jest/globals";

/**
 * Revert to mine, structure: every structural loss goes back as one operation on
 * the live nodes the engine reported (remove, relocate, reorder, realize), planned
 * as one graph so a child another selected move keeps survives its parent's
 * deletion, and node identity, listeners and remote text inside a moved block
 * survive. Records come from real merges through a real LiveSync apply of the 07
 * structural fixtures; each test first asserts the loss it needs.
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

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  ({ beginApply, completeApply } = await import("../../src/sync/conflicts.js"));

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
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/save")) return respond(200, { msg: "Saved" });
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
const saveCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes("/_/save"));
const relayCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes("/_/sync"));
const body = () => document.body.innerHTML;
const diskDoc = (inner) => `<!DOCTYPE html><html><head></head><body>${inner}</body></html>`;

async function settle(html) {
  document.body.innerHTML = html;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

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

const detailOf = (id) => conflicts.get(id).detail;
const byId = (id) => document.getElementById(id);

// A listener is the one thing a copy of a node cannot carry.
function listen(el) {
  const seen = jest.fn();
  el.addEventListener("ping", seen);
  return () => {
    el.dispatchEvent(new Event("ping"));
    return seen.mock.calls.length;
  };
}

// ---------------------------------------------------------------------------
// R4 to R8: one operation each
// ---------------------------------------------------------------------------

test("R4 S1: the resurrected section is deleted again; the neighbour and its listener remain", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<section id="s"><h2>FAQ</h2><p>Old</p></section><p id="n">n</p>`, `<p id="n">n</p>`, `<section id="s"><h2>FAQ</h2><p>New</p></section><p id="n">n</p>`);
  expect(detailOf(id)).toBe("edit-beats-delete");
  const n = byId("n");
  const pings = listen(n);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="n">n</p>`);
  expect(byId("n")).toBe(n);
  expect(pings()).toBe(1);
  expect(conflicts.size).toBe(0);
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

test("R5 S3: the moved paragraph goes to the local parent as the same object, remote text inside it kept", async () => {
  const sync = makeSync();
  const [id] = await lose(
    sync,
    `<div id="a"><p id="p">P</p></div><div id="b"></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"><p id="p">P</p></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"></div><div id="c"><p id="p">P edited</p></div>`
  );
  expect(detailOf(id)).toBe("both-moved");
  const p = byId("p");
  const pings = listen(p);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<div id="a"></div><div id="b"><p id="p">P edited</p></div><div id="c"></div>`);
  expect(byId("p")).toBe(p);
  expect(pings()).toBe(1);
  sync.stop();
});

test("R6 S4 with remoteNew: participants take the local order in the slots they occupy; every object survives", async () => {
  const sync = makeSync();
  const [id] = await lose(
    sync,
    `<div id="s"><p id="a">A</p><p id="b">B</p><p id="c">C</p></div>`,
    `<div id="s"><p id="b">B</p><p id="a">A</p><p id="c">C</p></div>`,
    `<div id="s"><p id="a">A</p><p id="d">D</p><p id="c">C</p><p id="b">B</p></div>`
  );
  expect(detailOf(id)).toBe("both-reordered");
  const before = ["a", "d", "c", "b"].map(byId);

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<div id="s"><p id="b">B</p><p id="d">D</p><p id="a">A</p><p id="c">C</p></div>`);
  expect(["a", "d", "c", "b"].map(byId)).toEqual(before);
  sync.stop();
});

test("R7 S5: the paragraph the other side moved is removed again; a and b remain", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<div id="a"><p id="p">P</p></div><div id="b"></div>`, `<div id="a"></div><div id="b"></div>`, `<div id="a"></div><div id="b"><p id="p">P</p></div>`);
  expect(detailOf(id)).toBe("move-beats-delete");
  const [a, b] = [byId("a"), byId("b")];

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<div id="a"></div><div id="b"></div>`);
  expect([byId("a"), byId("b")]).toEqual([a, b]);
  sync.stop();
});

test("R8 S6: the local subtree comes back through the live root, and S7: the bare run at its gap", async () => {
  const sync = makeSync();
  const [element] = await lose(sync, `<div id="s"></div>`, `<div id="s"><p id="p">LOCAL <b>x</b></p></div>`, `<div id="s"><p id="p">REMOTE</p></div>`);
  expect(detailOf(element)).toBe("insert-collision");
  const p = byId("p");
  const pings = listen(p);

  expect((await revert.revertConflicts([element])).revertedIds).toEqual([element]);
  expect(body()).toBe(`<div id="s"><p id="p">LOCAL <b>x</b></p></div>`);
  expect(byId("p")).toBe(p);
  expect(pings()).toBe(1);

  const [run] = await lose(
    sync,
    `<div id="s"><section id="a"></section><section id="b"></section></div>`,
    `<div id="s"><section id="a"></section>A &amp; &lt;b&gt;<section id="b"></section></div>`,
    `<div id="s"><section id="a"></section>REMOTE<section id="b"></section></div>`,
    6
  );
  const [a, b] = [byId("a"), byId("b")];

  expect((await revert.revertConflicts([run])).revertedIds).toEqual([run]);
  expect(body()).toBe(`<div id="s"><section id="a"></section>A &amp; &lt;b&gt;<section id="b"></section></div>`);
  expect([byId("a"), byId("b")]).toEqual([a, b]);
  sync.stop();
});

test("R8 an insert collision whose live root is gone is realized at the local placement", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<div id="s"><i id="k">k</i></div>`, `<div id="s"><i id="k">k</i><p id="p">LOCAL</p></div>`, `<div id="s"><i id="k">k</i><p id="p">REMOTE</p></div>`);
  byId("p").remove();
  await Promise.resolve();

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<div id="s"><i id="k">k</i><p id="p">LOCAL</p></div>`);
  sync.stop();
});

// ---------------------------------------------------------------------------
// R9: cycles and inline atoms
// ---------------------------------------------------------------------------

test("R9 a competing-move cycle is blocked rather than moving an ancestor into itself", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<div id="a">A</div><div id="b">B</div>`, `<div id="b">B<div id="a">A</div></div>`, `<div id="a">A<div id="b">B</div></div>`);
  expect(detailOf(id)).toBe("both-moved");

  const result = await revert.revertConflicts([id]);

  expect(result).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<div id="a">A<div id="b">B</div></div>`);
  expect(conflicts.size).toBe(1);
  sync.stop();
});

test("R9 an inline atom this tab deleted is deleted again; the text around it is untouched", async () => {
  const sync = makeSync();
  const [id] = await lose(sync, `<p id="p">one <img id="i" src="a"> two three</p>`, `<p id="p">one two three</p>`, `<p id="p">one two <img id="i" src="a"> three</p>`);
  expect(detailOf(id)).toBe("move-beats-delete");
  const p = byId("p");

  const result = await revert.revertConflicts([id]);

  expect(result.revertedIds).toEqual([id]);
  expect(body()).toBe(`<p id="p">one two  three</p>`);
  expect(byId("p")).toBe(p);
  sync.stop();
});

test("a child one loss moves out of a section another loss of the same merge deletes: neither is ordered, both block, the page untouched", async () => {
  const sync = makeSync();
  const ids = await lose(
    sync,
    `<section id="s"><h2>FAQ</h2><p id="k">keep</p></section><div id="d"></div>`,
    `<div id="d"><p id="k">keep</p></div>`,
    `<section id="s"><h2>FAQ edited</h2><p id="k">keep</p></section><div id="d"></div>`
  );
  expect(ids.map(detailOf).sort()).toEqual(["both-moved", "edit-beats-delete"]);
  const k = byId("k");

  const result = await revert.revertConflicts(ids);

  expect(result.revertedIds).toEqual([]);
  expect([...result.blockedIds].sort()).toEqual([...ids].sort());
  expect(body()).toBe(`<section id="s"><h2>FAQ edited</h2><p id="k">keep</p></section><div id="d"></div>`);
  expect(byId("k")).toBe(k);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

// ---------------------------------------------------------------------------
// R10: every operation at once
// ---------------------------------------------------------------------------

test("R10 nine operations mixed: each restored id acknowledged once, one save, no direct relay", async () => {
  const sync = makeSync();
  const base =
    `<p id="t1">One quick fox sleeps.</p>` +
    `<p id="t2">One <b>quick</b> fox</p>` +
    `<a id="a1" href="/a">Go</a>` +
    `<section id="s1"><h2>FAQ</h2><p>Old</p></section><p id="n">n</p>` +
    `<div id="m1"><p id="mp">P</p></div><div id="m2"></div><div id="m3"></div>` +
    `<div id="o"><p id="oa">A</p><p id="ob">B</p><p id="oc">C</p></div>` +
    `<div id="d1"><p id="dp">P</p></div><div id="d2"></div>` +
    `<div id="i1"></div>` +
    `<div id="i2"><section id="x"></section><section id="y"></section></div>`;
  const local =
    `<p id="t1">One slow fox sleeps.</p>` +
    `<p id="t2">One <b>slow</b> fox</p>` +
    `<a id="a1" href="/mine">Go</a>` +
    `<p id="n">n</p>` +
    `<div id="m1"></div><div id="m2"><p id="mp">P</p></div><div id="m3"></div>` +
    `<div id="o"><p id="ob">B</p><p id="oa">A</p><p id="oc">C</p></div>` +
    `<div id="d1"></div><div id="d2"></div>` +
    `<div id="i1"><p id="ip">LOCAL</p></div>` +
    `<div id="i2"><section id="x"></section>LOCAL<section id="y"></section></div>`;
  const remote =
    `<p id="t1">One fast fox sleeps.</p>` +
    `<p id="t2">One <b>fast</b> fox</p>` +
    `<a id="a1" href="/theirs">Go</a>` +
    `<section id="s1"><h2>FAQ</h2><p>New</p></section><p id="n">n</p>` +
    `<div id="m1"></div><div id="m2"></div><div id="m3"><p id="mp">P edited</p></div>` +
    `<div id="o"><p id="oa">A</p><p id="od">D</p><p id="oc">C</p><p id="ob">B</p></div>` +
    `<div id="d1"></div><div id="d2"><p id="dp">P</p></div>` +
    `<div id="i1"><p id="ip">REMOTE</p></div>` +
    `<div id="i2"><section id="x"></section>REMOTE<section id="y"></section></div>`;
  const ids = await lose(sync, base, local, remote);
  expect(ids).toHaveLength(9);
  const kept = ["t1", "t2", "a1", "n", "mp", "oa", "ob", "oc", "od", "ip", "x", "y"].map(byId);
  const acknowledged = [];
  const onChange = (e) => { if (e.detail.reason === "reverted") acknowledged.push(...e.detail.removedIds); };
  document.addEventListener("clay:sync-conflicts-changed", onChange);

  const result = await revert.revertConflicts(ids);
  document.removeEventListener("clay:sync-conflicts-changed", onChange);

  expect([...result.revertedIds].sort()).toEqual([...ids].sort());
  expect(result.blockedIds).toEqual([]);
  expect([...acknowledged].sort()).toEqual([...ids].sort());
  expect(body()).toBe(
    `<p id="t1">One slow fox sleeps.</p>` +
    `<p id="t2">One <b>slow</b> fox</p>` +
    `<a id="a1" href="/mine">Go</a>` +
    `<p id="n">n</p>` +
    `<div id="m1"></div><div id="m2"><p id="mp">P edited</p></div><div id="m3"></div>` +
    `<div id="o"><p id="ob">B</p><p id="od">D</p><p id="oa">A</p><p id="oc">C</p></div>` +
    `<div id="d1"></div><div id="d2"></div>` +
    `<div id="i1"><p id="ip">LOCAL</p></div>` +
    `<div id="i2"><section id="x"></section>LOCAL<section id="y"></section></div>`
  );
  expect(["t1", "t2", "a1", "n", "mp", "oa", "ob", "oc", "od", "ip", "x", "y"].map(byId)).toEqual(kept);
  expect(conflicts.size).toBe(0);
  expect(saveCalls()).toHaveLength(1);
  expect(relayCalls().length).toBeLessThanOrEqual(1);
  sync.stop();
});

// ---------------------------------------------------------------------------
// the disk lane: a save-domain clone wakes up before it reaches the page
// ---------------------------------------------------------------------------

test("disk-lane activation: an element restored from a save-domain clone ends with the live contenteditable", async () => {
  await settle(`<div id="s"></div>`);
  const sync = startSync();
  document.body.innerHTML = `<div id="s"><p id="p" editmode:contenteditable contenteditable="true">LOCAL</p></div>`;
  await Promise.resolve();

  await sync._doApplyExternal(diskDoc(`<div id="s"><p id="p">REMOTE</p></div>`), 1, "E1");
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(1);
  expect(conflicts.recoveryOf(ids[0]).domain).toBe("save");
  expect(conflicts.get(ids[0]).recovery.structure.localFragment).toContain("inert-contenteditable");
  expect(body()).toBe(`<div id="s"><p id="p">REMOTE</p></div>`);

  const result = await revert.revertConflicts(ids);

  expect(result.revertedIds).toEqual(ids);
  const p = byId("p");
  expect(p.textContent).toBe("LOCAL");
  expect(p.getAttribute("contenteditable")).toBe("true");
  expect(p.hasAttribute("inert-contenteditable")).toBe(false);
  expect(p.hasAttribute("editmode:contenteditable")).toBe(true);
  sync.stop();
});

test("O1 an insert collision inside a block both sides moved, from one merge: the two touch, neither is ordered, both block", async () => {
  const sync = makeSync();
  const ids = await lose(sync,
    `<div id="a"><div id="s"><i id="k">k</i></div></div><div id="b"></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"><div id="s"><i id="k">k</i><p id="p">LOCAL</p></div></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"></div><div id="c"><div id="s"><i id="k">k</i><p id="p">REMOTE</p></div></div>`);
  expect(ids).toHaveLength(2);
  const p = byId("p");
  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual([]);
  expect(result.blockedIds.sort()).toEqual(ids.sort());
  expect(document.querySelectorAll("#p")).toHaveLength(1);
  expect(byId("p")).toBe(p);
  expect(body()).toBe(`<div id="a"></div><div id="b"></div><div id="c"><div id="s"><i id="k">k</i><p id="p">REMOTE</p></div></div>`);
  expect(saveCalls()).toHaveLength(0);

  // The run between the two marks is recorded as a text loss whose range starts
  // inside one mark and ends inside the other: it blocks on its own, and a record of
  // the same merge that writes nothing does not hold the move back.
  const runs = await lose(sync,
    `<div id="a"><div id="s"><i id="k">k</i><i id="m">m</i></div></div><div id="b"></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"><div id="s"><i id="k">k</i>LOCAL<i id="m">m</i></div></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"></div><div id="c"><div id="s"><i id="k">k</i>REMOTE<i id="m">m</i></div></div>`, 6);
  const move = runs.find((id) => conflicts.get(id).kind === "structure");
  const text = runs.find((id) => conflicts.get(id).kind === "text");
  expect(await revert.revertConflicts(runs)).toMatchObject({ revertedIds: [move], blockedIds: [text] });
  expect(body()).toBe(`<div id="a"></div><div id="b"><div id="s"><i id="k">k</i>REMOTE<i id="m">m</i></div></div><div id="c"></div>`);
  sync.stop();
});

test("O2 an older selected move into a section a newer selected loss deletes is blocked; the deletion happens", async () => {
  const sync = makeSync();
  const [A] = await lose(sync,
    `<section id="s"><h2>S</h2></section><div id="a"><p id="p">P</p></div><div id="c"></div>`,
    `<section id="s"><h2>S</h2><p id="p">P</p></section><div id="a"></div><div id="c"></div>`,
    `<section id="s"><h2>S</h2></section><div id="a"></div><div id="c"><p id="p">P edited</p></div>`);
  sync.lastHtml = captureFrame();
  byId("s").remove();
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("<h2>S</h2>", "<h2>S!</h2>"), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  expect(B).toBeDefined();
  const p = byId("p");

  const result = await revert.revertConflicts([A, B]);
  expect(result.revertedIds).toEqual([B]);
  expect(result.blockedIds).toEqual([A]);
  expect(byId("s")).toBeNull();
  expect(byId("p")).toBe(p);
  expect(p.parentNode.id).toBe("c");
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

test("C3 a newer selected move into a section an older selected loss deletes survives; the older deletion is blocked", async () => {
  const sync = makeSync();
  const [A] = await lose(sync,
    `<section id="s"><h2>Old</h2></section><div id="a"><p id="p">P</p></div><div id="b"></div>`,
    `<div id="a"><p id="p">P</p></div><div id="b"></div>`,
    `<section id="s"><h2>New</h2></section><div id="a"><p id="p">P</p></div><div id="b"></div>`);
  sync.lastHtml = captureFrame();
  byId("s").append(byId("p"));
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><section id="s"><h2>New</h2></section><div id="a"></div><div id="b"><p id="p">P</p></div></body>`), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  expect(B).toBeDefined();

  const result = await revert.revertConflicts([A, B]);
  expect(result.revertedIds).toEqual([B]);
  expect(result.blockedIds).toEqual([A]);
  expect(body()).toBe(`<section id="s"><h2>New</h2><p id="p">P</p></section><div id="a"></div><div id="b"></div>`);
  sync.stop();
});

test("C1 selected moves that form a cycle across applies: the newest lands, the older is blocked", async () => {
  const sync = makeSync();
  const first = await lose(sync,
    `<section id="a">A</section><section id="b">B</section><div id="c"></div><div id="d"></div>`,
    `<section id="b">B<section id="a">A</section></section><div id="c"></div><div id="d"></div>`,
    `<section id="b">B</section><div id="c"><section id="a">A</section></div><div id="d"></div>`);
  document.body.innerHTML = `<div id="c"><section id="a">A<section id="b">B</section></section></div><div id="d"></div>`;
  await Promise.resolve();
  const newest = `<div id="c"><section id="a">A</section></div><div id="d"><section id="b">B</section></div>`;
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body>${newest}</body>`), 6, null);
  expect(body()).toBe(newest);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids.length).toBeGreaterThan(first.length);
  const later = ids.filter((id) => !first.includes(id));

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual(later);
  expect(result.blockedIds).toEqual(first);
  expect(body()).toBe(`<div id="c"><section id="a">A<section id="b">B</section></section></div><div id="d"></div>`);
  expect(saveCalls()).toHaveLength(1);
  sync.stop();
});

test("C4 two independent insert collisions whose live roots are gone are both realized", async () => {
  const sync = makeSync();
  const ids = await lose(sync,
    `<div id="a"></div><div id="b"></div>`,
    `<div id="a"><p id="p">LOCAL P</p></div><div id="b"><p id="q">LOCAL Q</p></div>`,
    `<div id="a"><p id="p">REMOTE P</p></div><div id="b"><p id="q">REMOTE Q</p></div>`);
  expect(ids).toHaveLength(2);
  byId("p").remove();
  byId("q").remove();
  await Promise.resolve();

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds.sort()).toEqual(ids.sort());
  expect(body()).toBe(`<div id="a"><p id="p">LOCAL P</p></div><div id="b"><p id="q">LOCAL Q</p></div>`);
  sync.stop();
});

test("C10 an insert collision whose live node moved elsewhere since is blocked before any write", async () => {
  const sync = makeSync();
  const [id] = await lose(sync,
    `<div id="s"></div><div id="t"></div>`,
    `<div id="s"><p id="p">LOCAL</p></div><div id="t"></div>`,
    `<div id="s"><p id="p">REMOTE</p></div><div id="t"></div>`);
  await sync._doApplyUpdate(sync.lastHtml.replace(`<div id="s"><p id="p">REMOTE</p></div><div id="t"></div>`, `<div id="s"></div><div id="t"><p id="p">REMOTE moved</p></div>`), 6, null);
  expect(body()).toBe(`<div id="s"></div><div id="t"><p id="p">REMOTE moved</p></div>`);

  expect(await revert.revertConflicts([id])).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(body()).toBe(`<div id="s"></div><div id="t"><p id="p">REMOTE moved</p></div>`);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("O8 a reorder with fewer than two participants left is blocked, not acknowledged", async () => {
  const sync = makeSync();
  const [id] = await lose(sync,
    `<div id="s"><p id="a">A</p><p id="b">B</p><p id="c">C</p></div>`,
    `<div id="s"><p id="b">B</p><p id="a">A</p><p id="c">C</p></div>`,
    `<div id="s"><p id="a">A</p><p id="c">C</p><p id="b">B</p></div>`);
  byId("a").remove();
  byId("b").remove();
  await Promise.resolve();
  expect(await revert.revertConflicts([id])).toEqual({ revertedIds: [], blockedIds: [id], saveResult: null });
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("C5 a newer text loss inside an inserted paragraph that cannot be planned blocks the older insertion, selected or not", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<div id="s"></div>`, `<div id="s"><p id="p">One slow fox sleeps.</p></div>`, `<div id="s"><p id="p">One quick fox sleeps.</p></div>`);
  sync.lastHtml = captureFrame();
  byId("p").firstChild.data = "One slower fox sleeps.";
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace("One quick fox sleeps.", "One fast fox sleeps."), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  expect(B).toBeDefined();
  byId("p").firstChild.data = "OnXst fox sleeps.";
  await Promise.resolve();

  expect(revert.prepareRevert([B]).blocked.has(B)).toBe(true);
  expect(await revert.revertConflicts([A])).toEqual({ revertedIds: [], blockedIds: [A], saveResult: null });
  const both = await revert.revertConflicts([A, B]);
  expect(both.revertedIds).toEqual([]);
  expect(both.blockedIds.sort()).toEqual([A, B].sort());
  expect(body()).toBe(`<div id="s"><p id="p">OnXst fox sleeps.</p></div>`);
  sync.stop();
});

// ---------------------------------------------------------------------------
// round 2: combinations, footprints, achieved deletions, the invariants
// ---------------------------------------------------------------------------

test("N4 C2 an older restored subtree carrying a paragraph a newer loss moves: the move lands, the older is blocked, one #n", async () => {
  const sync = makeSync();
  const [older] = await lose(sync,
    `<div id="host"></div><div id="b"></div><div id="c"></div>`,
    `<div id="host"><section id="s"><p id="n">LOCAL</p></section></div><div id="b"></div><div id="c"></div>`,
    `<div id="host"><section id="s"><p id="n">REMOTE</p></section></div><div id="b"></div><div id="c"></div>`);
  byId("b").append(byId("n"));
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><div id="host"><section id="s"></section></div><div id="b"></div><div id="c"><p id="n">REMOTE</p></div></body>`), 6, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(2);
  const newer = ids.find((id) => id !== older);
  const n = byId("n");

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual([newer]);
  expect(result.blockedIds).toEqual([older]);
  expect(document.querySelectorAll("#n")).toHaveLength(1);
  expect(byId("n")).toBe(n);
  expect(body()).toBe(`<div id="host"><section id="s"></section></div><div id="b"><p id="n">REMOTE</p></div><div id="c"></div>`);
  sync.stop();
});

test("C5 NEW1 three moves over the same sections across three merges: the newest lands, the older two stay open", async () => {
  const sync = makeSync();
  const [first] = await lose(sync,
    `<section id="a">A</section><section id="b">B</section><div id="c"></div><div id="d"></div><div id="e"></div>`,
    `<section id="b">B<section id="a">A</section></section><div id="c"></div><div id="d"></div><div id="e"></div>`,
    `<section id="b">B</section><div id="c"><section id="a">A</section></div><div id="d"></div><div id="e"></div>`);
  byId("b").append(byId("a"));
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><section id="b">B</section><div id="c"></div><div id="d"><section id="a">A</section></div><div id="e"></div></body>`), 6, null);
  expect(conflicts.size).toBe(2);
  byId("a").append(byId("b"));
  await Promise.resolve();
  const earlier = conflicts.list().map((r) => r.id);
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><div id="c"></div><div id="d"><section id="a">A</section></div><div id="e"><section id="b">B</section></div></body>`), 7, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(3);
  const newest = ids.find((id) => !earlier.includes(id));

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual([newest]);
  expect(result.blockedIds.sort()).toEqual(ids.filter((id) => id !== newest).sort());
  expect(body()).toBe(`<div id="c"></div><div id="d"><section id="a">A<section id="b">B</section></section></div><div id="e"></div>`);
  expect(conflicts.size).toBe(2);
  expect(first).not.toBe(newest);
  sync.stop();
});

test("N5 a reorder and a newer move of one participant out of it: the reorder keeps the rest in order, the move lands", async () => {
  const sync = makeSync();
  const [reorder] = await lose(sync,
    `<div id="s"><p id="a">A</p><p id="b">B</p><p id="c">C</p></div><div id="t"></div><div id="u"></div>`,
    `<div id="s"><p id="b">B</p><p id="a">A</p><p id="c">C</p></div><div id="t"></div><div id="u"></div>`,
    `<div id="s"><p id="a">A</p><p id="c">C</p><p id="b">B</p></div><div id="t"></div><div id="u"></div>`);
  sync.lastHtml = captureFrame();
  byId("t").append(byId("b"));
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><div id="s"><p id="a">A</p><p id="c">C</p></div><div id="t"></div><div id="u"><p id="b">B</p></div></body>`), 6, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(2);

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds.sort()).toEqual(ids.sort());
  expect(body()).toBe(`<div id="s"><p id="a">A</p><p id="c">C</p></div><div id="t"><p id="b">B</p></div><div id="u"></div>`);
  expect(reorder).toBeDefined();
  sync.stop();
});

test("N6 a local deletion whose subject a clean frame removed since is achieved: it constrains nothing and is acknowledged when selected", async () => {
  const sync = makeSync();
  const [A] = await lose(sync, `<p id="q">One quick fox.</p><section id="s"><h2>Old</h2></section>`, `<p id="q">One slow fox.</p><section id="s"><h2>Old</h2></section>`, `<p id="q">One fast fox.</p><section id="s"><h2>Old</h2></section>`);
  sync.lastHtml = captureFrame();
  byId("s").remove();
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><p id="q">One fast fox.</p><section id="s"><h2>New</h2></section></body>`), 6, null);
  const B = conflicts.list().map((r) => r.id).find((id) => id !== A);
  expect(conflicts.get(B).recovery.structure.localAction).toBe("deleted");
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><p id="q">One fast fox.</p></body>`), 7, null);
  expect(byId("s")).toBeNull();

  expect(revert.prepareRevert([A]).blocked.size).toBe(0);
  expect((await revert.revertConflicts([A])).revertedIds).toEqual([A]);
  expect(body()).toBe(`<p id="q">One slow fox.</p>`);

  const done = await revert.revertConflicts([B]);
  expect(done.revertedIds).toEqual([B]);
  expect(done.saveResult.msgType).toBe("skipped");
  expect(body()).toBe(`<p id="q">One slow fox.</p>`);
  expect(conflicts.size).toBe(0);
  sync.stop();
});

test("C4 NEW6 two absent insertions with different identities at the same clone path stay apart: both are realized", async () => {
  const sync = makeSync();
  await lose(sync, `<div id="s"></div>`, `<div id="s"><p id="p">LOCAL P</p></div>`, `<div id="s"><p id="p">REMOTE P</p></div>`);
  await sync._doApplyUpdate(sync.lastHtml.replace(`<p id="p">REMOTE P</p>`, ""), 6, null);
  expect(byId("p")).toBeNull();
  byId("s").innerHTML = `<p id="q">LOCAL Q</p>`;
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace(`<div id="s"></div>`, `<div id="s"><p id="q">REMOTE Q</p></div>`), 7, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(2);
  byId("q").remove();
  await Promise.resolve();

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds.sort()).toEqual(ids.sort());
  expect(byId("p").textContent).toBe("LOCAL P");
  expect(byId("q").textContent).toBe("LOCAL Q");
  expect(byId("p").parentNode).toBe(byId("s"));
  expect(byId("q").parentNode).toBe(byId("s"));
  sync.stop();
});

test.each([
  ["S4 a keyless reorder", `<ul id="u"><li>A</li><li>B</li><li>C</li></ul>`, `<ul id="u"><li>C</li><li>A</li><li>B</li></ul>`, `<ul id="u"><li>B</li><li>C</li><li>A</li></ul>`],
  ["S6 a keyless insertion", `<ul id="u"><li>A</li></ul>`, `<ul id="u"><li>A</li><li>Local new</li></ul>`, `<ul id="u"><li>A</li><li>Remote new</li></ul>`],
])("%s still goes back", async (label, base, local, remote) => {
  const sync = makeSync();
  const ids = await lose(sync, base, local, remote);
  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds.sort()).toEqual(ids.sort());
  expect(result.blockedIds).toEqual([]);
  expect(body()).toBe(local);
  sync.stop();
});

// The one synthetic record here: this vendor records no loss for an inserted
// comment (three probes, zero records), so the comment shape is installed by hand.
test("O9 an absent comment insertion is realized as a comment", async () => {
  await settle(`<div id="s"><i id="a"></i><i id="b"></i></div>`);
  const root = document.documentElement.cloneNode(true);
  const s = byId("s");
  root.querySelector("#s").insertBefore(document.createComment("mine"), root.querySelector("#b"));
  const ref = (node, path) => ({ key: node.id, nodeType: 1, live: [node], base: [path], local: [path], remote: [path], merged: [path] });
  const applyId = beginApply({ source: "peer", domain: "sync", root });
  const [id] = completeApply(applyId, [{
    kind: "structure", detail: "insert-collision", node: null,
    recovery: {
      version: 1, key: "comment-insert", localLost: true, applied: true,
      subject: { key: "comment-subject", nodeType: 8, live: [], local: [[1, 0, 1]], base: [], remote: [], merged: [] },
      structure: { localAction: "inserted", fragmentKind: "comment", localFragment: "mine", localPlacement: { parent: ref(s, [1, 0]), before: [ref(byId("b"), [1, 0, 2])], after: [ref(byId("a"), [1, 0, 0])] } },
    },
  }], { ticket: 99 });

  const result = await revert.revertConflicts([id]);
  expect(result.revertedIds).toEqual([id]);
  expect(s.childNodes[1].nodeType).toBe(8);
  expect(s.childNodes[1].data).toBe("mine");
});

test("P7 C8 a text restore whose fragment carries an inline element a newer move targets: no second copy, both stay open", async () => {
  const sync = makeSync();
  await lose(sync,
    `<div id="p"><i id="x">x</i><i id="y">y</i><i id="z">z</i></div><div id="q"></div><div id="r"></div>`,
    `<div id="p"><i id="y">y</i><i id="z">z</i></div><div id="q"><i id="x">x</i></div><div id="r"></div>`,
    `<div id="p"><i id="y">y</i><i id="z">z</i></div><div id="q"></div><div id="r"><i id="x">x</i></div>`);
  sync.lastHtml = captureFrame();
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body><div id="p"><i id="y">y</i><i id="z">z</i><i id="x">x</i></div><div id="q"></div><div id="r"></div></body>`), 6, null);
  sync.lastHtml = captureFrame();
  document.body.innerHTML = `<div id="p"><i id="x">x</i><i id="z">z</i><i id="y">y</i></div><div id="q"></div><div id="r"></div>`;
  await Promise.resolve();
  const settled = `<div id="p"><i id="z">z</i><i id="x">x</i><i id="y">y</i></div><div id="q"></div><div id="r"></div>`;
  await sync._doApplyUpdate(sync.lastHtml.replace(/<body>[\s\S]*<\/body>/, `<body>${settled}</body>`), 7, null);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(2);
  expect(ids.map((id) => conflicts.get(id).kind).sort()).toEqual(["structure", "text"]);

  const result = await revert.revertConflicts(ids);
  expect(result.revertedIds).toEqual([]);
  expect(result.blockedIds.sort()).toEqual(ids.sort());
  expect(document.querySelectorAll("#x")).toHaveLength(1);
  expect(body()).toBe(settled);
  sync.stop();
});

test("B2 a block moved into a mark is undone: byte-identical page, the id open", async () => {
  const sync = makeSync();
  const base = `<p id="p"><b id="m">x</b></p><div id="k">K</div><div id="t"></div>`;
  await settle(base);
  sync.lastHtml = captureFrame();
  byId("m").append(byId("k"));
  await Promise.resolve();
  const remote = `<p id="p"><b id="m">x</b></p><div id="t"><div id="k">K</div></div>`;
  await sync._doApplyUpdate(sync.lastHtml.replace(`<body>${base}</body>`, `<body>${remote}</body>`), 5, null);
  expect(body()).toBe(remote);
  const ids = conflicts.list().map((r) => r.id);
  expect(ids).toHaveLength(1);
  expect(detailOf(ids[0])).toBe("both-moved");
  const html = document.documentElement.outerHTML;
  const k = byId("k");
  expect(revert.prepareRevert(ids).blocked.size).toBe(0);

  expect(await revert.revertConflicts(ids)).toEqual({ revertedIds: [], blockedIds: ids, saveResult: null });
  expect(document.documentElement.outerHTML).toBe(html);
  expect(byId("k")).toBe(k);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("A a failed check after moves, a removal and a restored subtree undoes all of them: byte-identical page, same nodes, listener kept", async () => {
  const sync = makeSync();
  const ids = await lose(
    sync,
    `<p id="t">One quick fox.</p><div id="a"><p id="mp">P</p></div><div id="b"></div><div id="c"></div><section id="s"><h2>FAQ</h2></section><p id="n">n</p><div id="i"></div>`,
    `<p id="t">One slow fox.</p><div id="a"></div><div id="b"><p id="mp">P</p></div><div id="c"></div><p id="n">n</p><div id="i"><p id="ip">LOCAL</p></div>`,
    `<p id="t">One fast fox.</p><div id="a"></div><div id="b"></div><div id="c"><p id="mp">P</p></div><section id="s"><h2>FAQ!</h2></section><p id="n">n</p><div id="i"><p id="ip">REMOTE</p></div>`
  );
  expect(ids).toHaveLength(4);
  const html = document.documentElement.outerHTML;
  const nodes = ["t", "mp", "s", "n", "ip"].map(byId);
  const pings = listen(byId("mp"));
  const spy = jest.spyOn(Range.prototype, "insertNode").mockImplementationOnce(() => {});

  const result = await revert.revertConflicts(ids);
  spy.mockRestore();

  expect(result.revertedIds).toEqual([]);
  expect(result.blockedIds.sort()).toEqual(ids.sort());
  expect(document.documentElement.outerHTML).toBe(html);
  expect(["t", "mp", "s", "n", "ip"].map(byId)).toEqual(nodes);
  expect(byId("mp").parentNode).toBe(byId("c"));
  expect(pings()).toBe(1);
  expect(conflicts.size).toBe(4);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});

test("A a move that silently does not land is caught by its own check and undone: byte-identical page, the id open", async () => {
  const sync = makeSync();
  const [id] = await lose(
    sync,
    `<div id="a"><p id="p">P</p></div><div id="b"></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"><p id="p">P</p></div><div id="c"></div>`,
    `<div id="a"></div><div id="b"></div><div id="c"><p id="p">P edited</p></div>`
  );
  expect(detailOf(id)).toBe("both-moved");
  const html = document.documentElement.outerHTML;
  const p = byId("p");
  const pings = listen(p);
  const spy = jest.spyOn(Node.prototype, "appendChild").mockImplementationOnce(() => {});

  const result = await revert.revertConflicts([id]);
  spy.mockRestore();

  expect(result.revertedIds).toEqual([]);
  expect(result.blockedIds).toEqual([id]);
  expect(document.documentElement.outerHTML).toBe(html);
  expect(byId("p")).toBe(p);
  expect(p.parentNode).toBe(byId("c"));
  expect(pings()).toBe(1);
  expect(conflicts.size).toBe(1);
  expect(saveCalls()).toHaveLength(0);
  sync.stop();
});
