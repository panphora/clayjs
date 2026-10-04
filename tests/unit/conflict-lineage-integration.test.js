import { jest } from "@jest/globals";

const actualVendor = await import('../../src/vendor/hyper-morph.vendor.js');
const vendorFacade = { ...actualVendor.HyperMorph };
jest.unstable_mockModule('../../src/vendor/hyper-morph.vendor.js', () => ({
  ...actualVendor,
  HyperMorph: vendorFacade,
  default: vendorFacade,
}));

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

const { protectionOf, beginLineageCapture } = await import('../../src/sync/conflict-footprints.js');
const { HyperMorph } = await import('../../src/vendor/hyper-morph.vendor.js');
const { buildRecovery } = await import('../../src/core/conflict-download.js');

async function pair({ duplicate = false } = {}) {
  const sync = makeSync();
  const middle = duplicate ? '<p>Two wild dogs.</p>' : '';
  const base = `<p>One quick fox.</p>${middle}<p>Two brisk dogs.</p><aside>note</aside>`;
  const [A] = await lose(sync, base, base.replace('quick', 'slow'), base.replace('quick', 'fast'));
  sync.lastHtml = captureFrame();
  const old = document.querySelector('aside').previousElementSibling;
  old.firstChild.data = 'Two lazy dogs.';
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace('Two brisk dogs.', 'Two wild dogs.'), 6, null);
  const B = conflicts.list().find((r) => r.id !== A).id;
  expect(conflicts.size).toBe(2);
  return { sync, A, B, old };
}

async function retag(sync, from = 'p', to = 'h3', extra = '') {
  sync.lastHtml = captureFrame();
  const incoming = sync.lastHtml.replace(`<${from}>Two wild dogs.</${from}><aside>note</aside>`, `<${to}>Two wild dogs.</${to}><aside>note${extra}</aside>`);
  expect(incoming).not.toBe(sync.lastHtml);
  await sync._doApplyUpdate(incoming, 7, null);
  return document.querySelector(to);
}

test.each([false, true])('real N7b plus two retags, saved DOM and immutable Download (duplicate=%s)', async (duplicate) => {
  const { sync, A, B, old } = await pair({ duplicate });
  const record = conflicts.get(B);
  const recovery = record.recovery;
  const live = [...recovery.subject.live];
  const localRoot = conflicts.recoveryOf(B).root;
  const mine = localRoot.outerHTML;
  const normalize = (html) => html.replace(/"savedAt":"[^"]*"/, '"savedAt":""');
  window.clay = { ...window.clay, conflicts };
  const beforeDownload = normalize(buildRecovery([record]).html);
  const h3 = await retag(sync);
  expect(old.isConnected).toBe(false);
  expect(protectionOf(record).nodes).toEqual([h3]);
  const h2 = await retag(sync, 'h3', 'h2', '!');
  expect(h3.isConnected).toBe(false);
  expect(protectionOf(record).nodes[0]).toBe(h2);
  expect(record.recovery).toBe(recovery);
  expect(record.recovery.subject.live).toEqual(live);
  expect(conflicts.recoveryOf(B).root).toBe(localRoot);
  expect(localRoot.outerHTML).toBe(mine);
  expect(normalize(buildRecovery([record]).html)).toBe(beforeDownload);
  expect(beforeDownload).toContain('Two lazy dogs.');
  expect(beforeDownload).not.toContain('<h2>Two wild dogs.</h2>');

  const result = await revert.revertConflicts([A]);
  expect(result.revertedIds).toEqual([A]);
  expect(result.saveResult.ok).toBe(true);
  const expected = `<p>One slow fox.</p>${duplicate ? '<p>Two wild dogs.</p>' : ''}<h2>Two wild dogs.</h2><aside>note!</aside>`;
  expect(body()).toBe(expected);
  expect(saveBodies()).toHaveLength(1);
  expect(saveBodies()[0]).toContain(expected);
  expect(conflicts.list().map((r) => r.id)).toEqual([B]);
  expect(await revert.revertConflicts([B])).toEqual({ revertedIds: [], blockedIds: [B], saveResult: null });
  expect(document.querySelector('h2')).toBe(h2);
  sync.stop();
});

test.each(['clean', 'no base'])('the %s merge wrapper composes old protection', async (path) => {
  const { sync, B, old } = await pair();
  const base = captureFrame();
  sync.lane = 'saved';
  const { report } = await sync._mergeIncoming(base.replace('<p>Two wild dogs.</p>', '<h3>Two wild dogs.</h3>'), null, {
    base: path === 'no base' ? null : base,
    captureLocal: () => snapshot.captureSnapshot({ flushUndo: false }), synthetic: true,
  });
  const heading = document.querySelector('h3');
  expect(report.lineage.entries.find((e) => e.from === old).to[0]).toBe(heading);
  expect(protectionOf(conflicts.get(B)).nodes[0]).toBe(heading);
  expect(conflicts.size).toBe(2);
  sync.stop();
});

