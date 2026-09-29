import { jest } from "@jest/globals";

/**
 * The rows the notice draws, driven by real merges through the engine's own
 * recovery data: what a clash is called, where its eye points, and the words on
 * both sides. The engine, not the live page, is the source: a subject the merge
 * left off the page is still named from this tab's retained copy, and the text
 * around a clash is the text the engine handed over.
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

let liveSyncModule;
let LiveSync;
let conflicts;
let snapshot;
let gate;
let save;
let etag;
let autosaveState;
let rowOf;

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
  // autosave.js decides at import whether to install its mutation feed.
  document.documentElement.setAttribute("autosave", "");

  liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  await import("../../src/core/unsaved-warning.js");
  await import("../../src/core/autosave.js");

  ({ rowOf } = await import("../../src/core/conflict-presentation.js"));
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  etag = await import("../../src/core/etag.js");
  autosaveState = await import("../../src/lib/autosave-state.js");

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
  autosaveState.setAutosaveActive(false);
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag("E0");
});

afterEach(() => {
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
  delete window.clay;
  document.documentElement.removeAttribute("autosave");
  autosaveState.setAutosaveActive(false);
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
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

/** The remote document, built from this tab's own frame: every replace must land. */
function frame(html, ...pairs) {
  let out = html;
  for (const [from, to] of pairs) {
    const next = out.replace(from, to);
    expect(next).not.toBe(out);
    out = next;
  }
  return out;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test("a word clash quotes the engine's own text around it", async () => {
  await settle('<p id="p">One quick fox sleeps.</p>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#p").textContent = "One slow fox sleeps.";
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyUpdate(frame(sync.lastHtml, ["One quick fox sleeps.", "One fast fox sleeps."]), 5, null);
  seen.stop();

  const records = conflicts.list();
  expect(seen[0].conflictIds).toHaveLength(1);
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.yours.before).toBe("One ");
  expect(row.yours.hit).toBe("slow");
  expect(row.yours.after).toBe(" fox sleeps.");
  expect(row.now.hit).toBe("fast");
  expect(row.target).toBe(document.querySelector("#p"));
  expect(row.name).toBe("Paragraph");
  sync.stop();
});

test("only the word that changed is quoted, even when it repeats", async () => {
  await settle('<p id="p">quick fox and quick fox</p>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#p").textContent = "quick fox and slow fox";
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["quick fox and quick fox", "quick fox and fast fox"]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.yours.before.endsWith("quick fox and ")).toBe(true);
  expect(row.yours.hit).toBe("slow");
  expect(row.now.hit).toBe("fast");
  sync.stop();
});

test("a change inside inline markup arrives as text, never as HTML", async () => {
  await settle('<p id="p">One <b>quick</b> fox.</p>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("b").textContent = "slow";
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["<b>quick</b>", "<b>fast</b>"]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.yours.hit).not.toContain("<");
  expect(row.now.hit).not.toContain("<");
  expect(row.yours.hit).toContain("slow");
  expect(row.now.hit).toContain("fast");
  sync.stop();
});

test("a clash on an attribute names it and points at the live element", async () => {
  await settle('<a id="a" href="/a">Go</a>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#a").setAttribute("href", "/mine");
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ['href="/a"', 'href="/theirs"']), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.name).toBe("Link address");
  expect(row.yours.hit).toBe("/mine");
  expect(row.now.hit).toBe("/theirs");
  expect(row.target).toBe(document.querySelector("#a"));
  sync.stop();
});

test("a local deletion the other edit beat says so, and points at what is still here", async () => {
  await settle('<section id="s"><h2>FAQ</h2><p>Old</p></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#s").remove();
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["Old", "New"]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.name).toBe("FAQ section");
  expect(row.sentence.startsWith("You deleted this section.")).toBe(true);
  expect(row.target).toBe(document.querySelector("#s"));
  sync.stop();
});

test("the other edit's deletion leaves this tab's own edit alone", async () => {
  await settle('<section id="s"><h2>FAQ</h2><p>Old</p></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#s p").textContent = "New";
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ['<section id="s"><h2>FAQ</h2><p>Old</p></section>', ""]), 5, null);

  expect(conflicts.list()).toHaveLength(0);
  sync.stop();
});

