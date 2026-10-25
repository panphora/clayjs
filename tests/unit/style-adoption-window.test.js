/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { bootStylePage, warn } from "./style-adoption-helpers.js";

/**
 * Opus S1. A style write opens a window where the page reads clean because the
 * stripper has not taken the owned tag out of the stored bytes yet. An edit made
 * in that window through anything but `input` (here a click on a control that
 * changes text) is real work, and the close warning has to say so.
 */

const { save, snapshot, style } = await bootStylePage();

test("an edit made by a click in the adoption window is unsaved and warns", () => {
  expect(save.baselineSettled()).toBe(false);

  style("saved", ".item { color: blue; }");
  // The write is queued and the stripper has not landed: the stored bytes still
  // carry the tag, so the page compares dirty.
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);

  const content = document.getElementById("content");
  const button = document.body.appendChild(document.createElement("button"));
  button.addEventListener("click", () => { content.textContent = "Changed by a click"; });
  button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  button.click();

  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);
  expect(window.clay.hasUnsavedChanges()).toBe(true);
  expect(warn()).toBe(true);
});
