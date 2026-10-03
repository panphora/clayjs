import { jest } from "@jest/globals";

/**
 * The conflict ledger is this document's memory of what incoming frames won over
 * its unsaved edits. It is what keeps the close warning honest for work a merge
 * replaced: the page's bytes cannot show that text, so a record outlives the
 * save that follows, and leaves only when the person says so through
 * acknowledge().
 *
 * The ledger's lifetime is the document's, so nothing here may end it early,
 * and an apply in flight counts as pending work from the moment it begins: the
 * close warning must never blink false in the gap where a frame has won but its
 * record is not installed yet.
 *
 * Each test loads both modules fresh, after a module reset, so the ledger's maps
 * start empty and the two share one registry instance: a leaked record would
 * otherwise keep the close warning on in every test that follows.
 */

let ledger;
let unsaved;
let events = [];
let onConflictsChanged;
let insertionLive;

beforeEach(async () => {
  jest.resetModules();
  ledger = await import("../../src/sync/conflicts.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
  events = [];
  onConflictsChanged = (event) => events.push(event.detail);
  document.addEventListener("clay:sync-conflicts-changed", onConflictsChanged);
  insertionLive = document.implementation.createHTMLDocument("").documentElement;
  insertionLive.querySelector("body").innerHTML = "<section><div><p>mine</p><p>mine</p></div><p>mine</p></section><aside></aside>";
});

afterEach(() => {
  document.removeEventListener("clay:sync-conflicts-changed", onConflictsChanged);
});

/** A plain engine conflict, the shape a merge hands the ledger. */
function engineConflict(overrides = {}) {
  return { kind: "text", local: "mine", remote: "theirs", ...overrides };
}

/** Start an apply of one conflict and return the id the ledger installed. */
function installOne(conflict, options = {}) {
  const applyId = ledger.beginApply({
    source: "peer", seq: null, etag: null, domain: "sync", root: document.createElement("html"),
    ...options,
  });
  const ids = ledger.completeApply(applyId, [conflict], { ticket: 41 });
  return ids[0];
}

test("two conflicts in one apply take distinct ids in order, each engine object wearing its own", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 9, etag: "E1", domain: "sync", root: document.createElement("html"),
  });
  const first = engineConflict();
  const second = engineConflict({ kind: "attr" });

  const ids = ledger.completeApply(applyId, [first, second], { ticket: 41 });

  expect(ids).toHaveLength(2);
  const [firstId, secondId] = ids;
  expect(firstId).not.toBe(secondId);
  expect(firstId).toMatch(/^[a-z0-9]+:\d+$/);
  expect(secondId).toMatch(/^[a-z0-9]+:\d+$/);
  expect(firstId.split(":")[0]).toBe(secondId.split(":")[0]);

  const list = ledger.conflicts.list();
  expect(ledger.conflicts.size).toBe(2);
  expect(list.map((rec) => rec.id)).toEqual([firstId, secondId]);
  expect(list[0]).toBe(first);
  expect(first.id).toBe(firstId);
  expect(second.id).toBe(secondId);
  expect(ledger.conflicts.get(firstId)).toBe(first);
  expect(ledger.conflicts.get(firstId).applyId).toBe(applyId);
  expect(list.map((rec) => rec.source)).toEqual(["peer", "peer"]);
  expect(list.map((rec) => rec.ticket)).toEqual([41, 41]);
  expect(list.map((rec) => rec.rawReports)).toEqual([[first], [second]]);
  expect(list.map((rec) => rec.claimedBy)).toEqual([null, null]);
});

