// What a document downloads from clayjs.com, per mode: requests, bytes as served
// (raw, gzip, brotli q4, per file) and dependent fetch stages on a cold load. It
// reads the document's clayjs.com tags and follows the loader's boot order
// (src/loader.js): the boot prefix, then each core module and plugin, each awaited
// before the next one starts.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { DOCUMENT_LOAD_BUDGET } from "./document-load-budget.mjs";

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

// The cookie a host sets on a document it serves to its owner. The bootstrap predicate
// may read it, so the meter has to present it to measure that boot.
const OWNER_COOKIE = "isAdminOfCurrentResource=1";
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
    late: plan.late || [],
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

// A generated runtime module is `export default {...}` and nothing else.
function hintIndex(file) {
  return JSON.parse(existsSync(file) ? readFileSync(file, "utf8").slice("export default ".length).replace(/;\s*$/, "") : "null");
}

// The bootstrap's own decision, read out of the generated script: whether this page
// asks for the edit supplement before the plan is resolved. Evaluating the function the
// release ships is the only way the meter can agree with the boot it is measuring.
function bootstrapFetchHints(code, { search = "", cookie = "" } = {}) {
  const at = code.indexOf("function __clayLikelyEdit");
  if (at < 0) return false;
  const end = code.indexOf("\n  }", at) + 4;
  const likelyEdit = new Function(`${code.slice(at, end)}\n  return __clayLikelyEdit;`)();
  return Boolean(likelyEdit(search, cookie));
}

