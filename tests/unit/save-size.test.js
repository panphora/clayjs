/**
 * The size of a save is the size of the bytes it sends, counted as UTF-8, and the
 * host's limit is only known when it said a positive safe integer.
 *
 * Everything here is the pure measurement: `saveSize` never asks anybody anything, so
 * these are the numbers every save lane and every import preview is judged by.
 */
import { readFileSync } from "node:fs";
import { saveSize, storedFile } from "../../src/core/save-size.js";
import { splitPage } from "../../src/server/rooms/page-state.js";

const bytesOf = (text) => new TextEncoder().encode(text).byteLength;
const body = (bytes) => "x".repeat(bytes);

test("counts the bytes of the string and echoes a known limit", () => {
  expect(saveSize("hello", 1000)).toEqual({ bytes: 5, maxBytes: 1000, state: "ok" });
});

test("one byte under the limit is near, and still admissible", () => {
  const size = saveSize(body(999), 1000);
  expect(size.bytes).toBe(999);
  expect(size.maxBytes).toBe(1000);
  expect(size.state).toBe("near");
});

test("exactly the limit is admissible: the ceiling is inclusive", () => {
  const size = saveSize(body(1000), 1000);
  expect(size.bytes).toBe(1000);
  expect(size.state).toBe("near");
});

test("one byte over the limit is over", () => {
  const size = saveSize(body(1001), 1000);
  expect(size.bytes).toBe(1001);
  expect(size.state).toBe("over");
});

test("near starts at 80% of the limit, rounded up", () => {
  expect(saveSize(body(7), 10).state).toBe("ok");
  expect(saveSize(body(8), 10).state).toBe("near");
  expect(saveSize(body(7), 9).state).toBe("ok");
  expect(saveSize(body(8), 9).state).toBe("near");
});

test("counts UTF-8 bytes, not string length", () => {
  const html = "é日😀";
  // Two, three and four bytes, and four UTF-16 units between them: the count is the
  // encoded bytes, which is what the host stores.
  expect(html.length).toBe(4);
  expect(saveSize(html, 1000).bytes).toBe(2 + 3 + 4);
  expect(saveSize(html, 1000).bytes).toBe(bytesOf(html));
  // An astral symbol is one code point, two UTF-16 units, four bytes: a limit of eight
  // bytes holds exactly two of them and not a third.
  expect(saveSize("😀😀", 8)).toEqual({ bytes: 8, maxBytes: 8, state: "near" });
  expect(saveSize("😀😀😀", 8)).toEqual({ bytes: 12, maxBytes: 8, state: "over" });
});

test("an empty body has no bytes and is under any real limit", () => {
  expect(saveSize("", 10)).toEqual({ bytes: 0, maxBytes: 10, state: "ok" });
});

test("a missing limit is unknown, and the bytes are still counted", () => {
  for (const missing of [undefined, null]) {
    expect(saveSize("hello", missing)).toEqual({ bytes: 5, maxBytes: null, state: "unknown" });
  }
  expect(saveSize("hello")).toEqual({ bytes: 5, maxBytes: null, state: "unknown" });
});

test("zero, negative, fractional and nonnumeric limits are all unknown", () => {
  for (const bad of [0, -1, -1048576, 1.5, 1000.25, "1000", NaN, Infinity, -Infinity, {}, [], true]) {
    expect(saveSize("hello", bad)).toEqual({ bytes: 5, maxBytes: null, state: "unknown" });
  }
});

test("an unknown limit never calls a body over, however large it is", () => {
  expect(saveSize(body(10000), undefined).state).toBe("unknown");
  expect(saveSize(body(10000), 0).state).toBe("unknown");
});

describe("storedFile: what a 'file' limit measures", () => {
  const TAG = '<script type="application/json" merge="page" clay="live">{"a":1}</script>';

  test("a body limit measures every byte", () => {
    const html = `<body>\n  ${TAG}\n  <article data-rev="1"></article>\n</body>`;
    expect(storedFile(html, null)).toBe(html);
  });

  test("a tag alone on its line leaves with the line, as the host's splitPage cuts it", () => {
    const html = `<body>\n  ${TAG}\n  <article data-rev="1"></article>\n</body>`;
    expect(storedFile(html, "file")).toBe(`<body>\n  <article data-rev="1"></article>\n</body>`);
    const crlf = `<body>\r\n  ${TAG}\r\n  <article data-rev="1"></article>\r\n</body>`;
    expect(storedFile(crlf, "file")).toBe(`<body>\r\n  <article data-rev="1"></article>\r\n</body>`);
  });

  test("a tag sharing its line leaves alone", () => {
    const html = `<body>${TAG}<article data-rev="1"></article></body>`;
    expect(storedFile(html, "file")).toBe(`<body><article data-rev="1"></article></body>`);
  });

  test.each(["document-rich.html", "document-text.html"])("on %s it cuts exactly what the host's splitPage cuts", (name) => {
    const html = readFileSync(new URL(`../fixtures/load/${name}`, import.meta.url), "utf8");
    const { file, state } = splitPage(html);
    expect(state).not.toBeNull();
    expect(storedFile(html, "file")).toBe(file);
  });

  test("a body with no page tag is measured whole", () => {
    const html = "<body><p>plain</p></body>";
    expect(storedFile(html, "file")).toBe(html);
  });
});
