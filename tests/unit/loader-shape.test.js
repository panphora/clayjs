import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The public scripts live in entries/ and are flattened to the root of the served
// site by build.js, so read them from entries/ and resolve their /src targets from
// the repo root, which is where the flatten puts src/ relative to them.
const entriesDir = join(repoRoot, "entries");

// Every top-level classic bootstrap dynamically imports one ES module from /src.
// If a bootstrap's import target is missing, the tag is dead on arrival. This
// asserts the wiring is intact for each satellite (and core).
const BOOTSTRAPS = [
  "clay.js",
  "clay-ui.js",
  "clay-internals.js",
  "clay-events.js",
  "clay-options.js",
  "clay-dom.js",
  "all.js",
  "clay-utils.js",
];

test.each(BOOTSTRAPS)("%s imports a src target that exists on disk", (file) => {
  const source = readFileSync(join(entriesDir, file), "utf8");
  const match = source.match(/import\(base \+ "(\/src\/[^"]+)"\)/);
  expect(match).not.toBeNull();
  const target = match[1].replace(/^\//, "");
  expect(existsSync(join(repoRoot, target))).toBe(true);
});

// clay-events' [onrender] sweeps the document the instant its import resolves, and
// those handlers routinely reach for clay-dom's element helpers (this.val, this.exec,
// this.nearest). The two satellites are independent dynamic imports, so without this
// gate events can win on a cold load and every handler throws "Cannot read properties
// of undefined" — intermittently, and looking like stale data rather than a failure.
// Observed on the official devlog template; see the templates-to-clayjs change record.
describe("clay-events waits for clay-dom", () => {
  const source = readFileSync(join(entriesDir, "clay-events.js"), "utf8");

  test("it gates on clay.loaded.dom before importing its src target", () => {
    expect(source).toMatch(/clay\.loaded\.dom/);
    // Ordering is the whole point: the gate is worthless after the import.
    expect(source.indexOf("clay.loaded.dom")).toBeLessThan(
      source.indexOf('import(base + "/src/events/index.js")')
    );
  });

  test("a clay-dom that failed to load does not take events down with it", () => {
    const gate = source.match(/return clay\.loaded\.dom[^;]*;/);
    expect(gate).not.toBeNull();
    // Swallowed, not chained: a rejected clay.loaded.dom must not reject clay.loaded.events.
    expect(gate[0]).toMatch(/\.catch\(/);
  });

  test("the gate is optional, so clay-events alone still boots", () => {
    // `clay.loaded.dom &&` is what makes a page without clay-dom.js proceed instead
    // of awaiting undefined forever.
    expect(source).toMatch(/clay\.loaded\.dom &&/);
  });
});

// The two generated satellites are self-contained classic scripts: they must NOT
// dynamic-import (nothing to CORS-fetch) and must NOT carry ESM export syntax.
test.each(["sap.js", "clay-data.js"])("%s is a self-contained classic script", (file) => {
  const source = readFileSync(join(entriesDir, file), "utf8");
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

// Same silent failure as the richclay pin above: the vendored hypercms bundle
// resolves the cropper as `clay?.quickcrop ?? hyperclay?.quickcrop`, so a loader
// that loads the vendor file without publishing the member leaves every
// data-hcms-crop field uploading the raw image with no error and no log.
test("attachPluginMember publishes the quickcrop vendor on clay.quickcrop", () => {
  const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
  const branch = source.match(/\} else if \(path === "vendor\/quickcrop\.vendor\.js"\) \{[\s\S]*?\n {2}\}/);
  expect(branch).not.toBeNull();
  expect(branch[0]).toMatch(/^ {4}clay\.quickcrop = mod\.quickcrop \|\| mod\.default;$/m);
});

// options.js assigns this unguarded. It used to write window.hyperclay, which the
// loader had created; on window.clay the satellite bootstrap creates the object, so
// the assignment must land on whatever clay-options.js made.
test("importing the options satellite assigns clay.optionVisibility", async () => {
  window.clay = window.clay || {};

  const mod = await import("../../src/options/options.js");

  expect(window.clay.optionVisibility).toBe(mod.default);
});
