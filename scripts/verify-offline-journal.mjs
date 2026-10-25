// Proves a Journal, current or old, can open with no network: every script and stylesheet
// it names resolves inside the release, every library and language it loads on first use
// is packaged with everything those chunks import, the IBM Plex stylesheet's fonts are all
// there, and every byte the index lists is the byte the package carries.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "../src/vendor/parse5.vendor.js";
import { resolveRuntimeURL } from "../src/lib/offline-runtime.js";
import { assertReleasePath, CONTENT_TYPES, releaseFiles } from "./build-offline-manifest.mjs";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);

const DEFAULT_TYPE = "text/plain; charset=utf-8";

// The same recognized runtime link relations the projection rewrites. A preconnect hint
// names an origin, not a file, and has no offline value.
const RUNTIME_REL = new Set(["stylesheet", "preload", "modulepreload"]);

const URL_REF = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*?))\s*\)/g;

// src/lib/assets.js, by the entry it imports: the asset name a document asks for, and the
// chunk the release manifest names for it.
const ASSETS = [
  ["overtype", "vendor/overtype.vendor.js"],
  ["marked", "vendor/marked.vendor.js"],
  ["highlight", "vendor/highlight.vendor.js"],
  ["highlight/bash", "vendor/hljs-bash.vendor.js"],
  ["highlight/css", "vendor/hljs-css.vendor.js"],
  ["highlight/javascript", "vendor/hljs-javascript.vendor.js"],
  ["highlight/json", "vendor/hljs-json.vendor.js"],
  ["highlight/python", "vendor/hljs-python.vendor.js"],
  ["highlight/xml", "vendor/hljs-xml.vendor.js"],
];

// The release closure's own required roots, which a Journal inherits: the plugins and page
// features a host bootstraps for any document. Same list as verify-offline-closure.mjs.
const RELEASE_ROOTS = [
  "page/features/media.js",
  "page/features/tool.js",
  "page/features/table.js",
  "page/features/board.js",
  "plugins/derive.js",
];

const FONT_CSS = "fonts/ibm-plex.css";

function attributeOf(node, name) {
  for (const attr of node.attrs ?? []) {
    if (attr.name === name) return attr;
  }
  return null;
}

