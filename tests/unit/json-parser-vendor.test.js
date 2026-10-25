/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { parseJsonRelaxed as fromPackage } from "hyper-morph/json-parse";
import { parseJsonRelaxed } from "../../src/vendor/hyper-morph-json.vendor.js";

/**
 * A Document reads its JSON data tags with the small vendor, not with the
 * hyper-morph package: the package's entry pulls in the morph engine and the merge
 * code beside it. The vendor is a copy, so this is the test that keeps the copy
 * honest — same value, same thrown error, same message.
 */

const CASES = [
  ["strict JSON", '{"a":1,"b":[true,false,null],"c":{"d":"e"}}'],
  ["comments", '// leading\n{"a":1 /* inline */}'],
  ["trailing commas", '{"a":1,"b":[1,2,],}'],
  ["single quotes", "{'a':'x','b':\"y\"}"],
  ["unquoted identifier keys", "{a:1,$b:2,_c:3}"],
  ["a float, an exponent and a negative number", "{a:-1.5e3,b:0.25}"],
  ["invalid barewords", "{a:bareword}"],
  ["a bareword as a whole document", "bareword"],
  ["unterminated input", '{a:"unterminated'],
  ["an unterminated object", '{"a":1'],
  ["prototype-looking keys", '{"__proto__":{"polluted":true},"constructor":1,"prototype":2}'],
  ["an empty object and an empty array", '{"a":{},"b":[]}'],
];

const attempt = (fn, text) => {
  try {
    return { returned: JSON.stringify(fn(text)) };
  } catch (error) {
    return { threw: error.constructor.name, message: error.message };
  }
};

test.each(CASES)("%s parses exactly as the package export does", (_label, input) => {
  expect(attempt(parseJsonRelaxed, input)).toEqual(attempt(fromPackage, input));
});

test("thrown errors keep the package's type, message and prototype safety", () => {
  for (const [label, input] of CASES) {
    const vendor = attempt(parseJsonRelaxed, input);
    if (!vendor.threw) continue;
    expect([label, vendor]).toEqual([label, attempt(fromPackage, input)]);
    expect(() => parseJsonRelaxed(input)).toThrow(Error);
  }

  const parsed = parseJsonRelaxed(CASES[10][1]);
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  expect(parsed.polluted).toBeUndefined();
  expect(Object.prototype.polluted).toBeUndefined();
});

test("the vendored file is self-contained: no package specifier escapes it", () => {
  const source = readFileSync(new URL("../../src/vendor/hyper-morph-json.vendor.js", import.meta.url), "utf8");

  expect(source).not.toMatch(/\bfrom\s*["']/);
  expect(source).not.toMatch(/\bimport\s*\(/);
  expect(source).not.toMatch(/require\s*\(/);
  expect(source).toMatch(/export\{[^}]*parseJsonRelaxed/);
});
