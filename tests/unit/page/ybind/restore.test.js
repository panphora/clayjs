globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { toBase64 } from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, removeKey, attrKey, boundaryKey, canonicalRevision, blocksFromYValue, NET } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const open = (blocks, extra = {}) => {
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store, ...extra });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  return { store, binding, view, pd: binding.pd };
};
const texts = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.textContent)); return out; };
const ids = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.attrs.id)); return out; };
const keyIn = (flow, id) => {
  for (let it = flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const keyOf = (pd, id) => keyIn(pd.flow, id);
const indexIn = (flow, key) => {
  let at = 0;
  for (let it = flow._start; it; it = it.right) {
    if (`${it.id.client}.${it.id.clock}` === key) return at;
    if (!it.deleted && it.countable) at += it.length;
  }
  throw new Error(`Missing position ${key}`);
};
const indexAt = (pd, key) => indexIn(pd.flow, key);
const hide = (pd, sourceId, endId, operationId, sv = []) => {
  const key = keyOf(pd, sourceId);
  const end = endId ? keyOf(pd, endId) : null;
  pd.ydoc.transact(() => pd.gone.set(removeKey(key, operationId), { blockId: sourceId, end, sv }), NET);
  return key;
};
const markerCount = (pd, sourceKey) => {
  let n = 0;
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === `recovered:${sourceKey}`) n++;
  return n;
};
const vector = (ydoc) => toBase64(Y.encodeStateVector(ydoc));
const update = (ydoc) => toBase64(Y.encodeStateAsUpdateV2(ydoc));
const exchange = (a, b) => {
  const ua = Y.encodeStateAsUpdateV2(a.pd.ydoc);
  const ub = Y.encodeStateAsUpdateV2(b.pd.ydoc);
  Y.applyUpdateV2(a.pd.ydoc, ub, NET);
  Y.applyUpdateV2(b.pd.ydoc, ua, NET);
};
const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return doc;
};

const seed = () => [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }];

test("subscribeRecovery delivers an immediate snapshot, only changes, and stops after unsubscribe", () => {
  const a = open(seed());
  const events = [];
  const off = a.binding.subscribeRecovery((snapshot) => events.push(snapshot));
  expect(events).toHaveLength(1);
  expect(events[0].recoverable).toEqual([]);
  expect(events[0].notices).toEqual([]);

  a.binding.dismiss("1.0", "whatever");
  expect(events).toHaveLength(1);

  const q = hide(a.pd, "q", "r", "move-1");
  expect(events).toHaveLength(2);
  expect(events[1].recoverable.map((record) => record.source)).toEqual([q]);
  expect(events[1].notices).toEqual([]);
  expect(events[1].recoverable[0].revision).toBe(canonicalRevision(JSON.parse(events[1].recoverable[0].revision)));

  off();
  a.binding.restore(events[1].recoverable[0].source, events[1].recoverable[0].revision);
  expect(events).toHaveLength(2);
});

test("disposal stops recovery notifications", () => {
  const a = open(seed());
  const events = [];
  a.binding.subscribeRecovery((snapshot) => events.push(snapshot));
  expect(events).toHaveLength(1);
  a.binding.dispose();
  expect(events).toHaveLength(1);
});

test("a subscription receives remote recovery changes before a view attaches", () => {
  const store = createStore({ name: "page", value: seedValue(seed()) });
  const binding = createYPageBinding({ store });
  const events = [];
  binding.subscribeRecovery((snapshot) => events.push(snapshot));
  expect(events).toHaveLength(1);
  hide(binding.pd, "q", "r", "move-1");
  expect(events).toHaveLength(2);
  expect(events[1].recoverable).toHaveLength(1);
  binding.dispose();
});

test("recoverable snapshots are detached and immutable", () => {
  const a = open(seed());
  hide(a.pd, "q", "r", "move-1");
  const first = a.binding.recoverable;
  expect(first).toHaveLength(1);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first[0])).toBe(true);
  expect(Object.isFrozen(first[0].blocks)).toBe(true);
  expect(Object.isFrozen(first[0].blocks[0].runs)).toBe(true);
  expect(() => { first[0].source = "tampered"; }).toThrow();
  expect(() => { first.push({}); }).toThrow();
  const again = a.binding.recoverable;
  expect(again[0].source).toBe(first[0].source);
  expect(again[0].revision).toBe(first[0].revision);
  expect(first[0].source).not.toBe("tampered");
});

