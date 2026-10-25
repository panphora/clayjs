// What a document downloads from clayjs.com, per mode: requests, bytes as served
// (raw, gzip, brotli q4, per file) and dependent fetch stages on a cold load. It
// reads the document's clayjs.com tags and follows the loader's boot order
// (src/loader.js): the boot prefix, then each core module and plugin, each awaited
// before the next one starts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { parse } from "parse5";
import { draftEligible, noteBootParams } from "../src/core/draft-mode.js";
import { resolveModules } from "../src/loader-logic.js";
import { BOOT_IMPORTS, EDIT_BOOT_IMPORTS, EDITOR_BOOT_IMPORTS } from "../src/lib/boot-imports.js";
import { FEATURES, featureForType } from "../src/page/features/registry.js";
import { blocksFromYValue } from "../src/page/ybind/decode.js";
import { parseJsonRelaxed } from "../src/vendor/hyper-morph-json.vendor.js";
import { FONT_SHEETS, compileTheme } from "./build-themes.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CLAY = "https://clayjs.com/v1/";
const CLAY_ORIGIN = new URL(CLAY).origin;
const CLAY_SRC_PATH = "/v1/src/";
const CLAY_FONTS_PATH = "/v1/fonts/";
// The page's own origin, before anything is fetched from it: a relative URL in a
// fixture is a request to the fixture, never to a third party.
const FIXTURE_ORIGIN = "https://fixture.invalid";
const FIXTURES = join(ROOT, "tests/fixtures/load");
const CSS_IMPORT = /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)"']+))\s*\)|"([^"]+)"|'([^']+)')/gi;
const FONT_URL = /url\(\s*["']?([^"')]+\.(?:woff2?|ttf|otf))["']?\s*\)/gi;
const THEME_PATH = /^src\/page\/themes\/([^/]+)\.css$/;

const attrsOf = (node) => Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
const textOf = (node) => (node.childNodes || []).map((child) => child.value ?? textOf(child)).join("");
const PAGE_PLUGIN = "plugins/page.js";
const PAGE_MERGE = /^page(\.[0-9]+)?$/;

