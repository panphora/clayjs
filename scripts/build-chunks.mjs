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
import { BOOT_IMPORTS, EDIT_BOOT_IMPORTS, EDITOR_BOOT_IMPORTS } from "../src/lib/boot-imports.js";

export const BOOT_PREFIX = ["core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js"];
// Chunks an edit boot fetches through a dynamic import, which no static closure sees:
// live sync and conflicts each start their edit half as they evaluate, and edit-mode
// fetches the mode lifecycle when the initial edit activates. They are listed in the
// supplement's edit boot imports, so the loader preloads them with the rest of its plan,
// and only a page that fetched the supplement ever sees the list.
export const EDIT_DYNAMIC_IMPORTS = ["sync/live-sync-edit.js", "sync/conflicts-edit.js", "core/mode-lifecycle.js"];
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
  const { MODULES, CORE_WAVES, PLUGIN_PATHS } = await import(pathToFileURL(path.join(root, "src/loader-logic.js")).href);
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
    ...EDITOR_BOOT_IMPORTS,
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
  // The paths a view-mode plan can name and a satellite preloads: the always core
  // wave, both halves of every plugin that is not edit-only (view names the owner half,
  // a draft the plain one), the boot imports those paths pull in, and every satellite
  // target, which is its own script tag on a page of any mode. Everything else is
  // edit-only and goes to the supplement, so a reader never downloads its index.
  const viewPaths = new Set([
    "loader.js",
    READER_CORE,
    ...CORE_WAVES.always,
    ...Object.values(PLUGIN_PATHS).filter((s) => !s.editOnly).flatMap((s) => [s.path, s.ownerPath].filter(Boolean)),
    ...Object.values(satellites),
  ]);
  const viewBootImports = Object.fromEntries(Object.entries(BOOT_IMPORTS).filter(([p]) => viewPaths.has(p)));
  const editBootImports = Object.fromEntries(Object.entries(BOOT_IMPORTS).filter(([p]) => !viewPaths.has(p)));
  for (const list of Object.values(viewBootImports)) for (const file of list) viewPaths.add(file);
  // The import closure of a set of entries: every file preloadEntries can reach from
  // them, one file at a time in the order it meets them.
  const closureKeys = (paths) => {
    const seen = new Set();
    const add = (file) => {
      if (!file || seen.has(file)) return;
      seen.add(file);
      for (const dep of files[file]?.imports ?? []) add(dep);
    };
    for (const p of paths) add(entries[p]);
    return seen;
  };
  // An empty import list is the same as no key: preloadEntries reads a missing list as
  // an empty one. The supplement skips what the main manifest already lists.
  const importsOf = (want, known = new Set()) => Object.fromEntries(
    [...want].filter((file) => !known.has(file) && files[file].imports.length).map((file) => [file, files[file].imports]),
  );
  const viewEntries = Object.fromEntries(Object.entries(entries).filter(([p]) => viewPaths.has(p)));
  const editEntries = Object.fromEntries(Object.entries(entries).filter(([p]) => !viewPaths.has(p)));
  const viewFiles = closureKeys(Object.keys(viewEntries));
  const viewImports = importsOf(viewFiles);
  const editImports = importsOf(closureKeys(Object.keys(editEntries)), viewFiles);
  const code = `export default ${JSON.stringify({ version, entries: viewEntries, imports: viewImports, bootImports: viewBootImports })};\n`;
  const runtime = `manifest-${sha256(code).slice(0, 8).toUpperCase()}.js`;
  const editCode = `export default ${JSON.stringify({ entries: editEntries, imports: editImports, bootImports: editBootImports, editBootImports: [...EDIT_BOOT_IMPORTS, ...EDIT_DYNAMIC_IMPORTS], editorBootImports: EDITOR_BOOT_IMPORTS })};\n`;
  const editRuntime = `manifest-edit-${sha256(editCode).slice(0, 8).toUpperCase()}.js`;
  for (const [name, body] of [[runtime, code], [editRuntime, editCode]]) {
    await writeFile(path.join(outdir, name), body);
    files[name] = { sha256: sha256(body), bytes: Buffer.byteLength(body), contentType: "text/javascript; charset=utf-8", imports: [], dynamicImports: [] };
  }
  const build = sha256(Object.keys(files).sort().map((f) => `${f} ${files[f].sha256}`).join("\n"));
  const manifest = { schema: 1, package: pkgName, version, build, runtime, edit: editRuntime, entries, files };
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
  // Only an explicit ?editmode=true asks for the supplement, or the window.clayEditMode
  // global a standalone page sets before this script; the owner cookie is not an edit
  // request, because an owner who opens a document in view resolves to view.
  function __clayLikelyEdit(search) {
    var asked = new URLSearchParams(search).get("editmode");
    if (asked) return asked === "true";
    if (typeof clayEditMode !== "undefined") return Boolean(clayEditMode);
    return typeof __hyperclayEditMode !== "undefined" && Boolean(__hyperclayEditMode);
  }
  var likelyEdit = __clayLikelyEdit(window.location.search);
  // The supplement an edit page is about to import, preloaded like the manifest.
  if (likelyEdit) M.preload.push(M.edit);
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
    clay.__runtime = Promise.all([
      import(dir + M.manifest),
      likelyEdit ? import(dir + M.edit).catch(function () { return null; }) : null
    ]).then(function (r) {
      var manifest = r[0].default;
      manifest.base = dir;
      var edit = r[1] ? r[1].default : null;
      var hints = null;
      // The cached hint fetch a resolved edit, draft or first entry uses. A failed one
      // clears itself for retry and never selects another release.
      function loadEditHints() {
        if (!hints) {
          hints = (edit ? Promise.resolve(edit) : import(dir + M.edit).then(function (m) { return m.default; }))
            .catch(function (err) { hints = null; throw err; });
        }
        return hints;
      }
      return { chunks: true, dir: dir, manifest: manifest, edit: edit, loadEditHints: loadEditHints };
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
  const loader = manifest.entries["loader.js"];
  if (!loader) throw new Error("the manifest has no loader.js entry");
  const preload = closureOf(manifest, [loader, manifest.runtime, ...BOOT_PREFIX.map((p) => manifest.entries[p])]);
  const clay = await readFile(path.join(root, "entries/clay.js"), "utf8");
  const code = replaceOnce(
    replaceOnce(
      clay,
      PRELUDE,
      bootstrapSource({ dir: "m/", manifest: manifest.runtime, edit: manifest.edit, preload }),
      "entries/clay.js",
    ),
    'import(base + "/src/loader.js")',
    `__clayChunks.runtime.then(function (R) {
  if (!R.chunks) return import(__clayChunks.tree + "/src/loader.js");
  window.clay.__chunked = true;
  return import(R.dir + R.manifest.entries["loader.js"]).then(function (m) {
    return { boot: function (b, p, resolve) { return m.boot(b, p, resolve, R.manifest, R.edit, R.loadEditHints); } };
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
      dir: "m/",
      manifest: manifest.runtime,
      edit: manifest.edit,
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
