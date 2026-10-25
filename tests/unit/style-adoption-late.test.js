/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { bootStylePage, warn } from "./style-adoption-helpers.js";

/**
 * Argon G3, the false-dirty half. On a page whose baseline has settled, a script
 * that calls `clay.style()` over an already saved tag has changed nothing a person
 * would lose: the page reads clean while the stripper is still loading, and stays
 * clean once it lands.
 */

const { save, snapshot, style } = await bootStylePage();

test("a clay.style() adoption after the settle reads clean while pending and after it lands", async () => {
  save.releaseBootSettle();
  while (!save.baselineSettled()) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(window.clay.hasUnsavedChanges()).toBe(false);

  const tag = document.querySelector('style[data-name="saved"]');
  expect(style("saved", ".item { color: blue; }")).toBe(tag);
  // Pending: the stored bytes still carry the tag, so the capture really differs.
  expect(snapshot.captureForDirtyCheck()).not.toBe(save.getLastSavedDirty());
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);

  await save.styleAdoptionsSettled();
  expect(snapshot.captureForDirtyCheck()).toBe(save.getLastSavedDirty());
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);
});