test("a conflict that lost nothing of this tab's is not recorded, and leaves no apply behind", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 2, etag: "E2", domain: "sync", root: document.createElement("html"),
  });

  const ids = ledger.completeApply(applyId, [
    engineConflict({ recovery: { key: "k1", localLost: false, applied: true } }),
    engineConflict({ recovery: { key: "k2", localLost: true, applied: false, unavailable: "hook-veto" } }),
  ], { ticket: 7 });

  expect(ids).toEqual([]);
  expect(ledger.conflicts.size).toBe(0);
  expect(ledger.conflicts.list()).toEqual([]);
  expect(events).toEqual([]);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(unsaved.hasUnsavedState()).toBe(false);

  // The apply is gone, not parked: a later report against it installs nothing.
  expect(ledger.completeApply(applyId, [engineConflict({ recovery: { key: "k3", localLost: true } })], { ticket: 8 })).toEqual([]);
  expect(ledger.conflicts.size).toBe(0);
});

test("a report the engine could not map to the live page is still a loss", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 3, etag: "E9", domain: "sync", root: document.createElement("html"),
  });

  const ids = ledger.completeApply(applyId, [
    engineConflict({
      recovery: { version: 1, key: "k1", localLost: true, applied: false, unavailable: "missing-output" },
    }),
  ], { ticket: 4 });

  expect(ids).toHaveLength(1);
  expect(ledger.conflicts.size).toBe(1);
  expect(ledger.conflicts.get(ids[0]).recovery.unavailable).toBe("missing-output");
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(unsaved.hasUnsavedState()).toBe(true);
});

test("a hook that kept the incoming change off the page is not a loss, whatever the engine guessed", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 4, etag: "E10", domain: "sync", root: document.createElement("html"),
  });

  const ids = ledger.completeApply(applyId, [
    engineConflict({ recovery: { version: 1, key: "k2", localLost: false, applied: false, unavailable: "hook-veto" } }),
    engineConflict({ recovery: { version: 1, key: "k2b", localLost: true, applied: false, unavailable: "hook-veto" } }),
  ], { ticket: 5 });

  expect(ids).toEqual([]);
  expect(ledger.conflicts.size).toBe(0);
  expect(events).toEqual([]);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(unsaved.hasUnsavedState()).toBe(false);
});

test("a report where this tab's operation survived is not a loss", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 5, etag: "E11", domain: "sync", root: document.createElement("html"),
  });

  const ids = ledger.completeApply(applyId, [
    engineConflict({ recovery: { version: 1, key: "k3", localLost: false, applied: true, unavailable: null } }),
  ], { ticket: 6 });

  expect(ids).toEqual([]);
  expect(ledger.conflicts.size).toBe(0);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(unsaved.hasUnsavedState()).toBe(false);
});

test("raw conflicts sharing a recovery key in one apply become one record holding both", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 1, etag: "E3", domain: "sync", root: document.createElement("html"),
  });
  const recovery = { key: "k1", localLost: true, applied: true };
  const first = engineConflict({ recovery });
  const second = engineConflict({ kind: "attr", recovery });

  const ids = ledger.completeApply(applyId, [first, second], { ticket: 3 });

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(first);
  expect(rec.rawReports).toHaveLength(2);
  expect(rec.rawReports).toEqual([first, second]);
  expect(ledger.conflicts.size).toBe(1);
  expect(events).toHaveLength(1);
  expect(events[0].added).toEqual([rec]);
  expect(events[0].open).toEqual(ids);
});

test("the same recovery key in two applies stays two records", () => {
  const recovery = { key: "k1", localLost: true, applied: true };
  const firstId = installOne(engineConflict({ recovery }));
  const secondId = installOne(engineConflict({ recovery }), { source: "disk", domain: "save" });

  expect(firstId).not.toBe(secondId);
  expect(ledger.conflicts.size).toBe(2);
  expect(ledger.conflicts.get(firstId).rawReports).toHaveLength(1);
  expect(ledger.conflicts.get(secondId).rawReports).toHaveLength(1);
  expect(ledger.conflicts.get(firstId).source).toBe("peer");
  expect(ledger.conflicts.get(secondId).source).toBe("disk");
});

