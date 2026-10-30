/**
 * @jest-environment node
 */
import * as Y from "../../../src/vendor/yjs.vendor.js";
import {
  COMPACTION,
  ROOM_ERROR_STATUS,
  pageShape,
  planCompaction,
  buildCandidate,
  checkUpdate,
  admitPageOps,
  unionFileEntries,
  createRangeCache,
} from "../../../src/live/page-compaction.js";
import { rangesOf, within, docRanges } from "../../../src/page/ybind/containment.js";

const tag = "12345678";
const checkpointKey = `c${tag}-1`;
const looseKey = (n) => `t${tag}-${n.toString(36)}`;
const clientKey = (n) => `u1-a-${n.toString(36)}`;
const update = (value) => Y.fromBase64(value);

const insertUpdate = (client, text) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  doc.getText("flow").insert(0, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  return encoded;
};

const deleteUpdate = (client, sources, index, length) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  for (const source of sources) Y.applyUpdateV2(doc, update(source));
  doc.getText("flow").delete(index, length);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  return encoded;
};

const setOp = (key, value) => ({ op: "set", path: ["y", key], value });
const pageState = (over = {}) => ({ compaction: 1, failed: null, retired: new Set(), ...over });

const freeze = ({ y, ops, state }) => ({
  y: JSON.parse(JSON.stringify(y)),
  ops: JSON.parse(JSON.stringify(ops)),
  state: JSON.parse(JSON.stringify({ ...state, retired: [...state.retired] })),
});

const admit = (args) => {
  const before = freeze(args);
  const result = admitPageOps({ limits: COMPACTION, ...args });
  expect(freeze(args)).toEqual(before);
  return result;
};

test("plans a tail at sixteen loose entries", () => {
  const y = {};
  for (let i = 0; i < 16; i++) y[looseKey(i)] = insertUpdate(100 + i, `entry ${i}`);
  expect(pageShape(y).normal).toBe(true);
  const plan = planCompaction(y);
  expect(plan.kind).toBe("tail");
  expect(plan.sources.map(([key]) => key)).toEqual(Object.keys(y).sort());
});

test("plans nothing below the soft threshold", () => {
  const y = {};
  for (let i = 0; i < 15; i++) y[looseKey(i)] = insertUpdate(100 + i, `entry ${i}`);
  expect(planCompaction(y)).toBeNull();
});

test("plans a full when loose bytes pass a quarter of the checkpoint", () => {
  const y = { [checkpointKey]: insertUpdate(200, "checkpoint text of some length") };
  for (let i = 0; i < 3; i++) y[looseKey(i)] = insertUpdate(300 + i, `loose ${i} `.repeat(3));
  expect(planCompaction(y)).toBeNull();
  const plan = planCompaction(y, {}, { ...COMPACTION, tailFloor: 10 });
  expect(plan.kind).toBe("full");
  expect(plan.sources.map(([key]) => key)).toEqual(Object.keys(y).sort());
});

test("plans a full when the page is out of normal form", () => {
  const y = { [checkpointKey]: insertUpdate(200, "one"), [`c${tag}-2`]: insertUpdate(201, "two") };
  y[looseKey(0)] = insertUpdate(202, "loose");
  expect(pageShape(y).checkpoints).toBe(2);
  expect(planCompaction(y).kind).toBe("full");
  const parts = { [looseKey(0)]: insertUpdate(202, "loose"), [`${looseKey(0)}.0.2`]: "AA" };
  expect(pageShape(parts).parts).toBe(1);
  expect(planCompaction(parts).kind).toBe("full");
});

test("plans a full on an overflow", () => {
  const y = {};
  for (let i = 0; i < 3; i++) y[looseKey(i)] = insertUpdate(300 + i, `entry ${i}`);
  expect(planCompaction(y)).toBeNull();
  expect(planCompaction(y, { overflow: true }).kind).toBe("full");
});

test("a tail candidate holds every source", () => {
  const sources = [];
  for (let i = 0; i < 16; i++) sources.push([looseKey(i), insertUpdate(100 + i, `entry ${i}`)]);
  const plan = planCompaction(Object.fromEntries(sources));
  const candidate = buildCandidate(plan);
  expect(candidate.failure).toBeUndefined();
  const index = rangesOf(update(candidate.update));
  for (const [, value] of sources) expect(within(index, rangesOf(update(value)))).toBe(true);
});

