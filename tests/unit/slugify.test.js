import slugify from "../../src/utils/slugify.js";

test("lowercases and hyphenates", () => {
  expect(slugify("Hello there")).toBe("hello-there");
});

test("strips accents and non-word chars, collapses dashes", () => {
  expect(slugify("Café  del  Mar!!")).toBe("cafe-del-mar");
});

test("trims leading/trailing dashes", () => {
  expect(slugify("  --Edge--  ")).toBe("edge");
});

test("preserves .html / .htmlclay extensions (lowercased)", () => {
  expect(slugify("My Page.HTML")).toBe("my-page.html");
  expect(slugify("Notes.htmlclay")).toBe("notes.htmlclay");
});

test("null/undefined => empty string", () => {
  expect(slugify(null)).toBe("");
  expect(slugify(undefined)).toBe("");
});