/**
 * The live page a report's paths are resolved in, content steps included: an html
 * element whose head is step 0 and body step 1, the body holding a section (with a
 * div of two paragraphs inside it) and an aside beside it.
 */
function nodeAt(path, root = insertionLive) {
  return path.reduce((node, step) => (step === "content" ? node.content : node.childNodes[step]), root);
}

/**
 * A nested insert-collision, the shape one engine release emits once per element
 * of one inserted subtree: subject.local is the single path that element lives at,
 * subject.merged is where the merge put it, subject.live is that live element, and
 * every report carries its own full recovery copy.
 */
function insertCollision(path, key, overrides = {}) {
  const node = nodeAt(path);
  return {
    kind: "structure",
    detail: "insert-collision",
    node,
    recovery: {
      version: 1, key, localLost: true, applied: true, unavailable: null,
      subject: { key: `${key}-subject`, nodeType: 1, live: [node], local: [path], base: [], remote: [], merged: [path] },
      structure: {
        localAction: "inserted", fragmentKind: "element", localFragment: node.outerHTML,
        localPlacement: { parent: null, before: [], after: [] },
      },
      ...overrides,
    },
  };
}

/** Start an apply of several reports and return the ids the ledger installed. */
function installAll(reports, options = {}) {
  const applyId = ledger.beginApply({
    source: "peer", seq: null, etag: null, domain: "sync", root: document.createElement("html"),
    ...options,
  });
  return ledger.completeApply(applyId, reports, { ticket: 41 });
}

test("a child-first pair from one inserted subtree becomes one record holding both, the outer one wearing it", () => {
  const parent = insertCollision([1, 0], "outer");
  const child = insertCollision([1, 0, 0], "inner");

  const ids = installAll([child, parent]);

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(parent);
  expect(rec.rawReports).toEqual([parent, child]);
  expect(rec.recovery.key).toBe("outer");
  expect(ledger.conflicts.size).toBe(1);
});

test("three levels of one inserted subtree fold to the outermost, every report kept once", () => {
  const outer = insertCollision([1, 0], "outer");
  const middle = insertCollision([1, 0, 0], "middle");
  const inner = insertCollision([1, 0, 0, 1], "inner");

  const ids = installAll([inner, outer, middle]);

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(outer);
  expect(rec.rawReports).toEqual([outer, inner, middle]);
  expect(new Set(rec.rawReports).size).toBe(3);
});

test("two branches of one inserted subtree fold under it as one record", () => {
  const outer = insertCollision([1, 0], "outer");
  const left = insertCollision([1, 0, 0], "left");
  const right = insertCollision([1, 0, 1], "right");

  const ids = installAll([left, right, outer]);

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(outer);
  expect(rec.rawReports).toEqual([outer, left, right]);
});

test("siblings of a shared parent, neither inside the other, stay two records", () => {
  const left = insertCollision([1, 0], "left");
  const right = insertCollision([1, 1], "right");

  const ids = installAll([left, right]);

  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.get(ids[0])).toBe(left);
  expect(ledger.conflicts.get(ids[1])).toBe(right);
  expect(ledger.conflicts.get(ids[0]).rawReports).toEqual([left]);
  expect(ledger.conflicts.get(ids[1]).rawReports).toEqual([right]);
});

test("an element inside a template's content folds under the inserted block that carries it", () => {
  insertionLive.querySelector("body").innerHTML = "<template><p>mine</p></template>";
  const outer = insertCollision([1, 0], "outer");
  const nested = insertCollision([1, 0, "content", 0], "nested");

  const ids = installAll([nested, outer]);

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(outer);
  expect(rec.rawReports).toEqual([outer, nested]);
});

