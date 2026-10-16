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

test("rows added, removed and edited in either tab all survive", () => {
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
  expect(merge3(base, two, { rows: rows(["r1", "One"]) })).toEqual({
    value: { rows: rows(["r1", "One"]) },
    conflict: false,
  });
  expect(merge3(base, { rows: rows(["r1", "A one"], ["r2", "Two"]) }, { rows: rows(["r1", "One"], ["r2", "B two"]) })).toEqual({
    value: { rows: rows(["r1", "A one"], ["r2", "B two"]) },
    conflict: false,
  });
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
