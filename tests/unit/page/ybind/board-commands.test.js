import { orderedIds } from "../../../../src/page/model.js";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { renderModel, project } from "../../../../src/page/projection.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, removeKey, attrKey, reduceRecovery, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";
import { boardKey } from "../../../../src/page/ybind/board.js";
import { slotKey } from "../../../../src/page/ybind/board-commands.js";

const COLUMNS = { todo: { pos: "1", name: "To do" }, doing: { pos: "2", name: "In progress" }, done: { pos: "3", name: "Done" } };
const CARDS = { a: { pos: "1", col: "todo", title: "Sample inbox", owner: "Sam", due: "2026-10-20" }, b: { pos: "2", col: "todo", title: "Invite flow" }, c: { pos: "1", col: "done", title: "Pricing page" } };
const clone = (value) => JSON.parse(JSON.stringify(value));
const blocks = () => [{ id: "p", text: "Before" }, { id: "bd", t: "board", attrs: { columns: clone(COLUMNS), cards: clone(CARDS) } }, { id: "q", text: "After" }];
const initial = seedValue(blocks());

let tabs, frame;
beforeEach(() => { tabs = []; frame = 0; });
afterEach(() => { for (const tab of tabs) { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); } });

const open = (value = initial) => {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  const tab = { store, binding, view, pd: binding.pd, board: binding.board };
  tabs.push(tab);
  return tab;
};
const boardIn = (tab, id = "bd") => {
  let found = null;
  tab.view.state.doc.forEach((node) => { if (node.attrs.id === id) found = { columns: node.attrs.columns, cards: node.attrs.cards }; });
  return found;
};
const order = (tab, columnId, id = "bd") => Object.entries(boardIn(tab, id).cards).filter(([, card]) => card.col === columnId).map(([cardId]) => cardId);
const fieldsOf = (tab) => Object.fromEntries(tab.pd.boardFields.entries());
const written = (tab, run) => {
  const before = fieldsOf(tab);
  const result = run();
  const after = fieldsOf(tab);
  const changed = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => JSON.parse(key).slice(1).join("/"));
  return { result, changed: changed.sort() };
};
const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};
const sync = (a, b) => { deliver(a, b); deliver(b, a); };
const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const settled = (...list) => {
  for (const tab of list) {
    const decoded = blocksFromYValue(tab.store.value).bd;
    expect({ columns: decoded.columns, cards: decoded.cards }).toEqual(boardIn(tab));
    expect(tab.binding.stats.mismatch).toBe(0);
  }
  for (const tab of list.slice(1)) expect(boardIn(tab)).toEqual(boardIn(list[0]));
};

test("two tabs edit different fields of one card and both edits survive, one key each", () => {
  const a = open(), b = open();
  expect(written(a, () => a.board.editCard("bd", "a", { title: "Sample inbox first" }))).toEqual({ result: { status: "changed" }, changed: ["card/a/title"] });
  expect(written(b, () => b.board.editCard("bd", "a", { owner: "Ana", due: "2026-10-23" }))).toEqual({ result: { status: "changed" }, changed: ["card/a/due", "card/a/owner"] });
  sync(a, b);
  expect(boardIn(a).cards.a).toEqual({ pos: "1", col: "todo", title: "Sample inbox first", owner: "Ana", due: "2026-10-23" });
  settled(a, b);
  expect(boardIn(open(a.store.value))).toEqual(boardIn(a));
});

test("two tabs moving one card at once converge on one placement", () => {
  const a = open(), b = open();
  expect(written(a, () => a.board.moveCard("bd", "b", { columnId: "doing" }))).toEqual({ result: { status: "moved" }, changed: ["card/b/placement"] });
  expect(b.board.moveCard("bd", "b", { columnId: "done", afterId: "c" })).toEqual({ status: "moved" });
  sync(a, b);
  const card = boardIn(a).cards.b;
  expect(["doing", "done"]).toContain(card.col);
  expect(Object.values(boardIn(a).cards).filter((other) => other.title === "Invite flow")).toHaveLength(1);
  settled(a, b);
});

test("two tabs moving different cards into the same slot keep both, in the same order", () => {
  const a = open(), b = open();
  a.board.moveCard("bd", "a", { columnId: "doing" });
  b.board.moveCard("bd", "b", { columnId: "doing" });
  sync(a, b);
  expect(order(a, "doing")).toEqual(["a", "b"]);
  expect(order(b, "doing")).toEqual(["a", "b"]);
  expect(boardIn(a).cards.a.pos).toBe(boardIn(a).cards.b.pos);
  expect(a.board.moveCard("bd", "c", { columnId: "doing", afterId: "a" })).toEqual({ status: "moved" });
  expect(sorted(a, "doing")).toEqual(["a", "c", "b"]);
  sync(a, b);
  expect(sorted(b, "doing")).toEqual(["a", "c", "b"]);
  expect(new Set(["a", "b", "c"].map((id) => boardIn(a).cards[id].pos)).size).toBe(3);
  settled(a, b);
});

