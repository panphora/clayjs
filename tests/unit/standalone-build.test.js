import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The single-file build is a deploy artifact both test suites could be green
 * without: nothing else runs esbuild. This builds it and reads the result.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

let bundle;
beforeAll(() => {
  execFileSync("node", ["build.js", "--standalone"], { cwd: ROOT, stdio: "pipe" });
  bundle = readFileSync(join(ROOT, "dist/clay.standalone.js"), "utf8");
}, 60000);

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
    /\bhypercms\s*=\s*\(/,
    /quickcrop v1/,                        // quickcrop's legal comment
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
  expect(bundle.length).toBeGreaterThan(500_000);
  expect(bundle.length).toBeLessThan(3_000_000);
});