test("a report with no live output stays its own record, whatever its ancestry", () => {
  const outer = insertCollision([1, 0], "outer");
  const missing = insertCollision([1, 0, 0], "missing", { unavailable: "missing-output" });
  const unmapped = insertCollision([1, 0, 1], "unmapped", { applied: false });

  const ids = installAll([missing, unmapped, outer]);

  expect(ids).toHaveLength(3);
  const byKey = new Map(ids.map((id) => [ledger.conflicts.get(id).recovery.key, ledger.conflicts.get(id)]));
  expect(byKey.get("outer").rawReports).toEqual([outer]);
  expect(byKey.get("missing").rawReports).toEqual([missing]);
  expect(byKey.get("unmapped").rawReports).toEqual([unmapped]);
});

test("a report with no live output anchors no fold over the reports inside it", () => {
  const outer = insertCollision([1, 0], "outer", { unavailable: "missing-output" });
  const child = insertCollision([1, 0, 0], "inner");

  const ids = installAll([outer, child]);

  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.get(ids[0])).toBe(outer);
  expect(ledger.conflicts.get(ids[1])).toBe(child);
  expect(ledger.conflicts.get(ids[0]).rawReports).toEqual([outer]);
  expect(ledger.conflicts.get(ids[1]).rawReports).toEqual([child]);
});

test("one subtree's insert-collisions in two applies never fold together", () => {
  const firstId = installOne(insertCollision([1, 0], "outer"));
  const secondId = installOne(insertCollision([1, 0, 0], "inner"), { source: "disk", domain: "save" });

  expect(firstId).not.toBe(secondId);
  expect(ledger.conflicts.size).toBe(2);
  expect(ledger.conflicts.get(firstId).rawReports).toHaveLength(1);
  expect(ledger.conflicts.get(secondId).rawReports).toHaveLength(1);
  expect(ledger.conflicts.get(firstId).source).toBe("peer");
  expect(ledger.conflicts.get(secondId).source).toBe("disk");
});

test("reports sharing one recovery key stay one record, each report present once", () => {
  const parent = insertCollision([1, 0], "same");
  const child = insertCollision([1, 0, 0], "same");

  const ids = installAll([parent, child]);

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).toBe(parent);
  expect(rec.rawReports).toEqual([parent, child]);
  expect(new Set(rec.rawReports).size).toBe(2);
});

test("a child the merge moved out of its local parent keeps its own record", () => {
  const parent = insertCollision([1, 0], "outer");
  const child = insertCollision([1, 0, 0], "inner");
  nodeAt([1, 1]).appendChild(child.recovery.subject.live[0]);
  child.recovery.subject.merged = [[1, 1, 0]];

  const ids = installAll([child, parent]);

  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.get(ids[0])).toBe(child);
  expect(ledger.conflicts.get(ids[1])).toBe(parent);
  expect(ledger.conflicts.get(ids[0]).rawReports).toEqual([child]);
  expect(ledger.conflicts.get(ids[1]).rawReports).toEqual([parent]);
  expect(ledger.conflicts.size).toBe(2);
});

test("a stale merged path cannot fold a child whose live node left the parent", () => {
  const parent = insertCollision([1, 0], "outer");
  const child = insertCollision([1, 0, 0], "inner");
  nodeAt([1, 1]).appendChild(child.recovery.subject.live[0]);

  const ids = installAll([child, parent]);

  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.get(ids[0])).toBe(child);
  expect(ledger.conflicts.get(ids[1])).toBe(parent);
  expect(ledger.conflicts.get(ids[0]).rawReports).toEqual([child]);
  expect(ledger.conflicts.get(ids[1]).rawReports).toEqual([parent]);
  expect(ledger.conflicts.size).toBe(2);
});

test("a child with no merged path stays separate however valid the outer report is", () => {
  const parent = insertCollision([1, 0], "outer");
  const child = insertCollision([1, 0, 0], "inner");
  child.recovery.subject.merged = [];

  const ids = installAll([parent, child]);

  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.get(ids[0])).toBe(parent);
  expect(ledger.conflicts.get(ids[1])).toBe(child);
  expect(ledger.conflicts.get(ids[0]).rawReports).toEqual([parent]);
  expect(ledger.conflicts.get(ids[1]).rawReports).toEqual([child]);
  expect(ledger.conflicts.size).toBe(2);
});

