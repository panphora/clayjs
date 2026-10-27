// Scenario: what a page checkpoint covers, and what a capsule rebuilds.
//
// Neither question can be answered by a state vector. Inserting `abc` and deleting `b`
// leaves the vector where it was while the bytes carry the deletion, and a peer update a
// local insert was built on is a prerequisite a replay cannot invent. So coverage is a
// byte comparison over a strictly decoded checkpoint, and a capsule is replayed from its
// base, its received dependencies and its own bytes into a fresh Y.Doc — no room, no
// store, no host — then read back through the strict decoder.

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { toBase64, fromBase64 } from "../../../../src/vendor/yjs.vendor.js";
import { LOCAL, NET, createPageDoc } from "../../../../src/page/ybind/layout.js";
import { docFromValue } from "../../../../src/page/ybind/provider.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import {
  PageProofError,
  canonicalPageBytes,
  containsUpdate,
  digestHex,
  equalBytes,
  pageProof,
  validatePageCheckpoint,
} from "../../../../src/page/ybind/recovery-proof.js";
import {
  PageReplayError,
  accumulateCapsule,
  admitCapsule,
  reconstructPage,
  replayPageValue,
} from "../../../../src/page/ybind/recovery-replay.js";
import { lineageOf, sameLineage } from "../../../../src/page/ybind/lineage.js";
import { sameAuthority } from "../../../../src/recovery/identity.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const FIXTURE = JSON.parse(readFileSync(new URL("../../../fixtures/page/recovery/capsule.json", import.meta.url), "utf8"));
const ACCEPTED = { authority: FIXTURE.context.authority, lineage: FIXTURE.context.lineage };
const RECEIPT = { file: "doc.html", pageState: "doc.page-state" };

const bytesOf = (text) => fromBase64(text);
const stateOf = (doc) => ({ v: 1, g: 0, y: { seed: toBase64(Y.encodeStateAsUpdateV2(doc)) } });
const textOf = (state) => docFromValue(state).getText("flow").toString();
const modelOf = (state) => blocksFromYValue(state);
const svOf = (doc) => [...Y.decodeStateVector(Y.encodeStateVector(doc)).entries()];
const page = (clientID) => { const doc = new Y.Doc(); doc.clientID = clientID; return doc; };

const capsuleOf = (over = {}) => ({
  ...FIXTURE.capsule,
  payload: { base: bytesOf(FIXTURE.capsule.payload.base), dependencies: new Uint8Array(0), owned: new Uint8Array(0) },
  ...over,
});
const batchesOf = () => FIXTURE.batches.map((batch) => ({ ...batch, payload: bytesOf(batch.payload) }));
const recordsOf = (batches) => batches.map((batch) => ({ id: batch.id, revision: batch.revision, update: batch.payload, context: batch.context }));

const proofOf = (state, records, over = {}) => pageProof({
  capture: "capture-1",
  records,
  accepted: ACCEPTED,
  article: "<article data-page>ac from the room</article>",
  state,
  receipt: RECEIPT,
  ...over,
});

// One doc that types `ab`, one that types `abc` and then deletes the `b`: the same state
// vector, the same text, and only one of them owns the deletion.
const counterexample = () => {
  const typed = page(5);
  const updates = [];
  typed.on("updateV2", (u) => updates.push(u));
  typed.getText("flow").insert(0, "abc");
  const inserted = Y.encodeStateAsUpdateV2(typed);
  typed.getText("flow").delete(1, 1);
  return { typed, updates, inserted, deleted: Y.encodeStateAsUpdateV2(typed) };
};

test("an insertion is covered and the deletion that follows it is not", async () => {
  const { typed, updates, inserted, deleted } = counterexample();
  const before = new Y.Doc();
  Y.applyUpdateV2(before, inserted);
  expect(textOf(stateOf(typed))).toBe("ac");
  expect(textOf(stateOf(before))).toBe("abc");
  expect(svOf(typed)).toEqual(svOf(before));

  expect(containsUpdate(inserted, updates[0], Y)).toBe(true);
  expect(containsUpdate(inserted, updates[1], Y)).toBe(false);
  expect(containsUpdate(deleted, updates[0], Y)).toBe(true);
  expect(containsUpdate(deleted, updates[1], Y)).toBe(true);
  expect(equalBytes(inserted, deleted)).toBe(false);

  const records = [{ id: "typed", revision: 1, update: updates[0], context: FIXTURE.context }, { id: "removed", revision: 2, update: updates[1], context: FIXTURE.context }];
  const saved = await proofOf(stateOf(typed), records);
  expect(await validatePageCheckpoint(saved, [{ id: "typed", revision: 1 }, { id: "removed", revision: 2 }])).toEqual([{ id: "typed", revision: 1 }, { id: "removed", revision: 2 }]);
  const older = await proofOf(stateOf(before), records);
  expect(await validatePageCheckpoint(older, [{ id: "typed", revision: 1 }, { id: "removed", revision: 2 }])).toEqual([{ id: "typed", revision: 1 }]);
});

