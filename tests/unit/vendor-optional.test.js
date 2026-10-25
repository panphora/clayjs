/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSETS } from "../../scripts/vendor-optional.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = [...ASSETS.map((asset) => asset.file), "LICENSES-optional.md"];

/**
 * The optional libraries are generated files, committed because src/ is what npm
 * publishes and what clayjs.com serves. A version bump or a hand edit that leaves them
 * behind ships a library no package.json pins.
 */

test("the committed files are what the pinned packages build", () => {
  const out = execFileSync("npm", ["run", "--silent", "check:vendor-optional"], { cwd: ROOT, encoding: "utf8" });
  expect(out).toContain("In sync");
});

// --ignore-scripts keeps the pack a listing: the prepack builds the standalone bundle,
// which this test has no business rewriting.
test("the published package carries every vendored file", () => {
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }));
  const published = new Set(packed.files.map((file) => file.path));
  expect(FILES.filter((file) => !published.has(`src/vendor/${file}`))).toEqual([]);
});
