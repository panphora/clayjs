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

// hyper-undo and sapjs delegate "is this node undoable / does this region skip the
// save?" to the platform's region model. They used to read it off the compat shim,
// which built it straight from the module rather than mirroring clay. Drop the shim
// without this member and both go dead with no error and no log.
describe("clay.region", () => {
  test("the core assembly publishes region on clay itself, not only on the shim", () => {
    const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
    const assembly = source.match(/Object\.assign\(clay, \{[\s\S]*?\n {2}\}\);/);
    expect(assembly).not.toBeNull();
    expect(assembly[0]).toMatch(/region: regionPolicy\.windowRegionShape,/);
  });

  test("the published shape carries what the vendors call", async () => {
    const { windowRegionShape } = await import("../../src/lib/region-policy.js");
    expect(typeof windowRegionShape.resolveRegionPolicy).toBe("function");
    expect(typeof windowRegionShape.skipForPolicy).toBe("function");
  });
});

// The vendored hypercms bundle resolves richclay as `clay?.RichClay ?? hyperclay?.RichClay`.
// attachPluginMember used to publish it only on the compat shim, so dropping the shim
// without this leaves hypercms unable to find richclay at all — silently.
test("attachPluginMember publishes the richclay vendor on clay.RichClay", () => {
  const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
  const branch = source.match(/\} else if \(path === "vendor\/richclay\.vendor\.js"\) \{[\s\S]*?\n {2}\}/);
  expect(branch).not.toBeNull();
  // Anchored: `window.hyperclay.RichClay = ...` contains `clay.RichClay = ...` as a
  // substring, so an unanchored match passes on the very code this pins against.
  expect(branch[0]).toMatch(/^ {4}clay\.RichClay = mod\.RichClay \|\| mod\.default;$/m);
});

// options.js assigns this unguarded. It used to write window.hyperclay, which the
// loader had created; on window.clay the satellite bootstrap creates the object, so
// the assignment must land on whatever clay-options.js made.
test("importing the options satellite assigns clay.optionVisibility", async () => {
  window.clay = window.clay || {};

  const mod = await import("../../src/options/options.js");

  expect(window.clay.optionVisibility).toBe(mod.default);
});
