// What a document downloads from clayjs.com, per mode: requests, bytes as served
// (raw, gzip, brotli q11, per file) and dependent fetch stages on a cold load. It
// reads the document's clayjs.com tags and follows the loader's boot order
// (src/loader.js): the boot prefix, then each core module and plugin, each awaited
// before the next one starts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { resolveModules } from "../src/loader-logic.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CLAY = "https://clayjs.com/v1/";
const CLAY_SRC = CLAY + "src/";
const FIXTURES = join(ROOT, "tests/fixtures/load");
const SCRIPT_TAG = /<script[^>]*\bsrc="(https:\/\/clayjs\.com\/v1\/[^"]+)"/g;
const LINK_TAG = /<link\b[^>]*>/g;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

const sizesByPath = new Map();
function sizes(path) {
  if (sizesByPath.has(path)) return sizesByPath.get(path);
  const buffer = readFileSync(join(ROOT, path));
  const value = {
    raw: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
  sizesByPath.set(path, value);
  return value;
}

function satellitesOf(html) {
  const scripts = [...html.matchAll(SCRIPT_TAG)].map((m) => new URL(m[1]));
  const core = scripts.find((u) => u.pathname === "/v1/clay.js");
  return {
    params: core ? core.searchParams : new URLSearchParams(),
    names: scripts.filter((u) => u !== core).map((u) => u.pathname.replace("/v1/", "")),
  };
}

// A satellite is a classic script whose own tag fetches one module: the single
// `import(base + "/src/<target>")` in entries/<name>. sap.js and clay-data.js have
// none; they are self-contained.
function satelliteTarget(name) {
  const path = join(ROOT, "entries", name);
  if (!existsSync(path)) return null;
  const match = readFileSync(path, "utf8").match(/import\(base \+ "\/src\/([^"]+)"\)/);
  return match ? match[1] : null;
}

async function readGraph(entryPoints) {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [...new Set(["src/loader.js", ...entryPoints])],
    bundle: true,
    splitting: true,
    format: "esm",
    write: false,
    outdir: "measure-out",
    metafile: true,
    external: ["https://*"],
    logLevel: "silent",
  });
  return result.metafile.inputs;
}

function staticDeps(inputs, file) {
  return (inputs[file]?.imports || [])
    .filter((im) => !im.external && im.kind === "import-statement")
    .map((im) => im.path);
}

function dynamicDeps(inputs, file) {
  return (inputs[file]?.imports || [])
    .filter((im) => !im.external && im.kind === "dynamic-import")
    .map((im) => im.path);
}

// graph.mjs's rule: the longest chain of modules this step newly fetches through
// static imports. Already loaded modules count 0, and a cycle counts once.
function closure(inputs, entry, loaded) {
  const added = [];
  const depth = new Map();
  const walk = (file, d) => {
    if (loaded.has(file)) return 0;
    if (depth.has(file)) return depth.get(file);
    if (!inputs[file]) return 0;
    depth.set(file, d);
    added.push(file);
    let max = 1;
    for (const dep of staticDeps(inputs, file)) max = Math.max(max, 1 + walk(dep, d + 1));
    depth.set(file, max);
    return max;
  };
  const chain = walk(entry, 0);
  for (const f of added) loaded.add(f);
  return { added, chain };
}

function total(files) {
  const sum = { requests: files.length, raw: 0, gzip: 0, brotli: 0 };
  for (const f of files) {
    const s = sizes(f);
    sum.raw += s.raw;
    sum.gzip += s.gzip;
    sum.brotli += s.brotli;
  }
  return sum;
}

function cssOf(html) {
  const external = [];
  const files = [];
  const seen = new Set();
  let depth = 0;
  const walk = (path, stage) => {
    if (seen.has(path)) return;
    seen.add(path);
    files.push(path);
    depth = Math.max(depth, stage);
    for (const match of readFileSync(join(ROOT, path), "utf8").matchAll(CSS_IMPORT)) {
      const spec = match[1];
      if (/^(https?:)?\/\//.test(spec) || spec.startsWith("data:")) {
        external.push(spec);
        continue;
      }
      const next = posix.normalize(spec.startsWith("/") ? spec.slice(1) : posix.join(posix.dirname(path), spec));
      if (next.startsWith("src/") && existsSync(join(ROOT, next))) walk(next, stage + 1);
      else external.push(spec);
    }
  };
  for (const tag of html.matchAll(LINK_TAG)) {
    if (!/\brel="stylesheet"/.test(tag[0])) continue;
    const href = tag[0].match(/\bhref="([^"]+)"/);
    if (!href) continue;
    if (href[1].startsWith(CLAY_SRC)) walk("src/" + href[1].slice(CLAY_SRC.length).split(/[?#]/)[0], 1);
    else external.push(href[1]);
  }
  return { ...total(files), depth, external };
}

export async function measure({ html, mode }) {
  const { params, names } = satellitesOf(html);
  const hasSap = /\ssap[\s>=]/.test(html);
  const plan = resolveModules(params, mode === "edit", { hasSap });
  const targets = names.map(satelliteTarget).filter(Boolean);
  const inputs = await readGraph(targets.map((t) => `src/${t}`));

  const steps = [
    "loader.js", "core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js",
    ...plan.core, ...plan.plugins,
  ].map((step) => `src/${step}`);

  const loaded = new Set();
  let depth = 1; // the classic clay.js entry itself
  for (const step of steps) depth += closure(inputs, step, loaded).chain;

  // Satellites are fetched in parallel with the main chain: no depth.
  for (const target of targets) closure(inputs, `src/${target}`, loaded);

  const classic = ["entries/clay.js", ...names.map((name) => `entries/${name}`)];
  const pathSet = new Set(loaded);
  for (const path of classic) pathSet.add(path);
  const paths = [...pathSet];
  const js = { ...total(paths), depth, files: paths.map((path) => ({ path, ...sizes(path) })) };

  // Modules that load after the editor takes input stay out of the numbers above.
  const lateLoaded = new Set(loaded);
  if (plan.late) for (const module of plan.late) closure(inputs, `src/${module}`, lateLoaded);
  js.late = total([...lateLoaded].filter((path) => !loaded.has(path)));

  const lazy = new Set();
  for (const file of loaded) for (const dep of dynamicDeps(inputs, file)) if (!loaded.has(dep)) lazy.add(dep);

  return { mode, plugins: plan.plugins, js, css: cssOf(html), lazy: [...lazy].sort() };
}

function parseArgs(argv) {
  const files = [];
  let mode = null;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") mode = argv[++i];
    else if (argv[i] === "--json") json = true;
    else files.push(argv[i]);
  }
  return { files, mode, json };
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, mode, json } = parseArgs(process.argv.slice(2));
  const targets = files.length
    ? files
    : readdirSync(FIXTURES).filter((f) => f.endsWith(".html")).sort().map((f) => join(FIXTURES, f));
  const modes = mode ? [mode] : ["view", "edit"];
  const results = [];
  for (const file of targets) {
    const html = readFileSync(file, "utf8");
    for (const m of modes) results.push({ file: relative(ROOT, file), ...(await measure({ html, mode: m })) });
  }
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("file | mode | asset | requests | raw | gzip | brotli | depth");
    for (const r of results) {
      for (const asset of ["js", "css"]) {
        const m = r[asset];
        console.log(`${r.file} | ${r.mode} | ${asset} | ${m.requests} | ${kb(m.raw)} | ${kb(m.gzip)} | ${kb(m.brotli)} | ${m.depth}`);
      }
    }
  }
}
