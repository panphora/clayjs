import * as I from "../../../src/page/items.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

afterEach(() => { document.body.innerHTML = ""; });

const keys = (query) => I.rankItems(I.MENU_ITEMS, query).map((i) => i.key);
const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };

test("every slash menu entry has a one-line description", () => {
  for (const item of I.MENU_ITEMS) {
    expect(typeof item.description).toBe("string");
    expect(item.description.length).toBeGreaterThan(0);
    expect(item.description.length).toBeLessThanOrEqual(48);
    expect(item.description).not.toMatch(/[.\n]$/);
  }
});

test("a search of three or more letters also matches words in the descriptions, after every label match", () => {
  expect(keys("rows")).toEqual(["table"]);
  expect(keys("picture")).toEqual(["image"]);
  expect(keys("tasks")).toEqual(["check"]);
  expect(keys("heading").slice(0, 3)).toEqual(["h1", "h2", "h3"]);
  expect(keys("table")).toEqual(["table", "toc", "csv"]);
});

test("one and two letter searches ignore descriptions", () => {
  expect(keys("a")).toEqual(I.rankItems(I.MENU_ITEMS.map(({ description, ...rest }) => rest), "a").map((i) => i.key));
  expect(keys("ro")).toEqual(I.rankItems(I.MENU_ITEMS.map(({ description, ...rest }) => rest), "ro").map((i) => i.key));
});

test("menu rows show the description under the label", () => {
  const view = editor([["e", "paragraph", ""]]);
  view.coordsAtPos = () => COORDS;
  select(view, posOf(view, "e", true));
  typeText(view, "/");
  const menu = view.dom.parentElement.querySelector(".page-menu");
  const table = [...menu.querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label").textContent === "Table");
  expect(table.querySelector(".page-menu-text .page-menu-desc").textContent).toBe("Rows and columns, paste from a spreadsheet");
  expect(menu.querySelectorAll(".page-menu-desc")).toHaveLength(I.MENU_ITEMS.length);
});
