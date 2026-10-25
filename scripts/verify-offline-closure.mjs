// Proves the release inventory is a complete offline closure: every file it names has the
// recorded bytes, every module and stylesheet reference inside those files resolves to
// another listed file, and every external URL is classified. A local host that bundles
// the release can trust one green run instead of guessing what a page will fetch.
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { init, parse } from "es-module-lexer";
import { assertReleasePath, CONTENT_TYPES } from "./build-offline-manifest.mjs";

const DEFAULT_TYPE = "text/plain; charset=utf-8";

const typeOf = (pub) => CONTENT_TYPES.get(path.posix.extname(pub).toLowerCase()) ?? DEFAULT_TYPE;

// The three non-literal dynamic imports the generated bootstraps use, by their exact
// source text: each one's target comes from the chunk manifest the bootstrap embeds.
const NONLITERAL = {
  "import(dir + M.manifest)": "a bootstrap loads the chunk manifest it embeds the name of",
  "import(R.dir + file)": "a bootstrap imports a chunk the manifest names",
  'import(R.dir + R.manifest.entries["loader.js"])': "clay.js imports the loader chunk the manifest names",
};
const TREE_FALLBACK = /^import\(__clayChunks\.tree \+ "\/(src\/[^"]+)"\)$/;

const URL_REF = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/g;
const IMPORT_REF = /@import\s+(?:"([^"]*)"|'([^']*)')/g;

const HLJS = ["bash", "css", "javascript", "json", "python", "xml"];
const REQUIRED = [
  "page/features/media.js",
  "page/features/tool.js",
  "page/features/table.js",
  "page/features/board.js",
  "plugins/derive.js",
  "vendor/overtype.vendor.js",
  "vendor/marked.vendor.js",
  "vendor/highlight.vendor.js",
  ...HLJS.map((language) => `vendor/hljs-${language}.vendor.js`),
];
const REQUIRED_FONTS = ["fonts/inter-latin-wght-normal.woff2", "fonts/ibm-plex-sans-latin-400-normal.woff2"];

// The Node entries a page never loads: the server bundles at server/, and the
// server-side sources at src/server/ they are built from. Both are counted in `files`.
// src/standalone.js is esbuild's input for clay.standalone.js and names package paths
// (../entries/), which resolve in the package tree, not under a prefix; no page imports it.
const BUILD_ENTRIES = new Set(["src/standalone.js"]);
const isNodeOnly = (pub) => pub.startsWith("server/") || pub.startsWith("src/server/") || BUILD_ENTRIES.has(pub);

