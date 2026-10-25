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

export const BOOT_PREFIX = ["core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js"];
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

export async function emitChunks({ root, outdir }) {
  const { MODULES } = await import(pathToFileURL(path.join(root, "src/loader-logic.js")).href);
  const { version, name: pkgName } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const satellites = await satelliteTargets(root);
  const logical = [...new Set(["loader.js", ...Object.keys(MODULES), ...Object.values(satellites)])];
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
  const imports = Object.fromEntries(Object.entries(files).filter(([f]) => f.endsWith(".js")).map(([f, v]) => [f, v.imports]));
  const code = `export default ${JSON.stringify({ version, entries, imports })};\n`;
  const runtime = `manifest-${sha256(code).slice(0, 8).toUpperCase()}.js`;
  await writeFile(path.join(outdir, runtime), code);
  files[runtime] = { sha256: sha256(code), bytes: Buffer.byteLength(code), contentType: "text/javascript; charset=utf-8", imports: [], dynamicImports: [] };
  const build = sha256(Object.keys(files).sort().map((f) => `${f} ${files[f].sha256}`).join("\n"));
  const manifest = { schema: 1, package: pkgName, version, build, runtime, entries, files };
  await writeFile(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  return { manifest, metafile: result.metafile, satellites };
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

function bootstrapSource(payload, tail) {
  return `(function (M) {
  var dir = new URL(M.dir, base + "/").href;
  var tree = /\/dist$/.test(base) ? base.slice(0, -5) : base;
  M.preload.forEach(function (file) {
    var link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = dir + file;
    link.setAttribute("clay", "no-save");
    document.head.appendChild(link);
  });
${tail}
})(${JSON.stringify(payload)})`;
}

export async function emitBootstraps({ root, outdir, manifest, satellites }) {
  const { version } = manifest;
  const loader = manifest.entries["loader.js"];
  if (!loader) throw new Error("the manifest has no loader.js entry");
  const preload = closureOf(manifest, [loader, manifest.runtime, ...BOOT_PREFIX.map((p) => manifest.entries[p])]);
  const tail = `  return Promise.all([import(dir + M.loader), import(dir + M.manifest)]).then(function (r) {
    var manifest = r[1].default;
    manifest.base = dir;
    window.clay.__chunked = true;
    return { boot: function (b, p, resolve) { return r[0].boot(b, p, resolve, manifest); } };
  }, function (err) {
    console.warn("clayjs: the bundled runtime did not load, loading the module tree instead:", err);
    return import(tree + "/src/loader.js");
  });`;
  const clay = await readFile(path.join(root, "entries/clay.js"), "utf8");
  const code = replaceOnce(
    clay,
    'import(base + "/src/loader.js")',
    bootstrapSource({ version, dir: "m/", loader, manifest: manifest.runtime, preload }, tail),
    "entries/clay.js",
  );
  await writeFile(path.join(outdir, "clay.js"), code);
  for (const [name, target] of Object.entries(satellites)) {
    if (name === "clay.js") continue;
    const entry = manifest.entries[target];
    if (!entry) throw new Error(`the manifest has no ${target} entry`);
    const source = await readFile(path.join(root, "entries", name), "utf8");
    const satelliteTail = `  return import(dir + M.entry).catch(function (err) {
    if (window.clay && window.clay.__chunked) throw err;
    console.warn("clayjs: the bundled runtime did not load, loading the module tree instead:", err);
    return import(tree + "/src/${target}");
  });`;
    const satellite = replaceOnce(
      source,
      `import(base + "/src/${target}")`,
      bootstrapSource({ version, dir: "m/", entry, preload: closureOf(manifest, [entry]) }, satelliteTail),
      `entries/${name}`,
    );
    await writeFile(path.join(outdir, name), satellite);
  }
}

export function rollingBootstrap(code, version) {
  return replaceOnce(code, '"dir":"m/"', `"dir":"../${version}/m/"`, "the bootstrap");
}