test("a full candidate holds every source in its stored bytes", () => {
  const insert = insertUpdate(1, "hello");
  const deletion = deleteUpdate(2, [insert], 0, 2);
  const sources = [[clientKey(0), insert], [clientKey(1), deletion]];
  const candidate = buildCandidate({ kind: "full", sources });
  expect(candidate.failure).toBeUndefined();
  const stored = new Y.Doc({ gc: true });
  try {
    Y.applyUpdateV2(stored, update(candidate.update));
    const index = docRanges(stored);
    expect(index.complete).toBe(true);
    expect(index.deletes.get(1)).toEqual([[0, 2]]);
    for (const [, value] of sources) expect(within(index, rangesOf(update(value)))).toBe(true);
  } finally {
    stored.destroy();
  }
});

test("a candidate missing one deletion fails the proof", () => {
  const insert = insertUpdate(1, "hello");
  const deletion = deleteUpdate(2, [insert], 0, 2);
  const sources = [[clientKey(0), insert], [clientKey(1), deletion]];
  const kept = sources.map(([key, value]) => [key, value]);
  kept.splice(kept.findIndex(([key]) => key === clientKey(1)), 1);
  const merged = rangesOf(Y.mergeUpdatesV2(sources.map(([, value]) => update(value))));
  const stripped = rangesOf(Y.mergeUpdatesV2(kept.map(([, value]) => update(value))));
  expect(within(merged, rangesOf(update(deletion)))).toBe(true);
  expect(within(stripped, rangesOf(update(deletion)))).toBe(false);
});

test("the stored bytes are proved, so an encode that drops a deletion fails", () => {
  const insert = insertUpdate(1, "hello");
  const deletion = deleteUpdate(2, [insert], 0, 2);
  const sources = [[clientKey(0), insert], [clientKey(1), deletion]];
  const full = buildCandidate({ kind: "full", sources });
  expect(full.failure).toBeUndefined();
  expect(typeof full.update).toBe("string");
  const check = new Y.Doc({ gc: true });
  try {
    Y.applyUpdateV2(check, update(full.update));
    expect(docRanges(check).deletes.get(1)).toEqual([[0, 2]]);
  } finally {
    check.destroy();
  }
  const stripped = buildCandidate({
    kind: "full",
    sources,
    encode: () => Y.mergeUpdatesV2([update(insert)]),
  });
  expect(stripped).toEqual({ failure: "not-covered" });
});

test("a full build with pending structs falls back to a raw merge", () => {
  const whole = new Y.Doc();
  whole.clientID = 7;
  whole.getText("flow").insert(0, "ab");
  whole.getText("flow").insert(2, "cd");
  const prefix = new Y.Doc();
  const start = new Y.Doc();
  start.clientID = 7;
  start.getText("flow").insert(0, "ab");
  Y.applyUpdateV2(prefix, Y.encodeStateAsUpdateV2(start));
  const tail = Y.toBase64(Y.encodeStateAsUpdateV2(whole, Y.encodeStateVector(prefix)));
  const candidate = buildCandidate({ kind: "full", sources: [["u7-a-1", tail]] });
  expect(candidate.pending).toBe(true);
  expect(within(rangesOf(update(candidate.update)), rangesOf(update(tail)))).toBe(true);
  start.destroy();
  prefix.destroy();
  whole.destroy();

  const deletion = deleteUpdate(3, [insertUpdate(4, "hello")], 0, 2);
  const deletionOnly = Y.toBase64(Y.encodeStateAsUpdateV2(
    (() => {
      const doc = new Y.Doc();
      Y.applyUpdateV2(doc, update(deletion));
      return doc;
    })(),
    (() => {
      const doc = new Y.Doc();
      Y.applyUpdateV2(doc, update(deletion));
      const vector = Y.encodeStateVector(doc);
      doc.destroy();
      return vector;
    })(),
  ));
  const pendingDelete = buildCandidate({ kind: "full", sources: [["u3-a-1", deletionOnly]] });
  expect(pendingDelete.pending).toBe(true);
});