test("a visible source resolves and a stale or missing revision leaves Yjs untouched", () => {
  const a = open(seed());
  const original = keyOf(a.pd, "q");
  const originalVector = vector(a.pd.ydoc);
  expect(a.binding.restore(original, "any-revision")).toEqual({ status: "resolved", id: "q" });
  expect(vector(a.pd.ydoc)).toBe(originalVector);
  const q = hide(a.pd, "q", "r", "move-1");
  const record = a.binding.recoverable[0];
  const beforeVector = vector(a.pd.ydoc);
  const beforeUpdate = update(a.pd.ydoc);
  expect(a.binding.restore(record.source, "stale-revision")).toEqual({ status: "stale", notice: null });
  expect(a.binding.restore("999.0", "stale-revision")).toEqual({ status: "stale", notice: null });
  expect(vector(a.pd.ydoc)).toBe(beforeVector);
  expect(update(a.pd.ydoc)).toBe(beforeUpdate);

  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  const afterVector = vector(a.pd.ydoc);
  const afterUpdate = update(a.pd.ydoc);
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "resolved", id: `recovered:${q}` });
  expect(a.binding.restore(record.source, "other-revision")).toEqual({ status: "resolved", id: `recovered:${q}` });
  expect(vector(a.pd.ydoc)).toBe(afterVector);
  expect(update(a.pd.ydoc)).toBe(afterUpdate);
});

test("one Restore exposes the source once and a strict encoded reload preserves it", () => {
  const a = open(seed());
  const q = hide(a.pd, "q", "r", "move-1");
  const record = a.binding.recoverable[0];
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(texts(a.view)).toEqual(["ALPHA", "bravo", "OMEGA"]);
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);
  expect(markerCount(a.pd, q)).toBe(1);
  let marker = null;
  for (let it = a.pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === `recovered:${q}`) marker = it.id;
  expect(a.pd.origins.get(boundaryKey(marker.client, marker.clock))).toEqual({ blockId: `recovered:${q}`, kind: "restore", recoveryOf: q });
  expect(a.binding.recoverable).toEqual([]);

  const value = blocksFromYValue(yValueOf(a.pd.ydoc));
  expect(value.p.c).toBe("ALPHA");
  expect(value.r.c).toBe("OMEGA");
  expect(value[`recovered:${q}`]).toMatchObject({ t: "paragraph", c: "bravo" });
});

test("two disconnected Restores project one source and Undo of one leaves the other", () => {
  const a = open(seed());
  const b = open(seed());
  const q = hide(a.pd, "q", "r", "move-1");
  exchange(a, b);
  expect(b.binding.recoverable.map((record) => record.source)).toEqual([q]);
  const ra = a.binding.recoverable[0];
  const rb = b.binding.recoverable[0];
  expect(ra.revision).toBe(rb.revision);

  expect(a.binding.restore(ra.source, ra.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(b.binding.restore(rb.source, rb.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  exchange(a, b);
  expect(markerCount(a.pd, q)).toBe(2);
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);
  expect(ids(b.view)).toEqual(["p", `recovered:${q}`, "r"]);

  expect(a.binding.undo()).toBe(true);
  exchange(a, b);
  expect(markerCount(a.pd, q)).toBe(1);
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);
  expect(ids(b.view)).toEqual(["p", `recovered:${q}`, "r"]);
});

test("a peer insertion after Restore survives Undo and Redo under the same source", () => {
  const a = open(seed());
  const q = hide(a.pd, "q", null, "move-1");
  const record = a.binding.recoverable[0];
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);

  const peer = clone(a.pd, 777);
  peer.getText("flow").insert(indexIn(peer.getText("flow"), keyIn(peer.getText("flow"), "r")), "!");
  Y.applyUpdateV2(a.pd.ydoc, Y.encodeStateAsUpdateV2(peer), NET);
  expect(texts(a.view)).toEqual(["ALPHA", "bravo!", "OMEGA"]);
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);

  expect(a.binding.undo()).toBe(true);
  expect(ids(a.view)).toEqual(["p", "r"]);
  expect(a.pd.flow.toString()).toContain("bravo!");

  expect(a.binding.redo()).toBe(true);
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);
  expect(texts(a.view)).toEqual(["ALPHA", "bravo!", "OMEGA"]);
});