test("a block both sides moved names both destinations, once", async () => {
  await settle('<div id="a"><p id="p">P</p></div><section id="b"><h2>Pricing</h2></section><section id="c"><h2>FAQ</h2></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#b").append(document.querySelector("#p"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="a"><p id="p">P</p></div>', '<div id="a"></div>'],
    ['<section id="c"><h2>FAQ</h2></section>', '<section id="c"><h2>FAQ</h2><p id="p">P</p></section>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(rowOf(records[0]).sentence).toBe("You moved this paragraph into the Pricing section. The other edit moved it into the FAQ section. Their position is showing.");
  sync.stop();
});

test("a reorder both sides changed keeps the other edit's order, once", async () => {
  const body = '<ul id="s"><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul>';
  await settle(body);
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#s").insertBefore(document.querySelector("#b"), document.querySelector("#a"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml, [body, '<ul id="s"><li id="a">A</li><li id="c">C</li><li id="b">B</li></ul>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(rowOf(records[0]).sentence.startsWith("You changed the order of the items in this list.")).toBe(true);
  sync.stop();
});

test("a move the other edit made beats this tab's deletion, once", async () => {
  await settle('<div id="a"><p id="p">P</p></div><div id="b"></div>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#p").remove();
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="a"><p id="p">P</p></div>', '<div id="a"></div>'],
    ['<div id="b"></div>', '<div id="b"><p id="p">P</p></div>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(rowOf(records[0]).sentence).toBe("You deleted this paragraph. The other edit moved it, so it is still here.");
  sync.stop();
});

test("two insertions in the same place say whose content is showing", async () => {
  await settle('<div id="s"></div>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#s").innerHTML = '<p id="p">LOCAL</p>';
  await Promise.resolve();

  const remote = frame(sync.lastHtml, ['<div id="s"></div>', '<div id="s"><p id="p">REMOTE</p></div>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  expect(rowOf(records[0]).sentence).toBe("You and the other edit added different content in the same place. Their content is showing.");
  sync.stop();
});

test("the notice counts clashes, not the raw reports behind them", async () => {
  await settle('<div id="a"><p id="p">P</p></div><section id="b"><h2>Pricing</h2></section><section id="c"><h2>FAQ</h2></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#b").append(document.querySelector("#p"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="a"><p id="p">P</p></div>', '<div id="a"></div>'],
    ['<section id="c"><h2>FAQ</h2></section>', '<section id="c"><h2>FAQ</h2><p id="p">P</p></section>']);
  await sync._doApplyUpdate(remote, 5, null);

  expect(conflicts.list()).toHaveLength(1);

  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.clay = { conflicts };
  await import("../../src/core/conflict-notice.js");
  await tick();

  const bar = document.querySelector("[data-clay-conflict]");
  expect(bar).not.toBeNull();
  expect(bar.textContent).toContain("Another edit replaced 1 change.");
  sync.stop();
});

const CHANGED_AGAIN = "The other edit replaced this, and the page changed again before it could be shown here. Download my copy keeps your version.";

test("a column without its own heading is not named after a card inside it", async () => {
  await settle('<div id="board"><div id="todo"><div class="t">To do</div><article id="card"><h3>Buy milk</h3></article></div><div id="doing"><div class="t">Doing</div><article><h3>Write report</h3></article></div><div id="done"><div class="t">Done</div><article><h3>Call Bob</h3></article></div></div>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#doing").append(document.querySelector("#card"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="todo"><div class="t">To do</div><article id="card"><h3>Buy milk</h3></article></div>', '<div id="todo"><div class="t">To do</div></div>'],
    ['<div id="done"><div class="t">Done</div><article><h3>Call Bob</h3></article></div>', '<div id="done"><div class="t">Done</div><article><h3>Call Bob</h3></article><article id="card"><h3>Buy milk</h3></article></div>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.sentence).toBe("You moved this article. The other edit moved it somewhere else. Their position is showing.");
  expect(row.sentence).not.toContain("Write report");
  expect(row.sentence).not.toContain("Call Bob");
  sync.stop();
});

test("a moved block's own heading is not its destination", async () => {
  await settle('<div id="a"><article id="x"><h3>Item</h3></article></div><section id="b"></section><section id="c"><h2>FAQ</h2></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#b").append(document.querySelector("#x"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="a"><article id="x"><h3>Item</h3></article></div>', '<div id="a"></div>'],
    ['<section id="c"><h2>FAQ</h2></section>', '<section id="c"><h2>FAQ</h2><article id="x"><h3>Item</h3></article></section>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.sentence).not.toContain("Item section");
  sync.stop();
});

test("a destination the moved block sits alone in is not named after its own heading", async () => {
  await settle('<div id="a"><article id="x"><h3>Item</h3></article></div><section id="b"></section><section id="c"><h2>FAQ</h2></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#c").append(document.querySelector("#x"));
  await Promise.resolve();

  const remote = frame(sync.lastHtml,
    ['<div id="a"><article id="x"><h3>Item</h3></article></div>', '<div id="a"></div>'],
    ['<section id="b"></section>', '<section id="b"><article id="x"><h3>Item</h3></article></section>']);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.sentence).toBe("You moved this article. The other edit moved it somewhere else. Their position is showing.");
  expect(row.sentence).not.toContain("Item");
  sync.stop();
});

test("deleting a comment is about the comment, not the section around it", async () => {
  await settle('<p id="d">Plain.</p><section id="s"><h2>FAQ</h2><!--old--><p>x</p></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#d").textContent = "Mine.";
  document.querySelector("#s > p").previousSibling.remove();
  await Promise.resolve();

  const remote = frame(sync.lastHtml, ["<!--old-->", "<!--theirs-->"]);
  await sync._doApplyUpdate(remote, 5, null);

  const records = conflicts.list();
  expect(records.length).toBeGreaterThanOrEqual(1);
  const rows = records.map((r) => rowOf(r));
  const structural = rows.filter((r) => r.kind === "struct");
  expect(structural.length).toBeGreaterThanOrEqual(1);
  for (const row of structural) {
    expect(row.name).toBe("Comment");
    expect(row.sentence.startsWith("You deleted this comment.")).toBe(true);
  }
  for (const row of rows) {
    expect(String(row.name)).not.toContain("section");
    expect(String(row.sentence)).not.toContain("section");
  }
  sync.stop();
});

test("output the engine could not map shows no eye and no Now", async () => {
  await settle('<p id="p">One quick fox.</p>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  window.clay = { conflicts };
  document.querySelector("#p").textContent = "One slow fox.";
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["One quick fox.", "One fast fox."]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf({ ...records[0], recovery: { ...records[0].recovery, applied: false, unavailable: "missing-output" } });
  expect(row.target).toBeNull();
  expect(row.now).toBeNull();
  expect(row.yours.hit).toBe("slow");
  expect(row.sentence).toBe(CHANGED_AGAIN);
  sync.stop();
});

test("a structural row the page never showed has no eye, a neutral kind and no still here", async () => {
  await settle('<section id="s"><h2>FAQ</h2><p>Old</p></section>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  window.clay = { conflicts };
  document.querySelector("#s").remove();
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["Old", "New"]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf({ ...records[0], recovery: { ...records[0].recovery, applied: false, unavailable: "missing-output" } });
  expect(row.target).toBeNull();
  expect(row.name).not.toBe("Edit");
  expect(row.sentence).toBe(CHANGED_AGAIN);
  expect(row.sentence).not.toContain("still here");
  sync.stop();
});

test("a data block clash points its eye at the block's visible host", async () => {
  await settle('<p id="d">Plain.</p><div id="w"><script type="application/json" id="j">{"a":1}</script></div>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#d").textContent = "Mine.";
  document.querySelector("#j").textContent = '{"a":2}';
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ['{"a":1}', '{"a":3}']), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.name).toBe("Data block");
  expect(row.target).toBe(document.querySelector("#w"));
  sync.stop();
});

test("a clash inside a template points its eye at the visible host, never the template's own content", async () => {
  await settle('<p id="d">Plain.</p><div id="w"><template id="t"><p>One quick fox.</p></template></div>');
  const sync = makeSync();
  sync.lastHtml = captureFrame();
  document.querySelector("#d").textContent = "Mine.";
  document.querySelector("#t").content.querySelector("p").textContent = "One slow fox.";
  await Promise.resolve();

  await sync._doApplyUpdate(frame(sync.lastHtml, ["One quick fox.", "One fast fox."]), 5, null);

  const records = conflicts.list();
  expect(records).toHaveLength(1);
  const row = rowOf(records[0]);
  expect(row.target).toBe(document.querySelector("#w"));
  expect(row.target).not.toBe(document.querySelector("#t"));
  expect(row.target).not.toBe(document.querySelector("#t").content.querySelector("p"));
  expect(row.now.hit).toBe("fast");
  sync.stop();
});
