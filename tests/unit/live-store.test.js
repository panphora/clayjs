import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";

/**
 * The store behind clay.live: memory is the truth, every write is an op, object
 * and list identity survives local writes and rebases, update() is one atomic
 * batch, and rebase() replays this tab's unconfirmed ops over a new value.
 */

function make(value = { score: 0, players: { ana: { x: 1 } }, items: [1] }) {
  const store = createStore({ name: "game", value });
  const events = [];
  store.handle.on("change", (e) => events.push(e));
  const sent = [];
  store.onLocal((ops) => sent.push(ops));
  return { store, game: store.handle, events, sent };
}

test("reads through the proxy match the value", () => {
  const { game } = make();
  expect(game.data.players.ana.x).toBe(1);
  expect(JSON.stringify(game.data)).toBe('{"score":0,"players":{"ana":{"x":1}},"items":[1]}');
  expect(Array.isArray(game.data.items)).toBe(true);
  expect(game.data.items.map((n) => n * 2)).toEqual([2]);
  expect(game.data.players).toBe(game.data.players);
});

test("a proxy write is one set op, sent and announced as local", () => {
  const { game, events, sent } = make();
  game.data.players.ana.x = 5;
  expect(game.data.players.ana.x).toBe(5);
  const op = { op: "set", path: ["players", "ana", "x"], value: 5 };
  expect(sent).toEqual([[op]]);
  expect(events).toEqual([{ source: "local", ops: [op] }]);
});

test("a list index assignment is a path set; push is a whole-list set that keeps identity", () => {
  const { game, sent } = make();
  const items = game.data.items;
  items[0] = 9;
  items.push(2);
  items.push(3);
  expect(game.data.items).toBe(items);
  expect(game.toJSON().items).toEqual([9, 2, 3]);
  expect(sent[0]).toEqual([{ op: "set", path: ["items", 0], value: 9 }]);
  expect(sent[2]).toEqual([{ op: "set", path: ["items"], value: [9, 2, 3] }]);
  expect(items.pop()).toBe(3);
  expect(game.toJSON().items).toEqual([9, 2]);
});

test("delete on an object is a del op; on a list it throws", () => {
  const { game, sent } = make();
  delete game.data.players.ana;
  expect(game.toJSON().players).toEqual({});
  expect(sent).toEqual([[{ op: "del", path: ["players", "ana"] }]]);
  expect(() => {
    delete game.data.items[0];
  }).toThrow(/splice/);
});

test("set, delete and add take dotted or array paths; add defaults to 1", () => {
  const { game } = make();
  game.set("players.bo", { x: 0 });
  game.set(["players", "bo", "x"], 4);
  game.add("score");
  game.add("score", 2);
  game.delete("players.ana");
  expect(game.toJSON()).toEqual({ score: 3, players: { bo: { x: 4 } }, items: [1] });
});

test("an op that cannot apply throws and changes nothing", () => {
  const { game, events } = make();
  expect(() => {
    game.data.items[5] = 1;
  }).toThrow(RangeError);
  expect(() => game.set("score", undefined)).toThrow(/delete/);
  expect(() => game.set("x", () => 1)).toThrow(TypeError);
  expect(game.toJSON().items).toEqual([1]);
  expect(events).toEqual([]);
});

test("a stored value is copied in, never aliased", () => {
  const { game } = make();
  const bo = { x: 1 };
  game.data.players.bo = bo;
  bo.x = 99;
  expect(game.data.players.bo.x).toBe(1);
  const json = game.toJSON();
  json.score = 50;
  expect(game.data.score).toBe(0);
});

test("update is one batch: one event, coalesced ops", () => {
  const { game, events, sent } = make();
  const result = game.update((d) => {
    d.score += 1;
    d.score += 1;
    d.players.ana.x = 2;
    return "ok";
  });
  expect(result).toBe("ok");
  expect(events).toHaveLength(1);
  expect(sent).toEqual([[{ op: "set", path: ["score"], value: 2 }, { op: "set", path: ["players", "ana", "x"], value: 2 }]]);
});

