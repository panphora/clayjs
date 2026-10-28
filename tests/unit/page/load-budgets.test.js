/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOCUMENT_LOAD_BUDGET } from "../../../scripts/document-load-budget.mjs";

/**
 * The built Document report, held to the ceilings the meter and this test import from one
 * module. The report is pinned to its build: it names the chunk manifest identity it was
 * measured from, and an identity that is not this checkout's build is refused with both
 * builds named, so a report from an older, smaller release cannot pass here.
 *
 * Nothing sets CLAY_LOAD_REPORT for a whole-suite run, so this test produces the report
 * itself when the variable is unset: it builds the chunks into a temp directory the way
 * tests/unit/build/load-budget.test.js does, then runs the meter over that build into a
 * report file, so the gate measures on every run instead of skipping.
 */

const ROOT = new URL("../../../", import.meta.url).pathname;
const MEASURE = join(ROOT, "scripts/measure-load.mjs");
const FIXTURE = join(ROOT, "tests/fixtures/load/document-text.html");
const DIST_MANIFEST = join(ROOT, "dist/m/manifest.json");
const { emitBootstraps, emitChunks } = await import("../../../scripts/build-chunks.mjs");
// What measure-load.mjs records as a row's identity, field for field.
const IDENTITY = ["schema", "package", "version", "build", "runtime", "edit"];
const PHASES = ["viewReady", "editReady", "late", "firstSave", "firstAdoption", "firstUse"];

const identityOf = (manifest) => Object.fromEntries(IDENTITY.map((key) => [key, manifest?.[key] ?? null]));

// The build the report has to name: the dist a caller measured, or the one this run built.
let report = process.env.CLAY_LOAD_REPORT ?? null;
let manifest = DIST_MANIFEST;

function currentBuild() {
  if (!existsSync(manifest)) {
    throw new Error(`this checkout has no built manifest to check the report against: ${manifest} is missing; run npm run build`);
  }
  return identityOf(JSON.parse(readFileSync(manifest, "utf8")));
}

// A report that is set but absent or unreadable is a failure, never a skip: the run that
// was supposed to measure and did not must not look green.
function loadReport() {
  if (!existsSync(report)) throw new Error(`CLAY_LOAD_REPORT names ${report}, and no report is there`);
  let rows;
  try {
    rows = JSON.parse(readFileSync(report, "utf8"));
  } catch (error) {
    throw new Error(`CLAY_LOAD_REPORT names ${report}, which is not a readable load report: ${error.message}`);
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${report} holds no measured rows`);
  const mine = currentBuild();
  for (const row of rows) {
    const built = identityOf(row.manifest);
    if (JSON.stringify(built) !== JSON.stringify(mine)) {
      throw new Error(`${report} measured ${row.file} ${row.mode} from build ${built.build} (${built.package} ${built.version}), ` +
        `and this checkout's build is ${mine.build} (${mine.package} ${mine.version}); measure the build that is in dist`);
    }
  }
  return rows;
}

// The report a whole-suite run has no variable for: built here, measured by the meter's own
// command line, and named by its build so the identity check below still means something.
let scratch = null;

describe("the built Document load report, against this build's ceilings", () => {
  beforeAll(async () => {
    if (report) return;
    scratch = mkdtempSync(join(tmpdir(), "clay-load-report-"));
    const chunks = await emitChunks({ root: ROOT, outdir: join(scratch, "m") });
    await emitBootstraps({ root: ROOT, outdir: scratch, manifest: chunks.manifest, satellites: chunks.satellites });
    manifest = join(scratch, "m/manifest.json");
    const file = join(scratch, "document-load.json");
    writeFileSync(file, execFileSync(process.execPath, [MEASURE, "--built", scratch, FIXTURE, "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }));
    report = file;
  }, 180000);

  afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  let rows = null;
  const measured = () => (rows ??= loadReport());
  const ceilingFor = (row) => (row.mode === "view" ? DOCUMENT_LOAD_BUDGET.readerBrotli : DOCUMENT_LOAD_BUDGET.textEditorBrotli);

  test("the report was measured from this checkout's current build", () => {
    const builds = [...new Set(measured().map((row) => row.manifest.build))];
    expect(builds).toEqual([currentBuild().build]);
  });

  test("view ready and edit ready stay within the reader and editor ceilings, at the built depth", () => {
    for (const row of measured()) {
      const atViewReady = row.phases.viewReady.brotli;
      const atEditReady = atViewReady + row.phases.editReady.brotli;
      const ready = row.mode === "view" ? atViewReady : atEditReady;
      const ceiling = ceilingFor(row);

      expect({ file: row.file, paid: atEditReady }).toEqual({ file: row.file, paid: row.js.brotli });
      expect({ file: row.file, mode: row.mode, ready }).toEqual({ file: row.file, mode: row.mode, ready: row.js.brotli });
      expect(row.budget.line).toBe(row.mode === "view" ? "readerBrotli" : "textEditorBrotli");
      expect(row.budget.limit).toBe(ceiling);
      expect(row.js.brotli).toBeLessThanOrEqual(ceiling);
      expect(row.js.depth).toBeLessThanOrEqual(DOCUMENT_LOAD_BUDGET.maxBuiltDepth);

      if (row.mode !== "view") {
        const reach = row.js.brotli <= DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli;
        console.log(`load budgets: ${row.file} ${row.mode} ready is ${row.js.brotli} B Brotli at depth ${row.js.depth}, ` +
          `${ceiling - row.js.brotli} B under the ${ceiling} B ceiling; the ${DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli} B stretch is ` +
          `${reach ? "reached" : `not reached, ${row.js.brotli - DOCUMENT_LOAD_BUDGET.textEditorStretchBrotli} B over`}`);
      } else {
        console.log(`load budgets: ${row.file} ${row.mode} ready is ${row.js.brotli} B Brotli at depth ${row.js.depth}, ` +
          `${ceiling - row.js.brotli} B under the ${ceiling} B reader ceiling`);
      }
    }
  });

  // Automatic late work is the page's own idle cost, and moving bytes there is not demand
  // loading: the phase has to be reported, in bytes of its own, and no file may appear in
  // two phases, read the way Step 1's test reads the same report.
  test("automatic late work is reported as its own phase, not folded into ready", () => {
    for (const row of measured()) {
      const phases = row.mode === "view" ? PHASES.filter((key) => key !== "editReady") : PHASES;
      for (const key of phases) {
        expect([row.file, key, row.phases[key].requests > 0]).toEqual([row.file, key, true]);
        expect([row.file, key, row.phases[key].brotli > 0]).toEqual([row.file, key, true]);
      }

      const counted = PHASES.flatMap((key) => row.phases[key].files.map((file) => file.path));
      expect([row.file, new Set(counted).size]).toEqual([row.file, counted.length]);
      expect(row.phases.late.requests).toBe(row.js.late.requests);
      expect(row.phases.late.brotli).toBe(row.js.late.brotli);
      expect(row.phases.late.brotli).toBeGreaterThan(0);
    }
  });
});
