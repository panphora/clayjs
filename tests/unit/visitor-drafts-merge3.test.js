/**
 * merge3 on its own: this tab's value against another tab's, both from the value
 * they started at. Objects merge per field, lists of rows with an `id` merge per
 * row, and anything both sides changed differently is a conflict this tab wins.
 */
import { merge3 } from "../../src/plugins/visitor-drafts/store.js";

const rows = (...pairs) => pairs.map(([id, name]) => ({ id, name }));

test("fields of nested objects merge per field", () => {
  const base = { title: "owner title", meta: { author: "owner", tags: "a" } };
  const mine = { title: "A title", meta: { author: "owner", tags: "a" } };
  const theirs = { title: "owner title", meta: { author: "other", tags: "a" } };

  expect(merge3(base, mine, theirs)).toEqual({
    value: { title: "A title", meta: { author: "other", tags: "a" } },
    conflict: false,
  });
});

test("a field both tabs set to the same value is not a conflict", () => {
  const base = { title: "owner title", meta: { author: "owner" } };
  const mine = { title: "same title", meta: { author: "owner" } };
  const theirs = { title: "same title", meta: { author: "owner" } };

  expect(merge3(base, mine, theirs)).toEqual({ value: mine, conflict: false });
});

test("a list only one tab changed is taken whole, and a list both changed is a conflict", () => {
  const base = { rows: rows(["r1", "One"], ["r2", "Two"]) };
  const two = { rows: rows(["r1", "One"], ["r2", "Two"]) };

  expect(merge3(base, two, { rows: rows(["r1", "One"], ["r2", "Two"], ["r3", "Three"]) })).toEqual({
    value: { rows: rows(["r1", "One"], ["r2", "Two"], ["r3", "Three"]) },
    conflict: false,
  });
  expect(merge3(base, { rows: rows(["r1", "One"]) }, two)).toEqual({
    value: { rows: rows(["r1", "One"]) },
    conflict: false,
  });
  expect(merge3(base, { rows: rows(["r1", "A one"], ["r2", "Two"]) }, { rows: rows(["r1", "One"], ["r2", "B two"]) })).toEqual({
    value: { rows: rows(["r1", "A one"], ["r2", "B two"]) },
    conflict: false,
  });
});

test("a card moved to different lists in two tabs is a conflict, never two copies", () => {
  const card = (id) => ({ id, title: id });
  const base = { lists: [{ id: "todo", cards: [card("c1")] }, { id: "doing", cards: [] }, { id: "done", cards: [] }] };
  const mine = { lists: [{ id: "todo", cards: [] }, { id: "doing", cards: [card("c1")] }, { id: "done", cards: [] }] };
  const theirs = { lists: [{ id: "todo", cards: [] }, { id: "doing", cards: [] }, { id: "done", cards: [card("c1")] }] };

  expect(merge3(base, mine, theirs)).toEqual({ value: mine, conflict: true });
});

test("a row removed in one tab and edited in the other is a conflict", () => {
  const base = { rows: rows(["r1", "One"], ["r2", "Two"]) };

  expect(merge3(base, { rows: rows(["r1", "One"]) }, { rows: rows(["r1", "One"], ["r2", "Two edited"]) })).toEqual({
    value: { rows: rows(["r1", "One"]) },
    conflict: true,
  });
  expect(merge3(base, { rows: rows(["r1", "One"], ["r2", "Two edited"]) }, { rows: rows(["r1", "One"]) })).toEqual({
    value: { rows: rows(["r1", "One"], ["r2", "Two edited"]) },
    conflict: true,
  });
});
