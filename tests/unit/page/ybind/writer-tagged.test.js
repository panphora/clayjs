globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, blocksFromYValue, removeKey, parseGoneIntents, textDeleteKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const { EditorState } = pmState;

const open = (blocks) => {
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), {
    state: EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  return { binding, view, pd: binding.pd };
};

const texts = (view) => { const out = []; view.state.doc.forEach((n) => out.push(n.textContent)); return out; };
const vectorOf = (ydoc) => [...Y.decodeStateVector(Y.encodeStateVector(ydoc)).entries()].sort((a, b) => a[0] - b[0]);
const keysOf = (pd, id) => {
  const keys = [];
  for (let it = pd.flow._start; it; it = it.right) if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) keys.push(`${it.id.client}.${it.id.clock}`);
  return keys;
};
const textAfter = (pd, id) => {
  let seen = false;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) { seen = true; continue; }
    if (seen && it.content instanceof Y.ContentString) return { client: it.id.client, clock: it.id.clock };
    if (seen) return null;
  }
  return null;
};
const markerAt = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return { at, key: `${it.id.client}.${it.id.clock}` };
    at += it.length;
  }
  throw new Error(`Missing marker ${id}`);
};
const exchange = (a, b) => {
  const ua = Y.encodeStateAsUpdateV2(a);
  const ub = Y.encodeStateAsUpdateV2(b);
  Y.applyUpdateV2(a, ub, NET);
  Y.applyUpdateV2(b, ua, NET);
};
const reload = (ydoc) => {
  const doc = new Y.Doc();
  doc.clientID = 424242;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(ydoc));
  expect(() => blocksFromYValue(yValueOf(doc))).not.toThrow();
  return doc;
};
const removalEntries = (pd) => [...pd.gone.entries()].filter(([key]) => JSON.parse(key)[0] === "remove");
const runs = (record) => record.blocks.flatMap((block) => block.runs);
const seed = () => [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }];

test("a whole q deletion writes exactly one tagged record at S(q) with the pre-write vector and r as end", () => {
  const { binding, view, pd } = open(seed());
  const q = markerAt(pd, "q");
  const r = markerAt(pd, "r");
  const before = vectorOf(pd.ydoc);
  const pos = view.state.doc.child(0).nodeSize;
  const node = view.state.doc.child(1);
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
  expect(texts(view)).toEqual(["ALPHA", "OMEGA"]);
  expect([...pd.gone.entries()]).toHaveLength(1);
  const [key, value] = [...pd.gone.entries()][0];
  const [kind, source, operationId] = JSON.parse(key);
  expect(kind).toBe("remove");
  expect(source).toBe(q.key);
  expect(typeof operationId).toBe("string");
  expect(operationId.length).toBeGreaterThan(0);
  expect(key).toBe(removeKey(q.key, operationId));
  expect(value.blockId).toBe("q");
  expect(value.end).toBe(r.key);
  expect(value.sv).toEqual(before);
  expect(binding.stats.mismatch).toBe(0);
  expect(binding.recoverable).toEqual([]);
  reload(pd.ydoc);
});

test("a concurrent unseen X under a locally removed q stays a shared recovery candidate through Undo and Redo", () => {
  const { binding, view, pd } = open(seed());
  const q = markerAt(pd, "q");

  const peer = new Y.Doc();
  peer.clientID = 100;
  Y.applyUpdateV2(peer, Y.encodeStateAsUpdateV2(pd.ydoc), NET);
  peer.getText("flow").insert(q.at + 1, "X");

  const pos = view.state.doc.child(0).nodeSize;
  const node = view.state.doc.child(1);
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
  expect(texts(view)).toEqual(["ALPHA", "OMEGA"]);
  reload(pd.ydoc);

  exchange(pd.ydoc, peer);
  expect(texts(view)).toEqual(["ALPHA", "OMEGA"]);
  const record = binding.recoverable.find((candidate) => candidate.source === q.key);
  expect(record).toBeTruthy();
  expect(record.blockId).toBe("q");
  expect(runs(record).filter((run) => !run.baseline).map((run) => run.text)).toEqual(["X"]);
  reload(pd.ydoc);

  expect(binding.undo()).toBe(true);
  exchange(pd.ydoc, peer);
  expect(texts(view)).toEqual(["ALPHA", "Xbravo", "OMEGA"]);
  expect(binding.recoverable).toEqual([]);
  reload(pd.ydoc);

  expect(binding.redo()).toBe(true);
  expect(texts(view)).toEqual(["ALPHA", "OMEGA"]);
  const redone = binding.recoverable.find((candidate) => candidate.source === q.key);
  expect(redone).toBeTruthy();
  expect(runs(redone).filter((run) => !run.baseline).map((run) => run.text)).toEqual(["X"]);
  reload(pd.ydoc);
});

