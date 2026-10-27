/**
 * @jest-environment jsdom
 */

import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

/**
 * The tools a counterexample needs after it is found: `shrink` reduces a failing schedule
 * to one that still reaches its preconditions and fails the same oracle property, and
 * `prove` shows a fix by running the schedule against two exact runtime copies.
 *
 * The two runtimes are scratch copies under the OS temp dir. One is untouched, the other
 * carries one planted defect written here as a literal find and replace, and the case is
 * one that passes today: so a proof of "fails before, passes after" is a real proof and
 * the checkout's own `src/` is never edited.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(ROOT, "scripts/mode-counterexamples.mjs");
const CASES = path.join(ROOT, "tests/mode-counterexamples/cases");
const CASE = path.join(CASES, "bytes-etag-pairing.json");
// The cases a selftest of the whole corpus takes six minutes to reach. These four carry
// all three defects the corpus can feel — a write the exit never made, a view announced
// before the save was accepted and a listener a cycle keeps — so one minute proves the
// planting and the verdict for those. The three it cannot feel yet are named below.
const SUBSET = ["canonical-freeze", "cycles-no-growth", "cycles-one-write", "enter-leave-one-write"];
const UNFELT = ["drop-generation-checks", "rebaseline-current-dom", "route-draft-to-host"];
const PROPERTY = "bytes-etag-pairing";
const PLANTED = {
  file: "src/core/save-core.js",
  find: "  if (etag) options.headers['If-Match'] = etag;",
  replace: "  if (etag) options.headers['If-Match'] = 'etag-0';",
};

let scratch = null;
let before = null;
let after = null;
let reducedFile = null;

function run(args, runtime = null) {
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" "),
    CLAY_COUNTEREXAMPLE_RUNTIME: runtime ?? "",
  };
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
}

function outcomeOf(result) {
  const line = String(result.stdout ?? "").split("\n").reverse().find((candidate) => candidate.trim().startsWith("["));
  return line ? JSON.parse(line)[0] : null;
}

function plantedSource() {
  const source = readFileSync(path.join(ROOT, PLANTED.file), "utf8");
  expect(source.split(PLANTED.find).length - 1).toBe(1);
  return source;
}

beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), "clay-case-tools-"));
  before = path.join(scratch, "before");
  after = path.join(scratch, "after");
  for (const copy of [before, after]) cpSync(path.join(ROOT, "src"), path.join(copy, "src"), { recursive: true });
  const target = path.join(before, PLANTED.file);
  writeFileSync(target, plantedSource().replace(PLANTED.find, PLANTED.replace));
}, 180000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

test("a case run reads ClayJS from the runtime root it is given", () => {
  const source = plantedSource();
  expect(readFileSync(path.join(before, PLANTED.file), "utf8")).toBe(source.replace(PLANTED.find, PLANTED.replace));

  const clean = run(["check", "--cases", CASES, "--case", path.basename(CASE), "--json"], after);
  const cleanOutcome = outcomeOf(clean);
  expect(cleanOutcome.status).toBe("passed");

  const planted = run(["check", "--cases", CASES, "--case", path.basename(CASE), "--json"], before);
  const plantedOutcome = outcomeOf(planted);
  expect(plantedOutcome.status).toBe("failed");
  expect(plantedOutcome.failures.map((failure) => failure.property)).toEqual([PROPERTY]);
}, 180000);

test("shrink keeps the preconditions and the failure while cutting steps", () => {
  const original = JSON.parse(readFileSync(CASE, "utf8"));
  reducedFile = path.join(scratch, "reduced.json");

  const result = run(["shrink", "--case", CASE, "--out", reducedFile], before);
  expect(result.status).toBe(0);

  const reduced = JSON.parse(readFileSync(reducedFile, "utf8"));
  expect(reduced.id).toBe(`${original.id}-reduced`);
  expect(reduced.reducedFrom).toBe(original.id);
  expect(reduced.steps.length).toBeLessThanOrEqual(original.steps.length);
  expect(reduced.requires).toEqual(original.requires);

  const rerun = run(["check", "--cases", CASES, "--case-file", reducedFile, "--json"], before);
  const outcome = outcomeOf(rerun);
  expect(outcome.status).toBe("failed");
  expect(outcome.failures.map((failure) => failure.property)).toEqual([PROPERTY]);
}, 180000);

test("prove passes when the fix flips the case and names two runtimes", () => {
  const proofFile = path.join(scratch, "proof.json");
  const result = run(["prove", "--case", CASE, "--before", before, "--after", after, "--reduced", reducedFile, "--out", proofFile]);
  expect(result.status).toBe(0);

  const proof = JSON.parse(readFileSync(proofFile, "utf8"));
  expect(proof.case).toBe("bytes-etag-pairing");
  expect(proof.reduced).toBe("bytes-etag-pairing-reduced");
  expect(proof.before.hash).not.toBe(proof.after.hash);
  expect(proof.results.map((entry) => `${entry.schedule}:${entry.runtime}:${entry.status}`)).toEqual([
    "bytes-etag-pairing:before:failed",
    "bytes-etag-pairing:after:passed",
    "bytes-etag-pairing-reduced:before:failed",
    "bytes-etag-pairing-reduced:after:passed",
  ]);
}, 180000);

test("prove refuses two copies of the same runtime", () => {
  const result = run(["prove", "--case", CASE, "--before", after, "--after", after, "--out", path.join(scratch, "same.json")]);
  expect(result.status).not.toBe(0);
  expect(String(result.stderr)).toContain("same runtime");
});

test("shrink refuses a case that does not fail", () => {
  const result = run(["shrink", "--case", CASE, "--out", path.join(scratch, "passing.json")], after);
  expect(result.status).not.toBe(0);
  expect(String(result.stderr)).toContain("passed");
});

test("every sensitivity mutation names code that occurs exactly once in the checkout", async () => {
  const { MUTATIONS } = await import("../mode-counterexamples/mutations.mjs");
  expect(MUTATIONS.map((mutation) => mutation.id)).toEqual([
    "skip-flush",
    "drop-generation-checks",
    "rebaseline-current-dom",
    "route-draft-to-host",
    "announce-view-before-acceptance",
    "leak-one-listener",
  ]);
  for (const mutation of MUTATIONS) {
    const source = readFileSync(path.join(ROOT, mutation.file), "utf8");
    expect(`${mutation.id}:${source.split(mutation.find).length - 1}`).toBe(`${mutation.id}:1`);
    expect(mutation.why.startsWith(`${mutation.file}:`)).toBe(true);
  }
});

test("selftest plants each defect in a scratch runtime copy and says which cases feel it", async () => {
  const { MUTATIONS } = await import("../mode-counterexamples/mutations.mjs");
  const cases = path.join(scratch, "selftest-cases");
  const runtime = path.join(scratch, "selftest");
  mkdirSync(cases, { recursive: true });
  for (const name of SUBSET) copyFileSync(path.join(CASES, `${name}.json`), path.join(cases, `${name}.json`));
  const untouched = readFileSync(path.join(ROOT, "src/core/save.js"), "utf8");

  const result = run(["selftest", "--scratch", runtime, "--cases", cases]);
  const output = String(result.stdout ?? "");
  const lineFor = (id) => output.split("\n").find((line) => line.startsWith(id)) ?? "";

  for (const mutation of MUTATIONS) expect(lineFor(mutation.id)).not.toBe("");
  for (const id of UNFELT) expect(lineFor(id)).toContain("NOT CAUGHT");
  for (const mutation of MUTATIONS.filter((entry) => !UNFELT.includes(entry.id))) {
    expect(lineFor(mutation.id)).toMatch(/ caught by \S+ (failed|invalid)/);
  }
  expect(output).toContain(`6 mutations: ${MUTATIONS.length - UNFELT.length} caught, ${UNFELT.length} not caught`);
  expect(output).toContain(`selftest: the corpus does not feel ${UNFELT.join(", ")}`);
  expect(result.status).toBe(1);
  expect(readdirSync(runtime).sort()).toEqual(MUTATIONS.map((mutation) => mutation.id).sort());
  expect(readFileSync(path.join(ROOT, "src/core/save.js"), "utf8")).toBe(untouched);
}, 600000);
