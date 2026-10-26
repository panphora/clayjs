/**
 * @jest-environment jsdom
 */

import { readdirSync, readFileSync } from "node:fs";
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
});

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
