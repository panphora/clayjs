/**
 * clay.live at file speed: captures carry each saved store's value (never the
 * DOM tag), a never-saved store writes nothing, frames rebase a store and replay
 * its unconfirmed ops, this tab's own save coming back confirms its ops so an
 * increment counts once, and tags no saved store owns follow the file.
 */

let live;
let receiveFrame;
let confirmSaved;
let storeOf;
let snapshot;

beforeAll(async () => {
  ({ live, receiveFrame, confirmSaved, storeOf } = await import("../../src/plugins/live.js"));
  snapshot = await import("../../src/core/snapshot.js");
});

const tag = (name, json, clay = "live") => `<script type="application/json" merge="${name}" clay="${clay}">${json}</script>`;
const page = (body) => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
const domText = (name) => document.querySelector(`script[merge="${name}"]`).textContent;

function captured(name) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  return clone.querySelector(`script[merge="${name}"]`).textContent;
}

test("every capture carries the store's current value; the page's tag is never written", () => {
  document.body.innerHTML = tag("a1", '{"score":0}');
  const game = live("a1");
  game.add("score", 2);
  expect(captured("a1")).toBe('{"score":2}');
  expect(domText("a1")).toBe('{"score":0}');
});

test("< is escaped, and an authored multi-line tag is written pretty", () => {
  document.body.innerHTML = tag("a2", '{\n  "n": 1\n}');
  live("a2").set("msg", "</script>");
  expect(captured("a2")).toBe('{\n  "n": 1,\n  "msg": "\\u003c/script>"\n}');
});

test("a never-saved store writes nothing into captures", () => {
  document.body.innerHTML = tag("a3", '{"x":0}', "live ephemeral");
  live("a3").set("x", 5);
  expect(captured("a3")).toBe('{"x":0}');
});

test("a frame's value becomes the base and this tab's ops replay over it", () => {
  document.body.innerHTML = tag("a4", '{"score":0,"p":{}}');
  const game = live("a4");
  game.add("score", 1);
  game.set("p.me", 1);
  receiveFrame(page(tag("a4", '{"score":10,"p":{"you":2}}')));
  expect(game.toJSON()).toEqual({ score: 11, p: { you: 2, me: 1 } });
  expect(storeOf("a4").pending).toHaveLength(2);
});

test("this tab's own save coming back confirms its ops, so an increment counts once", () => {
  document.body.innerHTML = tag("a5", '{"score":0}');
  const game = live("a5");
  game.add("score", 1);
  const text = captured("a5");
  receiveFrame(page(tag("a5", text)));
  expect(game.data.score).toBe(1);
  expect(storeOf("a5").pending).toEqual([]);
  receiveFrame(page(tag("a5", '{"score":5}')));
  expect(game.data.score).toBe(5);
});

test("an accepted save confirms the ops it carried, without announcing a change", () => {
  document.body.innerHTML = tag("a6", '{"score":0}');
  const game = live("a6");
  game.add("score", 1);
  captured("a6");
  const events = [];
  game.on("change", (e) => events.push(e));
  confirmSaved(page(tag("a6", '{"score":1}')));
  expect(storeOf("a6").pending).toEqual([]);
  expect(events).toEqual([]);
  game.add("score", 1);
  confirmSaved(page(tag("a6", '{"score":1}')));
  expect(game.data.score).toBe(2);
  expect(storeOf("a6").pending).toHaveLength(1);
});

test("accepted bytes this tab never captured confirm nothing", () => {
  document.body.innerHTML = tag("a7", '{"score":0}');
  const game = live("a7");
  game.add("score", 1);
  confirmSaved(page(tag("a7", '{"score":99}')));
  expect(game.data.score).toBe(1);
  expect(storeOf("a7").pending).toHaveLength(1);
});

test("an older save of this tab's arriving after a newer one is ignored", () => {
  document.body.innerHTML = tag("a8", '{"s":0}');
  const game = live("a8");
  game.add("s", 1);
  const older = captured("a8");
  game.add("s", 1);
  const newer = captured("a8");
  receiveFrame(page(tag("a8", newer)));
  expect(storeOf("a8").pending).toEqual([]);
  receiveFrame(page(tag("a8", older)));
  expect(game.data.s).toBe(2);
});

test("tags no saved store owns follow the file", () => {
  document.body.innerHTML = tag("b1", '{"v":1}') + tag("b2", "{}", "live ephemeral");
  const lobby = live("b2");
  receiveFrame(page(tag("b1", '{"v":2}') + tag("b2", '{"w":1}')));
  expect(domText("b1")).toBe('{"v":2}');
  expect(domText("b2")).toBe('{"w":1}');
  expect(lobby.toJSON()).toEqual({});
});

test("clay:sync-applied frames are taken", () => {
  document.body.innerHTML = tag("b3", '{"n":0}');
  const game = live("b3");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: page(tag("b3", '{"n":7}')) } }));
  expect(game.data.n).toBe(7);
});