test("acknowledge removes only the named ids and reports what is left", () => {
  const firstId = installOne(engineConflict());
  const secondId = installOne(engineConflict());
  expect(ledger.conflicts.size).toBe(2);

  const result = ledger.conflicts.acknowledge([firstId], { reason: "accepted" });

  expect(result).toEqual({ removedIds: [firstId], remainingIds: [secondId] });
  expect(ledger.conflicts.get(firstId)).toBeNull();
  expect(ledger.conflicts.get(secondId)).not.toBeNull();
  expect(ledger.conflicts.list().map((rec) => rec.id)).toEqual([secondId]);
  expect(events.at(-1).removedIds).toEqual([firstId]);
  expect(events.at(-1).reason).toBe("accepted");
  expect(events.at(-1).open).toEqual([secondId]);
  expect(unsaved.hasUnsavedState()).toBe(true);
});

test("unknown and repeated ids are no-ops, and an empty list does nothing", () => {
  const id = installOne(engineConflict());
  expect(ledger.conflicts.size).toBe(1);
  const eventCount = events.length;

  expect(ledger.conflicts.acknowledge([], { reason: "accepted" })).toEqual({ removedIds: [], remainingIds: [id] });
  expect(ledger.conflicts.acknowledge(["nope:1"], { reason: "accepted" })).toEqual({ removedIds: [], remainingIds: [id] });
  expect(events).toHaveLength(eventCount);
  expect(ledger.conflicts.size).toBe(1);

  expect(ledger.conflicts.acknowledge([id, id], { reason: "reverted" })).toEqual({ removedIds: [id], remainingIds: [] });
  expect(events).toHaveLength(eventCount + 1);
  expect(ledger.conflicts.size).toBe(0);
  expect(unsaved.hasUnsavedState()).toBe(false);
});

test("acknowledge demands an array and one of the three reasons", () => {
  const id = installOne(engineConflict());

  expect(() => ledger.conflicts.acknowledge(id, { reason: "accepted" })).toThrow(TypeError);
  expect(() => ledger.conflicts.acknowledge([id])).toThrow(TypeError);
  expect(() => ledger.conflicts.acknowledge([id], {})).toThrow(TypeError);
  expect(() => ledger.conflicts.acknowledge([id], { reason: "snoozed" })).toThrow(TypeError);
  expect(ledger.conflicts.size).toBe(1);
  expect(unsaved.hasUnsavedState()).toBe(true);
});

test("a claim hides nothing from the list or the close warning", () => {
  const id = installOne(engineConflict());

  ledger.conflicts.claim([id], { owner: "notice" });

  expect(ledger.conflicts.get(id).claimedBy).toBe("notice");
  expect(ledger.conflicts.list().map((rec) => rec.id)).toEqual([id]);
  expect(ledger.conflicts.size).toBe(1);
  expect(unsaved.hasUnsavedState()).toBe(true);
  expect(events.at(-1).updatedIds).toEqual([id]);
  expect(events.at(-1).reason).toBe("claimed");
  expect(events.at(-1).open).toEqual([id]);
});

test("a second owner cannot claim what the first holds, and a repeat claim acquires nothing", () => {
  const id = installOne(engineConflict());
  const lease = ledger.conflicts.claim([id], { owner: "first" });

  expect(() => ledger.conflicts.claim([id], { owner: "second" })).toThrow(/already claimed by first/);
  expect(ledger.conflicts.get(id).claimedBy).toBe("first");

  // The same owner asking again gets a lease, but not the right to release it.
  const repeat = ledger.conflicts.claim([id], { owner: "first" });
  repeat.release();
  expect(ledger.conflicts.get(id).claimedBy).toBe("first");

  lease.release();
  expect(ledger.conflicts.get(id).claimedBy).toBeNull();
});

