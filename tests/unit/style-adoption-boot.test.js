/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { jest } from "@jest/globals";
import { bootStylePage } from "./style-adoption-helpers.js";

/**
 * A Document's own editor CSS is an owned style: `createPageEditor` writes
 * `styleWithLegacyId("page-editor-style", …)` on every boot. Those bytes are only
 * worth stripping where the file already carries that tag (an older editor saved
 * one). Everywhere else the write must not queue the stripper, so parse5 never
 * loads at boot. The split below is the two files a Document can be.
 */

const actual = await import("../../src/core/style-comparisons.js");

const requested = [];
jest.unstable_mockModule("../../src/core/style-comparisons.js", () => {
  requested.push(true);
  return { styleComparisonStripper: actual.styleComparisonStripper };
});

const { save, snapshot } = await bootStylePage({ head: "" });
const { createPageEditor, PAGE_EDITOR_CSS } = await import("../../src/page/editor.js");

const mount = () => document.body.appendChild(document.createElement("div"));
const view = [];

afterEach(() => {
  for (const editor of view.splice(0)) if (!editor.isDestroyed) editor.destroy();
});

test("the page editor over a document with no saved editor style never imports the stripper", async () => {
  const editor = createPageEditor(mount());
  view.push(editor);

  expect(document.getElementById("page-editor-style").textContent).toBe(PAGE_EDITOR_CSS);
  expect(save.getLastSavedDirty()).not.toContain("page-editor-style");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);
  await save.styleAdoptionsSettled();
  expect(requested).toEqual([]);
});

test("the page editor over a document with a saved editor style imports the stripper and strips it", async () => {
  document.head.insertAdjacentHTML(
    "beforeend",
    '<style data-name="page-editor-style" clay="no-data">.old { color: red; }</style>'
  );
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty();
  save.setLastSavedBaselines(forComparison, forDirty);
  expect(save.getLastSavedDirty()).toContain(".old { color: red; }");

  const editor = createPageEditor(mount());
  view.push(editor);

  await save.styleAdoptionsSettled();
  expect(requested.length).toBe(1);
  expect(save.getLastSavedDirty()).not.toContain(".old { color: red; }");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);
});
