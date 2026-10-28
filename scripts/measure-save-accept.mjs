// The work after an accepted save, outside Jest: what offerCheckpoint parses, what the
// checkpoint proof covers, what the channel validates, what the file debt clears and what
// the journal base and lineage cost. Run at 2,000 blocks: before the containment index
// this path spent about 2 s proving which records the accepted state covers; after it,
// about 35 ms. tests/unit/page/save-accept-performance.test.js calls the same function.
import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";

const USAGE = `usage: node scripts/measure-save-accept.mjs [--records 200] [--history 0]

  --records     recovery records the accepted state has to cover
  --history     seeded edits made before the records start (0 keeps the fixture fresh)`;

function usage(message) {
  if (message) process.stderr.write(`measure-save-accept: ${message}\n`);
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

function count(name, value, fallback, least) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) usage(`--${name} takes a whole number, not ${JSON.stringify(value)}`);
  const n = Number(value);
  if (n < least) usage(`--${name} must be at least ${least}`);
  return n;
}

function parse(argv) {
  const args = { records: 200, history: 0 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") { process.stdout.write(`${USAGE}\n`); process.exit(0); }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage(`${flag} needs a value`);
    i++;
    if (flag === "--records") { args.records = count("records", value, 200, 0); continue; }
    if (flag === "--history") { args.history = count("history", value, 0, 0); continue; }
    usage(`unknown option ${flag}`);
  }
  return args;
}

// The page the acceptance runs in: one jsdom document and the globals the projection and
// the proof read, the way scripts/measure-page-session.mjs sets them up.
async function browserEnvironment(url) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, { url, pretendToBeVisual: true });
  const { window } = dom;
  const SKIP = new Set(["globalThis", "queueMicrotask", "setTimeout", "clearTimeout", "setInterval", "clearInterval"]);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (SKIP.has(key)) continue;
    try {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: window[key] });
    } catch {}
  }
  globalThis.window = window;
  globalThis.document = window.document;
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
  return dom;
}

// The parse src/plugins/live.js does in offerCheckpoint, before the proof runs.
const parseHtml = (html) => new DOMParser().parseFromString(html, "text/html");

export async function measureSaveAccept({ records = 200, history = 0 } = {}) {
  const Y = await import("../src/vendor/yjs.vendor.js");
  const { NET } = await import("../src/page/ybind/layout.js");
  const { entriesOf } = await import("../src/page/ybind/parts.js");
  const proofs = await import("../src/page/checkpoint-proof.js");
  const recovery = await import("../src/page/ybind/recovery-proof.js");
  const { articleOfPageState } = await import("../src/page/save-projection.js");
  const { createPageFileDebt } = await import("../src/page/ybind/file-debt.js");
  const { journalBase } = await import("../src/page/ybind/recovery-replay.js");
  const { lineageOf } = await import("../src/page/ybind/lineage.js");
  const { buildLongDocument } = await import("../tests/unit/page/helpers/long-document.js");

  const { value } = buildLongDocument();
  const doc = new Y.Doc();
  doc.clientID = 777;
  for (const [, v] of entriesOf(value.y)) Y.applyUpdateV2(doc, Y.fromBase64(v), NET);
  const flow = doc.getText("flow");
  let seed = 5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const editAt = () => {
    const at = 1 + Math.floor(rnd() * (flow.length - 2));
    if (rnd() < 0.7) flow.insert(at, "abc".slice(0, 1 + Math.floor(rnd() * 3)));
    else flow.delete(at, 1);
  };
  for (let i = 0; i < history; i++) editAt();

  const logged = [];
  const AUTHORITY = { host: "fixture.test", documentId: "doc", principalId: "p" };
  const CONTEXT = { authority: AUTHORITY, lineage: { generation: "3f".repeat(16) } };
  const debt = createPageFileDebt();
  doc.on("updateV2", (update, origin) => {
    if (origin === NET) return;
    logged.push({ id: `r${logged.length}`, revision: logged.length + 1, update, context: CONTEXT });
    debt.local(update);
  });
  for (let i = 0; i < records; i++) editAt();

  const stateBytes = Y.encodeStateAsUpdateV2(doc);
  const text = Y.toBase64(stateBytes);
  const PART = 12 * 1024;
  const n = Math.ceil(text.length / PART);
  const state = { v: 1, g: 0, y: Object.fromEntries(Array.from({ length: n }, (_, i) => [`m1-0.${i}.${n}`, text.slice(i * PART, (i + 1) * PART)])) };

  const a00 = performance.now();
  const article = articleOfPageState(state);
  const firstArticle = +(performance.now() - a00).toFixed(1);

  const t0 = performance.now();
  const marks = {};
  const lap = (name, since) => { marks[name] = +(performance.now() - since).toFixed(1); return performance.now(); };

  let t = performance.now();
  const html = `<!DOCTYPE html><html><body><article data-page>${article}</article></body></html>`;
  parseHtml(html).querySelector("article[data-page]")?.innerHTML ?? null;
  t = lap("parseArticle", t);
  const proven = await proofs.captureProof({ capture: "c1", records: logged, accepted: CONTEXT, article, state, etag: '"e1"' });
  t = lap("captureProof", t);
  const again = await recovery.validatePageCheckpoint(proven.proof, proven.covered);
  t = lap("channelValidate", t);
  const cleared = debt.accepted(state);
  t = lap("fileDebt", t);
  const base = journalBase(proven.proof.state);
  await lineageOf("g", base);
  t = lap("journalBase+lineage", t);
  const total = +(performance.now() - t0).toFixed(1);

  const a0 = performance.now();
  articleOfPageState(state);
  const articleMs = +(performance.now() - a0).toFixed(1);

  return {
    stateBytes: stateBytes.length,
    records: logged.length,
    covered: proven.covered?.length,
    revalidated: again.length,
    debtCleared: cleared,
    ...marks,
    firstArticle,
    articleOfPageState: articleMs,
    total,
  };
}

async function main() {
  const args = parse(process.argv.slice(2));
  const dom = await browserEnvironment("https://example.test/save-accept.html");
  try {
    process.stdout.write(`${JSON.stringify(await measureSaveAccept(args))}\n`);
  } finally {
    dom.window.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
