import { captureForSave } from "../../src/core/snapshot.js";
import { preloadEntries } from "../../src/lib/preload.js";

/**
 * The loader preloads its whole resolved plan in one round trip before it imports
 * anything. The links are runtime chrome: a save must not carry them and live sync
 * must not merge them.
 */

const m = {
  base: "https://cdn.test/1.0.0/m/",
  entries: { "a.js": "a-1.js", "b.js": "b-1.js" },
  imports: { "a-1.js": ["c-1.js"], "b-1.js": ["c-1.js"], "c-1.js": [] },
};

const links = () => [...document.head.querySelectorAll('link[rel="modulepreload"]')];

beforeEach(() => {
  document.head.innerHTML = "";
});

test("a whole plan adds one link per file in the closure, shared deps once", () => {
  expect(preloadEntries(m, ["a.js", "b.js"])).toBe(3);

  expect(links().map((link) => link.href)).toEqual([
    "https://cdn.test/1.0.0/m/a-1.js",
    "https://cdn.test/1.0.0/m/c-1.js",
    "https://cdn.test/1.0.0/m/b-1.js",
  ]);
  for (const link of links()) expect(link.getAttribute("clay")).toBe("no-save");
});

test("a second call over the same plan adds nothing", () => {
  preloadEntries(m, ["a.js", "b.js"]);

  expect(preloadEntries(m, ["a.js", "b.js"])).toBe(0);
  expect(links().length).toBe(3);
});

test("a file the page already preloads is not preloaded twice", () => {
  const existing = document.createElement("link");
  existing.rel = "modulepreload";
  existing.href = "https://cdn.test/1.0.0/m/c-1.js";
  document.head.append(existing);

  expect(preloadEntries(m, ["a.js", "b.js"])).toBe(2);
  expect(links().length).toBe(3);
});

test("no manifest means no preloading", () => {
  expect(preloadEntries(null, ["a.js"])).toBe(0);
  expect(links()).toEqual([]);
});

test("a path the manifest does not know adds nothing", () => {
  expect(preloadEntries(m, ["nope.js"])).toBe(0);
  expect(links()).toEqual([]);
});

test("a save carries no preload link", () => {
  preloadEntries(m, ["a.js", "b.js"]);
  expect(links().length).toBe(3);

  const forSave = captureForSave({ emitForSync: false });

  expect(forSave).not.toContain("modulepreload");
  expect(forSave).not.toContain("a-1.js");
});
