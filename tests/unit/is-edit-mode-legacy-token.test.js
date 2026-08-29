// Scenario: the pre-rename token name does not, by itself, turn edit mode on.
//
// The old name is no longer a credential, so it cannot be a rung on the edit-mode ladder
// either. On htmlclay the cookie rung still applies and the page stays editable, which is
// exactly why host-attrs.js warns: editable plus unsaveable is the failure worth naming.
//
// One assertion, its own file: is-edit-mode.js decides at import and jest caches the
// module, so a second import in a shared file reads the first import's answer.

test("the pre-rename token spelling alone does not turn edit mode on", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(false);
});
