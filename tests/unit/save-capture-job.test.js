/**
 * save-capture-job: one atomic capture half, then a job that can be resumed.
 *
 * `beginSaveCapture` runs everything that has to see the live page in one synchronous
 * call and hands back a job whose rest (the three serializations and the save renderer's
 * verification) is a generator. The synchronous capture is that job drained, so the two
 * cannot disagree: this file sweeps the save corpus and demands the drained job, a job
 * run with a budget of zero (a yield at every point), and a job driven across a page
 * that is being edited all produce the bytes `captureForSaveAndComparison` returns.
 *
 * The job also owns what it captured. A mutation made between two of its yields cannot
 * reach the result, and the renderer it runs is told about ITS capture rather than about
 * whatever the last capture in this task happened to be.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { jest } from "@jest/globals";
import {
  addDocumentTransform,
  attachCaptureArtifact,
  captureArtifact,
  captureForSaveAndComparison,
  capturePageState,
  currentCaptureContext,
  setCapturePageState,
  setSaveRenderer,
} from "../../src/core/snapshot.js";
import { beginSaveCapture } from "../../src/core/save-job.js";
import { drain, runSliced } from "../../src/lib/slice.js";

jest.setTimeout(180000);

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

// The documents snapshot.test.js builds by hand, plus the same corpus the source
// differential sweeps: every saved shape the repository has.
const FRAGMENT = `
  <div id="keep">KEEPME</div>
  <nav clay="no-save">NOSAVEREGION</nav>
  <aside save-remove>LEGACYREMOVE</aside>
  <span clay="no-snapshot">NOSNAPREGION</span>
  <p onbeforesave="this.textContent='CHANGED'">beforetext</p>
  <grammarly-extension>EXTNOISE</grammarly-extension>
`;

const CORPUS = [
  ...htmlFilesUnder("tests/fixtures"),
  ...htmlFilesUnder("conformance/fixtures"),
  ...htmlFilesUnder("examples"),
  ...htmlFilesUnder("website"),
].sort();

// A transform may look at the live page, which is why every transform runs inside the
// atomic half. This one records the live title into the clone, so a page edited after
// the capture can be told apart from the page that was captured.
addDocumentTransform((clone) => {
  clone.setAttribute("data-captured-title", document.title);
});

function loadFragment(html) {
  document.body.innerHTML = html;
}

function loadDocument(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

// The four public fields minus the capture id, which is a monotone counter and so is
// the one thing two captures can never share.
const bytes = (capture) => ({
  forSave: capture.forSave,
  forComparison: capture.forComparison,
  forDirty: capture.forDirty,
});

// The renderer the source session registers, in both forms: it hands its capture the
// artifact of the bytes it produced, which is how a suspended job can be told apart
// from one that read the wrong context.
const markCapture = (clone, today) => {
  const context = currentCaptureContext();
  if (context) attachCaptureArtifact({ captureId: context.captureId });
  return today;
};

function* markCaptureSteps(clone, today) {
  yield;
  return markCapture(clone, today);
}

/** Count the yield points a job offers, so "it slices" is a number and not a claim. */
function* countYields(gen, counter) {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
    counter.yields++;
    yield;
  }
}

beforeEach(() => {
  document.title = "";
  loadFragment("");
  setSaveRenderer(markCapture, { steps: markCaptureSteps });
});

afterEach(() => {
  setSaveRenderer(null);
  setCapturePageState(null);
});

test("the drained job is the synchronous capture, over the save corpus", () => {
  loadFragment(FRAGMENT);
  const fragment = captureForSaveAndComparison({ emitForSync: false });
  expect(Object.keys(fragment).sort()).toEqual(["captureId", "forComparison", "forDirty", "forSave"]);
  expect(bytes(drain(beginSaveCapture({ emitForSync: false }).steps()))).toEqual(bytes(fragment));

  for (const file of CORPUS) {
    loadDocument(readFileSync(join(ROOT, file), "utf8"));
    const expected = captureForSaveAndComparison({ emitForSync: false });
    const actual = drain(beginSaveCapture({ emitForSync: false }).steps());
    expect(bytes(actual)).toEqual(bytes(expected));
    expect(Number.isSafeInteger(actual.captureId)).toBe(true);
  }
});