test("checkUpdate refuses bad base64 and undecodable bytes", () => {
  expect(checkUpdate("not base64!!")).toBeNull();
  expect(checkUpdate("AAAAA")).toBeNull();
  expect(checkUpdate(42)).toBeNull();
  expect(checkUpdate(Y.toBase64(new Uint8Array([1, 2, 3])))).toBeNull();
});

test("checkUpdate reports deletions and inserts", () => {
  const insert = insertUpdate(1, "hello");
  expect(checkUpdate(insert)).toEqual({ deleted: 0, inserts: true });
  const deletion = deleteUpdate(2, [insert], 0, 2);
  const source = new Y.Doc();
  Y.applyUpdateV2(source, update(deletion));
  const deletionOnly = Y.toBase64(Y.encodeStateAsUpdateV2(source, Y.encodeStateVector(source)));
  source.destroy();
  expect(checkUpdate(deletionOnly)).toEqual({ deleted: 2, inserts: false });
});

const deletionOnly = (client, sources, index, length) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  for (const source of sources) Y.applyUpdateV2(doc, update(source));
  doc.getText("flow").delete(index, length);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(doc, Y.encodeStateVector(doc)));
  doc.destroy();
  return encoded;
};

test("admits a whole client key and reports what it adds", () => {
  const y = { [checkpointKey]: insertUpdate(200, "checkpoint") };
  const result = admit({ y, ops: [setOp(clientKey(0), insertUpdate(1, "hello"))], state: pageState() });
  expect(result).toMatchObject({ added: 1, deleted: 0, inserts: true, limit: COMPACTION.activeBytes });
  expect(result.shape.normal).toBe(true);
  const deleting = admit({ y, ops: [setOp(clientKey(1), deletionOnly(2, [insertUpdate(3, "hello")], 0, 2))], state: pageState() });
  expect(deleting.deleted).toBe(2);
  expect(deleting.limit).toBe(COMPACTION.activeBytes + COMPACTION.deleteReserve);
});

test("treats a set identical to the stored value as a no-op", () => {
  const value = insertUpdate(1, "hello");
  const y = { [clientKey(0)]: value };
  const result = admit({ y, ops: [setOp(clientKey(0), value)], state: pageState() });
  expect(result).toMatchObject({ added: 0, deleted: 0, inserts: false });
});

test("refuses a frame from a client that did not declare the version", () => {
  const result = admit({ y: {}, ops: [], state: pageState({ compaction: 0 }) });
  expect(result).toEqual({ error: "page-upgrade" });
  expect(ROOM_ERROR_STATUS[result.error]).toBe(404);
});

test("a room whose compaction failed admits frames against its byte limit without asking for a fold", () => {
  const result = admit({ y: {}, ops: [], state: pageState({ failed: { reason: "compaction-failed", at: 1 } }) });
  expect(result).toMatchObject({ added: 0, failed: true, shape: null });
  expect(result.limit).toBeGreaterThan(0);
});

test("refuses a deletion, a foreign key shape, a changed value and a retired key", () => {
  const value = insertUpdate(1, "hello");
  const y = { [checkpointKey]: insertUpdate(200, "checkpoint"), [clientKey(0)]: value };
  const cases = [
    [{ op: "del", path: ["y", clientKey(0)] }],
    [{ op: "del", path: ["y", checkpointKey] }],
    [setOp(checkpointKey, insertUpdate(2, "other"))],
    [setOp("legacy-edit", insertUpdate(2, "other"))],
    [setOp(clientKey(0), insertUpdate(3, "hello"))],
    [setOp(clientKey(1), insertUpdate(4, "hello"))],
  ];
  for (const ops of cases) {
    const result = admit({ y, ops, state: pageState({ retired: new Set([clientKey(1)]) }) });
    expect(result).toEqual({ error: "page-immutable" });
    expect(ROOM_ERROR_STATUS[result.error]).toBe(409);
  }
});

test("refuses a value that is not a decodable update", () => {
  for (const value of ["not base64!!", Y.toBase64(new Uint8Array([1, 2, 3])), undefined]) {
    const result = admit({ y: {}, ops: [setOp(clientKey(0), value)], state: pageState() });
    expect(result).toEqual({ error: "page-update-invalid" });
    expect(ROOM_ERROR_STATUS[result.error]).toBe(422);
  }
});

