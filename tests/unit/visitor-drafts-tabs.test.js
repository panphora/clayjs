/**
 * Two tabs on one draft slot, through the real loader: what a tab that was never
 * touched does with another tab's newer save, and what it does when that save
 * arrives as a storage event. The untouched tab boots first in this file: every
 * boot's store shares the document's events, so a later boot would answer for it.
 */
import { bootDraftTab, DRAFT, settle, visibleRows } from "./helpers/visitor-drafts-tab.js";

const NEWER = {
  v: 1,
  savedAt: "2026-10-15T01:00:00.000Z",
  data: { title: "newer from the other tab", note: "typed note", rows: [{ id: "r2", name: "Second" }, { id: "r9", name: "an hour of work" }] },
};

test("a tab that restored a draft and was never touched leaves a newer save from another tab alone", async () => {
  const { key } = await bootDraftTab({ slot: "tabs-untouched-1", draft: DRAFT });

  expect(document.getElementById("title").textContent).toBe("draft title");
  // The visitor's other tab saved a newer draft into the same slot.
  localStorage.setItem(key, JSON.stringify(NEWER));

  window.dispatchEvent(new Event("pagehide"));

  expect(JSON.parse(localStorage.getItem(key))).toEqual(NEWER);
});

test("a save arriving from another tab as a storage event is applied when this tab is untouched and ignored when it has its own edit", async () => {
  const { key, events } = await bootDraftTab({ slot: "tabs-event-1", draft: DRAFT });

  window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(NEWER) }));

  expect(document.getElementById("title").textContent).toBe("newer from the other tab");
  expect(visibleRows()).toEqual([["r2", "Second"], ["r9", "an hour of work"]]);
  const restores = events.filter((event) => event.name === "clay:drafts-restored");
  expect(restores.length).toBe(2);
  expect(restores[1].detail).toEqual({ restored: true, hadDraft: true, parked: false, external: true });

  const own = await bootDraftTab({ slot: "tabs-event-2", draft: DRAFT });
  const note = document.getElementById("note");
  note.value = "my own edit";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();

  window.dispatchEvent(new StorageEvent("storage", { key: own.key, newValue: JSON.stringify(NEWER) }));

  expect(document.getElementById("title").textContent).toBe("draft title");
  expect(document.getElementById("note").value).toBe("my own edit");
  expect(visibleRows()).toEqual([["r2", "Second"]]);
});
