/**
 * reset() on a returning visitor's page: the draft is gone from the slot and the
 * reload that follows must not write it back. The store keeps nothing to write
 * once it is stopped, so the pagehide the reload fires leaves the slot empty.
 *
 * The tab boots first in this file: every boot's store shares the document's
 * events, so a later boot would answer for it.
 */
import { bootDraftTab, DRAFT } from "./helpers/visitor-drafts-tab.js";

test("reset() stops the store, so the reload's pagehide cannot write the draft back", async () => {
  const { clay, key } = await bootDraftTab({ slot: "reset-1", draft: DRAFT });

  expect(clay.visitorDrafts.hasDraft()).toBe(true);
  expect(document.getElementById("title").textContent).toBe("draft title");

  const realLocation = window.location;
  const fake = { href: "http://localhost/notes.html", reload: () => window.dispatchEvent(new Event("pagehide")) };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  try {
    expect(clay.visitorDrafts.reset()).toBe(true);
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }

  expect(localStorage.getItem(key)).toBeNull();
});
