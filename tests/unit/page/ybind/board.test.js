import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, removeKey, attrKey, reduceRecovery, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";
import { boardKey } from "../../../../src/page/ybind/board.js";

const COLUMNS = { todo: { pos: "1", name: "To do" }, done: { pos: "2", name: "Done" } };
const CARDS = { a: { pos: "1", col: "todo", title: "Sample inbox", owner: "Sam", due: "2026-10-20" }, b: { pos: "2", col: "done", title: "Invite flow" } };
const clone = (value) => JSON.parse(JSON.stringify(value));
const blocks = () => [{ id: "p", text: "Before" }, { id: "bd", t: "board", attrs: { columns: clone(COLUMNS), cards: clone(CARDS) } }, { id: "q", text: "After" }];

let tabs, frame;
beforeEach(() => { tabs = []; frame = 0; });
afterEach(() => { for (const tab of tabs) { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); } });

const open = (value = seedValue(blocks())) => {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  const tab = { store, binding, view, pd: binding.pd };
  tabs.push(tab);
  return tab;
};
const blockIn = (tab, id) => {
  let found = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = { node, pos }; });
  return found;
};
const boardIn = (tab, id) => {
  const found = blockIn(tab, id);
  return found && { columns: found.node.attrs.columns, cards: found.node.attrs.cards };
};
const fieldsOf = (tab) => Object.fromEntries(tab.pd.boardFields.entries());
const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};
const setCards = (tab, id, cards) => {
  const { node, pos } = blockIn(tab, id);
  tab.view.dispatch(tab.view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, cards }));
};

test("a board inserted in the editor stores its columns and cards as board fields, never in the block's attrs", () => {
  const tab = open(seedValue([{ id: "p", text: "Before" }]));
  const node = schema.nodes.board.create({ id: "nb", pos: "V", columns: clone(COLUMNS), cards: clone(CARDS) });
  tab.view.dispatch(tab.view.state.tr.insert(tab.view.state.doc.content.size, node));
  const attrs = tab.pd.attrs.get("nb");
  expect(attrs.get("t")).toBe("board");
  expect(attrs.has("columns")).toBe(false);
  expect(attrs.has("cards")).toBe(false);
  expect(fieldsOf(tab)[boardKey("nb", "card", "a", "placement")]).toEqual({ columnId: "todo", pos: "1" });
  expect(fieldsOf(tab)[boardKey("nb", "column", "done", "name")]).toBe("Done");
  expect(Object.keys(fieldsOf(tab))).toHaveLength(14);
  expect(boardIn(tab, "nb")).toEqual({ columns: COLUMNS, cards: CARDS });
  expect(blocksFromYValue(tab.store.value).nb).toMatchObject({ t: "board", columns: COLUMNS, cards: CARDS });
  expect(boardIn(open(tab.store.value), "nb")).toEqual({ columns: COLUMNS, cards: CARDS });
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("one Undo takes back an inserted board together with its fields", () => {
  const tab = open(seedValue([{ id: "p", text: "Before" }]));
  const node = schema.nodes.board.create({ id: "nb", pos: "V", columns: clone(COLUMNS), cards: {} });
  tab.view.dispatch(tab.view.state.tr.insert(tab.view.state.doc.content.size, node));
  expect(blockIn(tab, "nb")).not.toBeNull();
  expect(tab.binding.undo()).toBe(true);
  expect(blockIn(tab, "nb")).toBeNull();
  expect(fieldsOf(tab)).toEqual({});
  expect(tab.binding.redo()).toBe(true);
  expect(boardIn(tab, "nb")).toEqual({ columns: COLUMNS, cards: {} });
});

test("an attribute change from the editor writes only the changed leaf fields and keeps a peer's edit to another card", () => {
  const a = open(), b = open();
  const cards = clone(CARDS);
  cards.a.title = "Sample inbox first";
  delete cards.b;
  cards.n = { pos: "3", col: "todo", title: "New card" };
  const before = fieldsOf(a);
  setCards(a, "bd", cards);
  b.pd.ydoc.transact(() => b.pd.boardFields.set(boardKey("bd", "card", "b", "owner"), "Ana"), "peer-test");
  const written = Object.entries(fieldsOf(a)).filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value)).map(([key]) => JSON.parse(key).slice(1).join("/"));
  expect(written.sort()).toEqual(["card/a/title", "card/b/alive", "card/n/alive", "card/n/placement", "card/n/title"]);
  expect(a.pd.attrs.get("bd").has("cards")).toBe(false);
  deliver(a, b);
  deliver(b, a);
  for (const tab of [a, b]) {
    expect(boardIn(tab, "bd").cards).toEqual({ a: cards.a, n: cards.n });
    expect(tab.pd.boardFields.get(boardKey("bd", "card", "b", "owner"))).toBe("Ana");
    expect(blocksFromYValue(tab.store.value).bd.cards).toEqual({ a: cards.a, n: cards.n });
  }
  expect(a.binding.stats.mismatch + b.binding.stats.mismatch).toBe(0);
});

test("typing next to a board and deleting across it write no board field", () => {
  const tab = open();
  const before = fieldsOf(tab);
  const at = blockIn(tab, "p").pos + 1;
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
  tab.view.dispatch(tab.view.state.tr.insertText("Now "));
  const { pos } = blockIn(tab, "q");
  tab.view.dispatch(tab.view.state.tr.delete(blockIn(tab, "p").pos + 3, pos + 2));
  expect(fieldsOf(tab)).toEqual(before);
  expect(tab.pd.attrs.get("bd")?.has("cards") ?? false).toBe(false);
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("a removed board comes back on Restore with its card edits, and an edit after Restore goes to the removal record", () => {
  const a = open();
  a.pd.ydoc.transact(() => {
    a.pd.boardFields.set(boardKey("bd", "card", "a", "title"), "Sample inbox, edited");
    a.pd.boardFields.set(boardKey("bd", "card", "b", "alive"), false);
  }, "peer-test");
  const effective = { a: { ...CARDS.a, title: "Sample inbox, edited" } };
  const source = keyOf(a.pd, "bd");
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(source, "move-1"), { blockId: "bd", end: keyOf(a.pd, "q"), sv: [] }), "peer-test");
  expect(blockIn(a, "bd")).toBeNull();
  const record = reduceRecovery(a.pd).sources.get(source);
  expect(record.attrs.cards).toEqual(effective);
  expect(a.binding.restore(source, record.revision)).toEqual({ status: "restored", id: `recovered:${source}` });
  const id = `recovered:${source}`;
  expect(boardIn(a, id)).toEqual({ columns: COLUMNS, cards: effective });
  expect(blocksFromYValue(a.store.value)[id]).toMatchObject({ columns: COLUMNS, cards: effective });
  expect(boardIn(open(a.store.value), id)).toEqual({ columns: COLUMNS, cards: effective });
  const keys = Object.keys(fieldsOf(a));
  setCards(a, id, { ...effective, z: { pos: "5", col: "done", title: "After Restore" } });
  expect(Object.keys(fieldsOf(a))).toEqual(keys);
  expect(a.pd.gone.get(attrKey(source, "cards")).z.title).toBe("After Restore");
  expect(blocksFromYValue(a.store.value)[id].cards.z.title).toBe("After Restore");
  expect(a.binding.stats.mismatch).toBe(0);
});
