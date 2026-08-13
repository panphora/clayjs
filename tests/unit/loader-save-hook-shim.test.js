import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");

// The vendored richclay and hypercms bundles now read their save-cleanup hook off
// window.clay and fall back to null with no error, so a guard that goes false costs
// them nothing visible and writes their own chrome into every saved file. Nothing
// throws and nothing logs; only this test notices.

test("clay.addDocumentTransform is assigned from the snapshot module", () => {
  expect(source).toMatch(/clay\.addDocumentTransform = snapshot\.addDocumentTransform;/);
});

test("the loader never creates window.hyperclay", () => {
  expect(source).not.toMatch(/window\.hyperclay/);
});

test("the old name is gone from clay's own surface", () => {
  expect(source).not.toMatch(/(?<!hyper)clay\.beforeSave/);
  expect(source).not.toMatch(/snapshot\.beforeSave/);
});
