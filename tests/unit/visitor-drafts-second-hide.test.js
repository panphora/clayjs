/**
 * The second hide flush: edit, hide the tab (which flushes), show it, edit again,
 * and close before the autosave delay. The slot has to hold the second edit, which
 * a flush that only runs while a dirty flag is up would leave as the first one.
 *
 * The tab boots first in this file: every boot's store shares the document's
 * events, so a later boot would answer for it.
 */
import { bootDraftTab, settle } from "./helpers/visitor-drafts-tab.js";

test("a second hide flush after the tab is shown again still writes the newest edit", async () => {
  const { key } = await bootDraftTab({ slot: "second-hide-1" });

  const note = document.getElementById("note");
  note.value = "first keystroke";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();

  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  try {
    document.dispatchEvent(new Event("visibilitychange"));
    expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("first keystroke");

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    note.value = "second keystroke";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("second keystroke");
  } finally {
    delete document.visibilityState;
  }
});