function elements(doc) {
  const found = [];
  const walk = (node) => {
    if (node.tagName) found.push(node);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(doc);
  return found;
}

// Every script src and runtime link href the Journal asks a host to fetch.
export function journalReferences(html) {
  const found = [];
  for (const node of elements(parse(html))) {
    if (node.tagName === "script") {
      const src = attributeOf(node, "src");
      if (src) found.push(src.value);
      continue;
    }
    if (node.tagName !== "link") continue;
    const href = attributeOf(node, "href");
    if (!href) continue;
    const rel = String(attributeOf(node, "rel")?.value ?? "").toLowerCase();
    if (rel.split(/\s+/).some((token) => RUNTIME_REL.has(token))) found.push(href.value);
  }
  return found;
}

export async function verifyOfflineJournal({ manifestFile, journalFile, packageRoot } = {}) {
  if (!manifestFile) throw new Error("verifyOfflineJournal needs a manifestFile");
  if (!journalFile) throw new Error("verifyOfflineJournal needs a journalFile");
  const root = path.resolve(packageRoot ?? REPO);
  const index = JSON.parse(await readFile(manifestFile, "utf8"));
  const release = await releaseFiles(root);
  const files = index.files && typeof index.files === "object" ? index.files : {};
  const listed = new Set(Object.keys(files));
  const releases = { [index.version]: index };
  const problems = [];
  const needed = new Set();
  const aliases = new Set();

  const requireListed = (pub, why) => {
    try {
      assertReleasePath(pub);
    } catch (err) {
      problems.push(`${why}: ${err.message}`);
      return false;
    }
    if (!listed.has(pub)) {
      problems.push(`${why}: the release lists no ${pub}`);
      return false;
    }
    needed.add(pub);
    return true;
  };

  // 1. The Journal's own script and stylesheet URLs.
  for (const raw of journalReferences(await readFile(journalFile, "utf8"))) {
    if (!/^https?:\/\//i.test(raw)) continue;
    const result = resolveRuntimeURL(raw, { releases, selectedVersion: index.version });
    if (!result || result.available === false) {
      problems.push(`${journalFile}: ${raw} resolves to no file in the release`);
      continue;
    }
    if (result.kind === "alias") aliases.add(raw);
    requireListed(result.path, `${journalFile}: ${raw}`);
  }

  // 2. The chunk manifest and every chunk the Journal's libraries import, statically or
  // not: a language or module a first use reaches for is as required as the boot graph.
  const chunksPub = "m/manifest.json";
  let chunks = null;
  if (requireListed(chunksPub, journalFile)) {
    chunks = JSON.parse(await readFile(path.join(root, release.get(chunksPub)), "utf8"));
  }
  const walked = new Set();
  const walkChunk = (target, why) => {
    if (walked.has(target)) return;
    walked.add(target);
    const pub = `m/${target}`;
    if (!requireListed(pub, why)) return;
    const entry = chunks.files?.[target];
    if (!entry) return;
    for (const next of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      walkChunk(next, `${pub} imports it`);
    }
  };
  if (chunks) {
    for (const name of [...RELEASE_ROOTS, ...ASSETS.map(([, entry]) => entry)]) {
      const target = chunks.entries?.[name];
      if (!target) {
        problems.push(`${name}: the chunk manifest has no entry for it`);
        continue;
      }
      walkChunk(target, `${name}: the chunk manifest names m/${target}`);
    }
  }

  // 3. The IBM Plex stylesheet and every font it names.
  if (requireListed(FONT_CSS, journalFile)) {
    const css = await readFile(path.join(root, release.get(FONT_CSS)), "utf8");
    for (const match of css.matchAll(URL_REF)) {
      const ref = (match[1] ?? match[2] ?? match[3]).trim();
      if (!ref || /^data:/i.test(ref)) continue;
      if (!ref.startsWith("./") && !ref.startsWith("../")) {
        problems.push(`${FONT_CSS}: reaches ${JSON.stringify(ref)}, which is neither relative nor a bundled font`);
        continue;
      }
      const target = path.posix.join(path.posix.dirname(FONT_CSS), ref.replace(/[?#].*$/, ""));
      requireListed(target, `${FONT_CSS}: ${JSON.stringify(ref)}`);
    }
  }

  // 4. Every listed byte, against the hash the index recorded.
  for (const [pub, entry] of Object.entries(files)) {
    let source;
    try {
      assertReleasePath(entry?.source);
      source = release.get(pub) ?? entry.source;
    } catch (err) {
      problems.push(`${pub}: ${err.message}`);
      continue;
    }
    const bytes = await readFile(path.join(root, source)).catch(() => null);
    if (bytes === null) {
      problems.push(`${pub}: the package carries no ${source}`);
      continue;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      problems.push(`${pub}: the bytes in ${source} are not the ones the index recorded`);
    }
    if (bytes.length !== entry.bytes) problems.push(`${pub}: ${source} is ${bytes.length} bytes, not the recorded ${entry.bytes}`);
    const type = CONTENT_TYPES.get(path.posix.extname(pub).toLowerCase()) ?? DEFAULT_TYPE;
    if (entry.type !== type) problems.push(`${pub}: is served as ${JSON.stringify(entry.type)}, not ${JSON.stringify(type)}`);
  }

  const paths = [...needed].sort();
  const ending = (suffix) => paths.filter((pub) => pub.toLowerCase().endsWith(suffix)).length;
  return {
    problems,
    files: paths,
    counts: { js: ending(".js"), fonts: ending(".woff2"), css: ending(".css"), aliases: aliases.size },
  };
}

const USAGE =
  "usage: node scripts/verify-offline-journal.mjs --manifest <dist/offline-manifest.json> --journal <file> [--package-root <dir>]";

const OPTIONS = {
  "--manifest": "manifestFile",
  "--journal": "journalFile",
  "--package-root": "packageRoot",
};

function usage(why) {
  if (why) console.error(`verify-offline-journal: ${why}`);
  console.error(USAGE);
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!Object.hasOwn(OPTIONS, arg)) usage(`unknown argument ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) usage(`${arg} needs a value`);
    options[OPTIONS[arg]] = value;
    i += 1;
  }
  if (!options.manifestFile) usage("--manifest is required");
  if (!options.journalFile) usage("--journal is required");
  let result;
  try {
    result = await verifyOfflineJournal(options);
  } catch (err) {
    console.error(`verify-offline-journal: ${err.message}`);
    process.exit(1);
  }
  console.log(
    `offline journal ${path.basename(options.journalFile)}: ${result.files.length} files, ` +
      `${result.counts.js} js, ${result.counts.css} css, ${result.counts.fonts} fonts, ` +
      `${result.counts.aliases} aliases, assets ${ASSETS.map(([id]) => id).join(", ")}`,
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