test('new raw loss is composed by a later frame while the first frame waits for a resource', async () => {
  const sync = makeSync();
  const [A] = await lose(sync, '<p>One quick fox.</p><p>Two brisk dogs.</p>', '<p>One slow fox.</p><p>Two brisk dogs.</p>', '<p>One fast fox.</p><p>Two brisk dogs.</p>');
  const base = captureFrame();
  const old = document.body.lastChild;
  old.firstChild.data = 'Two lazy dogs.';
  await Promise.resolve();
  const firstFrame = base.replace('Two brisk dogs.', 'Two wild dogs.').replace('</body>', '<script src="consumer-lineage-held.js"></script></body>');
  const first = sync._mergeIncoming(firstFrame, null, {
    base, captureLocal: () => snapshot.captureSnapshot({ flushUndo: false }), synthetic: true,
  });
  expect(conflicts.hasPendingApply()).toBe(true);
  expect(conflicts.list().map((r) => r.id)).toEqual([A]);
  expect(document.querySelectorAll('script[src="consumer-lineage-held.js"]')).toHaveLength(1);
  expect(document.body.textContent).toContain('Two wild dogs.');
  const current = captureFrame();
  sync.lane = 'saved';
  const later = await sync._mergeIncoming(current.replace('<p>Two wild dogs.</p>', '<h3>Two wild dogs.</h3>'), null, {
    base: current, captureLocal: () => snapshot.captureSnapshot({ flushUndo: false }), synthetic: true,
  });
  sync.lane = 'live';
  const heading = document.querySelector('h3');
  expect(later.report.lineage.entries.find((e) => e.from === old).to[0]).toBe(heading);
  document.querySelector('script[src="consumer-lineage-held.js"]').dispatchEvent(new Event('load'));
  const earlier = await first;
  expect(earlier.ticket).toBeLessThan(later.ticket);
  const [B] = earlier.conflictIds;
  expect(B).toBeTruthy();
  expect(conflicts.get(B)).toBe(earlier.report.conflicts[0]);
  expect(protectionOf(conflicts.get(B)).nodes[0]).toBe(heading);
  expect(conflicts.hasPendingApply()).toBe(false);
  expect((await revert.revertConflicts([A])).revertedIds).toEqual([A]);
  expect(conflicts.list().map((r) => r.id)).toEqual([B]);
  expect(saveBodies()).toHaveLength(1);
  expect(saveBodies()[0]).toContain('<p>One slow fox.</p><h3>Two wild dogs.</h3>');
  expect(document.querySelector('h3')).toBe(heading);
  expect(await revert.revertConflicts([B])).toEqual({ revertedIds: [], blockedIds: [B], saveResult: null });
  sync.stop();
});

test.each(['removal', 'retag with changed text', 'split', 'combination'])('real %s remains conservative and never uses a same-text twin', async (kind) => {
  const { sync, A, B } = await pair({ duplicate: true });
  const base = captureFrame();
  const target = '<p>Two wild dogs.</p><aside>note</aside>';
  const replacement = {
    removal: '<aside>note</aside>',
    'retag with changed text': '<h3>Three wild cats.</h3><aside>note</aside>',
    split: '<p>Two wild</p><p>dogs.</p><aside>note</aside>',
    combination: '<aside>Two wild dogs. note</aside>',
  }[kind];
  await sync._doApplyUpdate(base.replace(target, replacement), 7, null);
  const state = protectionOf(conflicts.get(B));
  if (state) expect(state.nodes).not.toEqual([document.querySelectorAll('p')[1]]);
  const before = body();
  const plan = revert.prepareRevert([B]);
  expect(plan.blocked.has(B)).toBe(kind !== 'split');
  expect(plan.ops).toHaveLength(kind === 'split' ? 1 : 0);
  // Only existing recovery may authorize an operation; lineage is not consulted there.
  if (plan.blocked.has(B)) {
    const old = await revert.revertConflicts([A]);
    expect(old.revertedIds).toEqual([]);
    expect(conflicts.list().map((r) => r.id)).toEqual([A, B]);
    expect(body()).toBe(before);
    expect(saveBodies()).toHaveLength(0);
  } else {
    expect(plan.ops).toHaveLength(1);
    expect(kind).toBe('split');
  }
  sync.stop();
});

test.each(['generation', 'external witness', 'postwrite generation', 'postwrite witness'])('%s prevents a prepared revert from committing stale protection', async (kind) => {
  const { sync, A, B } = await pair();
  const heading = await retag(sync);
  const plan = revert.prepareRevert([A]);
  expect(plan.ops.map((op) => op.id)).toEqual([A]);
  const ids = conflicts.list().map((r) => r.id);
  const invalidateGeneration = () => {
    const capture = beginLineageCapture(conflicts.list());
    capture.returned();
    capture.finish(conflicts.list());
  };
  let spy;
  if (kind === 'generation') invalidateGeneration();
  if (kind === 'external witness') heading.title = 'later';
  const before = body();
  if (kind.startsWith('postwrite')) {
    const original = Text.prototype.replaceData;
    spy = jest.spyOn(Text.prototype, 'replaceData').mockImplementation(function (...args) {
      original.apply(this, args);
      if (kind === 'postwrite generation') invalidateGeneration();
      else heading.title = 'during write';
    });
  }
  try { expect(revert.applyRevert(plan)).toEqual([]); }
  finally { spy?.mockRestore(); }
  expect(body()).toBe(before);
  expect(conflicts.list().map((r) => r.id)).toEqual(ids);
  expect(ids).toEqual([A, B]);
  expect(saveBodies()).toHaveLength(0);
  sync.stop();
});

