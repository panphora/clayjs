import { jest } from "@jest/globals";

/**
 * A document declares three-way merges for its own attributes: `merge-tokens`
 * lists space-separated token attributes (labels, members) and `merge-max` lists
 * counters that only grow. `src/sync/merge-declarations.js` answers hyper-morph's
 * `attributeMerge` option from those authored attributes, and live-sync passes it
 * on both paths: the frame a peer broadcasts and the file a save conflicts with.
 * Every case captures a peer's real snapshot and applies it with this tab's local
 * edit already made, so the merge sees three genuine sides.
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
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
  delete window.clay;
});

const BOARD = (labels, count) =>
  '<div id="board" merge-tokens="data-labels data-members">' +
  `<div id="board-meta" merge-max="data-next-card" data-next-card="${count}"></div>` +
  '<div class="list" id="l-todo">' +
  `<article class="card" id="c1" data-labels="${labels}" data-title="Ship it">One</article>` +
  `<article class="card" id="c2" data-labels="design" data-title="Two">Two</article>` +
  "</div>" +
  '<div class="list" id="l-doing"></div>' +
  '<div class="list" id="l-done"></div>' +
  "</div>";

const card = () => document.querySelector("#c1");
const diskDoc = (inner) => `<!DOCTYPE html><html><head></head><body>${inner}</body></html>`;

/**
 * `base` becomes this tab's page, `local` edits the live DOM, `remote` edits a
 * real snapshot of it (the peer's page), and the frame or the file arrives.
 * Both paths merge from the same three sides.
 */
async function merge({ base, local, remote, via = "frame" }) {
  document.body.innerHTML = base;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());

  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;

  const peer = snapshot.captureSnapshot({ flushUndo: false });
  remote(peer);
  const map = sync.identity.exportMap(peer, snapshot.originalSnapshotNode);
  const html = snapshot.serializeForSync(peer);

  local(document);
  await Promise.resolve();

  const reports = [];
  const on = (e) => reports.push(e.detail.report);
  document.addEventListener("clay:sync-applied", on);
  if (via === "frame") await sync._doApplyUpdate(html, 1, map, null);
  else await sync._doApplyExternal(diskDoc(html), 1, "E1");
  document.removeEventListener("clay:sync-applied", on);

  const outcome = {
    report: reports[0],
    conflicts: reports.flatMap((r) => r?.conflicts ?? []),
    ledger: conflicts.size,
    labels: card().dataset.labels ?? null,
    nextCard: document.querySelector("#board-meta").dataset.nextCard,
    title: card().dataset.title,
    lists: [...document.querySelectorAll(".list")].map((l) => [l.id, [...l.querySelectorAll(".card")].map((c) => c.id)]),
    sync,
  };
  sync.stop();
  return outcome;
}

const addLabel = (root, label) => {
  const el = root.querySelector("#c1");
  el.dataset.labels = `${el.dataset.labels} ${label}`;
};

test("labels both people added, in either direction, merge into one token set", async () => {
  for (const [mine, theirs] of [["bug", "feature"], ["feature", "bug"]]) {
    const out = await merge({
      base: BOARD("design", 15),
      local: (root) => addLabel(root, mine),
      remote: (root) => addLabel(root, theirs),
    });
    expect(out.labels).toBe("design bug feature");
    expect(out.conflicts).toEqual([]);
    expect(out.ledger).toBe(0);
  }
});

test("a label each person removed, and one removed against an unrelated add, both merge", async () => {
  const removals = await merge({
    base: BOARD("design bug feature", 15),
    local: (root) => { root.querySelector("#c1").dataset.labels = "design bug"; },
    remote: (root) => { root.querySelector("#c1").dataset.labels = "design feature"; },
  });
  expect(removals.labels).toBe("design");
  expect(removals.conflicts).toEqual([]);
  expect(removals.ledger).toBe(0);

  const mixed = await merge({
    base: BOARD("design bug", 15),
    local: (root) => { root.querySelector("#c1").dataset.labels = "design"; },
    remote: (root) => addLabel(root, "feature"),
  });
  expect(mixed.labels).toBe("design feature");
  expect(mixed.conflicts).toEqual([]);
});

test("a scalar title both sides rewrote still conflicts", async () => {
  const out = await merge({
    base: BOARD("design", 15),
    local: (root) => { root.querySelector("#c1").textContent = "Mine"; },
    remote: (root) => { root.querySelector("#c1").textContent = "Theirs"; },
  });
  expect(card().textContent).toBe("Theirs");
  expect(out.conflicts.length).toBeGreaterThan(0);
  expect(out.ledger).toBeGreaterThan(0);
});

test("a card both people moved into different lists still conflicts", async () => {
  const out = await merge({
    base: BOARD("design", 15),
    local: (root) => root.querySelector("#l-doing").append(root.querySelector("#c1")),
    remote: (root) => root.querySelector("#l-done").append(root.querySelector("#c1")),
  });
  expect(out.lists).toEqual([["l-todo", ["c2"]], ["l-doing", []], ["l-done", ["c1"]]]);
  expect(out.conflicts.length).toBeGreaterThan(0);
  expect(out.ledger).toBeGreaterThan(0);
});

test("two counters set at once take the larger, with no ledger record", async () => {
  const out = await merge({
    base: BOARD("design", 15),
    local: (root) => { root.querySelector("#board-meta").dataset.nextCard = "17"; },
    remote: (root) => { root.querySelector("#board-meta").dataset.nextCard = "16"; },
  });
  expect(out.nextCard).toBe("17");
  expect(out.conflicts).toEqual([]);
  expect(out.ledger).toBe(0);
});

test("an undeclared data attribute both sides changed still conflicts", async () => {
  const out = await merge({
    base: BOARD("design", 15),
    local: (root) => { root.querySelector("#c1").dataset.title = "Mine"; },
    remote: (root) => { root.querySelector("#c1").dataset.title = "Theirs"; },
  });
  expect(out.title).toBe("Theirs");
  expect(out.conflicts.length).toBeGreaterThan(0);
  expect(out.ledger).toBeGreaterThan(0);
});

test("the save-conflict path merges the same declarations as the frame path", async () => {
  const cases = [
    {
      name: "labels",
      base: BOARD("design", 15),
      local: (root) => addLabel(root, "bug"),
      remote: (root) => addLabel(root, "feature"),
      check: { labels: "design bug feature", ledger: 0 },
    },
    {
      name: "counter",
      base: BOARD("design", 15),
      local: (root) => { root.querySelector("#board-meta").dataset.nextCard = "17"; },
      remote: (root) => { root.querySelector("#board-meta").dataset.nextCard = "16"; },
      check: { nextCard: "17", ledger: 0 },
    },
    {
      name: "undeclared",
      base: BOARD("design", 15),
      local: (root) => { root.querySelector("#c1").dataset.title = "Mine"; },
      remote: (root) => { root.querySelector("#c1").dataset.title = "Theirs"; },
      check: { title: "Theirs" },
    },
  ];
  for (const c of cases) {
    const frame = await merge({ base: c.base, local: c.local, remote: c.remote, via: "frame" });
    const disk = await merge({ base: c.base, local: c.local, remote: c.remote, via: "save" });
    for (const key of Object.keys(c.check)) {
      expect([c.name, key, disk[key]]).toEqual([c.name, key, c.check[key]]);
      expect([c.name, key, frame[key]]).toEqual([c.name, key, c.check[key]]);
    }
    expect([c.name, disk.conflicts.length > 0]).toEqual([c.name, frame.conflicts.length > 0]);
  }
});
