import { createStore } from "../../../src/live/store.js";
import { identityPlugin, orderedIds } from "../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, blocksFromYValue } from "../../../src/page/ybind/index.js";
import { duplicateBlocks } from "../../../src/page/blocksel.js";
import { make, run } from "./blocks-helpers.js";

const { NodeSelection } = pmState;
const COLUMNS = { todo: { pos: "1", name: "To do" }, done: { pos: "2", name: "Done" } };
const CARDS = {
  b: { pos: "1", col: "todo", title: "Tied second" },
  a: { pos: "1", col: "todo", title: "Tied first", owner: "Sam", due: "2026-10-20" },
  c: { pos: "0", col: "done", title: "Odd key" },
  m: { pos: "1", col: "gone", title: "In a removed column" },
};
const boards = (doc) => { const out = []; doc.forEach((node) => { if (node.type.name === "board") out.push(node.attrs); }); return out; };
const selectBoard = (st, id) => { let at = null; st.doc.forEach((node, offset) => { if (node.attrs.id === id) at = offset; }); return st.apply(st.tr.setSelection(NodeSelection.create(st.doc, at))); };
const view = (board) => {
  const columns = orderedIds(board.columns);
  const cards = (col) => orderedIds(Object.fromEntries(Object.entries(board.cards).filter(([, card]) => card.col === col))).map((id) => { const { pos, col: _, ...rest } = board.cards[id]; return rest; });
  const missing = [...new Set(Object.values(board.cards).map((card) => card.col))].filter((col) => !Object.hasOwn(board.columns, col)).sort();
  return { columns: columns.map((id) => board.columns[id].name), cards: [...columns.map(cards), ...missing.map((col) => [col, ...cards(col)])] };
};

test("Duplicate gives a board new column and card ids and copies what it shows, in the same order", () => {
  const st = selectBoard(make([["p", "paragraph", "Intro"], ["bd", "board", null, { columns: COLUMNS, cards: CARDS }]]), "bd");
  const out = run(st, duplicateBlocks);
  const [source, copy] = boards(out.doc);
  expect(source).toMatchObject({ id: "bd", columns: COLUMNS, cards: CARDS });
  expect(copy.id).not.toBe("bd");
  const columnIds = Object.keys(copy.columns), cardIds = Object.keys(copy.cards);
  expect(columnIds.some((id) => Object.hasOwn(COLUMNS, id)) || cardIds.some((id) => Object.hasOwn(CARDS, id))).toBe(false);
  expect(columnIds.every((id) => id.startsWith("c-")) && cardIds.every((id) => id.startsWith("k-"))).toBe(true);
  expect(view(copy)).toEqual(view(source));
  expect(view(copy)).toEqual({
    columns: ["To do", "Done"],
    cards: [[{ title: "Tied first", owner: "Sam", due: "2026-10-20" }, { title: "Tied second" }], [{ title: "Odd key" }], ["gone", { title: "In a removed column" }]],
  });
});

test("through the Yjs binding a duplicated board has its own fields: changing either leaves the other alone, and one Undo takes the copy back", () => {
  const store = createStore({ name: "page", value: seedValue([{ id: "p", text: "Intro" }, { id: "bd", t: "board", attrs: { columns: COLUMNS, cards: { a: CARDS.a } } }]) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const pm = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(pm);
  try {
    const before = binding.pd.boardFields.size;
    let at = null;
    pm.state.doc.forEach((node, offset) => { if (node.attrs.id === "bd") at = offset; });
    pm.dispatch(pm.state.tr.setSelection(NodeSelection.create(pm.state.doc, at)));
    expect(duplicateBlocks(pm.state, pm.dispatch)).toBe(true);
    const copy = boards(pm.state.doc).find((board) => board.id !== "bd");
    const card = Object.keys(copy.cards)[0];
    expect(binding.pd.boardFields.size).toBe(before * 2);
    expect(binding.board.editCard(copy.id, card, { title: "Copy only" }).status).toBe("changed");
    expect(binding.board.removeColumn("bd", "done").status).toBe("removed");
    const decoded = blocksFromYValue(store.value);
    expect(decoded.bd.cards.a.title).toBe("Tied first");
    expect(decoded[copy.id].cards[card].title).toBe("Copy only");
    expect(Object.keys(decoded.bd.columns)).toEqual(["todo"]);
    expect(Object.keys(decoded[copy.id].columns)).toHaveLength(2);
    expect(binding.undo()).toBe(true);
    expect(binding.undo()).toBe(true);
    expect(binding.undo()).toBe(true);
    expect(boards(pm.state.doc).map((board) => board.id)).toEqual(["bd"]);
    expect(blocksFromYValue(store.value)[copy.id]).toBeUndefined();
    expect(Object.keys(blocksFromYValue(store.value).bd.columns)).toEqual(["todo", "done"]);
    expect(binding.stats.mismatch).toBe(0);
  } finally {
    pm.destroy();
    binding.dispose();
    binding.ydoc.destroy();
  }
});
