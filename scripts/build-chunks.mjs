// One esbuild build of every runtime entry: the loader, each module the loader can ask
// for (MODULES in src/loader-logic.js) and each satellite's target. Splitting gives
// every module exactly one output, so a page never runs two copies of save, sync or
// page state. The manifest maps logical paths to hashed files and lists each file's
// static imports, so a bootstrap and the loader can preload a closure in one round trip.
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BOOT_IMPORTS, EDIT_BOOT_IMPORTS } from "../src/lib/boot-imports.js";

export const BOOT_PREFIX = ["core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js"];
// The one build entry that carries the always-wave core (src/reader-core.js).
const READER_CORE = "reader-core.js";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function satelliteTargets(root) {
  const out = {};
  for (const name of (await readdir(path.join(root, "entries"))).filter((n) => n.endsWith(".js")).sort()) {
    const src = await readFile(path.join(root, "entries", name), "utf8");
    const found = [...src.matchAll(/import\(base \+ "\/src\/([^"]+)"\)/g)].map((m) => m[1]);
    if (found.length > 1) throw new Error(`entries/${name} imports more than one module from src/`);
    if (found.length) out[name] = found[0];
  }
  return out;
}

export async function emitChunks({ root, outdir, plugins = [] }) {
  const { MODULES, CORE_WAVES } = await import(pathToFileURL(path.join(root, "src/loader-logic.js")).href);
  const { version, name: pkgName } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const satellites = await satelliteTargets(root);
  const bootImports = Object.values(BOOT_IMPORTS).flat();
  const coreExports = Object.fromEntries(CORE_WAVES.always.map((file) => [file, file]));
  // A satellite whose own target is an always-wave module keeps an individual entry
  // as a compatibility wrapper, so it never evaluates the whole wave early.
  const satellitesInCore = new Set(Object.values(satellites).filter((file) => coreExports[file]));
  const logical = [...new Set([
    "loader.js",
    READER_CORE,
    ...Object.keys(MODULES).filter((file) => !coreExports[file] || satellitesInCore.has(file)),
    ...Object.values(satellites),
    ...bootImports,
    ...EDIT_BOOT_IMPORTS,
  ])];
  await rm(outdir, { recursive: true, force: true });
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: logical.map((p) => `src/${p}`),
    outbase: "src",
    outdir,
    bundle: true,
    splitting: true,
    format: "esm",
    minify: true,
    entryNames: "[dir]/[name]-[hash]",
    chunkNames: "c-[hash]",
    external: ["https://*"],
    legalComments: "linked",
    metafile: true,
    logLevel: "warning",
    logOverride: { "commonjs-variable-in-esm": "silent" },
    plugins: [readerCorePlugin(coreExports), ...plugins],
  });
  const rel = (p) => path.relative(outdir, path.resolve(root, p)).split(path.sep).join("/");
  const entries = {};
  const files = {};
  for (const [out, meta] of Object.entries(result.metafile.outputs)) {
    const file = rel(out);
    const bytes = await readFile(path.resolve(root, out));
    files[file] = {
      sha256: sha256(bytes),
      bytes: bytes.length,
      contentType: file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/plain; charset=utf-8",
      imports: (meta.imports ?? []).filter((i) => i.kind === "import-statement" && !i.external).map((i) => rel(i.path)),
      dynamicImports: (meta.imports ?? []).filter((i) => i.kind === "dynamic-import" && !i.external).map((i) => rel(i.path)),
    };
    if (meta.entryPoint) entries[meta.entryPoint.replace(/^src\//, "")] = file;
  }
  // Every always-wave logical path names the aggregate's one file, so the loader, the
  // bootstraps and the meter treat five entries as one request.
  const aggregate = entries[READER_CORE];
  if (!aggregate) throw new Error(`the manifest has no ${READER_CORE} entry`);
  for (const file of Object.keys(coreExports)) entries[file] ??= aggregate;
  const imports = Object.fromEntries(Object.entries(files).filter(([f]) => f.endsWith(".js")).map(([f, v]) => [f, v.imports]));
  const code = `export default ${JSON.stringify({ version, entries, imports, bootImports: BOOT_IMPORTS, editBootImports: EDIT_BOOT_IMPORTS, core: { entry: READER_CORE, exports: coreExports } })};\n`;
  const runtime = `manifest-${sha256(code).slice(0, 8).toUpperCase()}.js`;
  await writeFile(path.join(outdir, runtime), code);
  files[runtime] = { sha256: sha256(code), bytes: Buffer.byteLength(code), contentType: "text/javascript; charset=utf-8", imports: [], dynamicImports: [] };
  const build = sha256(Object.keys(files).sort().map((f) => `${f} ${files[f].sha256}`).join("\n"));
  const manifest = { schema: 1, package: pkgName, version, build, runtime, entries, files };
  await writeFile(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  return { manifest, metafile: result.metafile, satellites };
}

// The loader asks for each always-wave module through MODULES, and every one of
// those thunks is a dynamic import: esbuild gives each its own chunk, so dropping the
// entry roots alone would still cost one request per module. In the built graph each
// of those exact thunks is rewritten to read the namespace src/reader-core.js exports
// under the same logical path. Source mode keeps the plain thunks: only this build
// runs the transform, and it asserts one replacement per path.
function readerCorePlugin(coreExports) {
  return {
    name: "reader-core",
    setup(build) {
      build.onLoad({ filter: /src[\/\\]loader-logic\.js$/ }, async (args) => {
        let source = await readFile(args.path, "utf8");
        for (const [file, key] of Object.entries(coreExports)) {
          source = replaceOnce(
            source,
            `() => import("./${file}")`,
            `() => import("./${READER_CORE}").then((m) => m.core["${key}"])`,
            `the ${file} thunk`,
          );
        }
        return { contents: source, loader: "js" };
      });
    },
  };
}

function replaceOnce(source, needle, replacement, label) {
  const parts = source.split(needle);
  if (parts.length !== 2) throw new Error(`${label} must contain ${needle} exactly once, found ${parts.length - 1}`);
  return parts.join(replacement);
}

function closureOf(manifest, seeds) {
  const want = [];
  const seen = new Set();
  const add = (file) => {
    if (!file || seen.has(file)) return;
    seen.add(file);
    want.push(file);
    for (const dep of manifest.files[file]?.imports ?? []) add(dep);
  };
  for (const seed of seeds) add(seed);
  return want;
}

// The one statement every entry's `/* clay:chunk-prelude */` marker becomes. The
// first bootstrap to run chooses, once, between this release's chunks and the module
// tree beside them, and records the choice on window.clay; every later bootstrap
// imports its own entry from that same choice, so a page never runs two copies of a
// module (two save pipelines, two transform registries).
function bootstrapSource(payload) {
  return `var __clayChunks = (function (M) {
  var clay = window.clay = window.clay || {};
  var dir = new URL(M.dir, base + "/").href;
  var tree = base.slice(-5) === "/dist" ? base.slice(0, -5) : base;
  var have = {};
  document.head.querySelectorAll('link[rel="modulepreload"]').forEach(function (link) { have[link.href] = true; });
  M.preload.forEach(function (file) {
    var href = dir + file;
    if (have[href]) return;
    have[href] = true;
    var link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = href;
    link.setAttribute("clay", "no-save");
    document.head.appendChild(link);
  });
  if (!clay.__runtime) {
    clay.__runtime = import(dir + M.manifest).then(function (r) {
      var manifest = r.default;
      manifest.base = dir;
      return { chunks: true, dir: dir, manifest: manifest };
    }, function (err) {
      console.warn("clayjs: the bundled runtime did not load, loading the module tree instead:", err);
      return { chunks: false, tree: tree };
    });
  }
  return { tree: tree, runtime: clay.__runtime };
})(${JSON.stringify(payload)})`;
}

const PRELUDE = "/* clay:chunk-prelude */";

export async function emitBootstraps({ root, outdir, manifest, satellites }) {
  const { version } = manifest;
  const loader = manifest.entries["loader.js"];
  if (!loader) throw new Error("the manifest has no loader.js entry");
  const preload = closureOf(manifest, [loader, manifest.runtime, ...BOOT_PREFIX.map((p) => manifest.entries[p])]);
  const clay = await readFile(path.join(root, "entries/clay.js"), "utf8");
  const code = replaceOnce(
    replaceOnce(
      clay,
      PRELUDE,
      bootstrapSource({ version, dir: "m/", manifest: manifest.runtime, preload }),
      "entries/clay.js",
    ),
    'import(base + "/src/loader.js")',
    `__clayChunks.runtime.then(function (R) {
  if (!R.chunks) return import(__clayChunks.tree + "/src/loader.js");
  window.clay.__chunked = true;
  return import(R.dir + R.manifest.entries["loader.js"]).then(function (m) {
    return { boot: function (b, p, resolve) { return m.boot(b, p, resolve, R.manifest); } };
  });
})`,
    "entries/clay.js",
  );
  await writeFile(path.join(outdir, "clay.js"), code);
  for (const [name, target] of Object.entries(satellites)) {
    if (name === "clay.js") continue;
    const entry = manifest.entries[target];
    if (!entry) throw new Error(`the manifest has no ${target} entry`);
    const source = await readFile(path.join(root, "entries", name), "utf8");
    const prelude = bootstrapSource({
      version,
      dir: "m/",
      manifest: manifest.runtime,
      preload: closureOf(manifest, [entry, manifest.runtime]),
    });
    const satellite = replaceOnce(
      replaceOnce(source, PRELUDE, prelude, `entries/${name}`),
      `import(base + "/src/${target}")`,
      `__clayChunks.runtime.then(function (R) {
  if (!R.chunks) return import(__clayChunks.tree + "/src/${target}");
  var file = R.manifest.entries["${target}"];
  if (!file) throw new Error("clayjs: release " + R.manifest.version + " has no ${target}");
  return import(R.dir + file);
})`,
      `entries/${name}`,
    );
    await writeFile(path.join(outdir, name), satellite);
  }
}
