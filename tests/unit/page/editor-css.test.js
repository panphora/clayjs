import { PAGE_EDITOR_CSS } from "../../../src/page/editor.js";

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
