import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Every top-level classic bootstrap dynamically imports one ES module from /src.
// If a bootstrap's import target is missing, the tag is dead on arrival. This
// asserts the wiring is intact for each satellite (and core).
const BOOTSTRAPS = [
  "clay.js",
  "clay-ui.js",
  "clay-events.js",
  "clay-options.js",
  "clay-dom.js",
  "all.js",
  "clay-utils.js",
];

test.each(BOOTSTRAPS)("%s imports a src target that exists on disk", (file) => {
  const source = readFileSync(join(repoRoot, file), "utf8");
  const match = source.match(/import\(base \+ "(\/src\/[^"]+)"\)/);
  expect(match).not.toBeNull();
  const target = match[1].replace(/^\//, "");
  expect(existsSync(join(repoRoot, target))).toBe(true);
});

// The two generated satellites are self-contained classic scripts: they must NOT
// dynamic-import (nothing to CORS-fetch) and must NOT carry ESM export syntax.
test.each(["sap.js", "clay-data.js"])("%s is a self-contained classic script", (file) => {
  const source = readFileSync(join(repoRoot, file), "utf8");
  expect(source).not.toMatch(/import\(/);
  expect(source).not.toMatch(/^export[\s{]/m);
});
