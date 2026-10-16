/**
 * An edit made in the same task a save starts in. The save's baseline is the data
 * it captured, so the later edit stays pending and the next hide writes it, rather
 * than becoming the baseline of a record that never held it.
 */
import { bootDraftTab, DRAFT } from "./helpers/visitor-drafts-tab.js";

test("an edit made while a save is in flight is stored by the next pagehide", async () => {
  const { clay, key } = await bootDraftTab({ slot: "save-race-1", draft: DRAFT });
  const note = document.getElementById("note");

  note.value = "First edit";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  const saving = clay.save();
  note.value = "Second edit while save starts";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await saving;

  expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("First edit");

  window.dispatchEvent(new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("Second edit while save starts");
});