test.each(['sync hook', 'callback', 'resource rejection'])('%s failure after mutation broadens existing protection and preserves losses', async (kind) => {
  const { sync, A, B } = await pair();
  const base = captureFrame();
  sync.lane = 'saved';
  let spy;
  const extra = {};
  if (kind === 'sync hook') extra.beforeApply = () => { document.querySelector('aside').title = 'partly applied'; throw new Error('fixture apply failed'); };
  if (kind === 'callback') {
    const original = HyperMorph.mergeDocument;
    spy = jest.spyOn(HyperMorph, 'mergeDocument').mockImplementation((options) => original({
      ...options, lineage: { ...options.lineage, onResult(result, report) { options.lineage.onResult(result, report); throw new Error('fixture apply failed'); } },
    }));
  }
  let incoming = base.replace('<p>Two wild dogs.</p>', '<h3>Two wild dogs.</h3>');
  if (kind === 'resource rejection') {
    incoming = incoming.replace('</body>', '<script src="consumer-lineage-reject.js"></script></body>');
    const original = EventTarget.prototype.addEventListener;
    spy = jest.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (...args) {
      if (this.nodeType === 1 && this.getAttribute('src') === 'consumer-lineage-reject.js') throw new Error('fixture apply failed');
      return original.apply(this, args);
    });
  }
  try {
    await expect(sync._mergeIncoming(incoming, null, { base, captureLocal: () => snapshot.captureSnapshot({ flushUndo: false }), synthetic: true, extra })).rejects.toThrow('fixture apply failed');
  } finally { spy?.mockRestore(); }
  expect(protectionOf(conflicts.get(B)).nodes).toEqual([document.documentElement]);
  expect(conflicts.list().map((r) => r.id)).toEqual([A, B]);
  expect(conflicts.hasPendingApply()).toBe(false);
  expect(document.querySelector('h3') || document.querySelector('aside[title]')).not.toBeNull();
  sync.stop();
});
test('beforeApply escape preserves protection against an older attribute revert', async () => {
  const sync = makeSync();
  const base = '<section title="wrapper-base"><p title="base">Important content</p></section><aside>outside</aside><footer>old</footer>';
  const [A] = await lose(sync, base, base.replace('title="base"', 'title="mine"'), base.replace('title="base"', 'title="peer"'));
  const p = document.querySelector('p');
  sync.lastHtml = captureFrame();
  document.querySelector('section').title = 'wrapper-mine';
  await Promise.resolve();
  await sync._doApplyUpdate(sync.lastHtml.replace('wrapper-base', 'wrapper-peer'), 6, null);
  const B = conflicts.list().find(r => r.id !== A).id;
  const current = captureFrame();
  sync.lane = 'saved';
  await sync._mergeIncoming(current.replace('<section', '<article').replace('</section>', '</article>'), null, {
    base: current, captureLocal: () => snapshot.captureSnapshot({flushUndo:false}), synthetic:true,
  });
  const article = document.querySelector('article');
  expect(protectionOf(conflicts.get(B)).nodes).toEqual([article]);
  expect(article.contains(p)).toBe(true);
  const beforePlan = revert.prepareRevert([A]);
  expect(beforePlan.blocked.has(A)).toBe(true);
  expect(beforePlan.ops).toHaveLength(0);
  const next = captureFrame();
  const {report} = await sync._mergeIncoming(next.replace('old</footer>', 'new</footer>'), null, {
    base:next, captureLocal:()=>snapshot.captureSnapshot({flushUndo:false}), synthetic:true,
    extra:{beforeApply:()=>document.querySelector('aside').append(p)},
  });
  expect(document.querySelector('aside').contains(p)).toBe(true);
  expect(report.lineage.entries.find(e=>e.from===article)).toMatchObject({ kind: 'unknown', complete: false, to: [] });
  expect(protectionOf(conflicts.get(B)).nodes.some(node => node === p || node.contains(p))).toBe(true);
  const afterPlan = revert.prepareRevert([A]);
  expect(afterPlan.blocked.has(A)).toBe(true);
  expect(afterPlan.ops).toHaveLength(0);
  const result = await revert.revertConflicts([A]);
  expect(result).toEqual({ revertedIds: [], blockedIds: [A], saveResult: null });
  expect(p.title).toBe('peer');
  expect(conflicts.list().map(r=>r.id)).toEqual([A, B]);
  expect(saveBodies()).toHaveLength(0);
  sync.stop();
});
