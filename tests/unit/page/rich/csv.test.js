import { CsvError, parseCsv, inferKinds, tableFromCsv } from "../../../../src/page/rich/csv.js";
import { orderedIds } from "../../../../src/page/model.js";

test("BOM, quoted delimiter, doubled quote, and embedded line end stay strings", () => {
  expect(parseCsv('\uFEFFName,Note\r\n"007","hello,""world""\r\nnext"\r\n')).toEqual({
    header: ["Name", "Note"], rows: [["007", 'hello,"world"\r\nnext']],
  });
});

test("CRLF, lone CR, LF, and a trailing newline make exactly three rows", () => {
  expect(parseCsv("a,b\r1,2\r\n3,4\n5,6\n").rows).toEqual([["1", "2"], ["3", "4"], ["5", "6"]]);
});

test("delimiter detection ignores quoted punctuation and ragged rows pad", () => {
  expect(parseCsv('"a,b";c\n1;2;3\n4')).toEqual({ header: ["a,b", "c", ""], rows: [["1", "2", "3"], ["4", "", ""]] });
  expect(parseCsv("a\tb\n1\t2").rows).toEqual([["1", "2"]]);
});

test("unterminated quotes report the opening line", () => {
  expect(() => parseCsv('a,b\n1,"broken\nline')).toThrow(CsvError);
  try { parseCsv('a,b\n1,"broken\nline'); } catch (error) { expect({ code: error.code, line: error.line }).toEqual({ code: "unterminated-quote", line: 2 }); }
});

test("kind inference keeps leading zeros and blanks as text values", () => {
  const rows = [["007", "", "2026-10-21", "1,5"], ["008", "2", "2026-10-22", "2,0"]];
  expect(inferKinds(["id", "amount", "date", "rate"], rows)).toEqual(["text", "number", "date", "number"]);
  expect(inferKinds(["blank", "mixed", "grouped", "invalid date"], [["", "1.2", "1,000,000", "2026-02-30"], ["", "1,3", "2,000,000", "2026-03-01"]])).toEqual(["text", "text", "text", "text"]);
});

test("import emits stored map shapes with IDs, order keys, and a byte-accurate prefix", () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const parsed = parseCsv("name,amount\nAl,01\nBé,2\nC,3");
  const full = tableFromCsv(parsed, { newId });
  expect(Object.keys(full.cols)).toHaveLength(2);
  expect(Object.keys(full.rows)).toHaveLength(3);
  expect(full.cols.id1).toEqual({ pos: expect.any(String), name: "name", kind: "text" });
  expect(full.cols.id2.kind).toBe("text");
  expect(orderedIds(full.rows).map((id) => full.rows[id].cells.id1)).toEqual(["Al", "Bé", "C"]);
  const oneRowBytes = new TextEncoder().encode(JSON.stringify({ cols: full.cols, rows: { id3: full.rows.id3 } })).length;
  n = 0;
  const limited = tableFromCsv(parsed, { maxBytes: oneRowBytes, newId });
  expect(limited.truncated).toEqual({ kept: 1, total: 3 });
  expect(orderedIds(limited.rows)).toEqual(["id3"]);
});
