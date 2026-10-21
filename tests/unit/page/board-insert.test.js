import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { identityPlugin, isKey, orderedIds } from "../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, blocksFromYValue } from "../../../src/page/ybind/index.js";
import { BOARD_COLUMNS, makeBoard, insertBoardNode } from "../../../src/page/board.js";
import * as I from "../../../src/page/items.js";
import { editor, key, posOf, select, shape, typeText } from "./view-helpers.js";

afterEach(() => { document.body.innerHTML = ""; });

const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const names = (board) => orderedIds(board.attrs?.columns ?? board.columns).map((id) => (board.attrs?.columns ?? board.columns)[id].name);
const nodeOf = (view, type) => {
  let found = null;
  view.state.doc.forEach((node) => { if (!found && node.type.name === type) found = node; });
  return found;
};
const keys = (query) => I.rankItems(I.MENU_ITEMS, query).map((item) => item.key);

test("a new board has To do, In progress and Done, in that order, and no cards", () => {
  const board = makeBoard();
  expect(BOARD_COLUMNS).toEqual(["To do", "In progress", "Done"]);
  expect(names(board)).toEqual(["To do", "In progress", "Done"]);
  expect(board.attrs.cards).toEqual({});
  const ids = Object.keys(board.attrs.columns);
  expect(new Set(ids).size).toBe(3);
  expect(ids.every((id) => id.startsWith("c-"))).toBe(true);
  expect(Object.values(board.attrs.columns).every((column) => isKey(column.pos))).toBe(true);
  expect(board.attrs.id).toMatch(/^b-/);
});

test("/board then Enter on an empty line puts a board there and the caret on a new empty line below it", () => {
  const view = editor([["p", "paragraph", "Intro"], ["e", "paragraph", ""], ["q", "paragraph", "After"]]);
  view.coordsAtPos = () => COORDS;
  select(view, posOf(view, "e", true));
  for (const ch of "/board") typeText(view, ch);
  expect(key(view, "Enter")).toBe(true);
  expect(shape(view)).toBe("Intro | board | paragraph | After");
  expect(names(nodeOf(view, "board"))).toEqual(["To do", "In progress", "Done"]);
  const $head = view.state.selection.$head;
  expect($head.index(0)).toBe(2);
  expect($head.parent.type.name).toBe("paragraph");
  expect($head.parent.content.size).toBe(0);
  const order = [];
  view.state.doc.forEach((node) => order.push(node.attrs.pos));
  expect([...order].sort()).toEqual(order);
});

test("Board from the menu on a line with text goes after the line's whole subtree, at the line's level", () => {
  const view = editor([["t", "toggle", "Notes", { open: true }], ["c", "paragraph", "child", { parent: "t" }], ["q", "paragraph", "After"]]);
  select(view, posOf(view, "t", true));
  expect(I.runItem(view, I.MENU_ITEMS.find((item) => item.key === "board"), 0)).toBe(true);
  expect(shape(view)).toBe("Notes | child<t | board | paragraph | After");
  expect(view.state.selection.$head.index(0)).toBe(3);
});

test("the menu finds Board by name, kanban, cards and columns", () => {
  expect(keys("board")).toEqual(["board"]);
  expect(keys("kanban")[0]).toBe("board");
  expect(keys("cards")[0]).toBe("board");
  expect(keys("col")).toContain("board");
  expect(I.MENU_ITEMS.find((item) => item.key === "board")).toMatchObject({ label: "Board", description: "Cards in columns, like a kanban", insert: "board" });
});

test("through the Yjs binding a new board stores its three columns as board fields, in one Undo step, and takes cards", () => {
  const store = createStore({ name: "page", value: seedValue([{ id: "p", text: "Intro" }, { id: "e", text: "" }]) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  try {
    select(view, posOf(view, "e"));
    insertBoardNode(view.state, view.dispatch);
    const board = nodeOf(view, "board");
    const id = board.attrs.id;
    const columns = Object.keys(board.attrs.columns);
    expect([...binding.pd.boardFields.keys()].map((key) => JSON.parse(key)).filter(([owner]) => owner === id).map(([, kind, , field]) => `${kind}/${field}`).sort()).toEqual(["column/alive", "column/alive", "column/alive", "column/name", "column/name", "column/name", "column/pos", "column/pos", "column/pos"]);
    expect(binding.pd.attrs.get(id).has("columns")).toBe(false);
    expect(names(blocksFromYValue(store.value)[id])).toEqual(["To do", "In progress", "Done"]);
    const card = binding.board.createCard(id, { columnId: columns[0], title: "First card" });
    expect(card.status).toBe("created");
    expect(nodeOf(view, "board").attrs.cards[card.id]).toMatchObject({ col: columns[0], title: "First card" });
    expect(binding.undo()).toBe(true);
    expect(nodeOf(view, "board").attrs.cards).toEqual({});
    expect(binding.undo()).toBe(true);
    expect(nodeOf(view, "board")).toBeNull();
    expect(shape(view)).toBe("Intro | paragraph");
    expect(binding.stats.mismatch).toBe(0);
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
  }
});