// The block types a page will hold, read the way page.js reads them: the strict Yjs
// page store when the file has one, otherwise the `data-type`s of the saved article
// the store is seeded from.
function pageTypes(html) {
  const document = parse(html);
  const saved = [];
  let stored = null;
  const walk = (node) => {
    const attrs = attrsOf(node);
    if (stored === null && node.tagName === "script" && PAGE_MERGE.test(attrs.merge || "") && (attrs.clay || "").split(/\s+/).includes("live")) {
      try { stored = Object.values(blocksFromYValue(parseJsonRelaxed(textOf(node)))).map((block) => block.t); } catch { stored = null; }
    }
    if (Object.hasOwn(attrs, "data-type")) saved.push(attrs["data-type"]);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(document);
  return stored ?? saved;
}

// Every module the page plugin fetches for those types before the editor takes
// input: each feature's own part, plus what only that feature asks for.
function pageFeatureModules(html) {
  const modules = new Set();
  for (const type of pageTypes(html)) {
    const id = featureForType(type);
    if (!id) continue;
    modules.add(FEATURES[id].module);
    for (const path of FEATURES[id].boot ?? []) modules.add(path);
  }
  return [...modules];
}

function parseDocument(html) {
  const document = parse(html);
  const scripts = [];
  const stylesheets = [];
  const fontPreloads = [];
  let rootAttrs = {};
  let apiRules = null;
  let hasSap = false;
  let templateSource = null;

  const walk = (node) => {
    const attrs = attrsOf(node);
    if (node.tagName === "html") rootAttrs = attrs;
    if (node.tagName && Object.hasOwn(attrs, "sap")) hasSap = true;
    if (node.tagName === "meta" && (attrs.name || "").toLowerCase() === "hyper-source") templateSource = attrs.content || null;
    if (node.tagName === "script") {
      if (attrs.src) scripts.push(new URL(attrs.src, FIXTURE_ORIGIN));
      if (!apiRules && (attrs["data-rules-name"] || "").split(/\s+/).includes("api")) {
        apiRules = {
          getAttribute: (name) => attrs[name] ?? null,
          textContent: textOf(node),
        };
      }
    }
    const rel = (attrs.rel || "").split(/\s+/).map((token) => token.toLowerCase());
    if (node.tagName === "link" && rel.includes("stylesheet") && attrs.href) {
      stylesheets.push(attrs.href);
    }
    // A preloaded font is fetched before the sheet that would name it, so it is a
    // request of its own: a page whose font nobody counted still pays for it.
    if (node.tagName === "link" && rel.includes("preload") && (attrs.as || "").toLowerCase() === "font" && attrs.href) {
      fontPreloads.push(attrs.href);
    }
    for (const child of node.childNodes || []) walk(child);
  };
  walk(document);

  const clayScripts = scripts.filter(isClayAsset);
  const core = clayScripts.find((url) => url.pathname === "/v1/clay.js");
  const names = clayScripts
    .filter((url) => url.pathname !== "/v1/clay.js")
    .map((url) => url.pathname.slice("/v1/".length));
  const draftDocument = {
    documentElement: { getAttribute: (name) => rootAttrs[name] ?? null },
    querySelector: (selector) => selector === 'script[data-rules-name~="api"]' ? apiRules : null,
  };

  return {
    bootstrap: Boolean(core),
    params: core?.searchParams ?? new URLSearchParams(),
    names,
    scripts,
    stylesheets,
    fontPreloads,
    hasSap,
    templateSource,
    draftDocument,
  };
}

function isDraftEligible(document) {
  noteBootParams(document.params);
  return document.bootstrap && draftEligible(document.draftDocument, { protocol: "https:" });
}

const sizesByPath = new Map();
function sizes(path, root = ROOT) {
  const key = join(root, path);
  if (sizesByPath.has(key)) return sizesByPath.get(key);
  const buffer = readFileSync(key);
  const value = {
    raw: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    // Brotli quality 4 matches the 378,784 B served for Document view files
    // measured live from clayjs.com on 2026-10-24.
    brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }).length,
  };
  sizesByPath.set(key, value);
  return value;
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
  if (!entryPoints.length) return {};
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [...new Set(entryPoints)],
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

// Breadth-first fetch levels for modules this step newly fetches through static
// imports. Already loaded modules cost nothing and are not walked.
function closure(inputs, entry, loaded) {
  const added = [];
  const visited = new Set();
  let frontier = [entry];
  let levels = 0;
  while (frontier.length) {
    const next = [];
    let fetched = false;
    for (const file of frontier) {
      if (loaded.has(file) || visited.has(file)) continue;
      visited.add(file);
      if (!inputs[file]) continue;
      added.push(file);
      fetched = true;
      next.push(...staticDeps(inputs, file));
    }
    if (fetched) levels++;
    frontier = next;
  }
  for (const f of added) loaded.add(f);
  return { added, levels };
}

function total(files, root = ROOT) {
  const sum = { requests: files.length, raw: 0, gzip: 0, brotli: 0 };
  for (const f of files) {
    const s = sizes(f, root);
    sum.raw += s.raw;
    sum.gzip += s.gzip;
    sum.brotli += s.brotli;
  }
  return sum;
}

// A clayjs.com URL served out of this repo: the release's own assets, so their
// bytes are readable here rather than guessed.
function isClayAsset(url) {
  return url.origin === CLAY_ORIGIN && url.pathname.startsWith("/v1/");
}

function localCssPath(url) {
  if (url.origin !== CLAY_ORIGIN) return null;
  if (url.pathname.startsWith(CLAY_SRC_PATH)) return decodeURIComponent(url.pathname.slice("/v1/".length));
  // The release's font sheets ship beside the font files, at /v1/fonts/<name>.css.
  if (url.pathname.startsWith(CLAY_FONTS_PATH)) return `fonts/${decodeURIComponent(url.pathname.slice(CLAY_FONTS_PATH.length))}`;
  return null;
}

