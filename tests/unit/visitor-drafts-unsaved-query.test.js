/**
 * clay.hasUnsavedChanges() in draft mode: a predicate, not a save. It answers "the
 * last write to this browser's storage failed", so a host that asks it on every
 * dirty/clean event pays nothing and changes nothing. The write itself happens on
 * hide and on beforeunload, which flushes before it asks.
 */
import { jest } from "@jest/globals";
import { bootDraftTab, settle } from "./helpers/visitor-drafts-tab.js";

test("clay.hasUnsavedChanges() writes nothing, even with an edit pending", async () => {
  const { clay, key } = await bootDraftTab({ slot: "unsaved-query-1" });

  const note = document.getElementById("note");
  note.value = "typed but not stored yet";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  expect(localStorage.getItem(key)).toBeNull();

  const realSetItem = Storage.prototype.setItem;
  const setItem = jest.fn(function (name, value) { return realSetItem.call(this, name, value); });
  Storage.prototype.setItem = setItem;
  try {
    expect(clay.hasUnsavedChanges()).toBe(false);
    expect(setItem.mock.calls).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  } finally {
    Storage.prototype.setItem = realSetItem;
  }
});
