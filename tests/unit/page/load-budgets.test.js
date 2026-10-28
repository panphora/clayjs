/**
 * @jest-environment node
 */
import { describe, expect, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_LOAD_BUDGET } from "../../../scripts/document-load-budget.mjs";

/**
 * The built Document report, held to the ceilings the meter and this test import from one
 * module. The report is pinned to its build: it names the chunk manifest identity it was
 * measured from, and an identity that is not this checkout's dist is refused with both
 * builds named, so a report from an older, smaller release cannot pass here.
 */

const ROOT = new URL("../../../", import.meta.url).pathname;
const REPORT = process.env.CLAY_LOAD_REPORT;
const DIST_MANIFEST = join(ROOT, "dist/m/manifest.json");
// What measure-load.mjs records as a row's identity, field for field.
const IDENTITY = ["schema", "package", "version", "build", "runtime", "edit"];
const PHASES = ["viewReady", "editReady", "late", "firstSave", "firstAdoption", "firstUse"];

const identityOf = (manifest) => Object.fromEntries(IDENTITY.map((key) => [key, manifest?.[key] ?? null]));

function currentBuild() {
  if (!existsSync(DIST_MANIFEST)) {
    throw new Error(`this checkout has no built dist to check the report against: ${DIST_MANIFEST} is missing; run npm run build`);
  }
  return identityOf(JSON.parse(readFileSync(DIST_MANIFEST, "utf8")));
}

// A report that is set but absent or unreadable is a failure, never a skip: the run that
// was supposed to measure and did not must not look green.
function loadReport() {
  if (!existsSync(REPORT)) throw new Error(`CLAY_LOAD_REPORT names ${REPORT}, and no report is there`);
  let rows;
  try {
    rows = JSON.parse(readFileSync(REPORT, "utf8"));
  } catch (error) {
    throw new Error(`CLAY_LOAD_REPORT names ${REPORT}, which is not a readable load report: ${error.message}`);
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${REPORT} holds no measured rows`);
  const mine = currentBuild();
  for (const row of rows) {
    const built = identityOf(row.manifest);
    if (JSON.stringify(built) !== JSON.stringify(mine)) {
      throw new Error(`${REPORT} measured ${row.file} ${row.mode} from build ${built.build} (${built.package} ${built.version}), ` +
        `and this checkout's dist is build ${mine.build} (${mine.package} ${mine.version}); measure the build that is in dist`);
    }
  }
  return rows;
}

if (!REPORT) {
  console.warn("load budgets: CLAY_LOAD_REPORT is unset, so no built report was checked. " +
    "Run npm run build, then node scripts/measure-load.mjs --built dist tests/fixtures/load/document-text.html --json > /tmp/document-load.json, " +
    "then CLAY_LOAD_REPORT=/tmp/document-load.json npm test -- tests/unit/page/load-budgets.test.js");
}

const suite = REPORT ? describe : describe.skip;

suite("the built Document load report, against this build's ceilings", () => {
  let rows = null;
  const report = () => (rows ??= loadReport());
  const ceilingFor = (row) => (row.mode === "view" ? DOCUMENT_LOAD_BUDGET.readerBrotli : DOCUMENT_LOAD_BUDGET.textEditorBrotli);

  test("the report was measured from this checkout's current dist build", () => {
    const builds = [...new Set(report().map((row) => row.manifest.build))];
    expect(builds).toEqual([currentBuild().build]);
  });

  test("view ready and edit ready stay within the reader and editor ceilings, at the built depth", () => {
    for (const row of report()) {
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
    for (const row of report()) {
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