test("a received dependency is what lets a local insert be replayed", () => {
  const baseDoc = page(3);
  baseDoc.getText("flow").insert(0, "ab");
  const baseBytes = Y.encodeStateAsUpdateV2(baseDoc);

  const peer = page(9);
  Y.applyUpdateV2(peer, baseBytes);
  let received = null;
  peer.on("updateV2", (u) => { received = u; });
  peer.getText("flow").insert(1, "X");

  const local = page(7);
  const owned = [];
  local.on("updateV2", (u, origin) => { if (origin === LOCAL) owned.push(u); });
  Y.applyUpdateV2(local, baseBytes, NET);
  Y.applyUpdateV2(local, received, NET);
  Y.transact(local, () => local.getText("flow").insert(2, "Y"), LOCAL);

  const capsule = { kind: "binary", version: 1, context: FIXTURE.context, payload: { base: baseBytes, dependencies: new Uint8Array(0), owned: new Uint8Array(0) } };
  const dependency = { kind: "binary-batch", capsuleId: capsule.id, id: "dep", revision: 1, origin: "dependency", payload: received };
  const localBatches = owned.map((u, i) => ({ kind: "binary-batch", capsuleId: capsule.id, id: `own-${i}`, revision: i + 2, origin: "local", payload: u }));

  // Replaying the local bytes alone leaves pending structs: the insert was built on `X`.
  expect(() => replayPageValue({ capsule, batches: localBatches })).toThrow(PageReplayError);
  // With the received dependency the whole page comes back, `aXYb` and no pending structs.
  const rebuilt = replayPageValue({ capsule, batches: [...localBatches, dependency] });
  const reordered = replayPageValue({ capsule, batches: [dependency, ...localBatches] });
  expect(textOf(rebuilt)).toBe("aXYb");
  expect(equalBytes(canonicalPageBytes(rebuilt), canonicalPageBytes(reordered))).toBe(true);
  const doc = docFromValue(rebuilt, { strict: true });
  expect(doc.store.pendingStructs ?? null).toBe(null);
  expect(doc.store.pendingDs ?? null).toBe(null);
  doc.destroy();
});

test("a delete-only journal and an empty document replay exactly", async () => {
  const doc = page(5);
  const owned = [];
  doc.on("updateV2", (u, origin) => { if (origin === LOCAL) owned.push(u); });
  doc.getText("flow").insert(0, "gone");
  const base = Y.encodeStateAsUpdateV2(doc);
  Y.transact(doc, () => doc.getText("flow").delete(0, 4), LOCAL);

  const capsule = { kind: "binary", version: 1, context: FIXTURE.context, payload: { base, dependencies: new Uint8Array(0), owned: new Uint8Array(0) } };
  const batches = [{ kind: "binary-batch", capsuleId: capsule.id, id: "only", revision: 1, origin: "local", payload: owned[0] }];
  expect(replayPageValue({ capsule, batches })).toEqual(stateOf(doc));
  expect(textOf(replayPageValue({ capsule, batches }))).toBe("");

  const deleted = await pageProof({ capture: "capture-delete", records: [{ id: "only", revision: 1, update: owned[0], context: FIXTURE.context }], accepted: ACCEPTED, article: "", state: stateOf(doc), receipt: RECEIPT });
  expect(await validatePageCheckpoint(deleted, [{ id: "only", revision: 1 }])).toEqual([{ id: "only", revision: 1 }]);

  const empty = new Y.Doc();
  const nothing = { kind: "binary", version: 1, context: FIXTURE.context, payload: { base: new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) } };
  expect(reconstructPage({ capsule: nothing, batches: [] })).toEqual({});
  expect(replayPageValue({ capsule: nothing })).toEqual(stateOf(empty));
});

