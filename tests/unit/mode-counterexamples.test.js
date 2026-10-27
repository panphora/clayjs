/**
 * @jest-environment jsdom
 */

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCase } from "../mode-counterexamples/driver.mjs";
import { judge } from "../mode-counterexamples/oracle.mjs";

/**
 * The permanent corpus, run through the real switch and judged by the oracle.
 *
 * Every case in `tests/mode-counterexamples/cases/` is a schedule, its preconditions and
 * the evidence it must leave behind; the oracle reads the transport's own account, the
 * page and the trace. A case that fails today's code stays in the corpus marked
 * `knownFailing`, and this file asserts the failure it is known for rather than passing it
 * silently.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIR = new URL("../mode-counterexamples/cases/", import.meta.url);

function loadCases() {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".json")).sort();
  return files.map((name) => JSON.parse(readFileSync(new URL(name, DIR), "utf8")));
}

// A known failure names what it is known for: an oracle property, or `invalid` for a case
// whose preconditions the current code cannot reach.
function expectedOf(knownFailing) {
  const token = knownFailing.split(":")[0].trim();
  return token;
}

function assertKnown(outcome, verdict, knownFailing) {
  const expected = expectedOf(knownFailing);
  if (expected === "invalid") {
    expect(verdict.status).toBe("invalid");
    return;
  }
  expect(verdict.status).toBe("failed");
  expect(verdict.failures.map((failure) => failure.property)).toContain(expected);
}

const cases = loadCases();
const byId = new Map(cases.map((json) => [json.id, json]));

test("the corpus is not empty and every control it names is in it", () => {
  expect(cases.length).toBeGreaterThanOrEqual(7);
  for (const json of cases) {
    if (json.control === undefined) continue;
    expect(byId.has(json.control)).toBe(true);
  }
  console.log(`mode-counterexamples: ${cases.length} cases`);
});

test("every case runs through the driver and the oracle, and holds up", async () => {
  const runs = new Map();
  for (const json of cases) runs.set(json.id, await runCase(json));

  const lines = [];
  for (const json of cases) {
    const run = runs.get(json.id);
    const control = json.control ? { case: byId.get(json.control), run: runs.get(json.control) } : null;
    const verdict = judge({ case: json, run, control });
    lines.push(`${json.id}: ${verdict.status}${json.knownFailing ? " (known)" : ""}`);
    if (json.knownFailing) assertKnown(run, verdict, json.knownFailing);
    else {
      expect(verdict.failures).toEqual([]);
      expect(verdict.status).toBe("passed");
    }
    // A case that is not known-failing reaches every requirement it names.
    if (!json.knownFailing) expect(run.status).not.toBe("invalid");
  }

  console.log(lines.join("\n"));
  expect(new Set(cases.map((json) => json.id)).size).toBe(cases.length);
}, 120000);

test("a positive control with its input removed fails the pair", async () => {
  const json = byId.get("enter-leave-zero-writes");
  const control = byId.get(json.control);
  const withoutInput = { ...control, steps: control.steps.filter((step) => step.op !== "input") };

  const run = await runCase(json);
  const twin = await runCase(withoutInput);
  const verdict = judge({ case: json, run, control: { case: withoutInput, run: twin } });

  expect(twin.result.writes).toBe(0);
  expect(verdict.status).toBe("failed");
  expect(verdict.failures.map((failure) => failure.property)).toContain("positive-control");
});

// Round 3's own corpus: the schedules that found the controlled-attribute defects and the
// nine cases the report classed as oracle bugs or driver limitations. It lives in a
// subfolder so the corpus above is read exactly as it was, and it is judged the way a
// round is: one process per case, because a page's lifetime state is the process it runs
// in and a case that leaves edit never hands it back.
const ROUND3 = new URL("../mode-counterexamples/cases/round3/", import.meta.url);
const ROUND3_DIR = fileURLToPath(ROUND3);
const CLI = path.join(ROOT, "scripts/mode-counterexamples.mjs");

function round3Files() {
  return readdirSync(ROUND3)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function round3Verdict(name) {
  const child = spawnSync(process.execPath, [CLI, "check", "--cases", ROUND3_DIR, "--case-file", path.join(ROUND3_DIR, name), "--json"], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" ") },
  });
  const line = String(child.stdout ?? "")
    .split("\n")
    .reverse()
    .find((candidate) => candidate.trim().startsWith("["));
  expect(line).toBeDefined();
  return JSON.parse(line)[0];
}

const propertiesOf = (outcome) => (outcome.failures ?? []).map((failure) => failure.property);

// The two product defects round 3 proved, both fixed since: the entry that wrote with
// nothing typed and locked the page out, and the spelled boolean that left a saved page
// dirty. Each now passes.
const DEFECTS = [
  "entry-write-boolean-order",
  "entry-write-inert-contenteditable-order",
  "entry-write-inert-onclick-order",
  "entry-write-source-mapped",
  "entry-write-autosave-boolean-order",
  "entry-lockout-boolean-order",
  "entry-lockout-autosave",
  "spelled-boolean-stuck-in-edit",
  "spelled-readonly-stuck-in-edit",
  "spelled-boolean-stuck-source-mapped",
  "spelled-boolean-retry-stays-stuck",
];

// What the report holds the harness, not the library, to account for: the saved head and
// selector fields the oracle could not see, the inputs a person discarded, and the
// composition into an unsent field. None of them may fail now.
const SETTLED = [
  "seo-apply-head-conservation",
  "seo-close-discard-conservation",
  "seo-pending-selector-target",
  "seo-unsent-apply-reopen",
  "seo-unsent-close-reopen",
  "ime-unsent-compose-target",
];
// The two the driver cannot describe a person doing, which must now say so instead of
// failing on what it typed into a page that was not there.
const LIMITATIONS = ["ime-late-commit-after-view", "late-source-chunk-failed"];
// The page whose text the exit used to drop before: its binding now knows the input it owes
// the file, so the leave is refused in the page's own name and the text stays in edit. It
// still waits for the checkpoint that lands it.
const OPEN = ["page-pending-selector-target"];

test("round 3\u0027s corpus is the round\u0027s own, in its own folder", () => {
  const files = round3Files();
  expect(files.length).toBe(21);
  const ids = files.map((name) => JSON.parse(readFileSync(new URL(name, ROUND3), "utf8")).id);
  for (const id of [...DEFECTS, ...SETTLED, ...LIMITATIONS, ...OPEN]) expect(ids).toContain(id);
  // The corpus the checks read above is unchanged by the subfolder.
  expect(readdirSync(DIR).filter((name) => name.endsWith(".json")).length).toBe(cases.length);
});

test("round 3\u0027s defect candidates pass now that both defects are fixed", () => {
  const lines = [];
  const failing = [];
  for (const id of DEFECTS) {
    const outcome = round3Verdict(`${id}.json`);
    lines.push(`${id}: ${outcome.status} ${JSON.stringify(propertiesOf(outcome))}`);
    if (outcome.status !== "passed") failing.push(id);
  }
  console.log(lines.join("\n"));
  expect(failing).toEqual([]);
}, 300000);

test("the open page case ends in a refusal that names page:live", () => {
  for (const id of OPEN) {
    const outcome = round3Verdict(`${id}.json`);
    expect(outcome.status).toBe("passed");
    expect(propertiesOf(outcome)).toEqual([]);
  }
}, 300000);

test("round 3\u0027s oracle bugs and driver limitations no longer fail", () => {
  const lines = [];
  const wrong = [];
  for (const id of SETTLED) {
    const outcome = round3Verdict(`${id}.json`);
    lines.push(`${id}: ${outcome.status} ${(outcome.failures ?? []).map((failure) => failure.detail).join("; ")}`);
    if (outcome.status !== "passed") wrong.push(id);
  }
  for (const id of LIMITATIONS) {
    const outcome = round3Verdict(`${id}.json`);
    lines.push(`${id}: ${outcome.status} ${(outcome.failures ?? []).map((failure) => failure.detail).join("; ")}`);
    if (outcome.status !== "invalid" || !(outcome.failures ?? []).length) wrong.push(id);
  }
  console.log(lines.join("\n"));
  expect(wrong).toEqual([]);
}, 300000);