test("a batch claim that names one owned id changes nothing at all", () => {
  const freeId = installOne(engineConflict());
  const ownedId = installOne(engineConflict());
  ledger.conflicts.claim([ownedId], { owner: "other" });
  const eventCount = events.length;

  expect(() => ledger.conflicts.claim([freeId, ownedId], { owner: "writer" }))
    .toThrow(/already claimed by other/);

  expect(ledger.conflicts.get(freeId).claimedBy).toBeNull();
  expect(ledger.conflicts.get(ownedId).claimedBy).toBe("other");
  expect(events).toHaveLength(eventCount);
});

test("the apply is released with its last acknowledgement, and installs nothing after", () => {
  const root = document.createElement("html");
  const applyId = ledger.beginApply({ source: "peer", seq: 8, etag: "E7", domain: "sync", root });
  const losses = [engineConflict(), engineConflict({ kind: "attr" })];

  const ids = ledger.completeApply(applyId, losses, { ticket: 3 });
  expect(ids).toHaveLength(2);
  expect(ledger.conflicts.recoveryOf(ids[0])).not.toBeNull();

  ledger.conflicts.acknowledge(ids, { reason: "accepted" });
  expect(ledger.conflicts.size).toBe(0);
  expect(ledger.conflicts.recoveryOf(ids[0])).toBeNull();
  expect(ledger.conflicts.recoveryOf(ids[1])).toBeNull();

  // The apply entry went with its last record: a later report against it has
  // nothing to install onto, which is only true if the entry was deleted.
  expect(ledger.completeApply(applyId, [engineConflict()], { ticket: 4 })).toEqual([]);
  expect(ledger.conflicts.size).toBe(0);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
});

test("release twice is harmless and frees only the ids its own call took", () => {
  const firstId = installOne(engineConflict());
  const secondId = installOne(engineConflict());
  const firstLease = ledger.conflicts.claim([firstId], { owner: "notice" });
  ledger.conflicts.claim([secondId], { owner: "notice" });

  firstLease.release();
  firstLease.release();

  expect(ledger.conflicts.get(firstId).claimedBy).toBeNull();
  expect(ledger.conflicts.get(secondId).claimedBy).toBe("notice");
  expect(events.at(-1).updatedIds).toEqual([firstId]);
  expect(events.at(-1).reason).toBe("released");
});

test("a claimed record can still be acknowledged", () => {
  const id = installOne(engineConflict());
  const lease = ledger.conflicts.claim([id], { owner: "notice" });
  expect(unsaved.hasUnsavedState()).toBe(true);

  const result = ledger.conflicts.acknowledge([id], { reason: "reconciled" });

  expect(result.removedIds).toEqual([id]);
  expect(ledger.conflicts.size).toBe(0);
  expect(unsaved.hasUnsavedState()).toBe(false);

  const eventCount = events.length;
  lease.release();
  expect(events).toHaveLength(eventCount);
});

test("an apply in flight alone makes the close warning fire", () => {
  expect(unsaved.hasUnsavedState()).toBe(false);

  ledger.beginApply({ source: "peer", seq: 4, etag: "E4", domain: "sync", root: document.createElement("html") });

  expect(ledger.conflicts.hasPendingApply()).toBe(true);
  expect(ledger.conflicts.size).toBe(0);
  expect(unsaved.hasUnsavedState()).toBe(true);
});

test("the warning never blinks false between an apply beginning and its conflicts landing", () => {
  const seen = [];
  const onUnsavedChanged = () => seen.push(unsaved.hasUnsavedState());
  document.addEventListener("clay:unsaved-state-changed", onUnsavedChanged);
  try {
    const applyId = ledger.beginApply({
      source: "peer", seq: 5, etag: "E5", domain: "sync", root: document.createElement("html"),
    });
    const ids = ledger.completeApply(applyId, [engineConflict()], { ticket: 6 });

    expect(ids).toHaveLength(1);
    expect(ledger.conflicts.get(ids[0])).not.toBeNull();
    expect(seen.length).toBe(2);
    expect(seen).not.toContain(false);
    expect(seen.at(-1)).toBe(true);
    expect(ledger.conflicts.hasPendingApply()).toBe(false);
    expect(unsaved.hasUnsavedState()).toBe(true);
  } finally {
    document.removeEventListener("clay:unsaved-state-changed", onUnsavedChanged);
  }
});

