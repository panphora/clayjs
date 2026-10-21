import { cellText } from "../../../../src/page/rich/cell.js";
import { ATOM, BREAK } from "../../../../src/page/projection.js";

test("a plain cell is its own text and a missing cell is empty", () => {
  expect(cellText("Sep 21")).toBe("Sep 21");
  expect(cellText("")).toBe("");
  expect(cellText(undefined)).toBe("");
  expect(cellText(null)).toBe("");
  expect(cellText(42)).toBe("42");
  expect(cellText({ c: 1 })).toBe("");
});

test("a marked cell drops its marks and turns hard breaks into newlines", () => {
  expect(cellText({ c: "Bold link", m: [[4, "b"], [1, ""], [4, 'a["https://x.test"]']] })).toBe("Bold link");
  expect(cellText({ c: `one${ATOM}two`, m: [[3, ""], [1, BREAK], [3, "i"]] })).toBe("one\ntwo");
});

test("an object replacement character typed as text stays text", () => {
  expect(cellText({ c: `a${ATOM}b`, m: [[3, "b"]] })).toBe(`a${ATOM}b`);
});

test("per-unit mark keys read the same as runs", () => {
  expect(cellText({ c: `x${ATOM}`, m: ["b", BREAK] })).toBe("x\n");
});