// A request this repo cannot size: another origin's script, stylesheet or font.
// It is still a request the page makes, so it is counted as one with no bytes and
// named here, per origin, for a gate to refuse.
function isThirdParty(url) {
  return url.origin !== CLAY_ORIGIN && url.origin !== FIXTURE_ORIGIN;
}

export function cssImportsOf(css, servedUrl) {
  return [...css.matchAll(CSS_IMPORT)].map((match) => {
    const spec = match.slice(1).find(Boolean);
    const url = new URL(spec, servedUrl);
    return { url: url.href, path: localCssPath(url) };
  });
}

// A theme whose families all have a vendored sheet is served compiled: build.js writes
// that text at the document's own URL, so a Document's stylesheet is one request that
// names the release's fonts rather than a chain that reaches Google. A theme the build
// cannot compile is still the authored chain.
async function servedTheme(path) {
  const match = THEME_PATH.exec(path);
  if (!match) return null;
  const source = readFileSync(join(ROOT, path), "utf8");
  const families = [...source.matchAll(/fonts\.googleapis\.com\/css2\?([^"')]+)/g)]
    .flatMap((found) => new URLSearchParams(found[1]).getAll("family"))
    .map((value) => value.split(":")[0].toLowerCase());
  if (!families.length || !families.every((family) => FONT_SHEETS[family])) return null;
  return compileTheme({ root: ROOT, name: match[1], outPath: path });
}

function localFont(url) {
  if (url.origin !== CLAY_ORIGIN || !url.pathname.startsWith("/v1/fonts/")) return null;
  const path = `fonts/${decodeURIComponent(url.pathname.slice("/v1/fonts/".length))}`;
  return existsSync(join(ROOT, path)) ? path : null;
}

// Stylesheets, then the fonts they name: a font is fetched one stage after its sheet,
// and is reported on its own line so the JavaScript ceiling cannot hide it. A sheet or
// a font from another origin is a request too, so it counts against the line and is
// named in `thirdParty` instead of being sized here.
async function cssOf(document) {
  const external = [];
  const files = [];
  const fontFiles = new Map();
  const externalFonts = new Map();
  const thirdParty = new Map();
  const seen = new Set();
  let depth = 0;
  const named = (url, kind) => {
    if (!thirdParty.has(url.href)) thirdParty.set(url.href, { url: url.href, origin: url.origin, kind });
  };
  const queue = [
    ...document.stylesheets.map((href) => ({ href, stage: 1, kind: "stylesheet" })),
    ...document.fontPreloads.map((href) => ({ href, stage: 1, kind: "font" })),
  ];
  while (queue.length) {
    const { href, stage, kind } = queue.shift();
    const url = new URL(href, FIXTURE_ORIGIN);
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    if (kind === "font") {
      const local = localFont(url);
      if (local) fontFiles.set(url.href, { path: local, stage });
      else if (isThirdParty(url)) named(url, "font");
      continue;
    }
    const path = localCssPath(url);
    if (!path || !existsSync(join(ROOT, path))) {
      external.push(url.href);
      if (isThirdParty(url)) {
        named(url, "stylesheet");
        depth = Math.max(depth, stage);
      }
      continue;
    }
    files.push(path);
    depth = Math.max(depth, stage);
    const compiled = await servedTheme(path);
    const text = compiled ?? readFileSync(join(ROOT, path), "utf8");
    if (!compiled) {
      for (const imported of cssImportsOf(text, url)) {
        if (imported.path && existsSync(join(ROOT, imported.path))) queue.push({ href: imported.url, stage: stage + 1, kind: "stylesheet" });
        else {
          external.push(imported.url);
          if (isThirdParty(new URL(imported.url))) named(new URL(imported.url), "stylesheet");
        }
      }
    }
    for (const found of text.matchAll(FONT_URL)) {
      const font = new URL(found[1], url);
      const local = localFont(font);
      if (local) fontFiles.set(font.href, { path: local, stage: stage + 1 });
      else if (!found[1].startsWith("data:")) {
        externalFonts.set(font.href, true);
        if (isThirdParty(font)) named(font, "font");
      }
    }
  }
  const fonts = [...fontFiles.values()];
  const fontDepth = fonts.reduce((most, font) => Math.max(most, font.stage), 0);
  const cssBytes = total(files);
  const fontBytes = total(fonts.map((font) => font.path));
  const count = (kind) => [...thirdParty.values()].filter((entry) => entry.kind === kind).length;
  return {
    css: { ...cssBytes, requests: cssBytes.requests + count("stylesheet"), depth, external },
    fonts: {
      ...fontBytes,
      requests: fontBytes.requests + count("font"),
      depth: fontDepth,
      external: [...externalFonts.keys()],
    },
    thirdParty: [...thirdParty.values()],
  };
}

// Every script the page fetches from another origin. The bytes are not this repo's to
// know, but the request is the page's, so it is counted and named.
function thirdPartyScripts(document) {
  const found = new Map();
  for (const url of document.scripts) {
    if (!isThirdParty(url) || found.has(url.href)) continue;
    found.set(url.href, { url: url.href, origin: url.origin, kind: "script" });
  }
  return [...found.values()];
}

export async function measure({ html, mode }) {
  const document = parseDocument(html);
  const { bootstrap, params, names, hasSap, templateSource } = document;
  const isDraftMode = mode === "draft";
  // An owner can edit, and a copy of a starter template upgrades from its own
  // `hyper-source`: both are requests the page really makes before ready.
  const plan = bootstrap
    ? resolveModules(params, mode === "edit" || isDraftMode, { isDraftMode, hasSap, canEdit: true, templateSource })
    : { core: [], plugins: [] };
  const targets = names.map(satelliteTarget).filter(Boolean);
  const graphEntries = [...(bootstrap ? ["src/loader.js"] : []), ...targets.map((target) => `src/${target}`)];
  const inputs = await readGraph(graphEntries);

  const steps = bootstrap ? [
    "loader.js", "core/draft-mode.js", "core/is-edit-mode.js", "lib/region-policy.js",
    ...plan.core, ...plan.plugins,
  ].map((step) => `src/${step}`) : [];

  const loaded = new Set();
  let mainDepth = bootstrap ? 1 : 0;
  for (const step of steps) {
    const fetched = closure(inputs, step, loaded);
    mainDepth += fetched.levels;
    for (const importer of fetched.added) {
      if (importer === "src/plugins/derive.js" && names.includes("sap.js")) continue;
      for (const target of BOOT_IMPORTS[importer.replace(/^src\//, "")] || []) {
        mainDepth += closure(inputs, `src/${target}`, loaded).levels;
      }
    }
  }

  // A Document's page plugin loads the editor, and the view parts of the block types
  // the file already has, before input, so they belong to the boot set. The editor is
  // a dynamic target, fetched on demand. Only where the page plugin runs in edit.
  if (mode === "edit" && plan.plugins.includes(PAGE_PLUGIN)) {
    for (const file of EDITOR_BOOT_IMPORTS) mainDepth += closure(inputs, `src/${file}`, loaded).levels;
    for (const file of pageFeatureModules(html)) mainDepth += closure(inputs, `src/${file}`, loaded).levels;
  }

  let satelliteDepth = names.length ? 1 : 0;
  for (const target of targets) {
    const satelliteLoaded = new Set();
    const fetched = closure(inputs, `src/${target}`, satelliteLoaded);
    satelliteDepth = Math.max(satelliteDepth, 1 + fetched.levels);
    for (const path of satelliteLoaded) loaded.add(path);
  }
  const depth = Math.max(mainDepth, satelliteDepth);

  const classic = [...(bootstrap ? ["entries/clay.js"] : []), ...names.map((name) => `entries/${name}`)];
  const pathSet = new Set(loaded);
  for (const path of classic) pathSet.add(path);
  const paths = [...pathSet];
  const thirdParty = thirdPartyScripts(document);
  const js = { ...total(paths), depth, files: paths.map((path) => ({ path, ...sizes(path) })) };
  js.requests += thirdParty.length;

  // Modules that load after the editor takes input stay out of the numbers above.
  const lateLoaded = new Set(loaded);
  if (plan.late) for (const module of plan.late) closure(inputs, `src/${module}`, lateLoaded);
  js.late = total([...lateLoaded].filter((path) => !loaded.has(path)));

  const lazy = new Set();
  for (const file of loaded) for (const dep of dynamicDeps(inputs, file)) if (!loaded.has(dep)) lazy.add(dep);

  const assets = await cssOf(document);
  return {
    mode,
    bootstrap,
    plugins: plan.plugins,
    js,
    ...assets,
    thirdParty: [...thirdParty, ...assets.thirdParty],
    lazy: [...lazy].sort(),
  };
}

// The payload a generated bootstrap inlines: one JSON object, written without
// newlines, right after the closing `})(` of the wrapper.
function payloadOf(code) {
  const at = code.indexOf("})(");
  if (at < 0) return null;
  const start = at + 3;
  let depth = 0;
  let inString = false;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(code.slice(start, i + 1));
  }
  return null;
}

// A built release is measured from its own files: the bootstrap, the chunks it
// preloads and, one stage later, the chunks the boot plan adds. Nothing is read from
// src/, because nothing on the wire is.
export async function measureBuilt({ html, mode, dir }) {
  const document = parseDocument(html);
  const { bootstrap, params, names, hasSap, templateSource } = document;
  const isDraftMode = mode === "draft";
  const plan = bootstrap
    ? resolveModules(params, mode === "edit" || isDraftMode, { isDraftMode, hasSap, canEdit: true, templateSource })
    : { core: [], plugins: [] };
  const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
  const bootImports = [];
  if (bootstrap) {
    for (const path of [...plan.core, ...plan.plugins]) {
      for (const file of BOOT_IMPORTS[path] ?? []) {
        if (file === "vendor/sap-core.vendor.js" && names.includes("sap.js")) continue;
        bootImports.push(file);
      }
    }
    if (mode === "edit") bootImports.push(...EDIT_BOOT_IMPORTS);
    if (mode === "edit" && plan.plugins.includes(PAGE_PLUGIN)) bootImports.push(...EDITOR_BOOT_IMPORTS, ...pageFeatureModules(html));
  }
  const loaded = new Set();
  const addChunk = (file) => {
    if (!file || loaded.has(`m/${file}`)) return false;
    loaded.add(`m/${file}`);
    return true;
  };
  const addClosure = (paths, into = loaded) => {
    let added = 0;
    const stack = paths.map((p) => manifest.entries[p]).filter(Boolean);
    while (stack.length) {
      const file = stack.pop();
      if (into.has(`m/${file}`)) continue;
      into.add(`m/${file}`);
      added++;
      stack.push(...(manifest.files[file]?.imports ?? []));
    }
    return added;
  };
  const readPayload = (name) => {
    const file = join(dir, name);
    return existsSync(file) ? payloadOf(readFileSync(file, "utf8")) : null;
  };

  let mainDepth = 0;
  if (bootstrap) {
    const payload = readPayload("clay.js");
    if (!payload) throw new Error(`${dir}/clay.js is not a generated bootstrap`);
    loaded.add("clay.js");
    mainDepth = 1;
    let preload = 0;
    for (const file of payload.preload) if (addChunk(file)) preload++;
    if (preload) mainDepth++;
    if (addClosure([...plan.core, ...plan.plugins, ...bootImports])) mainDepth++;
  }

  let satelliteDepth = 0;
  for (const name of names) {
    const payload = readPayload(name);
    // sap.js and clay-data.js import nothing, so the chunk build emits no bootstrap
    // for them and the served file is entries/ itself.
    if (!payload) {
      loaded.add(`entries/${name}`);
      satelliteDepth = Math.max(satelliteDepth, 1);
      continue;
    }
    loaded.add(name);
    let depth = 1;
    let preload = 0;
    for (const file of payload.preload) if (addChunk(file)) preload++;
    if (preload) depth++;
    if (payload.entry && addChunk(payload.entry)) depth++;
    satelliteDepth = Math.max(satelliteDepth, depth);
  }

  const depth = Math.max(mainDepth, satelliteDepth);
  // A satellite with no chunk build entry is served as entries/ itself, so its bytes
  // come from the tree like source mode's do.
  const rootOf = (path) => (path.startsWith("entries/") ? ROOT : dir);
  const totals = (list) => {
    const sum = { requests: list.length, raw: 0, gzip: 0, brotli: 0 };
    for (const path of list) {
      const s = sizes(path, rootOf(path));
      sum.raw += s.raw;
      sum.gzip += s.gzip;
      sum.brotli += s.brotli;
    }
    return sum;
  };
  const thirdParty = thirdPartyScripts(document);
  const js = { ...totals([...loaded]), depth, files: [...loaded].map((path) => ({ path, ...sizes(path, rootOf(path)) })) };
  js.requests += thirdParty.length;

  // Modules that load after the editor takes input stay out of the numbers above.
  const late = new Set(loaded);
  if (plan.late) addClosure(plan.late, late);
  js.late = totals([...late].filter((path) => !loaded.has(path)));

  const lazy = new Set();
  for (const path of loaded) {
    if (!path.startsWith("m/")) continue;
    for (const dep of manifest.files[path.slice(2)]?.dynamicImports ?? []) {
      if (!loaded.has(`m/${dep}`)) lazy.add(`m/${dep}`);
    }
  }

  const assets = await cssOf(document);
  return {
    mode,
    bootstrap,
    plugins: plan.plugins,
    js,
    ...assets,
    thirdParty: [...thirdParty, ...assets.thirdParty],
    lazy: [...lazy].sort(),
  };
}

function parseArgs(argv) {
  const files = [];
  let mode = null;
  let json = false;
  let built = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") mode = argv[++i];
    else if (argv[i] === "--json") json = true;
    else if (argv[i] === "--built") built = argv[++i];
    else files.push(argv[i]);
  }
  return { files, mode, json, built };
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, mode, json, built } = parseArgs(process.argv.slice(2));
  const targets = files.length
    ? files
    : readdirSync(FIXTURES).filter((f) => f.endsWith(".html")).sort().map((f) => join(FIXTURES, f));
  const results = [];
  for (const file of targets) {
    const html = readFileSync(file, "utf8");
    const modes = mode ? [mode] : ["view", "edit", ...(isDraftEligible(parseDocument(html)) ? ["draft"] : [])];
    for (const m of modes) {
      results.push({
        file: relative(ROOT, file),
        ...(built ? await measureBuilt({ html, mode: m, dir: resolve(built) }) : await measure({ html, mode: m })),
      });
    }
  }
  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("file | mode | asset | requests | raw | gzip | brotli | depth");
    for (const r of results) {
      for (const asset of ["js", "css", "fonts"]) {
        const m = r[asset];
        console.log(`${r.file} | ${r.mode} | ${asset} | ${m.requests} | ${kb(m.raw)} | ${kb(m.gzip)} | ${kb(m.brotli)} | ${m.depth}`);
      }
      // Another origin's bytes are not this repo's to know: the request is counted, and
      // named per origin, with no byte figure that could be read as zero.
      const origins = new Map();
      for (const entry of r.thirdParty) origins.set(entry.origin, (origins.get(entry.origin) ?? 0) + 1);
      for (const [origin, requests] of origins) {
        console.log(`${r.file} | ${r.mode} | third-party ${origin} | ${requests} | ? | ? | ? |`);
      }
    }
  }
}