test("a local replacement tags each deleted physical unit and its own Undo removes the overlapping record", () => {
  const { binding, view, pd } = open(seed());
  const text = textAfter(pd, "q");
  const before = vectorOf(pd.ydoc);
  const start = view.state.doc.child(0).nodeSize + 1;
  view.dispatch(view.state.tr.insertText("X", start + 2, start + 4));
  expect(texts(view)).toEqual(["ALPHA", "brXo", "OMEGA"]);

  const records = parseGoneIntents(pd.gone).textDeletes;
  expect(records).toHaveLength(1);
  const [kind, client, clock, operationId] = JSON.parse(records[0].key);
  expect(kind).toBe("text-delete");
  expect(operationId.length).toBeGreaterThan(0);
  expect(records[0].key).toBe(textDeleteKey(client, clock, operationId));
  expect([client, clock, records[0].length, records[0].actor, records[0].sv]).toEqual([text.client, text.clock + 2, 2, pd.ydoc.clientID, before]);
  expect(binding.stats.mismatch).toBe(0);
  reload(pd.ydoc);

  expect(binding.undo()).toBe(true);
  expect(texts(view)).toEqual(["ALPHA", "bravo", "OMEGA"]);
  expect(parseGoneIntents(pd.gone).textDeletes).toEqual([]);
  expect(binding.stats.mismatch).toBe(0);
  reload(pd.ydoc);
});

test("a whole duplicate-q removal tags both old physical copies with one operation and never tags a new marker", () => {
  const { binding, view, pd } = open(seed());
  const q = markerAt(pd, "q");
  pd.ydoc.transact(() => pd.flow.insertEmbed(q.at, { b: "q" }), NET);
  const copies = keysOf(pd, "q");
  expect(copies).toHaveLength(2);
  expect(texts(view)).toEqual(["ALPHA", "bravo", "OMEGA"]);

  const before = vectorOf(pd.ydoc);
  const pos = view.state.doc.child(0).nodeSize;
  const node = view.state.doc.child(1);
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).insert(pos, schema.nodes.paragraph.create({ id: "z" }, schema.text("Z"))));
  expect(texts(view)).toEqual(["ALPHA", "Z", "OMEGA"]);

  const entries = removalEntries(pd);
  expect(entries).toHaveLength(2);
  const parsed = entries.map(([key, value]) => ({ key, value, parts: JSON.parse(key) }));
  expect(new Set(parsed.map((entry) => entry.value.blockId))).toEqual(new Set(["q"]));
  expect(new Set(parsed.map((entry) => entry.parts[1]))).toEqual(new Set(copies));
  expect(new Set(parsed.map((entry) => entry.parts[2])).size).toBe(1);
  expect(parsed.every((entry) => JSON.stringify(entry.value.sv) === JSON.stringify(before))).toBe(true);
  expect(parsed.every((entry) => entry.key === removeKey(entry.parts[1], entry.parts[2]))).toBe(true);
  const z = keysOf(pd, "z");
  expect(z).toHaveLength(1);
  expect(parsed.some((entry) => entry.parts[1] === z[0] || entry.value.blockId === "z")).toBe(false);
  expect(binding.stats.mismatch).toBe(0);
  reload(pd.ydoc);
});
