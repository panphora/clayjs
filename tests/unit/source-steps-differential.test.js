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

/**
 * Every field of the session a caller can observe, except the clocks that measure it and
 * the two counters that only ever go up: those are compared as increments.
 */
const sessionShape = (stats) => {
  const { timing, lastRenderMs, refreshes, ...rest } = stats;
  return rest;
};

/** The same, with the render's own clock kept: an aborted render must not move it either. */
const sessionState = (stats) => {
  const { timing, ...rest } = stats;
  return rest;
};

/**
 * A live document seeded from `html`, with the session installed around it. The fetch
 * answers with the document's own serialization, so the model and the map describe the
 * page and every render below verifies.
 */
async function installSession(html) {
  jest.resetModules();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.clayEditMode = true;
  const today = "<!DOCTYPE html>" + document.documentElement.outerHTML;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => today,
  }));
  const snapshot = await import("../../src/core/snapshot.js");
  const session = await import("../../src/source/session.js");
  await session.start({ context: null, latest: () => null });
  return { session, snapshot, today };
}

const saveClone = (snapshot) => snapshot.captureSaveClone({ flushUndo: false, authored: false });

let comparedSessions = 0;
let comparedSessionYields = 0;

/**
 * The SESSION's two step forms, over the same corpus: `renderSaveSteps` and
 * `refreshNowSteps`, drained and sliced, against the synchronous functions they are the
 * drain of. There is no second implementation to compare against here — the
 * synchronous function IS `drain` of the generator — so what these tests are for is
 * the other half of the claim: slicing changes nothing. A yield that lands between two
 * fields of a save's session state would hand back a different session, and that is
 * exactly what a sliced run and an aborted run would show.
 */
describe("the whole source corpus: the session's render and refresh step forms equal the synchronous ones", () => {
  beforeEach(() => { jest.useFakeTimers(); });

  afterEach(() => { jest.useRealTimers(); });

  test.each(CORPUS)("%s", async (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const { session, snapshot, today } = await installSession(src);
    expect(session.installed()).toBe(true);

    // The render: one save, three ways. The bytes are the whole assertion of the render
    // (a fallback hands back today's), and the session it leaves behind is the other.
    const expected = session.renderSave(saveClone(snapshot), today);
    const afterSync = sessionShape(session.stats());
    const refreshes = session.stats().refreshes;
    expect(typeof expected).toBe("string");

    expect(drain(session.renderSaveSteps(saveClone(snapshot), today))).toBe(expected);
    expect(sessionShape(session.stats())).toEqual(afterSync);

    let yields = 0;
    const slicedValue = await runSliced(session.renderSaveSteps(saveClone(snapshot), today), {
      budgetMs: 0,
      yieldTask: async () => { yields++; await Promise.resolve(); },
    });
    comparedSessionYields += yields;
    expect(slicedValue).toBe(expected);
    expect(sessionShape(session.stats())).toEqual(afterSync);
    // A render refreshes nothing: no refresh was queued, so none of the three ran one.
    expect(session.stats().refreshes).toBe(refreshes);

    // The refresh: a save was accepted, so the next save is measured from those bytes.
    // The first refresh runs drained and fixes the state all three have to land on; the
    // sliced one and the synchronous one are asked to land on exactly it.
    const accepted = today.replace("<html", '<html data-refreshed="1"');
    const refreshBase = session.stats().refreshes;
    session.adoptAccepted(accepted, null);
    drain(session.refreshNowSteps());
    const expectedRefresh = sessionShape(session.stats());
    expect(session.stats().refreshes).toBe(refreshBase + 1);
    expect(session.text()).toBe(accepted);

    session.adoptAccepted(accepted, null);
    let refreshYields = 0;
    await runSliced(session.refreshNowSteps(), {
      budgetMs: 0,
      yieldTask: async () => { refreshYields++; await Promise.resolve(); },
    });
    comparedSessionYields += refreshYields;
    expect(sessionShape(session.stats())).toEqual(expectedRefresh);
    expect(session.stats().refreshes).toBe(refreshBase + 2);
    expect(session.text()).toBe(accepted);

    session.adoptAccepted(accepted, null);
    session.stats();
    expect(sessionShape(session.stats())).toEqual(expectedRefresh);
    expect(session.stats().refreshes).toBe(refreshBase + 3);
    expect(session.text()).toBe(accepted);

    comparedSessions++;
  });

  test("the sweep compared real sessions and real yields", () => {
    expect(comparedSessions).toBe(CORPUS.length);
    expect(comparedSessionYields).toBeGreaterThan(0);
  });
});

