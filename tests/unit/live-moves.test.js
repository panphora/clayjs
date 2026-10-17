import { movesSince } from "../../src/live/moves.js";

test("a since at or past last has nothing newer", () => {
  const store = { last: 3, floor: 0, log: [{ seq: 1, ops: [{ p: ["a"], v: 1 }] }, { seq: 3, ops: [{ p: ["a"], v: 2 }] }] };
  expect(movesSince(store, { epoch: "e1", seq: 3 })).toEqual([]);
  expect(movesSince(store, { epoch: "e1", seq: 9 })).toEqual([]);
});

test("a since below the floor gives null: the log cannot reach back", () => {
  const store = { last: 5, floor: 4, log: [{ seq: 5, ops: [{ p: ["a"], v: 1 }] }] };
  expect(movesSince(store, { epoch: "e1", seq: 3 })).toBeNull();
});

test("a log starting above since.seq + 1 is sparse, not missing: it gives the entry", () => {
  const store = { last: 2, floor: 0, log: [{ seq: 2, ops: [{ p: ["a"], v: 1 }] }] };
  expect(movesSince(store, { epoch: "e1", seq: 0 })).toEqual([{ seq: 2, ops: [{ p: ["a"], v: 1 }] }]);
});

test("no since gives null", () => {
  const store = { last: 1, floor: 0, log: [{ seq: 1, ops: [{ p: ["a"], v: 1 }] }] };
  expect(movesSince(store, null)).toBeNull();
  expect(movesSince(store, { epoch: "e1" })).toBeNull();
});

test("entries carry only seq and ops", () => {
  const store = { last: 2, floor: 0, log: [{ seq: 1, ops: [{ p: ["a"], v: 1 }], bytes: 9 }] };
  const moves = movesSince(store, { epoch: "e1", seq: 0 });
  expect(moves).toEqual([{ seq: 1, ops: [{ p: ["a"], v: 1 }] }]);
  expect(Object.keys(moves[0])).toEqual(["seq", "ops"]);
});
