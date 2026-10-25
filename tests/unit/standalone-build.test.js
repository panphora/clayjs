import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

/**
 * The single-file build is a deploy artifact both test suites could be green
 * without: nothing else runs esbuild. This builds it and reads the result.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const DIST = mkdtempSync(join(os.tmpdir(), "clay-standalone-"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

let bundle;
beforeAll(() => {
  execFileSync("node", ["build.js", "--standalone", `--dist=${DIST}`], { cwd: ROOT, stdio: "pipe" });
  bundle = readFileSync(join(DIST, "clay.standalone.js"), "utf8");
}, 60000);

afterAll(() => {
  rmSync(DIST, { recursive: true, force: true });
});

test("names its version on the first line", () => {
  expect(bundle.split("\n")[0]).toContain(`clayjs ${pkg.version} standalone`);
});

test("is one classic script with nothing left to fetch", () => {
  // Every bundled import becomes a lazy initializer; a real import() left behind
  // is a network request at runtime. Two survive on purpose: autosave-debug's
  // diff library (opt-in debugging, documented as the exception on /offline),
  // and hypercms's `new Function("url", "return import(url)")`, a string no
  // bundler can see, which is the CMS's own optional loader.
  const imports = [...bundle.matchAll(/\bimport\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
  expect(new Set(imports)).toEqual(new Set(['"https://esm.sh/diff@5.2.0"', "url"]));
  expect(bundle).not.toMatch(/import\.meta/);
  expect(bundle).not.toMatch(/__require\(\s*["']/);   // a static external import, see build.js
  expect(bundle).not.toMatch(/^\s*(import|export)\s/m);
});

test("carries the core, every plugin and every satellite", () => {
  // esbuild hoists a lazily initialised module's `var x =` into a bare `x = (`
  // inside its initialiser, and renames a binding that collides (`clay2`), so
  // the markers accept both spellings.
  for (const marker of [
    /clayjs: plugin "/,                    // src/loader.js
    /Sortable 1\.15\.6/,                   // the vendored Sortable's legal comment
    /\brichclay\s*=\s*\(/,
    /(?:\bhypercms\s*=\s*\(|hypercms_vendor_exports|init_hypercms_vendor)/,
    /quickcrop v1/,                        // quickcrop's legal comment
    /@layer clay-skin\{/,                  // src/ui/skins, through the plugin wrappers
    /\bHyperMorph\s*=\s*\(/,               // sync's morph engine
    /\bhyperundo\s*=\s*\(/,
    /\bhyperHtmlApiData\s*=\s*\(/,         // clay-data
    /\bSap\s*=\s*\(/,                      // sap.js
    /\bclay\d*\.utils\s*=\s*\{/,
    /\bclay\d*\.internals\s*=\s*\{/,
    /satellite\("ui"/,
  ]) {
    expect(bundle).toMatch(marker);
  }
  // One skin per wrapper, each installed by name: a wrapper that dropped out of the
  // bundle takes its skin with it.
  expect((bundle.match(/@layer clay-skin\{/g) || []).length).toBeGreaterThanOrEqual(3);
  for (const name of ["richclay", "cms", "quickcrop"]) expect(bundle).toMatch(new RegExp(`installSkin\\d*\\(\\s*"${name}"`));
  expect(bundle.length).toBeGreaterThan(500_000);
  // 4.75 MB. The 4.5 MB ceiling was set at 4.01 MB; what grew it by 534 KB is the
  // reader's own work, all of it code the single-file build is meant to carry: the
  // vendored markdown and highlighting tools loaded on demand (OverType 192 KB, marked
  // 70 KB, highlight.js 35 KB plus 30 KB of grammars and its sheet), the menu and SEO
  // plugin 49 KB, and the reader's page features and saved stream. The guard is there to
  // catch something the size of Shiki's grammars (6.3 MB), which 4.75 MB still does.
  expect(bundle.length).toBeLessThan(4_750_000);
});

// The chunk build adds a generated bootstrap per entry that has a target, plus the
// chunks they select. Each bootstrap is a serveable URL too, so the unversioned-URL
// guard pins it the same way.
const BOOTSTRAPS = ["all.js", "clay-dom.js", "clay-events.js", "clay-internals.js", "clay-options.js", "clay-router.js", "clay-ui.js", "clay-utils.js", "clay.js"];

// The compiled theme the release serves offline travels with the modules, at
// page/themes/light-1.css under each prefix (build.js emitThemeAsset), so dist/page is
// part of the output and the unversioned-URL guard derives from this same listing.
// offline-manifest.json is the release inventory local hosts package from (Document 09).
test("writes exactly the files the unversioned-URL guard pins", () => {
  expect(readdirSync(DIST).sort()).toEqual([...BOOTSTRAPS, "clay.standalone.js", "m", "offline-manifest.json", "page", "server"].sort());
  for (const name of BOOTSTRAPS) {
    expect(readFileSync(join(DIST, name), "utf8")).toContain('"dir":"m/"');
  }
  expect(readdirSync(join(DIST, "m"))).toContain("manifest.json");
  expect(readdirSync(join(DIST, "server")).sort()).toEqual(["checkpoint.cjs", "checkpoint.mjs", "core.cjs", "offline-runtime.cjs", "offline-runtime.mjs", "rooms.cjs", "rooms.mjs"]);
});
