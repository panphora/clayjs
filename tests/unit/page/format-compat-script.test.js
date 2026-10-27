/**
 * @jest-environment node
 */
import { afterAll, expect, jest, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Document 11 Step 7's matrix command, run once over the published 1.15.2
 * package: every cohort has to report positive and negative cases of its own,
 * and a version list the cache cannot cover has to fail rather than skip a cell.
 */

const ROOT = new URL("../../../", import.meta.url).pathname;
const SCRIPT = path.join(ROOT, "scripts/verify-page-format-compat.mjs");
const CACHE = path.join(ROOT, ".version-cache");
jest.setTimeout(300_000);

const run = (...args) =>
  spawnSync(process.execPath, [SCRIPT, "--legacy-cache", CACHE, "--current", ".", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });

const summaryOf = (stdout) => {
  const line = stdout.split("\n").find((entry) => entry.startsWith("PAGE_FORMAT_COMPAT_JSON "));
  return line ? JSON.parse(line.slice("PAGE_FORMAT_COMPAT_JSON ".length)) : null;
};

const scratch = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

test("the tolerance phase passes every row and ran both sides of every cohort", () => {
  const result = run("--legacy", "1.15.2", "--phase", "tolerance", "--json");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);

  const summary = summaryOf(result.stdout);
  expect(summary).toMatchObject({ phase: "tolerance", ok: true, failed: [] });
  expect(summary.packages.map((entry) => entry.version)).toEqual(["1.15.2"]);
  expect(summary.packages[0].integrity).toMatch(/^sha512-/);
  expect(summary.rows.map((row) => row.row)).toEqual([
    "floor-zero",
    "floor-refusal",
    "newer-preserve",
    "offline-reader",
    "invalid-content",
  ]);
  for (const row of summary.rows) {
    expect(row.cells).toBeGreaterThan(0);
    expect(row.failed).toBe(0);
  }
  // R, the legacy package and the fixture newer writer each ran a positive and a
  // negative case of their own: a cohort that skipped its negative side fails.
  expect(summary.cohorts.map((entry) => entry.cohort)).toEqual(["R", "1.15.2", "fixture newer writer"]);
  for (const cohort of summary.cohorts) {
    expect(cohort.positive).toBeGreaterThan(0);
    expect(cohort.negative).toBeGreaterThan(0);
    expect(cohort.failed).toBe(0);
  }
  expect(result.stdout).toContain("row floor-zero:");
  expect(result.stdout).toContain("sha512-");
});

test("an empty version list fails", () => {
  const result = run("--legacy", "", "--phase", "tolerance");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("nonempty");
});

test("a listed package the cache does not hold fails", () => {
  const result = run("--legacy", "1.15.2,9.9.9", "--phase", "tolerance");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("@panphora/clayjs@9.9.9 is unavailable");
});

test("an edited cache fails the recorded digest", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clayjs-legacy-"));
  scratch.push(dir);
  cpSync(path.join(CACHE, "1.15.2"), path.join(dir, "1.15.2"), { recursive: true });
  appendFileSync(path.join(dir, "1.15.2/src/page/inline.js"), "\n// edited after publication\n");

  const result = spawnSync(
    process.execPath,
    [SCRIPT, "--legacy-cache", dir, "--legacy", "1.15.2", "--current", ".", "--phase", "tolerance"],
    { cwd: ROOT, encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024 },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("does not match its lock");
});
