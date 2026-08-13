/**
 * Boot never leaves a document without a client.
 *
 * Each of these used to be fatal: one broken optional plugin, one malformed cookie,
 * or one typo in a page author's save attribute took the whole library down, and
 * because clay.ready only ever resolved, the failure showed up as an await that
 * hung forever rather than an error anyone could catch.
 */

import cookie from "../../src/lib/cookie.js";
import { captureForSave, captureForComparison } from "../../src/core/snapshot.js";

describe("a malformed cookie does not throw", () => {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

  afterEach(() => {
    if (original) Object.defineProperty(document, "cookie", original);
  });

  test("a value that is not valid percent-encoding returns the raw string", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "isAdminOfCurrentResource=100%",
    });

    // decodeURIComponent('100%') throws URIError. The catch used to call it a
    // second time on the same value, so the second throw escaped — through
    // is-edit-mode's module-scope read, out of the loader's awaited import.
    expect(() => cookie.get("isAdminOfCurrentResource")).not.toThrow();
    expect(cookie.get("isAdminOfCurrentResource")).toBe("100%");
  });

  test("a normal encoded JSON value still decodes", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => `user=${encodeURIComponent(JSON.stringify({ id: 7 }))}`,
    });

    expect(cookie.get("user")).toEqual({ id: 7 });
  });
});

describe("a throwing authored handler costs that handler, not the page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("[onbeforesave] that throws does not break the capture", () => {
    document.body.innerHTML = `
      <div onbeforesave="throw new Error('author typo')">KEEP-A</div>
      <div onbeforesave="this.textContent = 'RAN-B'">start-b</div>
    `;

    let forSave;
    expect(() => { forSave = captureForSave({ emitForSync: false }); }).not.toThrow();
    expect(forSave).toContain("KEEP-A");
    // A later handler still runs: one bad attribute does not abort the rest.
    expect(forSave).toContain("RAN-B");
  });

  test("[onbeforesnapshot] that throws does not break the capture", () => {
    // This one runs earlier than [onbeforesave], on the same boot-fatal path.
    document.body.innerHTML = `<div onbeforesnapshot="throw new Error('author typo')">KEEP-C</div>`;

    expect(() => captureForComparison()).not.toThrow();
    expect(captureForSave({ emitForSync: false })).toContain("KEEP-C");
  });
});