test("the same visible text with a different history is not covered", async () => {
  const { typed, updates, deleted } = counterexample();
  const other = page(6);
  other.getText("flow").insert(0, "ac");

  expect(textOf(stateOf(other))).toBe("ac");
  expect(textOf(stateOf(typed))).toBe("ac");
  expect(modelOf(stateOf(other))).toEqual(modelOf(stateOf(typed)));
  expect(svOf(other)).not.toEqual(svOf(typed));

  const proof = await proofOf(stateOf(other), [{ id: "typed", revision: 1, update: updates[0], context: FIXTURE.context }]);
  expect(await validatePageCheckpoint(proof, [{ id: "typed", revision: 1 }])).toEqual([]);
  const own = await proofOf(stateOf(typed), [{ id: "typed", revision: 1, update: updates[0], context: FIXTURE.context }]);
  expect(await validatePageCheckpoint(own, [{ id: "typed", revision: 1 }])).toEqual([{ id: "typed", revision: 1 }]);
  expect(equalBytes(deleted, Y.encodeStateAsUpdateV2(typed))).toBe(true);
});

test("out-of-order batches replay, and a duplicate one changes nothing", () => {
  const capsule = capsuleOf();
  const batches = batchesOf();
  const inOrder = accumulateCapsule({ capsule, batches });
  const reversed = accumulateCapsule({ capsule, batches: [...batches].reverse() });
  for (const key of ["base", "dependencies", "owned"]) expect(equalBytes(inOrder[key], reversed[key])).toBe(true);

  const model = reconstructPage({ capsule, batches });
  expect(model).toEqual(FIXTURE.model);
  expect(Object.keys(model)).toHaveLength(28);

  const doubled = [...batches, ...batches.map((batch) => ({ ...batch, id: `${batch.id}-again` }))];
  expect(reconstructPage({ capsule, batches: doubled })).toEqual(model);
  expect(equalBytes(accumulateCapsule({ capsule, batches: doubled }).owned, inOrder.owned)).toBe(true);

  const withoutDependency = batches.filter((batch) => batch.origin === "local");
  expect(() => replayPageValue({ capsule, batches: withoutDependency })).toThrow(PageReplayError);
  expect(() => replayPageValue({ capsule, batches: withoutDependency })).toThrow(/missing a prerequisite/);
});

test("corrupt bytes and an incomplete multipart checkpoint keep the record", async () => {
  const capsule = capsuleOf();
  const corrupt = [...batchesOf()];
  corrupt[0] = { ...corrupt[0], payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7]) };
  expect(() => replayPageValue({ capsule, batches: corrupt })).toThrow();

  const good = FIXTURE.checkpoint.y.seed;
  const third = Math.floor(good.length / 3);
  const parts = [good.slice(0, third), good.slice(third, 2 * third), good.slice(2 * third)];
  const whole = { v: 1, g: 0, y: { "seed.0.3": parts[0], "seed.1.3": parts[1], "seed.2.3": parts[2] } };
  const missing = { v: 1, g: 0, y: { "seed.0.3": parts[0], "seed.2.3": parts[2] } };
  const batches = batchesOf();
  expect(reconstructPage({ capsule: capsuleOf(), batches })).toEqual(blocksFromYValue(whole));
  const wholeProof = await proofOf(whole, recordsOf(batches));
  expect(await validatePageCheckpoint(wholeProof, [{ id: "rec-2", revision: 2 }])).toEqual([{ id: "rec-2", revision: 2 }]);
  // A proof naming a state with one part of a multipart update missing proves nothing.
  const missingProof = { ...wholeProof, state: missing };
  await expect(validatePageCheckpoint(missingProof, [{ id: "rec-2", revision: 2 }])).rejects.toThrow(PageProofError);
  await expect(validatePageCheckpoint(missingProof, [{ id: "rec-2", revision: 2 }])).rejects.toThrow(/Incomplete Yjs update/);
  await expect(pageProof({ capture: "capture-1", records: recordsOf(batches), accepted: ACCEPTED, article: "", state: missing, receipt: RECEIPT })).rejects.toThrow(/Incomplete Yjs update/);
  const broken = { ...wholeProof, state: { v: 1, g: 0, y: { seed: "not base64 at all!" } } };
  await expect(validatePageCheckpoint(broken, [{ id: "rec-2", revision: 2 }])).rejects.toThrow(/does not decode/);
});

test("a record written under another generation or another account is never retired", async () => {
  const batches = batchesOf();
  const records = recordsOf(batches);
  const foreign = { ...FIXTURE.context, lineage: { ...FIXTURE.context.lineage, generation: "gen-8" } };
  const elsewhere = { ...FIXTURE.context, authority: { ...FIXTURE.context.authority, principalId: "acct-2" } };
  const moved = records.map((record, index) => (index === 0 ? { ...record, context: foreign } : record));
  const relogged = records.map((record, index) => (index === 0 ? { ...record, context: elsewhere } : record));
  const asked = records.map(({ id, revision }) => ({ id, revision }));

  const all = await proofOf(FIXTURE.checkpoint, records);
  expect(await validatePageCheckpoint(all, asked)).toEqual(asked);
  const stale = await proofOf(FIXTURE.checkpoint, moved);
  expect(await validatePageCheckpoint(stale, asked)).toEqual(asked.slice(1));
  const other = await proofOf(FIXTURE.checkpoint, relogged);
  expect(await validatePageCheckpoint(other, asked)).toEqual(asked.slice(1));
});