test("a peer insertion after Restore is still recoverable under the same source after Undo", () => {
  const a = open(seed());
  const q = hide(a.pd, "q", null, "move-1");
  const record = a.binding.recoverable[0];
  a.binding.restore(record.source, record.revision);
  const peer = clone(a.pd, 777);
  peer.getText("flow").insert(indexIn(peer.getText("flow"), keyIn(peer.getText("flow"), "r")), "!");
  Y.applyUpdateV2(a.pd.ydoc, Y.encodeStateAsUpdateV2(peer), NET);

  a.binding.undo();
  const recovered = a.binding.recoverable;
  expect(recovered.map((entry) => entry.source)).toEqual([q]);
  const displaced = recovered[0].blocks.flatMap((block) => block.runs).filter((run) => run.displaced);
  expect(displaced.map((run) => run.text)).toContain("!");
});

test("a later uncovered removal hides the source until a fresh Restore covers it", () => {
  const a = open(seed());
  const q = hide(a.pd, "q", "r", "move-1");
  const first = a.binding.recoverable[0];
  expect(a.binding.restore(first.source, first.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);

  hide(a.pd, "q", "r", "move-2", []);
  expect(ids(a.view)).toEqual(["p", "r"]);
  const hidden = a.binding.recoverable;
  expect(hidden.map((entry) => entry.source)).toEqual([q]);
  expect(hidden[0].revision).not.toBe(first.revision);

  expect(a.binding.restore(hidden[0].source, hidden[0].revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(ids(a.view)).toEqual(["p", `recovered:${q}`, "r"]);
});

test("raw marks, block type and flat overrides survive a Restore", () => {
  const a = open(seed());
  const q = keyOf(a.pd, "q");
  const contentAt = indexAt(a.pd, keyOf(a.pd, "q")) + 1;
  a.pd.ydoc.transact(() => a.pd.flow.format(contentAt, 3, { "strong~1-1": true }), NET);
  hide(a.pd, "q", "r", "move-1");
  a.pd.ydoc.transact(() => {
    a.pd.gone.set(attrKey(q, "t"), "heading");
    a.pd.gone.set(attrKey(q, "level"), 3);
    a.pd.gone.set(attrKey(q, "parent"), "p");
    a.pd.gone.set(attrKey(q, "src"), "x.png");
  }, NET);

  const record = a.binding.recoverable[0];
  expect(record.type).toBe("heading");
  expect(record.overrides).toEqual({ level: 3, parent: "p", src: "x.png", t: "heading" });
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });

  const node = a.view.state.doc.child(1);
  expect(node.type.name).toBe("heading");
  expect(node.attrs.id).toBe(`recovered:${q}`);
  expect(node.attrs.parent).toBe("p");
  expect(node.textContent).toBe("bravo");
  expect(node.firstChild.marks.map((mark) => mark.type.name)).toEqual(["strong"]);

  const value = blocksFromYValue(yValueOf(a.pd.ydoc));
  expect(value[`recovered:${q}`].t).toBe("heading");
  expect(value[`recovered:${q}`].level).toBe(3);
  expect(value[`recovered:${q}`].parent).toBe("p");
  expect(value[`recovered:${q}`].c).toBe("bravo");
});

test("an ordinary public ID with a recovered prefix stays ordinary", () => {
  const a = open([{ id: "p", text: "ALPHA" }, { id: "recovered:1.0", text: "ok" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  expect(ids(a.view)).toEqual(["p", "recovered:1.0", "q", "r"]);
  const q = hide(a.pd, "q", "r", "move-1");
  const record = a.binding.recoverable[0];
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  expect(ids(a.view)).toEqual(["p", "recovered:1.0", `recovered:${q}`, "r"]);
  const ordinary = a.view.state.doc.child(1);
  expect(ordinary.attrs.id).toBe("recovered:1.0");
  expect(ordinary.textContent).toBe("ok");
});

test("dismiss records local suppression without touching Yjs", () => {
  const a = open(seed());
  hide(a.pd, "q", "r", "move-1");
  const record = a.binding.recoverable[0];
  const beforeVector = vector(a.pd.ydoc);
  const beforeUpdate = update(a.pd.ydoc);
  const beforeRecords = a.binding.recoverable;
  expect(a.binding.dismiss(record.source, record.revision)).toBeUndefined();
  expect(vector(a.pd.ydoc)).toBe(beforeVector);
  expect(update(a.pd.ydoc)).toBe(beforeUpdate);
  expect(a.binding.recoverable).toEqual(beforeRecords);
  expect(a.binding.notices).toEqual([]);
});
