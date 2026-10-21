import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";
import { boardKey, boardChanges, writeBoard, resolveBoardFields, removedBoardEntities, BOARD_FIELDS } from "../../../../src/page/ybind/board.js";

const COLUMNS = { todo: { pos: "1", name: "To do" }, done: { pos: "2", name: "Done" } };
const CARDS = { a: { pos: "1", col: "todo", title: "Sample inbox", owner: "Sam", due: "2026-10-20" }, b: { pos: "2", col: "done", title: "Invite flow" } };
const board = (columns = COLUMNS, cards = CARDS) => ({ columns: JSON.parse(JSON.stringify(columns)), cards: JSON.parse(JSON.stringify(cards)) });
const stored = (before) => {
  const pd = createPageDoc(new Y.Doc());
  writeBoard(pd, "bd", { columns: {}, cards: {} }, before);
  return pd;
};
const keys = (changes) => changes.map(([key]) => JSON.parse(key).slice(1).join("/"));

test("the board schema names every field once", () => {
  expect(BOARD_FIELDS).toEqual({ column: ["alive", "name", "pos"], card: ["alive", "title", "owner", "due", "placement"] });
});

test("a new board writes alive and every set field, and resolves back to the same board", () => {
  const pd = stored(board());
  expect(Object.fromEntries(pd.boardFields.entries())).toEqual({
    [boardKey("bd", "column", "todo", "alive")]: true,
    [boardKey("bd", "column", "todo", "name")]: "To do",
    [boardKey("bd", "column", "todo", "pos")]: "1",
    [boardKey("bd", "column", "done", "alive")]: true,
    [boardKey("bd", "column", "done", "name")]: "Done",
    [boardKey("bd", "column", "done", "pos")]: "2",
    [boardKey("bd", "card", "a", "alive")]: true,
    [boardKey("bd", "card", "a", "title")]: "Sample inbox",
    [boardKey("bd", "card", "a", "owner")]: "Sam",
    [boardKey("bd", "card", "a", "due")]: "2026-10-20",
    [boardKey("bd", "card", "a", "placement")]: { columnId: "todo", pos: "1" },
    [boardKey("bd", "card", "b", "alive")]: true,
    [boardKey("bd", "card", "b", "title")]: "Invite flow",
    [boardKey("bd", "card", "b", "placement")]: { columnId: "done", pos: "2" },
  });
  expect(resolveBoardFields(pd.boardFields, "bd")).toEqual(board());
});

test("an edit writes only the changed field, and a move writes one placement value", () => {
  const pd = stored(board());
  const before = resolveBoardFields(pd.boardFields, "bd");
  const after = board();
  after.cards.a.title = "Sample inbox first";
  after.cards.b = { ...after.cards.b, col: "todo", pos: "3" };
  expect(boardChanges("bd", pd.boardFields, before, after)).toEqual([
    [boardKey("bd", "card", "a", "title"), "Sample inbox first"],
    [boardKey("bd", "card", "b", "placement"), { columnId: "todo", pos: "3" }],
  ]);
});

test("clearing an owner writes null, and a delete writes only alive false", () => {
  const pd = stored(board());
  const before = resolveBoardFields(pd.boardFields, "bd");
  const after = board();
  delete after.cards.a.owner;
  delete after.cards.b;
  delete after.columns.done;
  expect(boardChanges("bd", pd.boardFields, before, after)).toEqual([
    [boardKey("bd", "column", "done", "alive"), false],
    [boardKey("bd", "card", "a", "owner"), null],
    [boardKey("bd", "card", "b", "alive"), false],
  ]);
});

test("bringing back a removed card writes only alive true and keeps its stored fields", () => {
  const pd = stored(board());
  pd.boardFields.set(boardKey("bd", "card", "b", "alive"), false);
  pd.boardFields.set(boardKey("bd", "card", "b", "title"), "Invite flow, edited while removed");
  const before = resolveBoardFields(pd.boardFields, "bd");
  const removed = removedBoardEntities(pd.boardFields, "bd");
  expect(before.cards.b).toBeUndefined();
  expect(removed).toEqual({ columns: {}, cards: { b: { pos: "2", col: "done", title: "Invite flow, edited while removed" } } });
  const after = { ...before, cards: { ...before.cards, b: removed.cards.b } };
  expect(boardChanges("bd", pd.boardFields, before, after)).toEqual([[boardKey("bd", "card", "b", "alive"), true]]);
});

test("a new card with no owner or due writes neither, and an unchanged board writes nothing", () => {
  const pd = stored(board());
  const before = resolveBoardFields(pd.boardFields, "bd");
  const after = board();
  after.cards.n = { pos: "3", col: "todo", title: "" };
  expect(keys(boardChanges("bd", pd.boardFields, before, after))).toEqual(["card/n/alive", "card/n/placement"]);
  expect(boardChanges("bd", pd.boardFields, before, board())).toEqual([]);
});

test("removed entities are listed per block and the resolver still refuses a malformed key", () => {
  const pd = stored(board());
  writeBoard(pd, "other", { columns: {}, cards: {} }, board());
  pd.boardFields.set(boardKey("other", "column", "todo", "alive"), false);
  expect(removedBoardEntities(pd.boardFields, "bd")).toEqual({ columns: {}, cards: {} });
  expect(removedBoardEntities(pd.boardFields, "other").columns).toEqual({ todo: COLUMNS.todo });
  pd.boardFields.set(boardKey("bd", "card", "a", "future"), true);
  expect(() => removedBoardEntities(pd.boardFields, "bd")).toThrow(expect.objectContaining({ code: "unsupported-content" }));
  expect(() => resolveBoardFields(pd.boardFields, "bd")).toThrow(expect.objectContaining({ code: "unsupported-content" }));
});