test("a proof names the capture, the saved pair and the exact bytes", async () => {
  const batches = batchesOf();
  const records = recordsOf(batches);
  const asked = [{ id: "rec-2", revision: 2 }];
  const proof = await proofOf(FIXTURE.checkpoint, records);

  expect(await validatePageCheckpoint(proof, asked)).toEqual(asked);
  expect(await validatePageCheckpoint(proof, [{ id: "rec-2", revision: 3 }, { id: "unknown", revision: 1 }, { id: "rec-2", revision: 2 }])).toEqual(asked);
  expect(proof.stateDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(proof.articleDigest).toBe(await digestHex(new TextEncoder().encode(proof.article)));

  await expect(validatePageCheckpoint(null, asked)).rejects.toThrow(/needs a proof/);
  await expect(validatePageCheckpoint({ ...proof, saved: false }, asked)).rejects.toThrow(/save that succeeded/);
  await expect(validatePageCheckpoint({ ...proof, capture: "" }, asked)).rejects.toThrow(/the capture it saved/);
  await expect(validatePageCheckpoint({ ...proof, receipt: { file: "doc.html" } }, asked)).rejects.toThrow(/persisted file and page-state pair/);
  await expect(validatePageCheckpoint({ ...proof, state: stateOf(new Y.Doc()) }, asked)).rejects.toThrow(/not the one the proof was made over/);
  await expect(validatePageCheckpoint({ ...proof, article: "<article data-page>other</article>" }, asked)).rejects.toThrow(/not the one the proof was made over/);
  await expect(validatePageCheckpoint({ ...proof, records: [{ id: "rec-2", revision: 2 }] }, asked)).rejects.toThrow(/bytes each record owns/);
});

test("a garbage-collected checkpoint still covers the merged delete intervals", async () => {
  const doc = page(3);
  const updates = [];
  doc.on("updateV2", (u) => updates.push(u));
  doc.getText("flow").insert(0, "hello world");
  doc.getText("flow").delete(0, 5);
  doc.getText("flow").delete(0, 1);

  const ranges = [...Y.createDeleteSetFromStructStore(doc.store).clients.values()].flat().map((range) => [range.clock, range.len]);
  expect(ranges).toEqual([[0, 6]]);
  expect(textOf(stateOf(doc))).toBe("world");
  for (const update of updates) expect(containsUpdate(Y.encodeStateAsUpdateV2(doc), update, Y)).toBe(true);

  const records = updates.map((update, index) => ({ id: `gc-${index}`, revision: index + 1, update, context: FIXTURE.context }));
  const proof = await proofOf(stateOf(doc), records);
  const asked = records.map(({ id, revision }) => ({ id, revision }));
  expect(await validatePageCheckpoint(proof, asked)).toEqual(asked);

  const rebuilt = reconstructPage({ capsule: { id: "capsule", kind: "binary", version: 1, context: FIXTURE.context, payload: { base: new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) } }, batches: records.map((record) => ({ kind: "binary-batch", capsuleId: "capsule", id: record.id, revision: record.revision, origin: "local", payload: record.update })) });
  expect(rebuilt).toEqual({ "~start": { t: "paragraph", pos: "00000001", c: "world" } });
});

