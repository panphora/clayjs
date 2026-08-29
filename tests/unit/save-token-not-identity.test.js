// Scenario: a durable file identity is not a save credential.
//
// One list used to serve two jobs. It named every host-injected root attribute so
// an incoming morph could be kept away from them, and it was also the list the
// token reader walked. So htmlclayid, added for the first job, silently became a
// credential for the second: saveToken() returns the first name it finds, and
// whatever comes back goes into the save URL and gates edit mode.
//
// That is reachable rather than theoretical. htmlclay stamps htmlclayid on every
// serve but injects a save token only for top-level document loads, and its save
// route strips only the token, so the id reaches disk on the first save. Host such
// a file anywhere that mints no token and this library posted to
// /_/save/{htmlclayid} with credentials omitted, and showed edit mode to everyone.

import { SAVE_TOKEN_ATTRS, LEGACY_SAVE_TOKEN_ATTRS, HOST_IDENTITY_ATTRS, HOST_TOKEN_ATTRS, isTabLocalRootAttr } from "../../src/lib/root-attrs.js";

test("the token list holds no durable identity", () => {
  expect(SAVE_TOKEN_ATTRS).toEqual(["savetoken"]);
  expect(SAVE_TOKEN_ATTRS).not.toContain("htmlclayid");
  expect(SAVE_TOKEN_ATTRS).not.toContain("documentid");
});

test("a document carrying only a file identity has no save token", async () => {
  document.documentElement.setAttribute("htmlclayid", "durable-file-uuid");

  const { saveToken, hasSaveToken } = await import("../../src/core/host-attrs.js");

  expect(saveToken()).toBe(null);
  expect(hasSaveToken()).toBe(false);
});

test("a file identity alone does not turn edit mode on", async () => {
  document.documentElement.setAttribute("htmlclayid", "durable-file-uuid");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(false);
});

// The pre-rename spelling is not a credential any more. This is a deliberate break: a
// document served by an htmlclay at or below 1.8.0, which injects only the old name,
// keeps edit mode through that host's cookie and 404s on every save. Taken knowingly,
// while htmlclay is days old and pre-launch, rather than carrying a second credential
// name in the save path forever. host-attrs.js warns in the console so the failure names
// its own cause. ⚠️ htmlclay 1.9.0 must publish before this does.
test("the pre-rename spelling is not read as a save token", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");

  const { saveToken, hasSaveToken } = await import("../../src/core/host-attrs.js");

  expect(saveToken()).toBe(null);
  expect(hasSaveToken()).toBe(false);
});

// The warning that break carries is asserted in legacy-token-warning.test.js. It fires once per
// module instance, and the test above already consumed it: jest caches host-attrs.js for the whole
// file, so a spy installed after that import would watch a warning that had already happened.

// The edit-mode half lives in is-edit-mode-legacy-token.test.js. is-edit-mode.js decides once, at
// import, and jest caches the module for the whole file, so a second import here would read the
// value the identity test above already fixed rather than the DOM in front of it.

// Read and stripped are separate jobs, and the wider list is what the strip and the morph guard
// consult. A host injects the old name, so a tab loaded from one holds it on the root, and it must
// not be written into the document on save or handed to a peer through a morph.
test("the pre-rename spelling still never reaches disk", () => {
  expect(LEGACY_SAVE_TOKEN_ATTRS).toEqual(["htmlclaytoken"]);
  expect(HOST_TOKEN_ATTRS).toContain("htmlclaytoken");
  expect(isTabLocalRootAttr("htmlclaytoken", document.documentElement)).toBe(true);
});

test("a document carrying both spellings resolves to the current one", async () => {
  document.documentElement.setAttribute("savetoken", "tok-spec");
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");

  const { saveToken } = await import("../../src/core/host-attrs.js");

  expect(saveToken()).toBe("tok-spec");
});

// The identity still needs the protection it was added for. Splitting the lists
// must not quietly drop it out of the morph guard, or a peer's frame could strip
// this tab's copy of an attribute that is absent from disk bytes.
test("the file identity keeps its morph protection", () => {
  expect(HOST_IDENTITY_ATTRS).toContain("documentid");
  expect(HOST_TOKEN_ATTRS).toContain("documentid");
  expect(isTabLocalRootAttr("documentid", document.documentElement)).toBe(true);
});

// The legacy spelling is not a migration step. Every .htmlclay file saved before
// the rename carries htmlclayid on disk forever, and a morph that does not know
// the name strips this tab's copy of it.
test("the pre-spec identity spelling keeps its protection too", () => {
  expect(HOST_IDENTITY_ATTRS).toContain("htmlclayid");
  expect(isTabLocalRootAttr("htmlclayid", document.documentElement)).toBe(true);
});

// The order is the contract with host-attrs.js, which takes the first name it
// finds. A document carrying both must resolve to the current one.
test("the current identity spelling is read first", () => {
  expect(HOST_IDENTITY_ATTRS[0]).toBe("documentid");
});

test("every token spelling keeps its morph protection too", () => {
  for (const name of [...SAVE_TOKEN_ATTRS, ...LEGACY_SAVE_TOKEN_ATTRS]) {
    expect(isTabLocalRootAttr(name, document.documentElement)).toBe(true);
  }
});