/**
 * Aborting the session's step forms.
 *
 * `renderSave` and `refreshNow` touch session state, and the step forms exist so the same
 * work can be spread over tasks. That is only safe if a slice that stops in the middle
 * leaves the session exactly as it found it: an aborted render must not have recorded an
 * outcome or a byte count, and an aborted refresh must not have taken the queued bytes,
 * charged a repair, or left half a model behind. The refresh is aborted twice for that
 * reason: a queued refresh that survives an abort is handed to the second attempt
 * unchanged, so the second attempt must offer the same yields, and the state it finally
 * lands in must be the state the unaborted one did.
 */
describe("aborting the session's step forms leaves the session as it was", () => {
  const src = bigDocument();
  const N = [1, 2, 3, 5];
  let session, snapshot, today, expected;

  beforeAll(async () => {
    ({ session, snapshot, today } = await installSession(src));
    expect(session.installed()).toBe(true);
    expected = session.renderSave(saveClone(snapshot), today);
  });

  beforeEach(() => { jest.useFakeTimers(); });

  afterEach(() => { jest.useRealTimers(); });

  // A session that has never rendered, so every field a save writes is untouched and a
  // slice that wrote one before its yield cannot pass by writing the value that was
  // already there.
  test.each(N)("renderSaveSteps at yield %i", async (n) => {
    const target = await installSession(src);
    expect(target.session.installed()).toBe(true);
    const before = sessionState(target.session.stats());
    expect(before.lastBytes).toBeNull();
    expect(before.lastRenderMs).toBeNull();
    const { result, yields } = await abortAt(
      target.session.renderSaveSteps(saveClone(target.snapshot), target.today), n);
    expect(result).toEqual({ aborted: true });
    expect(yields).toBe(n);
    expect(sessionState(target.session.stats())).toEqual(before);
    expect(target.session.renderSave(saveClone(target.snapshot), target.today)).toBe(expected);
  });

  test.each(N)("refreshNowSteps at yield %i", async (n) => {
    const bytes = today.replace("<html", '<html data-refreshed="aborted"');
    session.adoptAccepted(bytes, null);
    drain(session.refreshNowSteps());
    const expectedRefresh = sessionShape(session.stats());
    const refreshBase = session.stats().refreshes;
    expect(session.text()).toBe(bytes);

    session.adoptAccepted(bytes, null);
    const first = await abortAt(session.refreshNowSteps(), n);
    expect(first.result).toEqual({ aborted: true });
    expect(first.yields).toBe(n);
    const second = await abortAt(session.refreshNowSteps(), n);
    expect(second.result).toEqual({ aborted: true });
    expect(second.yields).toBe(n);
    session.stats();
    expect(sessionShape(session.stats())).toEqual(expectedRefresh);
    expect(session.stats().refreshes).toBe(refreshBase + 1);
    expect(session.text()).toBe(bytes);
  });

  // The yields of a re-model are all in its parse, so the fixed points above all stop
  // inside it. The last yield comes after the model is built and before the re-pair is
  // committed, which is the assignment an abort would otherwise keep.
  test("refreshNowSteps at its last yield", async () => {
    const target = await installSession(src);
    const bytes = target.today.replace("<html", '<html data-refreshed="aborted"');
    const refreshBase = target.session.stats().refreshes;
    target.session.adoptAccepted(bytes, null);
    let total = 0;
    await runSliced(target.session.refreshNowSteps(), {
      budgetMs: 0,
      yieldTask: async () => { total++; await Promise.resolve(); },
    });
    expect(total).toBeGreaterThan(1);
    const expected = sessionShape(target.session.stats());
    expect(target.session.stats().refreshes).toBe(refreshBase + 1);
    expect(target.session.text()).toBe(bytes);

    target.session.adoptAccepted(bytes, null);
    const first = await abortAt(target.session.refreshNowSteps(), total);
    expect(first.result).toEqual({ aborted: true });
    expect(first.yields).toBe(total);
    const second = await abortAt(target.session.refreshNowSteps(), total);
    expect(second.result).toEqual({ aborted: true });
    expect(second.yields).toBe(total);
    target.session.stats();
    expect(sessionShape(target.session.stats())).toEqual(expected);
    expect(target.session.stats().refreshes).toBe(refreshBase + 2);
    expect(target.session.text()).toBe(bytes);
  });
});
