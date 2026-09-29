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

beforeEach(async () => {
  jest.resetModules();
  ledger = await import("../../src/sync/conflicts.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
  events = [];
  onConflictsChanged = (event) => events.push(event.detail);
  document.addEventListener("clay:sync-conflicts-changed", onConflictsChanged);
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
    engineConflict({ recovery: { key: "k2", localLost: true, applied: false } }),
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
