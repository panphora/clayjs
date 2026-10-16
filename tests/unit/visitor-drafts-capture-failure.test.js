/**
 * A capture that throws at hide time. The flush reports the failure, so the close
 * is warned about instead of letting the visitor leave with unsaved work that no
 * storage failure was recorded for.
 */
import { bootDraftTab, DRAFT } from "./helpers/visitor-drafts-tab.js";

test("a capture that throws at hide time warns instead of letting the tab close", async () => {
  const { clay, key } = await bootDraftTab({ slot: "capture-failure-1", draft: DRAFT });

  const note = document.getElementById("note");
  note.value = "Unsaved work";
  note.dispatchEvent(new Event("input", { bubbles: true }));

  clay.onSnapshot(() => { throw new Error("fixture capture failure"); });
  expect(clay.visitorDrafts.saveNow()).toBe(false);

  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);

  expect(unload.defaultPrevented).toBe(true);
  expect(JSON.parse(localStorage.getItem(key)).data.note).toBe(DRAFT.data.note);
});
