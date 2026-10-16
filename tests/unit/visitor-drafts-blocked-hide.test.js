/**
 * A blocked draft and a visitor who never edited: there is nothing to write, so the
 * hide reports no storage failure and the close is not warned about. The original
 * record stays in the slot.
 *
 * The tab boots first in this file: every boot's store shares the document's events,
 * so a later boot would answer for it.
 */
import { jest } from "@jest/globals";
import { bootDraftTab } from "./helpers/visitor-drafts-tab.js";

const SLOT = "blocked-hide-1";
const BLOCKED = { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "Old title", rows: "old incompatible schema" } };

test("a hide on a blocked draft with no visitor edits fails nothing and does not warn about closing", async () => {
  const realSetItem = Storage.prototype.setItem;
  const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (name, value) {
    if (String(name).includes(":unreadable:")) throw new Error("QuotaExceededError");
    return realSetItem.call(this, name, value);
  });

  try {
    const { clay, key, events } = await bootDraftTab({ slot: SLOT, draft: BLOCKED });
    expect(clay.visitorDrafts.restored()).toMatchObject({ restored: true, partial: true, parked: false, blocked: true });
    const raw = localStorage.getItem(key);

    window.dispatchEvent(new Event("pagehide"));
    const afterHide = events.filter((event) => event.name === "clay:drafts-store-failed").length;

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);

    expect({ failed: afterHide, warned: unload.defaultPrevented }).toEqual({ failed: 0, warned: false });
    expect(localStorage.getItem(key)).toBe(raw);
  } finally {
    setItem.mockRestore();
  }
});
