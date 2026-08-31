/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html?editmode=true"}
 */
import { jest } from "@jest/globals";

// Scenario: ?editmode=true, on a host older than the save-token rename.
//
// is-edit-mode.js lets that URL parameter outrank the stale-host check on purpose:
// it is a person at the keyboard asking for editing on this load, rather than a
// decision baked into a document by an author who could not have known. So the page
// IS editable.
//
// The notice never consulted edit mode, so it appeared anyway and told that person
// their page cannot be edited while they were editing it. Its own message is the
// test: "This page can't be edited" is either true or the notice should not be there.
//
// Its own file because the module builds once on DOM ready and jest caches modules
// per test file, so the query string has to be set before the import that reads it.

const bar = () => document.querySelector("[data-clay-stale-host]");

test("no notice on a stale host when the reader asked for edit mode anyway", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");
  jest.spyOn(console, "warn").mockImplementation(() => {});

  const { isEditMode } = await import("../../src/core/is-edit-mode.js");
  await import("../../src/core/stale-host-notice.js");

  // The premise: this really is the stale-host case, and editing really is on.
  const { servedStaleToken } = await import("../../src/core/host-attrs.js");
  expect(servedStaleToken()).toBe(true);
  expect(isEditMode).toBe(true);

  expect(bar()).toBeNull();
});