test("an apply that ends with no loss leaves the warning off", () => {
  const applyId = ledger.beginApply({
    source: "peer", seq: 6, etag: "E6", domain: "sync", root: document.createElement("html"),
  });
  expect(unsaved.hasUnsavedState()).toBe(true);

  ledger.completeApply(applyId, [engineConflict({ recovery: { key: "k9", localLost: false } })], { ticket: 2 });

  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(ledger.conflicts.size).toBe(0);
  expect(unsaved.hasUnsavedState()).toBe(false);
});

test("a failed apply installs one apply-incomplete record holding the apply's root", () => {
  const root = document.createElement("html");
  const applyId = ledger.beginApply({ source: "disk", seq: null, etag: "E7", domain: "save", root });

  const ids = ledger.failApply(applyId, new Error("morph threw"), { ticket: 12 });

  expect(ids).toHaveLength(1);
  const rec = ledger.conflicts.get(ids[0]);
  expect(rec).not.toBeNull();
  expect(rec.kind).toBe("apply-incomplete");
  expect(rec.detail).toBeNull();
  expect(rec.error).toBe("Error: morph threw");
  expect(rec.rawReports).toEqual([]);
  expect(rec.source).toBe("disk");
  expect(rec.ticket).toBe(12);
  expect(rec.applyId).toBe(applyId);
  expect(ledger.conflicts.recoveryOf(ids[0]).root).toBe(root);
  expect(ledger.conflicts.hasPendingApply()).toBe(false);
  expect(unsaved.hasUnsavedState()).toBe(true);

  const result = ledger.conflicts.acknowledge(ids, { reason: "reconciled" });

  expect(result).toEqual({ removedIds: ids, remainingIds: [] });
  expect(ledger.conflicts.recoveryOf(ids[0])).toBeNull();
  expect(unsaved.hasUnsavedState()).toBe(false);
});

test("recoveryOf hands back the clone the merge read, and drops it with the last acknowledgement", () => {
  const root = document.createElement("html");
  const applyId = ledger.beginApply({ source: "peer", seq: 9, etag: "E8", domain: "sync", root });

  const ids = ledger.completeApply(applyId, [engineConflict(), engineConflict({ kind: "attr" })], { ticket: 5 });

  expect(ids).toHaveLength(2);
  const recovery = ledger.conflicts.recoveryOf(ids[0]);
  expect(recovery).not.toBeNull();
  expect(recovery.root).toBe(root);
  expect(recovery.id).toBe(applyId);
  expect(recovery.source).toBe("peer");
  expect(recovery.seq).toBe(9);
  expect(recovery.etag).toBe("E8");
  expect(recovery.domain).toBe("sync");
  expect(ledger.conflicts.recoveryOf(ids[1])).toBe(recovery);
  expect(ledger.conflicts.recoveryOf("nope:1")).toBeNull();

  ledger.conflicts.acknowledge([ids[0]], { reason: "accepted" });
  expect(ledger.conflicts.recoveryOf(ids[0])).toBeNull();
  expect(ledger.conflicts.recoveryOf(ids[1])).toBe(recovery);
  expect(unsaved.hasUnsavedState()).toBe(true);

  ledger.conflicts.acknowledge([ids[1]], { reason: "reverted" });
  expect(ledger.conflicts.recoveryOf(ids[1])).toBeNull();
  expect(unsaved.hasUnsavedState()).toBe(false);
});
