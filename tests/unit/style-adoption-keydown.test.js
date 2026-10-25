/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { bootStylePage, until } from "./style-adoption-helpers.js";

/**
 * Argon G3. The editor handles Backspace itself and cancels the key's default, so
 * no `input` event follows it. An edit like that in the adoption window must still
 * keep the settled capture from overwriting the saved baseline: the edit has to
 * stay unsaved, so the next save writes it.
 */

const { save, snapshot, style } = await bootStylePage();

test("a Backspace edit in the adoption window is saved, not absorbed into the baseline", async () => {
  expect(save.baselineSettled()).toBe(false);

  style("saved", ".item { color: blue; }");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);

  const content = document.getElementById("content");
  content.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
  content.textContent = "Edited with Backspace";

  await save.styleAdoptionsSettled();
  save.releaseBootSettle();
  await until(() => save.baselineSettled());

  expect(save.getLastSavedDirty()).not.toContain('data-name="saved"');
  expect(save.getLastSavedDirty()).not.toContain("Edited with Backspace");
  expect(window.clay.hasUnsavedChanges()).toBe(true);
});
