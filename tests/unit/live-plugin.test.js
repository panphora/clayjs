import { jest } from "@jest/globals";

/**
 * clay.live(name) finds the page's live tag, parses relaxed JSON, returns one
 * handle per name, and never writes the tag.
 */

let live;
let liveTags;

beforeAll(async () => {
  ({ live, liveTags } = await import("../../src/plugins/live.js"));
});

beforeEach(() => {
  document.body.innerHTML = "";
});

test("finds the tag, parses relaxed JSON, and returns one handle per name", () => {
  document.body.innerHTML =
    '<script type="application/json" merge="game" clay="live">{score: 1, players: {}, }</script>';
  const game = live("game");
  expect(game.toJSON()).toEqual({ score: 1, players: {} });
  expect(game.ephemeral).toBe(false);
  expect(live("game")).toBe(game);
});

test("memory is the truth: writes never touch the tag", () => {
  document.body.innerHTML = '<script type="application/json" merge="board" clay="live">{"cells":[0,0]}</script>';
  const board = live("board");
  board.data.cells[1] = 1;
  expect(board.data.cells[1]).toBe(1);
  expect(document.querySelector('[merge="board"]').textContent).toBe('{"cells":[0,0]}');
});

test("the ephemeral token is read", () => {
  document.body.innerHTML = '<script type="application/json" merge="lobby" clay="live ephemeral">{}</script>';
  expect(live("lobby").ephemeral).toBe(true);
});

test("a missing, non-live, templated or external tag is not found", () => {
  document.body.innerHTML =
    '<script type="application/json" merge="plain">{}</script>' +
    '<template><script type="application/json" merge="inner" clay="live">{}</script></template>' +
    '<script type="application/json" merge="ext" clay="live" src="x.json"></script>' +
    '<script type="text/javascript" merge="js" clay="live">{}</script>';
  for (const name of ["nope", "plain", "inner", "ext", "js"]) expect(() => live(name)).toThrow(/no <script/);
});

test("a duplicated name is not live, with a warning", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  document.body.innerHTML =
    '<script type="application/json" merge="twice" clay="live">{}</script>' +
    '<script type="application/json" merge="twice" clay="live">{}</script>';
  expect(liveTags().has("twice")).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/twice/));
  warn.mockRestore();
});

test("bad JSON throws a SyntaxError naming the store", () => {
  document.body.innerHTML = '<script type="application/json" merge="broken" clay="live">{oops</script>';
  expect(() => live("broken")).toThrow(/clay.live\("broken"\)/);
});