test("snapshot-ready fires inside the atomic half, before the capture returns", () => {
  loadFragment(FRAGMENT);
  const seen = [];
  const listener = (event) => seen.push(event.detail);
  document.addEventListener("clay:snapshot-ready", listener);
  let job;
  try {
    job = beginSaveCapture({ forRequest: true });
  } finally {
    document.removeEventListener("clay:snapshot-ready", listener);
  }
  expect(seen).toHaveLength(1);
  expect(seen[0].captureId).toBe(job.captureId);
  expect(seen[0].forSave).toBe(true);
  expect(seen[0].documentElement.getAttribute("data-captured-title")).toBe("");

  const result = drain(job.steps());
  expect(result.forSave).toContain('data-captured-title=""');
});

test("run with a budget of zero the job yields, and still returns the same capture", async () => {
  loadFragment(FRAGMENT);
  const expected = captureForSaveAndComparison({ forRequest: false });
  const counter = { yields: 0 };
  const actual = await runSliced(
    countYields(beginSaveCapture({ forRequest: true }).steps(), counter),
    { budgetMs: 0, yieldTask: async () => {} },
  );
  expect(counter.yields).toBeGreaterThan(0);
  expect(bytes(actual)).toEqual(bytes(expected));
  expect(captureArtifact(actual).captureId).toBe(actual.captureId);
});

test("a page edited between two yields cannot reach the job's result", () => {
  loadFragment(FRAGMENT);
  document.title = "captured";
  const expected = captureForSaveAndComparison({ forRequest: true });
  expect(expected.forSave).toContain('data-captured-title="captured"');

  const job = beginSaveCapture({ forRequest: true });
  const gen = job.steps();
  gen.next();

  document.title = "typed over";
  document.body.insertAdjacentHTML("beforeend", "<p id='late'>LATE</p>");
  captureForSaveAndComparison({ forRequest: true });

  const actual = drain(gen);
  expect(bytes(actual)).toEqual(bytes(expected));
  expect(actual.forSave).not.toContain("LATE");
  expect(actual.forComparison).not.toContain("LATE");
  expect(actual.forSave).toContain('data-captured-title="captured"');
  expect(captureArtifact(actual).captureId).toBe(actual.captureId);
});

test("a renderer without a step form is called synchronously, once, with this capture", () => {
  loadFragment(FRAGMENT);
  const contexts = [];
  setSaveRenderer((clone, today) => {
    contexts.push(currentCaptureContext());
    return today + "<!--rendered-->";
  });

  const result = drain(beginSaveCapture({ forRequest: true }).steps());
  expect(contexts).toHaveLength(1);
  expect(contexts[0].captureId).toBe(result.captureId);
  expect(result.forSave.endsWith("<!--rendered-->")).toBe(true);
  expect(result.forComparison.endsWith("<!--rendered-->")).toBe(false);
});

test("drop releases the capture it made, whole or half-run", () => {
  setCapturePageState((clone) => ({ title: clone.getAttribute("data-captured-title") }));
  loadFragment(FRAGMENT);
  document.title = "one";

  const done = beginSaveCapture({ forRequest: true });
  const result = drain(done.steps());
  expect(captureArtifact(result)).not.toBeNull();
  expect(capturePageState(result.captureId)).toEqual({ title: "one" });

  done.drop();
  expect(captureArtifact(result)).toBeNull();
  expect(capturePageState(result.captureId)).toBeNull();

  const partial = beginSaveCapture({ forRequest: true });
  const gen = partial.steps();
  gen.next();
  expect(capturePageState(partial.captureId)).not.toBeNull();
  partial.drop();
  expect(capturePageState(partial.captureId)).toBeNull();

  document.title = "two";
  const after = captureForSaveAndComparison({ forRequest: true });
  expect(after.captureId).toBeGreaterThan(result.captureId);
  expect(after.forSave).toContain('data-captured-title="two"');
});
