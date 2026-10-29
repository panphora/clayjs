import { createPageEditor, PAGE_EDITOR_CSS } from "../../../src/page/editor.js";

/**
 * The colours the phase 4 chrome adds must have a light and a dark value, so a
 * dark page does not show a light-mode red or a light-mode selection wash.
 */

const definitions = (name) => [...PAGE_EDITOR_CSS.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());

test.each(["--page-danger", "--page-block-selected"])("%s is defined once for light and once for each dark selector", (name) => {
  expect(definitions(name)).toHaveLength(3);
});

test.each(["--page-danger", "--page-block-selected"])("%s has a different value in the dark set, the same in both dark selectors", (name) => {
  const [light, dark, forced] = definitions(name);
  expect(dark).not.toBe(light);
  expect(forced).toBe(dark);
});

test("the checklist tags are always visible at the design's metrics", () => {
  expect(PAGE_EDITOR_CSS).not.toContain('[data-empty="true"] { opacity: 0 }');
  expect(PAGE_EDITOR_CSS).toContain("height: 23px; padding: 0 7px");
  expect(PAGE_EDITOR_CSS).toContain("float: inline-end");
  expect(PAGE_EDITOR_CSS).not.toMatch(/\.page-li\[data-kind="check"\] { display: flex/);
  expect(PAGE_EDITOR_CSS).toContain('.page-check-chip[data-filled="true"]');
  expect(PAGE_EDITOR_CSS).toContain('.page-check-chip[data-overdue="true"]');
});

test("a text-only document's editor styles the checklist owner picker", () => {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks: { c1: { t: "list_item", pos: "V", c: "Task", kind: "check", owner: "Maya" } } });
  const css = document.getElementById("page-editor-style").textContent;
  for (const selector of [".page-board-owners", ".page-board-people", ".page-board-person", ".page-board-owner-input", ".page-board-face"]) {
    expect(css).toContain(selector);
  }
  // The board's own styles are not loaded, so the picker is styled by the core alone.
  expect(document.getElementById("page-feature-board")).toBe(null);
  view.destroy();
  mount.remove();
});
