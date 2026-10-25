/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { jest } from "@jest/globals";
import { bootStylePage } from "./style-adoption-helpers.js";

/**
 * Whether a stored baseline carries an owned tag is a byte test over saved HTML, so
 * the marker has to be the bytes the capture writes: a name with `&` in it is
 * `&amp;` in the file. Getting that wrong misses the tag, the adoption is skipped,
 * and the page reads dirty for the life of the tab.
 */

const actual = await import("../../src/core/style-comparisons.js");

const requested = [];
jest.unstable_mockModule("../../src/core/style-comparisons.js", () => {
  requested.push(true);
  return { styleComparisonStripper: actual.styleComparisonStripper };
});

const { save, snapshot, style } = await bootStylePage({
  head:
    '<style data-name="owned&amp;&lt;name" clay="no-data">.owned { color: red; }</style>' +
    '<style data-name="kept" clay="no-data">.kept { color: red; }</style>',
});

test("a saved tag whose name needs escaping is found and stripped", async () => {
  expect(requested).toEqual([]);

  style("owned&<name", ".owned { color: blue; }");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(true);

  await save.styleAdoptionsSettled();
  expect(requested.length).toBe(1);
  expect(save.getLastSavedDirty()).not.toContain(".owned { color: red; }");
  expect(save.getLastSavedDirty()).toContain(".kept { color: red; }");
});

test("a name no stored baseline carries queues nothing, so the stripper never loads again", async () => {
  const before = save.getLastSavedDirty();
  style("absent&<name", ".absent { color: green; }");
  expect(save.styleAdoptionPending(snapshot.captureForDirtyCheck())).toBe(false);

  await save.styleAdoptionsSettled();
  expect(requested.length).toBe(1);
  expect(save.getLastSavedDirty()).toBe(before);
});