test("moves, tables, opaque marks and origins come back whole from the recorded capsule", async () => {
  const capsule = capsuleOf();
  const batches = batchesOf();
  const restored = reconstructPage({ capsule, batches });
  expect(restored).toEqual(FIXTURE.model);
  expect(Object.keys(restored)).toEqual(["h", "empty", "p1", "p2", "h2", "l1", "l2", "l3", "l4", "l5", "l6", "c1", "c2", "co", "tg", "tb1", "tb2", "tg2", "tb3", "after", "code", "hr", "img", "tbl", "ch", "bd", "tool", "pre"]);
  expect(restored.tbl.rows.r3).toEqual({ pos: "3", cells: { c1: "Oct 5" } });
  expect(restored.after.c).toBe("ac from the roomBack at the top");
  expect(restored.after.m).toEqual([[2, "x[\"annotation\",{\"thread\":\"t-1\"}]"], [29, ""]]);
  expect(restored.ch).toEqual(FIXTURE.model.ch);
  expect(restored.tool.artifact.fallbackHtml).toBe("<p>Launch in 9 days</p>");

  const value = replayPageValue({ capsule, batches });
  expect(equalBytes(canonicalPageBytes(value), bytesOf(FIXTURE.checkpoint.y.seed))).toBe(true);
  const replayed = createPageDoc(docFromValue(value, { strict: true }));
  const accepted = createPageDoc(docFromValue(FIXTURE.checkpoint, { strict: true }));
  expect([...replayed.origins.entries()]).toEqual([...accepted.origins.entries()]);
  expect([...replayed.origins.keys()]).toEqual(["[\"boundary\",7,6]", "[\"span\",7,0]", "[\"boundary\",7,4]"]);
  replayed.ydoc.destroy();
  accepted.ydoc.destroy();
});

test("a capsule is admitted only into its own authority, account and generation", () => {
  const capsule = capsuleOf();
  const batches = batchesOf();
  const current = { context: FIXTURE.context, state: FIXTURE.checkpoint };
  const parts = admitCapsule({ capsule, batches, current });
  expect(parts.owned.length).toBeGreaterThan(0);
  expect(parts.dependencies.length).toBeGreaterThan(0);

  const generation = { ...current, context: { ...FIXTURE.context, lineage: { ...FIXTURE.context.lineage, generation: "gen-8" } } };
  expect(() => admitCapsule({ capsule, batches, current: generation })).toThrow(/another generation/);
  const account = { ...current, context: { ...FIXTURE.context, authority: { ...FIXTURE.context.authority, principalId: "acct-2" } } };
  expect(() => admitCapsule({ capsule, batches, current: account })).toThrow(/another document or account/);
  const document = { ...current, context: { ...FIXTURE.context, authority: { ...FIXTURE.context.authority, documentId: "doc-2" } } };
  expect(() => admitCapsule({ capsule, batches, current: document })).toThrow(/another document or account/);

  const replaced = page(42);
  replaced.getText("flow").insert(0, "a page rebuilt from another article");
  expect(() => admitCapsule({ capsule, batches, current: { ...current, state: stateOf(replaced) } })).toThrow(/journal's base/);

  const stranger = page(42);
  let strangerUpdate = null;
  stranger.on("updateV2", (u) => { strangerUpdate = u; });
  stranger.getText("flow").insert(0, "Z");
  const foreign = { kind: "binary", version: 1, context: FIXTURE.context, payload: { base: new Uint8Array(0), dependencies: new Uint8Array(0), owned: strangerUpdate } };
  expect(() => admitCapsule({ capsule: foreign, batches: [], current })).toThrow(/shares no ancestry/);

  const empty = { kind: "binary", version: 1, context: FIXTURE.context, payload: { base: new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) } };
  expect(() => admitCapsule({ capsule: empty, batches: [], current })).toThrow(/owns no local work/);

  expect(sameAuthority(FIXTURE.context.authority, FIXTURE.context.authority)).toBe(true);
  expect(sameAuthority(FIXTURE.context.authority, { ...FIXTURE.context.authority, principalId: null })).toBe(false);
  expect(sameAuthority(null, FIXTURE.context.authority)).toBe(false);
});

test("a capsule's recorded lineage is the digest and vector of its base", async () => {
  const base = bytesOf(FIXTURE.capsule.payload.base);
  const lineage = await lineageOf(FIXTURE.context.lineage.generation, base);
  expect(lineage).toEqual({ generation: FIXTURE.context.lineage.generation, baseDigest: FIXTURE.context.lineage.baseDigest, baseVector: Y.encodeStateVectorFromUpdateV2(base) });
  expect(sameLineage(lineage, FIXTURE.context.lineage)).toBe(true);
  expect(sameLineage(lineage, { ...lineage, generation: "gen-8" })).toBe(false);
  expect(sameLineage(lineage, { ...lineage, baseDigest: "0".repeat(64) })).toBe(false);
  expect(sameLineage(null, lineage)).toBe(false);

  const capsule = capsuleOf();
  const batches = batchesOf();
  const parts = accumulateCapsule({ capsule, batches });
  expect(parts.base.length).toBe(base.length);
  expect(parts.revision).toBe(FIXTURE.capsule.revision);
  expect(parts.context).toEqual(FIXTURE.context);
  expect(() => accumulateCapsule({ capsule: { ...capsule, kind: "text" }, batches })).toThrow(PageReplayError);
});
