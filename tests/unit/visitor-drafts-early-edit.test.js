/**
 * The window between the plugin's restore and clay.ready. visitor-drafts is first in
 * PLUGIN_ORDER, so the page shows the restored draft and takes input while the
 * plugins after it are still loading. The store's baseline is the page as restored,
 * not the page as it looks when boot finishes, so an edit typed in that window is
 * still this tab's work and a hide in that window is not a save of the page as it
 * stands. The tabs boot with a plugin import held pending, which keeps them in that
 * window on purpose.
 */
import { bootDraftTabHolding, DRAFT, settle } from "./helpers/visitor-drafts-tab.js";

test("an edit typed before clay.ready is stored by the next pagehide", async () => {
  const { key, release } = await bootDraftTabHolding({ slot: "early-edit-1", draft: DRAFT });

  const note = document.getElementById("note");
  note.value = "typed while plugins finish loading";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();

  const clay = await release();
  expect(clay.isDraftMode).toBe(true);

  window.dispatchEvent(new Event("pagehide"));

  expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("typed while plugins finish loading");
});

test("a tab hidden before clay.ready with no edits writes nothing", async () => {
  const { key, release } = await bootDraftTabHolding({ slot: "early-hide-1" });

  window.dispatchEvent(new Event("pagehide"));

  expect(localStorage.getItem(key)).toBeNull();

  await release();

  expect(localStorage.getItem(key)).toBeNull();
});

test("a tab hidden during boot does not recreate the slot another tab's reset() removed", async () => {
  const { key, release } = await bootDraftTabHolding({ slot: "early-reset-1", draft: DRAFT });

  localStorage.removeItem(key);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
  window.dispatchEvent(new Event("pagehide"));

  expect(localStorage.getItem(key)).toBeNull();

  await release();
});
