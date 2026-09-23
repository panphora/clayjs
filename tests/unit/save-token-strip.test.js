/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

test("a save never carries the host's save token, and keeps the document id", async () => {
  // A save token is a credential for this response, not file content. htmlclay strips
  // it from every save body on arrival, so sending it made the source map's idea of
  // the saved bytes one attribute longer than the file. The document id is different:
  // htmlclay keeps it on disk on purpose.
  document.documentElement.setAttribute("savetoken", "tok");
  document.documentElement.setAttribute("htmlclaytoken", "old");
  document.documentElement.setAttribute("documentid", "doc-1");
  await import("../../src/core/save.js");
  const { captureForSave } = await import("../../src/core/snapshot.js");
  const out = captureForSave({ emitForSync: false });
  expect(out).not.toMatch(/savetoken|htmlclaytoken/);
  expect(out).toContain('documentid="doc-1"');
  expect(document.documentElement.getAttribute("savetoken")).toBe("tok");   // the live page keeps it
});