const sorted = (tab, columnId) => orderedIds(Object.fromEntries(Object.entries(boardIn(tab).cards).filter(([, card]) => card.col === columnId)));

test("moving a card up past a tied pair lands it between them on the first try", () => {
  const a = open(), b = open();
  a.board.moveCard("bd", "a", { columnId: "doing" });
  b.board.moveCard("bd", "b", { columnId: "doing" });
  sync(a, b);
  const last = sorted(a, "doing").at(-1);
  expect(a.board.moveCard("bd", "c", { columnId: "doing", afterId: last })).toEqual({ status: "moved" });
  expect(sorted(a, "doing")).toEqual(["a", "b", "c"]);
  expect(a.board.moveCard("bd", "c", { columnId: "doing", afterId: "a" })).toEqual({ status: "moved" });
  expect(sorted(a, "doing")).toEqual(["a", "c", "b"]);
  sync(a, b);
  settled(a, b);
});

test("a card removed in one tab while another edits it stays hidden, and Restore brings it back with the edit", () => {
  const a = open(), b = open();
  expect(written(a, () => a.board.removeCard("bd", "b"))).toEqual({ result: { status: "removed" }, changed: ["card/b/alive"] });
  b.board.editCard("bd", "b", { title: "Invite flow, rewritten" });
  sync(a, b);
  for (const tab of [a, b]) {
    expect(boardIn(tab).cards.b).toBeUndefined();
    expect(tab.board.removed("bd").cards.b).toEqual({ pos: "2", col: "todo", title: "Invite flow, rewritten" });
  }
  expect(b.board.editCard("bd", "b", { title: "again" })).toEqual({ status: "refused", code: "missing-card" });
  expect(written(b, () => b.board.restoreCard("bd", "b"))).toEqual({ result: { status: "restored" }, changed: ["card/b/alive"] });
  sync(a, b);
  expect(boardIn(a).cards.b).toEqual({ pos: "2", col: "todo", title: "Invite flow, rewritten" });
  expect(a.board.restoreCard("bd", "b")).toEqual({ status: "unchanged" });
  settled(a, b);
});

test("Undo takes back only this tab's field and keeps the peer's field on the same card", () => {
  const a = open(), b = open();
  a.board.editCard("bd", "a", { title: "Mine" });
  b.board.editCard("bd", "a", { owner: "Ana" });
  sync(a, b);
  expect(a.binding.undo()).toBe(true);
  expect(boardIn(a).cards.a).toEqual({ ...CARDS.a, owner: "Ana" });
  sync(a, b);
  expect(boardIn(b).cards.a).toEqual({ ...CARDS.a, owner: "Ana" });
  expect(a.binding.redo()).toBe(true);
  expect(boardIn(a).cards.a).toEqual({ ...CARDS.a, title: "Mine", owner: "Ana" });
  settled(a);
});

test("every command is one Undo step, and undoing them all gives back the starting board", () => {
  const a = open();
  const start = boardIn(a);
  const column = a.board.createColumn("bd", { name: "Blocked" });
  expect(column.status).toBe("created");
  const card = a.board.createCard("bd", { columnId: column.id, title: "Waiting on legal" });
  expect(card.status).toBe("created");
  expect(a.board.moveCard("bd", "a", { columnId: column.id, afterId: card.id })).toEqual({ status: "moved" });
  expect(a.board.editCard("bd", card.id, { title: "Waiting on legal review" })).toEqual({ status: "changed" });
  expect(a.board.renameColumn("bd", "doing", "Doing")).toEqual({ status: "changed" });
  expect(a.board.moveColumn("bd", "done", { afterId: null })).toEqual({ status: "moved" });
  expect(a.board.removeCard("bd", "c")).toEqual({ status: "removed" });
  expect(Object.keys(boardIn(a).columns)).toEqual(["done", "todo", "doing", column.id]);
  expect(order(a, column.id)).toEqual([card.id, "a"]);
  for (let i = 0; i < 7; i++) expect(a.binding.undo()).toBe(true);
  expect(boardIn(a)).toEqual(start);
  settled(a);
});

test("a column removed in one tab keeps the cards another tab put in it, in the missing-column group", () => {
  const a = open(), b = open();
  expect(written(a, () => a.board.removeColumn("bd", "done"))).toEqual({ result: { status: "removed", cards: 1 }, changed: ["column/done/alive"] });
  const made = b.board.createCard("bd", { columnId: "done", title: "Ship notes" });
  b.board.moveCard("bd", "a", { columnId: "done" });
  sync(a, b);
  for (const tab of [a, b]) {
    expect(Object.keys(boardIn(tab).columns)).toEqual(["todo", "doing"]);
    expect(order(tab, "done").sort()).toEqual(["a", "c", made.id].sort());
    expect(renderModel(project({ bd: blocksFromYValue(tab.store.value).bd }))).toContain('data-col="done" data-missing');
  }
  expect(a.board.moveCard("bd", "a", { columnId: "done" })).toEqual({ status: "refused", code: "missing-column" });
  expect(a.board.moveCard("bd", "a", { columnId: "doing" })).toEqual({ status: "moved" });
  expect(boardIn(a).cards.a.col).toBe("doing");
  expect(b.board.restoreColumn("bd", "done")).toEqual({ status: "restored" });
  sync(a, b);
  expect(order(a, "done").sort()).toEqual(["c", made.id].sort());
  settled(a, b);
});

