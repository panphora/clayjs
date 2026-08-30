// Scenario: a host too old to save to does not get to look editable.
//
// HTML Clay 1.8.0 and earlier send the pre-rename save token AND set the owner cookie
// on every document serve. This library reads one token name, so it finds none, and the
// cookie rung would otherwise hand the page full edit mode. Every save from that page
// posts to a route that host does not have, so it 404s. An editable page that keeps
// nothing is worse than a read-only one, so the stale host wins over the cookie.
//
// One assertion, its own file: is-edit-mode.js decides at import and jest caches the
// module, so a second import in a shared file reads the first import's answer.

document.cookie = "isAdminOfCurrentResource=true";

test("the old token beats the owner cookie, and edit mode stays off", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(false);
  // The cookie is still there and still true. This is the rung being overruled, not
  // absent: without the stale check this same page reports edit mode on.
  expect(mod.isOwner).toBe(true);
});
