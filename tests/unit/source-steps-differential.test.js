/**
 * source-steps-differential: the step forms are the same code as the synchronous ones.
 *
 * Every expensive walk in save verification is now a generator with the existing
 * synchronous function as its drain, so the same walk serves one task and many. That is
 * only safe if the two ways of running it cannot produce different answers, so this
 * sweep takes every piece of real HTML in the repository and demands the step form,
 * drained and run with a budget of zero (a yield at every point the walk offers), equal
 * the synchronous result exactly: the same model ranges, the same pairings, the same
 * verdict. The last tests abort at the Nth yield for several N: an aborted walk returns
 * nothing at all and leaves nothing behind for the next synchronous call.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { jest } from "@jest/globals";
import {
  model,
  modelSteps,
  pairCaptured,
  pairCapturedSteps,
  verify,
  verifyRenderedSteps,
  verifyForSave,
  verifyForSaveSteps,
  vDiffSteps,
  vParseErrorsSteps,
} from "../../src/core/source-map.js";
import { drain, runSliced } from "../../src/lib/slice.js";

jest.setTimeout(120000);

const ROOT = new URL("../../", import.meta.url).pathname;

function htmlFilesUnder(dir, out = []) {
  let entries;
  try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) htmlFilesUnder(rel, out);
    else if (entry.name.endsWith(".html") && statSync(join(ROOT, rel)).size > 0) out.push(rel);
  }
  return out;
}

// The same corpus source-map.test.js and source-parse-steps.test.js sweep.
const CORPUS = [
  ...htmlFilesUnder("tests/fixtures"),
  ...htmlFilesUnder("conformance/fixtures"),
  ...htmlFilesUnder("examples"),
  ...htmlFilesUnder("website"),
].sort();

const parseDoc = (html) => new DOMParser().parseFromString(html, "text/html");

/**
 * A model, as text. `parentNode` is the document tree's only cycle and `parent`/`children`
 * is the location tree's, so both are cut; the location tree is compared through the
 * ranges below, which is what the pairing and the renderer actually read.
 */
const shape = (doc) => JSON.stringify(doc, (key, value) => (key === "parentNode" ? undefined : value));
const ranges = (m) => JSON.stringify(m, (key, value) =>
  (key === "parentNode" || key === "parent" || key === "node" || key === "live" || key === "doc" || key === "gen" ? undefined : value));
const modelShape = (m) => (m ? {
  src: m.src,
  tree: shape(m.doc),
  outside: m.outside,
  ranges: ranges(m),
  errors: [...m.parseErrors],
} : null);

/** Every node the pairing bound, in document order, with the range it was bound to. */
function bindings(root, paired) {
  const out = [];
  const walk = (node) => {
    const loc = paired.map.get(node);
    if (loc) out.push([node.nodeName, loc.kind, loc.from, loc.to, loc.gen === paired.gen]);
    for (const kid of node.childNodes) walk(kid);
  };
  walk(root);
  return out;
}
const pairShape = (root, paired) => (paired ? {
  stats: paired.stats,
  bindings: bindings(root, { map: paired.map, gen: undefined }),
} : null);

const verdictShape = (v) => ({ ok: v.ok, diff: v.diff, oracle: v.oracle, at: v.at, model: modelShape(v.model) });

let comparedDocuments = 0;
let brokenDocuments = 0;
let comparedYields = 0;

/**
 * The same document with one character taken out of its first real text: bytes that are
 * not the document, which every verifier form must refuse. Without a refused render the
 * sweep would pass on a comparison that never ran.
 */
function corrupted(doc) {
  const copy = doc.cloneNode(true);
  const walk = (node) => {
    if (node.nodeType === 3 && /\S/.test(node.data)) { node.data = node.data.slice(1); return true; }
    for (const kid of node.childNodes) if (walk(kid)) return true;
    return false;
  };
  return walk(copy.documentElement) ? "<!DOCTYPE html>" + copy.documentElement.outerHTML : null;
}

/** The step form under the driver that yields at every point the walk offers. */
async function sliced(gen) {
  let yields = 0;
  const value = await runSliced(gen, {
    budgetMs: 0,
    yieldTask: async () => { yields++; await Promise.resolve(); },
  });
  comparedYields += yields;
  return value;
}

test("the corpus is real and non-empty", () => {
  expect(CORPUS.length).toBeGreaterThan(50);
  expect(CORPUS.some((f) => f.startsWith("website/"))).toBe(true);
});