test("refused commands write nothing and leave Undo alone", () => {
  const a = open();
  const updates = [];
  a.binding.ydoc.on("updateV2", (update) => updates.push(update));
  const cases = [
    [a.board.editCard("nope", "a", { title: "x" }), "missing-board"],
    [a.board.editCard("p", "a", { title: "x" }), "missing-board"],
    [a.board.editCard("bd", "zz", { title: "x" }), "missing-card"],
    [a.board.editCard("bd", "a", { color: "red" }), "invalid-field"],
    [a.board.editCard("bd", "a", {}), "invalid-field"],
    [a.board.editCard("bd", "a", { due: "tomorrow" }), "invalid-value"],
    [a.board.editCard("bd", "a", { owner: "" }), "invalid-value"],
    [a.board.editCard("bd", "a", { title: null }), "invalid-value"],
    [a.board.moveCard("bd", "a", { columnId: "gone" }), "missing-column"],
    [a.board.moveCard("bd", "a", { columnId: "done", afterId: "b" }), "missing-destination"],
    [a.board.moveCard("bd", "a", { columnId: "todo", afterId: "a" }), "missing-destination"],
    [a.board.createCard("bd", { columnId: "gone", title: "x" }), "missing-column"],
    [a.board.createCard("bd", { columnId: "todo", title: 4 }), "invalid-value"],
    [a.board.createColumn("bd", { name: "x", afterId: "gone" }), "missing-destination"],
    [a.board.renameColumn("bd", "gone", "x"), "missing-column"],
    [a.board.moveColumn("bd", "todo", { afterId: "todo" }), "missing-destination"],
    [a.board.removeColumn("bd", "gone"), "missing-column"],
    [a.board.restoreColumn("bd", "gone"), "missing-column"],
    [a.board.restoreCard("bd", "zz"), "missing-card"],
  ];
  for (const [result, code] of cases) expect(result).toEqual({ status: "refused", code });
  expect(a.board.editCard("bd", "a", { title: "Sample inbox" })).toEqual({ status: "unchanged" });
  expect(a.board.moveCard("bd", "b", { columnId: "todo", afterId: "a" })).toEqual({ status: "unchanged" });
  expect(a.board.moveColumn("bd", "todo", { afterId: null })).toEqual({ status: "unchanged" });
  expect(updates).toHaveLength(0);
  expect(a.binding.undo()).toBe(false);
  expect(a.board.read("nope")).toBeNull();
  expect(a.board.removed("nope")).toBeNull();
});

test("commands on a restored board write its removal record, never board fields under the recovered id", () => {
  const a = open();
  const source = keyOf(a.pd, "bd");
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(source, "move-1"), { blockId: "bd", end: keyOf(a.pd, "q"), sv: [] }), "peer-test");
  expect(a.board.editCard("bd", "a", { title: "x" })).toEqual({ status: "refused", code: "missing-board" });
  const record = reduceRecovery(a.pd).sources.get(source);
  a.binding.restore(source, record.revision);
  const id = `recovered:${source}`;
  const keys = Object.keys(fieldsOf(a));
  const made = a.board.createCard(id, { columnId: "doing", title: "After Restore" });
  expect(made.status).toBe("created");
  expect(a.board.moveCard(id, "a", { columnId: "done" })).toEqual({ status: "moved" });
  expect(Object.keys(fieldsOf(a))).toEqual(keys);
  expect(a.pd.gone.get(attrKey(source, "cards"))[made.id]).toMatchObject({ col: "doing", title: "After Restore" });
  expect(blocksFromYValue(a.store.value)[id].cards[made.id].title).toBe("After Restore");
  expect(boardIn(a, id).cards.a.col).toBe("done");
  expect(a.board.removed(id)).toEqual({ columns: {}, cards: {} });
  expect(a.binding.undo()).toBe(true);
  expect(boardIn(a, id).cards.a.col).toBe("todo");
  expect(a.binding.stats.mismatch).toBe(0);
});

test("slot keys sort between their neighbours, after a tie, and around keys the helper did not make", () => {
  expect(slotKey([], 0)).toBe("V");
  expect(slotKey(["1", "3"], 1) > "1" && slotKey(["1", "3"], 1) < "3").toBe(true);
  expect(slotKey(["1", "3"], 0) < "1").toBe(true);
  expect(slotKey(["1", "3"], 2) > "3").toBe(true);
  const tie = slotKey(["1", "V", "V", "Z"], 2);
  expect(tie > "V" && tie < "Z").toBe(true);
  const zero = slotKey(["0", "1"], 1);
  expect(zero > "0" && zero < "1").toBe(true);
  expect(slotKey(["", "1"], 1) < "1").toBe(true);
  expect(slotKey(["5", "50"], 2) > "50").toBe(true);
});