test("update rolls back everything when it throws, with no event", () => {
  const { store, game, events } = make();
  game.add("score", 1);
  events.length = 0;
  expect(() =>
    game.update((d) => {
      d.score = 10;
      d.players.ana.x = 7;
      throw new Error("nope");
    })
  ).toThrow("nope");
  expect(game.toJSON()).toEqual({ score: 1, players: { ana: { x: 1 } }, items: [1] });
  expect(store.pending).toEqual([{ op: "add", path: ["score"], n: 1 }]);
  expect(events).toEqual([]);
});

test("update refuses an async function and rolls back", () => {
  const { game } = make();
  expect(() =>
    game.update(async (d) => {
      d.score = 5;
    })
  ).toThrow(/synchronously/);
  expect(game.data.score).toBe(0);
});

test("the whole value can be replaced but must keep its kind, and the root keeps its identity", () => {
  const { game } = make();
  const root = game.data;
  game.set([], { fresh: true });
  expect(game.data).toBe(root);
  expect(game.toJSON()).toEqual({ fresh: true });
  expect(() => game.set([], [1])).toThrow(/stay an object/);
});

test("rebase replays pending ops over the new value: increments count once, sets win", () => {
  const { store, game, events } = make();
  const ana = game.data.players.ana;
  game.add("score", 1);
  game.data.players.ana.x = 5;
  events.length = 0;

  store.rebase({ score: 10, players: { ana: { x: 2, y: 3 } }, items: [] });
  expect(game.toJSON()).toEqual({ score: 11, players: { ana: { x: 5, y: 3 } }, items: [] });
  expect(game.data.players.ana).toBe(ana);
  expect(ana.y).toBe(3);
  expect(events).toEqual([{ source: "remote", ops: null }]);

  store.rebase({ score: 11, players: { ana: { x: 2, y: 3 } }, items: [] }, { confirmed: 1, source: "state" });
  expect(game.toJSON().score).toBe(11);
  expect(game.data.players.ana.x).toBe(5);
  expect(store.pending).toEqual([{ op: "set", path: ["players", "ana", "x"], value: 5 }]);
  expect(events).toHaveLength(1);
});

test("rebase drops a pending op that no longer applies", () => {
  const { store, game } = make({ items: [1, 2, 3] });
  game.data.items[2] = 9;
  store.rebase({ items: [1] });
  expect(game.toJSON()).toEqual({ items: [1] });
  expect(store.pending).toEqual([]);
});

test("rebase ignores a value of the wrong kind", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const { store, game } = make();
  expect(store.rebase([1, 2])).toBe(false);
  expect(store.rebase(5)).toBe(false);
  expect(game.data.score).toBe(0);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("on returns an unsubscribe; a throwing listener does not stop the others", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const { game, events } = make();
  const off = game.on("change", () => {
    throw new Error("listener");
  });
  game.add("score");
  expect(events).toHaveLength(1);
  expect(error).toHaveBeenCalled();
  off();
  game.add("score");
  expect(error).toHaveBeenCalledTimes(1);
  expect(() => game.on("update", () => {})).toThrow(/change/);
  error.mockRestore();
});

test("ready resolves to the handle; status starts in file mode", async () => {
  const { game, store } = make();
  await expect(game.ready).resolves.toBe(game);
  expect(game.status).toEqual({ mode: "file" });
  store.setMode("fast");
  expect(game.status.mode).toBe("fast");
});

test("a store must start from an object or a list", () => {
  expect(() => createStore({ name: "n", value: 5 })).toThrow(/object or list/);
});

test("rebase through a mark drops exactly the ops up to it", () => {
  const { store, game } = make({ s: 0 });
  game.add("s", 1);
  const mark = store.mark;
  game.add("s", 1);
  store.rebase({ s: 1 }, { through: mark, source: "state" });
  expect(game.data.s).toBe(2);
  expect(store.pending).toEqual([{ op: "add", path: ["s"], n: 1 }]);
});

test("rebase announces a change only when the value changed", () => {
  const { store, events } = make({ s: 0 });
  store.rebase({ s: 0 });
  expect(events).toEqual([]);
  store.rebase({ s: 3 }, { source: "state" });
  expect(events).toEqual([{ source: "state", ops: null }]);
});

test("mark is the id of the newest committed op", () => {
  const { store, game } = make();
  expect(store.mark).toBe(0);
  game.add("score");
  game.update((d) => {
    d.score = 5;
    d.score = 6;
  });
  expect(store.mark).toBe(2);
});