describe("the whole source corpus: every step form equals the synchronous form", () => {
  test.each(CORPUS)("%s", async (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const doc = parseDoc(src);
    const root = doc.documentElement;
    const today = "<!DOCTYPE html>" + root.outerHTML;

    const expectedModel = modelShape(model(src));
    expect(modelShape(drain(modelSteps(src)))).toEqual(expectedModel);
    expect(modelShape(await sliced(modelSteps(src)))).toEqual(expectedModel);

    const expectedPair = pairShape(root, pairCaptured(root, model(src), (n) => n));
    expect(pairShape(root, drain(pairCapturedSteps(root, model(src), (n) => n)))).toEqual(expectedPair);
    expect(pairShape(root, await sliced(pairCapturedSteps(root, model(src), (n) => n)))).toEqual(expectedPair);

    const errors = model(src).parseErrors;
    const expectedVerify = verdictShape(verify(src, today, doc, root, errors));
    expect(verdictShape(drain(verifyRenderedSteps(src, today, doc, root, errors, false)))).toEqual(expectedVerify);
    expect(verdictShape(await sliced(verifyRenderedSteps(src, today, doc, root, errors, false)))).toEqual(expectedVerify);

    const forSave = verifyForSave(src, today, doc, root, errors);
    // The claimed result, not just the two ways of reaching it: an unchanged document
    // verifies through the clone oracle, so a skipped comparison cannot agree with
    // itself and pass.
    expect(forSave.ok).toBe(true);
    expect(forSave.oracle).toBe("clone");
    const expectedForSave = verdictShape(forSave);
    expect(verdictShape(drain(verifyForSaveSteps(src, today, doc, root, errors)))).toEqual(expectedForSave);
    expect(verdictShape(await sliced(verifyForSaveSteps(src, today, doc, root, errors)))).toEqual(expectedForSave);

    // The two private walks the verifier composes, on their own.
    const left = parseDoc(src).documentElement, right = parseDoc(src).documentElement;
    expect(drain(vDiffSteps(left, right, "html"))).toBe(null);
    expect(await sliced(vDiffSteps(left, right, "html"))).toBe(null);
    expect(drain(vParseErrorsSteps(src, errors, false))).toEqual({ diff: null });
    expect(await sliced(vParseErrorsSteps(src, errors, true))).toEqual(
      drain(vParseErrorsSteps(src, errors, true)));

    const broken = corrupted(doc);
    if (broken) {
      const refused = verdictShape(verifyForSave(broken, today, doc, root, errors));
      expect(refused.ok).toBe(false);
      expect(typeof refused.diff).toBe("string");
      expect(verdictShape(drain(verifyForSaveSteps(broken, today, doc, root, errors)))).toEqual(refused);
      expect(verdictShape(await sliced(verifyForSaveSteps(broken, today, doc, root, errors)))).toEqual(refused);
      brokenDocuments++;
    }

    comparedDocuments++;
  });

  test("the sweep compared real documents and real yields", () => {
    expect(comparedDocuments).toBe(CORPUS.length);
    expect(brokenDocuments).toBeGreaterThan(20);
    expect(comparedYields).toBeGreaterThan(0);
  });
});

/**
 * Big enough that the walks offer many yields: `vDiff` and `matchCaptured` yield every
 * 1,500 nodes compared, and the parse yields every chunk.
 */
function bigDocument(entries = 1500) {
  const parts = ["<!doctype html><html><head><title>big</title></head><body><main>"];
  for (let i = 0; i < entries; i++) {
    parts.push(`<article id="e${i}" data-n="${i}"><h2>Entry ${i}</h2><pre><code>${"lorem ipsum dolor sit amet ".repeat(6)}${i}</code></pre></article>`);
  }
  parts.push("</main></body></html>");
  return parts.join("");
}

/** Abort at the Nth yield; the aborted walk must return nothing and leave nothing. */
async function abortAt(gen, n) {
  const controller = new AbortController();
  let yields = 0;
  const result = await runSliced(gen, {
    budgetMs: 0,
    signal: controller.signal,
    yieldTask: async () => {
      if (++yields === n) controller.abort();
      await Promise.resolve();
    },
  });
  return { result, yields };
}

describe("an abort at the Nth yield leaves no partial state", () => {
  const src = bigDocument();
  const doc = parseDoc(src);
  const root = doc.documentElement;
  const today = "<!DOCTYPE html>" + root.outerHTML;
  const N = [1, 2, 3, 5];

  test("the document is big enough to abort inside every walk", () => {
    expect(src.length).toBeGreaterThan(300_000);
  });

  test.each(N)("pairCapturedSteps at yield %i", async (n) => {
    const expected = pairShape(root, pairCaptured(root, model(src), (k) => k));
    const m = model(src);
    const { result, yields } = await abortAt(pairCapturedSteps(root, m, (k) => k), n);
    expect(result).toEqual({ aborted: true });
    expect(yields).toBe(n);
    // The model carries no pairing token and no locations bound by the walk that stopped.
    expect(m.gen).toBeUndefined();
    expect(pairShape(root, pairCaptured(root, m, (k) => k))).toEqual(expected);
  });

  test.each(N)("verifyForSaveSteps at yield %i", async (n) => {
    const errors = model(src).parseErrors;
    const expected = verdictShape(verifyForSave(src, today, doc, root, errors));
    const { result, yields } = await abortAt(verifyForSaveSteps(src, today, doc, root, errors), n);
    expect(result).toEqual({ aborted: true });
    expect(yields).toBe(n);
    expect(verdictShape(verifyForSave(src, today, doc, root, errors))).toEqual(expected);
  });

  test.each(N)("modelSteps at yield %i", async (n) => {
    const expected = modelShape(model(src));
    const { result, yields } = await abortAt(modelSteps(src), n);
    expect(result).toEqual({ aborted: true });
    expect(yields).toBe(n);
    expect(modelShape(model(src))).toEqual(expected);
  });

  test.each(N)("vDiffSteps at yield %i", async (n) => {
    const left = parseDoc(src).documentElement, right = parseDoc(src).documentElement;
    const { result, yields } = await abortAt(vDiffSteps(left, right, "html"), n);
    expect(result).toEqual({ aborted: true });
    expect(yields).toBe(n);
    expect(drain(vDiffSteps(left, right, "html"))).toBe(null);
  });
});