// Every module a built file serves, for a build made from this source tree. The
// artifact stays the only source of bytes: a file is named only where this tree's build
// produced the same path with the same sha256 the artifact's own manifest lists, so a
// stale or hand-made directory is measured unnamed rather than misnamed.
const namesByDir = new Map();
async function chunkModulesOf(dir, manifest) {
  const key = resolve(dir);
  if (namesByDir.has(key)) return namesByDir.get(key);
  const modules = new Map();
  let outdir = null;
  try {
    const { emitChunks } = await import("./build-chunks.mjs");
    outdir = mkdtempSync(join(tmpdir(), "clay-measure-names-"));
    const built = await emitChunks({ root: ROOT, outdir: join(outdir, "m") });
    for (const [out, meta] of Object.entries(built.metafile.outputs)) {
      const file = relative(join(outdir, "m"), resolve(ROOT, out)).split("\\").join("/");
      const fresh = built.manifest.files[file];
      const measured = manifest.files[file];
      if (!fresh || !measured || measured.sha256 !== fresh.sha256) continue;
      modules.set(file, Object.keys(meta.inputs ?? {}).map((path) => path.replace(/^src\//, "")));
    }
  } catch {
    modules.clear();
  } finally {
    if (outdir) rmSync(outdir, { recursive: true, force: true });
  }
  namesByDir.set(key, modules);
  return modules;
}

// The save path, the merge engine's own code and the block features are what a later
// phase can be named after: a module one of them fetches is bytes that trigger pays.
const SAVE_ASSET = /^(core\/save|core\/autosave|core\/page-data-write|core\/source-map|core\/snapshot|core\/persist|core\/style-comparisons|core\/admin-attrs|attrs\/(add-from|onaftersave|refetch-on-save|save-freeze)|lib\/cache-bust|vendor\/parse5)/;
const ADOPT_ASSET = /^(sync\/|vendor\/hyper-morph|vendor\/hyper-html-api-upgrade|page\/adopt)/;
const FIRST_USE = "firstUse";

// A built release is measured from its own files: the bootstrap, the chunks it
// preloads and, one stage later, the chunks the boot plan adds. Nothing is read from
// src/, because nothing on the wire is. `search` and `owner` are the boot context the
// bootstrap's own decision reads: the meter defaults to an owner at the document's own
// URL, the boot a starter template's reader actually makes. A file is counted once, in
// the phase that first pays it: view ready, the editor's increment, the work the page
// starts by itself, then the first save, first merge and first feature use.
export async function measureBuilt({ html, mode, dir, search = "", owner = true }) {
  const document = parseDocument(html);
  const { bootstrap, params, names, hasSap, templateSource } = document;
  const isDraftMode = mode === "draft";
  const plan = bootstrap
    ? resolveModules(params, mode === "edit" || isDraftMode, { isDraftMode, hasSap, canEdit: true, templateSource })
    : { core: [], plugins: [] };
  // What a reader of the same document reaches before ready: an edit page fetches it
  // too, and a byte counted there is not counted again in the editor's increment.
  const viewPlan = bootstrap
    ? resolveModules(params, false, { isDraftMode: false, hasSap, canEdit: true, templateSource })
    : { core: [], plugins: [] };
  const manifest = JSON.parse(readFileSync(join(dir, "m/manifest.json"), "utf8"));
  const chunkModules = await chunkModulesOf(dir, manifest);
  const bootImportsOf = (target) => {
    const list = [];
    for (const path of [...target.core, ...target.plugins]) {
      for (const file of BOOT_IMPORTS[path] ?? []) {
        if (file === "vendor/sap-core.vendor.js" && names.includes("sap.js")) continue;
        list.push(file);
      }
    }
    return list;
  };
  const editBootImports = mode === "edit"
    ? [...EDIT_BOOT_IMPORTS, ...(plan.plugins.includes(PAGE_PLUGIN) ? EDITOR_BOOT_IMPORTS : [])]
    : [];

  const seen = new Set();
  const boot = [];
  const push = (path, into) => {
    if (!path || seen.has(path)) return false;
    seen.add(path);
    into.push(path);
    return true;
  };
  let entries = manifest.entries;
  const addClosure = (paths, into) => {
    let added = 0;
    const stack = paths.map((p) => entries[p]).filter(Boolean);
    while (stack.length) {
      const file = stack.pop();
      if (!push(`m/${file}`, into)) continue;
      added++;
      stack.push(...(manifest.files[file]?.imports ?? []));
    }
    return added;
  };
  // The view-mode reach of the same document, on its own seen set: a reader's part that
  // the editor replaced (page-view for page) is the reader's alone, and a chunk this
  // boot never fetches belongs to no phase of it.
  const viewReach = new Set();
  const reach = (chunks) => {
    const stack = [...chunks];
    while (stack.length) {
      const file = stack.pop();
      if (!file || viewReach.has(`m/${file}`)) continue;
      viewReach.add(`m/${file}`);
      stack.push(...(manifest.files[file]?.imports ?? []));
    }
  };
  const reachPaths = (paths) => reach(paths.map((p) => entries[p]).filter(Boolean));
  const readBootstrap = (name) => {
    const file = join(dir, name);
    const code = existsSync(file) ? readFileSync(file, "utf8") : null;
    return { code, payload: code ? payloadOf(code) : null };
  };
  const readPayload = (name) => readBootstrap(name).payload;

  let mainDepth = 0;
  if (bootstrap) {
    const { code, payload } = readBootstrap("clay.js");
    if (!payload) throw new Error(`${dir}/clay.js is not a generated bootstrap`);
    push("clay.js", boot);
    viewReach.add("clay.js");
    mainDepth = 1;
    // A reader downloads the main manifest and only the main manifest. The edit supplement
    // is fetched beside the manifest when the bootstrap's own predicate says so, and for a
    // resolved edit or draft by the loader's cached hint fetch; either way it is one
    // request in the stage beside the plan, and without it the hints the main manifest
    // lacks are deferred, never lost.
    const eagerHints = bootstrapFetchHints(code, { search, cookie: owner ? OWNER_COOKIE : "" });
    const hintsWanted = eagerHints || mode !== "view";
    const supplement = hintsWanted && payload.edit ? hintIndex(join(dir, "m", payload.edit)) : null;
    if (supplement) {
      push(`m/${payload.edit}`, boot);
      if (mode === "view") viewReach.add(`m/${payload.edit}`);
      entries = { ...supplement.entries, ...manifest.entries };
    }
    let preload = 0;
    for (const file of payload.preload) if (push(`m/${file}`, boot)) preload++;
    if (preload) mainDepth++;
    // The bootstrap's own preload is the reader's, in every mode: the loader, its
    // runtime index and the always-wave core a satellite would otherwise repeat.
    reach(payload.preload);
    reachPaths([...viewPlan.core, ...viewPlan.plugins, ...bootImportsOf(viewPlan)]);
    // The plan this boot resolves: an edit page asks for page, never for page-view.
    const bootPaths = mode === "view"
      ? [...viewPlan.core, ...viewPlan.plugins, ...bootImportsOf(viewPlan)]
      : [...plan.core, ...plan.plugins, ...editBootImports];
    if (addClosure(bootPaths, boot)) mainDepth++;
    // A feature's view part is not one of the chunks a boot preloads: page.js imports it
    // once it has evaluated, so it is a fetch stage after the preloaded plan.
    if (mode === "edit" && plan.plugins.includes(PAGE_PLUGIN) && addClosure(pageFeatureModules(html), boot)) mainDepth++;
  }

  let satelliteDepth = 0;
  for (const name of names) {
    const payload = readPayload(name);
    // sap.js and clay-data.js import nothing, so the chunk build emits no bootstrap
    // for them and the served file is entries/ itself.
    if (!payload) {
      push(`entries/${name}`, boot);
      viewReach.add(`entries/${name}`);
      satelliteDepth = Math.max(satelliteDepth, 1);
      continue;
    }
    push(name, boot);
    viewReach.add(name);
    let depth = 1;
    let preload = 0;
    for (const file of payload.preload) {
      if (push(`m/${file}`, boot)) preload++;
      viewReach.add(`m/${file}`);
    }
    if (preload) depth++;
    if (payload.entry) {
      if (push(`m/${payload.entry}`, boot)) depth++;
      viewReach.add(`m/${payload.entry}`);
    }
    satelliteDepth = Math.max(satelliteDepth, depth);
  }

  const phases = {
    viewReady: boot.filter((path) => viewReach.has(path)),
    editReady: boot.filter((path) => !viewReach.has(path)),
    late: [],
    firstSave: [],
    firstAdoption: [],
    firstUse: [],
  };

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
  // What the page holds when the person can act: the reader's boot plus the editor's own.
  const loaded = [...boot];
  const js = { ...totals(loaded), depth, files: loaded.map((path) => ({ path, ...sizes(path, rootOf(path)) })) };
  js.requests += thirdParty.length;

  // Modules that load after the editor takes input stay out of the numbers above.
  if (plan.late) addClosure(plan.late, phases.late);

  const lazy = new Set();
  const loadedSet = new Set(loaded);
  for (const path of loaded) {
    if (!path.startsWith("m/")) continue;
    for (const dep of manifest.files[path.slice(2)]?.dynamicImports ?? []) {
      if (!loadedSet.has(`m/${dep}`)) lazy.add(`m/${dep}`);
    }
  }

  // The triggers a page reaches without a request: an incoming merge, a save, a feature
  // the boot did not carry. Each is measured once, after everything the page already
  // held, and a chunk a later trigger fetches inherits that trigger's phase.
  const modulesOf = (path) => (path.startsWith("m/") ? chunkModules.get(path.slice(2)) ?? [] : []);
  const triggerOf = (target, from) => {
    for (const [phase, pattern] of [["firstSave", SAVE_ASSET], ["firstAdoption", ADOPT_ASSET]]) {
      if (modulesOf(target).some((name) => pattern.test(name))) return phase;
    }
    for (const [phase, pattern] of [["firstSave", SAVE_ASSET], ["firstAdoption", ADOPT_ASSET]]) {
      if (modulesOf(from).some((name) => pattern.test(name))) return phase;
    }
    return FIRST_USE;
  };
  const dynamicsOf = (path) => (path.startsWith("m/") ? manifest.files[path.slice(2)]?.dynamicImports ?? [] : []);
  const queue = [];
  for (const path of loaded) {
    for (const dep of dynamicsOf(path)) queue.push({ target: `m/${dep}`, from: path, key: triggerOf(`m/${dep}`, path) });
  }
  for (const path of phases.late) {
    for (const dep of dynamicsOf(path)) queue.push({ target: `m/${dep}`, from: path, key: "late" });
  }
  // Automatic late work first, then the save, then the merge, then a feature: a chunk
  // two triggers share is paid once, by the trigger that comes first in this order.
  const TRIGGER_ORDER = ["late", "firstSave", "firstAdoption", FIRST_USE];
  queue.sort((a, b) => TRIGGER_ORDER.indexOf(a.key) - TRIGGER_ORDER.indexOf(b.key));
  while (queue.length) {
    const { target, from, key } = queue.shift();
    const stack = [target.slice(2)];
    const added = [];
    while (stack.length) {
      const file = stack.pop();
      if (!push(`m/${file}`, phases[key])) continue;
      added.push(`m/${file}`);
      stack.push(...(manifest.files[file]?.imports ?? []));
    }
    for (const path of added) {
      for (const dep of dynamicsOf(path)) queue.push({ target: `m/${dep}`, from: path, key });
    }
  }

  // The automatic late work is measured with what the late plugins themselves start:
  // an idle page pays for that too, so the late line cannot leave it out.
  js.late = totals(phases.late);

  const phaseReport = {};
  for (const [key, list] of Object.entries(phases)) {
    phaseReport[key] = {
      ...totals(list),
      files: list.map((path) => ({ path, ...sizes(path, rootOf(path)) })),
      modules: [...new Set(list.flatMap(modulesOf))].sort(),
    };
  }

  const assets = await cssOf(document);
  const ceiling = mode === "view" ? DOCUMENT_LOAD_BUDGET.readerBrotli : DOCUMENT_LOAD_BUDGET.textEditorBrotli;
  return {
    mode,
    bootstrap,
    plugins: plan.plugins,
    late: plan.late || [],
    js,
    ...assets,
    thirdParty: [...thirdParty, ...assets.thirdParty],
    lazy: [...lazy].sort(),
    artifact: resolve(dir),
    manifest: {
      schema: manifest.schema,
      package: manifest.package,
      version: manifest.version,
      build: manifest.build,
      runtime: manifest.runtime,
      edit: manifest.edit,
    },
    phases: phaseReport,
    budget: {
      line: mode === "view" ? "readerBrotli" : "textEditorBrotli",
      limit: ceiling,
      measured: js.brotli,
      within: js.brotli <= ceiling,
      stretchLimit: DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli,
      stretchReached: mode === "view" ? null : js.brotli <= DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli,
      depthLimit: DOCUMENT_LOAD_BUDGET.maxBuiltDepth,
      depthWithin: depth <= DOCUMENT_LOAD_BUDGET.maxBuiltDepth,
    },
  };
}

const PHASE_ROWS = [
  ["viewReady", "phase view ready"],
  ["editReady", "phase edit ready"],
  ["late", "phase automatic late"],
  ["firstSave", "phase first save"],
  ["firstAdoption", "phase first adoption"],
  ["firstUse", "phase first use"],
];

function usage(message) {
  console.error(`measure-load: ${message}`);
  console.error("usage: node scripts/measure-load.mjs [--mode view|edit|draft] [--json] [--built <build directory>] [fixture ...]");
  process.exit(2);
}

function fail(message) {
  console.error(`measure-load: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const files = [];
  let mode = null;
  let json = false;
  let built = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) usage("--mode needs view, edit or draft");
      if (!["view", "edit", "draft"].includes(value)) usage(`--mode ${value} is not view, edit or draft`);
      mode = value;
    } else if (argv[i] === "--json") json = true;
    else if (argv[i] === "--built") {
      // A bare --built used to measure source and print it as built: no directory, no report.
      const value = argv[++i];
      if (!value || value.startsWith("--")) usage("--built needs the directory a build wrote");
      built = value;
    } else files.push(argv[i]);
  }
  return { files, mode, json, built };
}

const kb = (n) => (n / 1024).toFixed(1) + " KB";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, mode, json, built } = parseArgs(process.argv.slice(2));
  const dir = built ? resolve(built) : null;
  if (dir && !existsSync(join(dir, "m", "manifest.json"))) fail(`no build manifest at ${join(dir, "m", "manifest.json")}`);
  const targets = files.length
    ? files
    : readdirSync(FIXTURES).filter((f) => f.endsWith(".html")).sort().map((f) => join(FIXTURES, f));
  for (const file of targets) {
    if (!existsSync(file)) fail(`no fixture at ${resolve(file)}`);
  }
  const results = [];
  for (const file of targets) {
    const html = readFileSync(file, "utf8");
    const modes = mode ? [mode] : ["view", "edit", ...(isDraftEligible(parseDocument(html)) ? ["draft"] : [])];
    for (const m of modes) {
      results.push({
        file: relative(ROOT, file),
        ...(dir ? await measureBuilt({ html, mode: m, dir }) : await measure({ html, mode: m })),
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
      // The artifact this row was measured from, its build identity, then each phase.
      if (r.phases) {
        console.log(`${r.file} | ${r.mode} | built ${r.artifact} | build ${r.manifest.build} | ${r.manifest.package} ${r.manifest.version}`);
        for (const [key, label] of PHASE_ROWS) {
          const phase = r.phases[key];
          console.log(`${r.file} | ${r.mode} | ${label} | ${phase.requests} | ${kb(phase.raw)} | ${kb(phase.gzip)} | ${kb(phase.brotli)} |`);
        }
        console.log(`${r.file} | ${r.mode} | budget ${r.budget.line} | ${r.budget.measured} | ${r.budget.limit} | ${r.budget.within ? "within" : "over"}`);
        if (r.budget.stretchReached !== null) {
          console.log(`${r.file} | ${r.mode} | stretch ${r.budget.stretchLimit} | ${r.budget.measured} | ${r.budget.stretchReached ? "reached" : "not reached"}`);
        }
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
