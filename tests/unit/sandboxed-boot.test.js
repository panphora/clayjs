/**
 * @jest-environment jsdom
 */

// A sandboxed document (an iframe without allow-same-origin) throws a
// SecurityError on document.cookie. is-edit-mode.js reads a cookie at module
// scope, so before this guard the throw escaped the loader's dynamic import and
// the document lost its client entirely: not read-only, gone.
//
// The two fixes are a pair. The cookie guard is what lets clayjs boot in there at
// all, and the save token is the only edit-mode signal a sandbox can see, because
// the cookie it would otherwise consult is exactly what it cannot read.

function sandboxCookie() {
  Object.defineProperty(document, "cookie", {
    get() { throw new DOMException("The operation is insecure.", "SecurityError"); },
    set() { throw new DOMException("The operation is insecure.", "SecurityError"); },
    configurable: true
  });
}

beforeEach(() => {
  sandboxCookie();
});

test("cookie.get answers null instead of throwing when the jar is unreadable", async () => {
  const cookie = (await import("../../src/lib/cookie.js")).default;

  expect(cookie.get("isAdminOfCurrentResource")).toBeNull();
  expect(() => cookie.remove("isAdminOfCurrentResource")).not.toThrow();
});

test("a save token turns on edit mode where no cookie can be read", async () => {
  document.documentElement.setAttribute("savetoken", "tok-123");

  const mod = await import("../../src/core/is-edit-mode.js");

  expect(mod.isEditMode).toBe(true);
  // Being handed a token is not the same as being the owner: isOwner still
  // answers for the cookie, which here says nothing.
  expect(mod.isOwner).toBe(false);
});
