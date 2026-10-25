/**
 * @jest-environment node
 */
import { beforeAll, afterAll, expect, test } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../../", import.meta.url).pathname;
const budget = JSON.parse(readFileSync(new URL("../../../scripts/load-budget.json", import.meta.url), "utf8"));
const { measure, measureBuilt } = await import("../../../scripts/measure-load.mjs");
const { emitBootstraps, emitChunks } = await import("../../../scripts/build-chunks.mjs");

const htmlOf = (fixture) => readFileSync(new URL(`../../../tests/fixtures/load/${fixture}`, import.meta.url), "utf8");

for (const [fixture, modes] of Object.entries(budget)) {
  if (fixture === "built") continue;
  for (const [mode, limits] of Object.entries(modes)) {
    test(`${fixture} ${mode}: within its load budget`, async () => {
      const measured = await measure({ html: htmlOf(fixture), mode });

      expect(measured.bootstrap).toBe(true);
      expect(measured.js.requests).toBeGreaterThan(1);
      expect(measured.js.requests).toBeLessThanOrEqual(limits.requests);
      expect(measured.js.depth).toBeLessThanOrEqual(limits.depth);
      expect(measured.js.brotli).toBeLessThanOrEqual(limits.brotli);
      expect(measured.css.requests).toBeLessThanOrEqual(limits.css.requests);
      expect(measured.css.depth).toBeLessThanOrEqual(limits.css.depth);
    });
  }
}

// What a browser on clayjs.com actually downloads is the chunked release, so that
// gets its own budgets. Built once for the whole file: the chunk build is the slow
// part, and every fixture measures the same release.
let dir;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "clay-load-built-"));
  const chunks = await emitChunks({ root: ROOT, outdir: join(dir, "m") });
  await emitBootstraps({ root: ROOT, outdir: dir, manifest: chunks.manifest, satellites: chunks.satellites });
}, 180000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

for (const [fixture, modes] of Object.entries(budget.built)) {
  for (const [mode, limits] of Object.entries(modes)) {
    test(`${fixture} ${mode}: within its built load budget`, async () => {
      const measured = await measureBuilt({ html: htmlOf(fixture), mode, dir });

      expect(measured.bootstrap).toBe(true);
      expect(measured.js.requests).toBeGreaterThan(1);
      // Bootstrap, its preloads, then the plan: the depth this step is for.
      expect(measured.js.depth).toBe(3);
      expect(measured.js.requests).toBeLessThanOrEqual(limits.requests);
      expect(measured.js.depth).toBeLessThanOrEqual(limits.depth);
      expect(measured.js.brotli).toBeLessThanOrEqual(limits.brotli);
    });
  }
}
