import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * entries/clay.js and src/standalone.js carry the same bootstrap by hand: a
 * classic script cannot import the shared part. The pieces that must match are
 * compared here, comments and whitespace aside, so a fix to one cannot quietly
 * miss the other. The currentScript block is not compared: the standalone
 * boots without a src on purpose.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// The slice runs from `start` through the end of `end`, both of which must occur
// exactly once, so a changed line inside the piece shows as a content diff and a
// removed marker fails loudly.
function piece(text, start, end) {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  expect(text.indexOf(start, from + 1)).toBe(-1);
  const to = text.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to + end.length)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const clayjs = read("entries/clay.js");
const standalone = read("src/standalone.js");

test("mintReady is the same in both bootstraps", () => {
  const start = "function mintReady() {";
  const end = "if (!clay.ready) mintReady();";
  expect(piece(standalone, start, end)).toBe(piece(clayjs, start, end));
});

test("the failed-boot retry path is the same in both bootstraps", () => {
  // Not `.catch(function (err) {`: the standalone's satellite handler opens the
  // same way. The sentinel reset is the first line of the retry path in both.
  const start = "clay.__booted = false;";
  const end = "if (reject) reject(err);";
  expect(piece(standalone, start, end)).toBe(piece(clayjs, start, end));
});
