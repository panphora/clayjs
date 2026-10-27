import * as I from "../../../src/page/items.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

/**
 * Finding a command: the tiers the search keeps (exact, label prefix, word or
 * alias prefix, substring, description word), the fuzzy subsequence after them,
 * and the registry that is complete before any optional feature code loads.
 */

const keys = (query) => I.rankItems(I.MENU_ITEMS, query).map((i) => i.key);

test("an exact alias wins outright", () => {
  expect(keys("todo")).toEqual(["check"]);
  expect(keys("h2")[0]).toBe("h2");
  expect(keys("---")).toEqual(["divider"]);
});

test("a label prefix keeps registry order", () => {
  expect(keys("hea")).toEqual(["h1", "h2", "h3", "toggle-h1", "toggle-h2", "toggle-h3", "toc"]);
  expect(keys("t").slice(0, 2)).toEqual(["text", "toggle"]);
});

test("a substring still matches", () => {
  expect(keys("llou")).toEqual(["callout"]);
  expect(keys("  CODE ")).toEqual(["code"]);
});

test("a fuzzy abbreviation is found after the exact ranks", () => {
  expect(keys("hd2")).toEqual(["h2", "toggle-h2"]);
  expect(keys("tgl")).toEqual(["toggle", "toggle-h1", "toggle-h2", "toggle-h3"]);
});

test("equal fuzzy costs keep registry order", () => {
  expect(keys("blst")).toEqual(["bullet", "ordered"]);
  expect(keys("cl")).toEqual(["toggle", "callout", "board", "check"]);
});

test("a lower fuzzy cost comes before a higher one", () => {
  expect(keys("ct")).toEqual(["image", "quote", "toc", "callout", "check", "file", "csv"]);
});

test("every exact rank keeps its priority over a cheaper fuzzy match", () => {
  expect(keys("ed").slice(0, 3)).toEqual(["bullet", "ordered", "csv"]);
  expect(keys("ed").slice(3, 6)).toEqual(["h1", "h2", "h3"]);
});

test("no match, a one-letter query and an over-long query find nothing", () => {
  expect(keys("zz")).toEqual([]);
  expect(keys("z")).toEqual([]);
  expect(keys("a".repeat(33))).toEqual([]);
});

test("an empty or blank query keeps every item in registry order", () => {
  expect(keys("")).toEqual(I.MENU_ITEMS.map((i) => i.key));
  expect(keys("   ")).toEqual(I.MENU_ITEMS.map((i) => i.key));
});

test("every block type is listed before any optional feature code loads", () => {
  const pending = new Promise(() => {});
  const view = editor([["e", "paragraph", ""]], { features: { ensure: () => pending, has: () => false, dispose() {} } });
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "e"));
  typeText(view, "/");
  const labels = [...view.dom.parentElement.querySelectorAll(".page-menu-label")].map((n) => n.textContent);
  expect(labels).toEqual(I.MENU_ITEMS.map((i) => i.label));
  expect(I.MENU_ITEMS.slice(0, I.BLOCK_TYPES.length)).toEqual(I.BLOCK_TYPES);
  expect(I.MENU_ITEMS.slice(I.BLOCK_TYPES.length)).toEqual(I.INSERT_ITEMS);
});
