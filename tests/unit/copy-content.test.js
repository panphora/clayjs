/**
 * Copy-only content: `clay="no-copy"` and `clay="no-copy-unless:paid-forms"` stay in the
 * file everyone saves, syncs, snapshots and has recovered, and are cut out of the bytes of
 * a copy someone asks for. The cut is a splice on the original string, so every byte
 * outside a marked range survives: doctype, Unicode, CRLF and indentation included.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { stripCopyContent } from "../../src/core/copy-content.js";
import { downloadHtml } from "../../src/core/download.js";

const CASES = JSON.parse(readFileSync(new URL("../fixtures/copy-content.json", import.meta.url), "utf8"));

test.each(['no&#45;copy', 'n&#111;-copy', 'no&#45;copy-unless:paid&#45;forms'])('removes entity-encoded %s markers', token => {
  const html = `<body><script clay="${token}" src="https://signal.hyperclay.com/v1.js"></script><p>Keep</p></body>`;
  expect(stripCopyContent(html)).toBe('<body><p>Keep</p></body>');
});

const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

test("the conformance fixtures are all here", () => {
  expect(Array.isArray(CASES)).toBe(true);
  expect(CASES.length).toBeGreaterThan(0);
  expect(CASES.length).toBe(18);
});

for (const { name, input, expected } of CASES) {
  test(`conformance: ${name}`, () => {
    expect(stripCopyContent(input)).toBe(expected);
  });
}

test("a marked element inside a template's content goes, the template stays", () => {
  const html = '<body>\n  <template id="t">\n    <div clay="no-copy">Promo</div>\n    <p>Kept</p>\n  </template>\n  <p>Tail</p>\n</body>\n';

  expect(stripCopyContent(html)).toBe('<body>\n  <template id="t">\n    <p>Kept</p>\n  </template>\n  <p>Tail</p>\n</body>\n');
});

test("a marked element inside nested templates goes, both templates stay", () => {
  const html = '<body>\n  <template id="outer">\n    <template id="inner">\n      <div clay="no-copy">Deep</div>\n      <span>Stay</span>\n    </template>\n  </template>\n  <p>Tail</p>\n</body>\n';

  expect(stripCopyContent(html)).toBe('<body>\n  <template id="outer">\n    <template id="inner">\n      <span>Stay</span>\n    </template>\n  </template>\n  <p>Tail</p>\n</body>\n');
});

test("an implicit </p> ends the removed range where the parser ends the element", () => {
  const html = '<body>\n  <p clay="no-copy">Drop\n  <p>Keep</p>\n</body>\n';

  expect(stripCopyContent(html)).toBe('<body><p>Keep</p>\n</body>\n');
});

test("an implicit </li> ends the removed range where the parser ends the element", () => {
  const html = '<body>\n  <ul>\n    <li clay="no-copy">Drop\n    <li>Keep</li>\n  </ul>\n</body>\n';

  expect(stripCopyContent(html)).toBe('<body>\n  <ul><li>Keep</li>\n  </ul>\n</body>\n');
});

test("a feature list keeps the conditional region and still drops the unconditional one", () => {
  const html = '<body>\n  <div clay="no-copy">A</div>\n  <div clay="no-copy-unless:paid-forms">B</div>\n</body>\n';

  expect(stripCopyContent(html)).toBe('<body>\n</body>\n');
  expect(stripCopyContent(html, [])).toBe('<body>\n  <div clay="no-copy-unless:paid-forms">B</div>\n</body>\n');
  expect(stripCopyContent(html, ["forms"])).toBe('<body>\n</body>\n');
});

test("a document with no marker comes back as the very same string", () => {
  const html = '<!doctype html>\n<html><body><p>Nothing marked</p></body></html>';
  const kept = stripCopyContent(html);

  expect(kept).toBe(html);
  expect(stripCopyContent(null)).toBe(null);
  expect(stripCopyContent(undefined)).toBe(undefined);
});

test("downloadHtml strips copy-only content for HTML types and leaves other payloads alone", async () => {
  const blobs = [];
  const names = [];
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { names.push(this.download); });
  URL.createObjectURL = jest.fn((blob) => { blobs.push(blob); return "blob:copy"; });
  URL.revokeObjectURL = jest.fn();
  const html = '<body>\n  <div clay="no-copy">tracker</div>\n  <p>Keep</p>\n</body>\n';
  try {
    expect(await downloadHtml({ html, name: "copy.html" })).toBe(true);
    expect(await downloadHtml({ html, name: "copy.xhtml", type: "application/xhtml+xml; charset=utf-8" })).toBe(true);
    expect(await downloadHtml({ html: '<!-- clay="no-copy" --> *markup*', name: "copy.md", type: "text/markdown" })).toBe(true);

    expect(names).toEqual(["copy.html", "copy.xhtml", "copy.md"]);
    expect(await blobText(blobs[0])).toBe('<body>\n  <p>Keep</p>\n</body>\n');
    expect(await blobText(blobs[1])).toBe('<body>\n  <p>Keep</p>\n</body>\n');
    expect(await blobText(blobs[2])).toBe('<!-- clay="no-copy" --> *markup*');
  } finally {
    click.mockRestore();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});
