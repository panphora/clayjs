/**
 * A save whose capture is older than the page: it takes another tab's title, and the
 * row edit made after the capture in the same task is on the page and in the next
 * hide. Only what the save took from the other tab is applied, so the capture cannot
 * put this tab's older rows back.
 *
 * The tab boots first in this file: every boot's store shares the document's events,
 * so a later boot would answer for it.
 */
import { bootDraftTab } from "./helpers/visitor-drafts-tab.js";

const SLOT = "save-race-merge-1";
const OTHER = {
  v: 1,
  savedAt: "2026-10-15T01:00:00.000Z",
  data: { title: "A title", note: "owner note", rows: [{ id: "r1", name: "First" }] },
};

test("a save that took another tab's title keeps an edit made after its capture", async () => {
  const { clay, key } = await bootDraftTab({ slot: SLOT });
  const name = () => document.querySelector('#rows > li[data-id="r1"] .n').textContent;

  localStorage.setItem(key, JSON.stringify(OTHER));

  // An edit of this tab's own, so the save has something to capture.
  document.querySelector('#rows > li[data-id="r1"] .n').textContent = "B first edit";
  const saving = clay.save();
  document.querySelector('#rows > li[data-id="r1"] .n').textContent = "B second edit";
  await saving;

  expect(name()).toBe("B second edit");
  expect(document.getElementById("title").textContent).toBe("A title");

  window.dispatchEvent(new Event("pagehide"));

  const stored = JSON.parse(localStorage.getItem(key)).data;
  expect(stored.title).toBe("A title");
  expect(stored.rows).toEqual([{ id: "r1", name: "B second edit" }]);
});