test("refuses more than four new entries in one frame", () => {
  const ops = [];
  for (let i = 0; i < 5; i++) ops.push(setOp(clientKey(i), insertUpdate(10 + i, `entry ${i}`)));
  const result = admit({ y: {}, ops, state: pageState() });
  expect(result).toEqual({ error: "page-batch" });
  expect(ROOM_ERROR_STATUS[result.error]).toBe(409);
});

test("asks for a checkpoint when the page is out of normal form", () => {
  const y = { [checkpointKey]: insertUpdate(200, "one"), [`c${tag}-2`]: insertUpdate(201, "two") };
  const result = admit({ y, ops: [setOp(clientKey(0), insertUpdate(1, "hello"))], state: pageState() });
  expect(result).toEqual({ error: "checkpoint-required", retryAfter: 0 });
  expect(ROOM_ERROR_STATUS[result.error]).toBe(503);
});

test("asks for a checkpoint when new entries would pass the loose bound", () => {
  const y = {};
  for (let i = 0; i < COMPACTION.loose; i++) y[looseKey(i)] = insertUpdate(100 + i, `entry ${i}`);
  expect(admit({ y, ops: [setOp(clientKey(0), insertUpdate(300, "hello"))], state: pageState() }))
    .toEqual({ error: "checkpoint-required", retryAfter: 0 });
});

test("the union keeps held entries and adds the rest under file keys", () => {
  const checkpoint = insertUpdate(1, "checkpoint text");
  const loose = insertUpdate(2, "loose text");
  const legacy = insertUpdate(3, "legacy edit");
  const retired = insertUpdate(4, "retired entry");
  const group = looseKey(3);
  const half = Math.ceil(legacy.length / 2);
  const y = { [checkpointKey]: checkpoint, [looseKey(1)]: loose };
  const before = JSON.parse(JSON.stringify(y));
  const fileY = {
    [checkpointKey]: checkpoint,
    [looseKey(1)]: loose,
    "legacy-copy": checkpoint,
    [clientKey(9)]: retired,
    "legacy-edit": legacy,
    [`${group}.0.2`]: legacy.slice(0, half),
    [`${group}.1.2`]: legacy.slice(half),
    [`${looseKey(4)}.0.2`]: "AA",
  };
  const adds = unionFileEntries({
    y,
    fileY,
    retired: new Set([clientKey(9)]),
    rangesFor: createRangeCache(),
    keyFor: (i) => `f${tag}-2-${i.toString(36)}`,
  });
  expect(adds).toEqual([
    [`f${tag}-2-0`, legacy],
    [`f${tag}-2-1`, legacy],
  ]);
  for (const [key, value] of adds) {
    expect(typeof key).toBe("string");
    expect(typeof value).toBe("string");
    expect(before[key]).toBeUndefined();
  }
  expect(y).toEqual(before);
});

test("the union keeps a whole file entry only when the room does not hold it", () => {
  const insert = insertUpdate(1, "hello");
  const y = { [checkpointKey]: insert };
  const adds = unionFileEntries({ y, fileY: { [checkpointKey]: insert }, retired: new Set(), rangesFor: createRangeCache() });
  expect(adds).toEqual([]);
  const stale = unionFileEntries({
    y,
    fileY: { [checkpointKey]: insert, dropped: deleteUpdate(2, [insert], 0, 1) },
    retired: new Set(),
    rangesFor: createRangeCache(),
    keyFor: (i) => `f${tag}-3-${i.toString(36)}`,
  });
  expect(stale.map(([key]) => key)).toEqual([`f${tag}-3-0`]);
  expect(stale[0][1]).toBe(deleteUpdate(2, [insert], 0, 1));
});

test("ROOM_ERROR_STATUS names every refusal with its status", () => {
  expect(ROOM_ERROR_STATUS).toEqual({
    "checkpoint-required": 503, "page-full": 409, "compaction-failed": 409,
    "page-immutable": 409, "page-batch": 409, "page-update-invalid": 422, "page-upgrade": 404,
  });
  expect(Object.isFrozen(ROOM_ERROR_STATUS)).toBe(true);
});
