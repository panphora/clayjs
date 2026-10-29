import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CORE_WAVES, PLUGIN_PATHS, MODULES } from "../../src/loader-logic.js";

/**
 * The loader imports every module through MODULES, a table of literal imports,
 * so a bundler can see the whole graph: that is what makes the single-file
 * build possible. A path in CORE_WAVES or PLUGIN_PATHS with no entry here fails
 * at runtime, on that page, for that plugin only, and nothing else would notice.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const loader = readFileSync(join(ROOT, "src/loader.js"), "utf8");

const direct = [...loader.matchAll(/MODULES\["([^"]+)"\]/g)].map((m) => m[1]);
const wanted = [
  ...direct,
  ...CORE_WAVES.always,
  ...CORE_WAVES.editOnly,
  ...Object.values(PLUGIN_PATHS).map((spec) => spec.path),
  ...Object.values(PLUGIN_PATHS).map((spec) => spec.ownerPath).filter(Boolean),
];

test("the loader asks for some modules by name", () => {
  expect(direct.length).toBeGreaterThan(0);
});

test("every path the loader can ask for has an entry", () => {
  expect(wanted.filter((path) => typeof MODULES[path] !== "function")).toEqual([]);
});

test("every entry is reachable from the loader", () => {
  expect(Object.keys(MODULES).filter((path) => !wanted.includes(path))).toEqual([]);
});

test("every entry imports the file its key names, and that file exists", () => {
  for (const [path, thunk] of Object.entries(MODULES)) {
    const spec = String(thunk).match(/import\("\.\/([^"]+)"\)/);
    expect(spec && spec[1]).toBe(path);
    expect(existsSync(join(ROOT, "src", path))).toBe(true);
  }
});

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "vendor") out.push(...sources(abs));
    } else if (name.endsWith(".js")) {
      out.push(abs);
    }
  }
  return out;
}

// Comments talk about `import(base + …)` too; only code counts.
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// A computed specifier or import.meta.url is what the bundle cannot carry: esbuild
// leaves it in place, and the page reaches for the network at that line. The
// vendored bundles are excluded because they are built elsewhere and cannot be
// fixed here; the loader and the plugins are ours. The one exception imports the
// document's own `text/hyper-upgrade` module from a blob URL: that code is the
// author's, never a ClayJS module, so there is nothing for the bundle to carry.
const DOCUMENT_CODE = new Set(["src/core/upgrade-run.js"]);
// Server modules run in Node, never in a page bundle: a worker's file URL is theirs to read.
const SERVER_CODE = "src/server/";

test("no module under src/ computes an import specifier or reads import.meta", () => {
  const offenders = [];
  for (const file of sources(join(ROOT, "src"))) {
    if (DOCUMENT_CODE.has(file.slice(ROOT.length))) continue;
    if (file.slice(ROOT.length).startsWith(SERVER_CODE)) continue;
    const text = code(readFileSync(file, "utf8"));
    if (/import\s*\((?!\s*["'])/.test(text) || /import\.meta/.test(text)) {
      offenders.push(file.slice(ROOT.length));
    }
  }
  expect(offenders).toEqual([]);
});
