/**
 * A persisted textarea bound by a text rule: typing lives in the control's value
 * and `data-value`, which only a save capture copies into the markup. The dirty
 * check and the unchanged-save check read the data a save would store, so both an
 * explicit save and a hide write the typed text.
 */
import { bootDraftTabHolding, DRAFT } from "./helpers/visitor-drafts-tab.js";

const SLOT = "textarea-save-1";

test("a persisted textarea's typing is stored by save and by the next pagehide", async () => {
  const tab = await bootDraftTabHolding({ slot: SLOT, draft: DRAFT, path: "plugins/visitor-drafts.js" });
  const tag = document.querySelector('[data-rules-name="api"]');
  const rules = JSON.parse(tag.textContent);
  rules.note = "#note";
  tag.textContent = JSON.stringify(rules);
  document.getElementById("note").outerHTML = '<textarea id="note" persist>owner note</textarea>';
  const clay = await tab.release();

  const note = document.getElementById("note");
  expect(note.value).toBe(DRAFT.data.note);
  note.value = "Typed paragraph";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  expect(clay.getHTML()).toContain("Typed paragraph");

  await clay.save();
  expect(JSON.parse(localStorage.getItem(tab.key)).data.note).toBe("Typed paragraph");

  note.value = "Second paragraph";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  window.dispatchEvent(new Event("pagehide"));
  expect(JSON.parse(localStorage.getItem(tab.key)).data.note).toBe("Second paragraph");
});