const stripQuery = (spec) => spec.replace(/[?#].*$/, "");
const resolveFrom = (pub, spec) => path.posix.join(path.posix.dirname(pub), stripQuery(spec));

// The generated bootstraps carry their payload as the object literal of their last call:
// `})({...})`. Same reading as tests/unit/build/site-build.test.js's embedded().
function embedded(code) {
  const start = code.indexOf("})({");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 3; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return JSON.parse(code.slice(start + 3, i + 1));
  }
  throw new Error("unterminated embedded manifest");
}

export async function verifyOfflineClosure({ packageRoot, publishedRoot } = {}) {
  const packageMode = Boolean(packageRoot) && !publishedRoot;
  const publishedMode = Boolean(publishedRoot) && !packageRoot;
  if (!packageMode && !publishedMode) {
    throw new Error("verifyOfflineClosure needs exactly one of packageRoot and publishedRoot");
  }
  const indexFile = packageMode
    ? path.join(packageRoot, "dist", "offline-manifest.json")
    : path.join(publishedRoot, "offline-manifest.json");
  const index = JSON.parse(await readFile(indexFile, "utf8"));

  const problems = [];
  const result = {
    version: index.version,
    files: 0,
    js: 0,
    css: 0,
    fonts: 0,
    staticEdges: 0,
    dynamicEdges: 0,
    cssRefs: 0,
    external: 0,
    problems,
  };
  const onlineOnly = index.onlineOnly ?? {};
  const aliases = index.aliases ?? {};
  const files = index.files && typeof index.files === "object" ? index.files : {};
  const listed = new Set(Object.keys(files));
  const unsound = new Set();
  result.files = listed.size;

  // 1. Index shape.
  if (index.schema !== 1) problems.push(`index: schema is ${JSON.stringify(index.schema)}, not 1`);
  if (!listed.size) problems.push("index: lists no files");
  for (const pub of listed) {
    try {
      assertReleasePath(pub);
    } catch (err) {
      problems.push(err.message);
      unsound.add(pub);
    }
  }
  for (const [pub, entry] of Object.entries(files)) {
    try {
      assertReleasePath(entry?.source);
    } catch (err) {
      problems.push(`${pub}: ${err.message}`);
      unsound.add(pub);
    }
  }

  // 2. Bytes.
  const bytesBy = new Map();
  for (const pub of listed) {
    if (unsound.has(pub)) continue;
    const entry = files[pub] ?? {};
    const abs = packageMode ? path.join(packageRoot, String(entry.source)) : path.join(publishedRoot, pub);
    let bytes;
    try {
      const stat = await lstat(abs);
      if (!stat.isFile()) throw new Error(`${abs} is not a regular file`);
      bytes = await readFile(abs);
    } catch (err) {
      problems.push(`${pub}: ${err.message}`);
      continue;
    }
    bytesBy.set(pub, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) problems.push(`${pub}: sha256 is ${sha256}, the index records ${entry.sha256}`);
    if (bytes.length !== entry.bytes) problems.push(`${pub}: is ${bytes.length} bytes, the index records ${entry.bytes}`);
    const type = typeOf(pub);
    if (entry.type !== type) problems.push(`${pub}: type is ${JSON.stringify(entry.type)}, the extension serves ${JSON.stringify(type)}`);
  }
  const textOf = (pub) => bytesBy.get(pub)?.toString("utf8");

  // 3. Chunk graph.
  let chunks = null;
  if (!listed.has("m/manifest.json")) {
    problems.push("m/manifest.json: the release does not list the chunk manifest");
  } else if (bytesBy.has("m/manifest.json")) {
    try {
      chunks = JSON.parse(textOf("m/manifest.json"));
    } catch (err) {
      problems.push(`m/manifest.json: ${err.message}`);
    }
  }
  if (chunks) {
    for (const [name, record] of Object.entries(chunks.files ?? {})) {
      const pub = `m/${name}`;
      if (!listed.has(pub)) {
        problems.push(`${pub}: the chunk manifest names it but the release does not list it`);
        continue;
      }
      const entry = files[pub] ?? {};
      if (entry.sha256 !== record.sha256) {
        problems.push(`${pub}: sha256 is ${entry.sha256}, the chunk manifest records ${record.sha256}`);
      }
      if (entry.bytes !== record.bytes) {
        problems.push(`${pub}: is ${entry.bytes} bytes, the chunk manifest records ${record.bytes}`);
      }
      for (const target of record.imports ?? []) {
        result.staticEdges += 1;
        if (!listed.has(`m/${target}`)) problems.push(`${pub}: imports m/${target}, which the release does not list`);
      }
      for (const target of record.dynamicImports ?? []) {
        result.dynamicEdges += 1;
        if (!listed.has(`m/${target}`)) problems.push(`${pub}: dynamically imports m/${target}, which the release does not list`);
      }
    }
    for (const [name, target] of Object.entries(chunks.entries ?? {})) {
      if (!listed.has(`m/${target}`)) {
        problems.push(`m/${target}: the chunk manifest's entry for ${name} names it but the release does not list it`);
      }
    }
  }

  // 4. JavaScript references. Server files are Node entries a page never loads.
  await init;
  for (const pub of listed) {
    if (!/\.(?:js|mjs)$/i.test(pub) || isNodeOnly(pub)) continue;
    const code = textOf(pub);
    if (code === undefined) continue;
    let imports;
    try {
      [imports] = parse(code);
    } catch (err) {
      problems.push(`${pub}: ${err.message}`);
      continue;
    }
    result.js += 1;
    for (const record of imports) {
      // The lexer reports `import.meta` as a record of its own (d === -2), not an import.
      if (record.d === -2) continue;
      const spec = record.n;
      if (spec === undefined) {
        const expression = code.slice(record.ss, record.se).replace(/\s+/g, " ").trim();
        if (NONLITERAL[expression]) continue;
        const fallback = TREE_FALLBACK.exec(expression);
        if (fallback) {
          if (!listed.has(fallback[1])) {
            problems.push(`${pub}: ${expression} falls back to ${fallback[1]}, which the release does not list`);
          }
          continue;
        }
        problems.push(`${pub}: imports ${JSON.stringify(expression)}, which is not a literal the release can resolve`);
        continue;
      }
      if (spec.startsWith("./") || spec.startsWith("../")) {
        const target = resolveFrom(pub, spec);
        if (target.startsWith("..")) problems.push(`${pub}: imports ${JSON.stringify(spec)}, which leaves the release`);
        else if (!listed.has(target)) problems.push(`${pub}: imports ${JSON.stringify(spec)} (${target}), which the release does not list`);
      } else if (/^https?:\/\//.test(spec)) {
        result.external += 1;
        if (!Object.hasOwn(onlineOnly, spec) && !Object.hasOwn(aliases, spec)) {
          problems.push(`${pub}: imports ${spec}, which neither onlineOnly nor aliases classifies`);
        }
      } else {
        problems.push(`${pub}: imports ${JSON.stringify(spec)}, which is neither relative nor an absolute URL`);
      }
    }
  }

  // 5. Bootstrap payloads.
  for (const pub of listed) {
    if (pub.includes("/") || !pub.endsWith(".js")) continue;
    const code = textOf(pub);
    if (code === undefined || !code.includes('"dir":"m/"')) continue;
    let payload;
    try {
      payload = embedded(code);
    } catch (err) {
      problems.push(`${pub}: ${err.message}`);
      continue;
    }
    if (!payload) continue;
    const targets = [payload.manifest, ...(payload.preload ?? [])];
    for (const target of targets) {
      if (!listed.has(`m/${target}`)) problems.push(`${pub}: embeds m/${target}, which the release does not list`);
    }
  }

  // 6. CSS references.
  for (const pub of listed) {
    if (!pub.toLowerCase().endsWith(".css")) continue;
    const code = textOf(pub);
    if (code === undefined) continue;
    result.css += 1;
    const refs = [];
    for (const match of code.matchAll(URL_REF)) refs.push(match[1] ?? match[2] ?? match[3]);
    for (const match of code.matchAll(IMPORT_REF)) refs.push(match[1] ?? match[2]);
    for (const raw of refs) {
      const ref = raw.trim();
      if (!ref || /^data:/i.test(ref)) continue;
      result.cssRefs += 1;
      if (/^https?:\/\//.test(ref)) {
        result.external += 1;
        if (!Object.hasOwn(onlineOnly, ref) && !Object.hasOwn(aliases, ref)) {
          problems.push(`${pub}: reaches ${ref}, which neither onlineOnly nor aliases classifies`);
        }
      } else if (ref.startsWith("./") || ref.startsWith("../")) {
        const target = resolveFrom(pub, ref);
        if (target.startsWith("..")) problems.push(`${pub}: reaches ${JSON.stringify(ref)}, which leaves the release`);
        else if (!listed.has(target)) problems.push(`${pub}: reaches ${JSON.stringify(ref)} (${target}), which the release does not list`);
      } else {
        problems.push(`${pub}: reaches ${JSON.stringify(ref)}, which is neither relative nor an absolute URL`);
      }
    }
  }

  // 7. Aliases and online-only.
  for (const [alias, target] of Object.entries(aliases)) {
    if (!listed.has(target)) problems.push(`${target}: aliases[${JSON.stringify(alias)}] names it but the release does not list it`);
  }
  const texts = [...bytesBy.values()].map((bytes) => bytes.toString("utf8"));
  for (const url of Object.keys(onlineOnly)) {
    if (!texts.some((text) => text.includes(url))) problems.push(`onlineOnly: ${url} is stale, no listed file names it`);
  }

  // 8. Required members.
  const entries = chunks?.entries ?? {};
  for (const name of REQUIRED) {
    const target = entries[name];
    if (!target) {
      problems.push(`${name}: the chunk manifest has no entry for it`);
      continue;
    }
    if (!listed.has(`m/${target}`)) problems.push(`m/${target}: the chunk manifest's entry for ${name} names it but the release does not list it`);
  }
  if (chunks && result.dynamicEdges < 1) problems.push("index: the chunk graph has no dynamic edge");
  const fonts = [...listed].filter((pub) => pub.toLowerCase().endsWith(".woff2"));
  result.fonts = fonts.length;
  if (fonts.length < 10) problems.push(`index: lists ${fonts.length} fonts, fewer than 10`);
  for (const font of REQUIRED_FONTS) {
    if (!listed.has(font)) problems.push(`${font}: the release does not list it`);
  }
  const light = textOf("src/page/themes/light-1.css");
  if (light === undefined) problems.push("src/page/themes/light-1.css: the release does not list it");
  else if (light.includes("@import")) problems.push("src/page/themes/light-1.css: contains an @import");

  return result;
}

const USAGE = "usage: node scripts/verify-offline-closure.mjs --package-root <dir> | --published-root <dir>";

function usage(why) {
  if (why) console.error(`verify-offline-closure: ${why}`);
  console.error(USAGE);
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--package-root" || arg === "--published-root") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) usage(`${arg} needs a directory`);
      options[arg === "--package-root" ? "packageRoot" : "publishedRoot"] = value;
      i += 1;
    } else {
      usage(`unknown argument ${arg}`);
    }
  }
  if (Boolean(options.packageRoot) === Boolean(options.publishedRoot)) {
    usage("give exactly one of --package-root and --published-root");
  }
  let result;
  try {
    result = await verifyOfflineClosure(options);
  } catch (err) {
    console.error(`verify-offline-closure: ${err.message}`);
    process.exit(1);
  }
  console.log(
    `offline closure ${result.version}: ${result.files} files, ${result.js} js, ${result.css} css, ` +
      `${result.fonts} fonts, ${result.staticEdges} static and ${result.dynamicEdges} dynamic edges, ` +
      `${result.cssRefs} css refs, ${result.external} external`,
  );
  for (const problem of result.problems) console.log(problem);
  process.exitCode = result.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
