/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

const budget = JSON.parse(readFileSync(new URL("../../../scripts/load-budget.json", import.meta.url), "utf8"));
const { measure } = await import("../../../scripts/measure-load.mjs");

for (const [fixture, modes] of Object.entries(budget)) {
  for (const [mode, limits] of Object.entries(modes)) {
    test(`${fixture} ${mode}: within its load budget`, async () => {
      const html = readFileSync(new URL(`../../../tests/fixtures/load/${fixture}`, import.meta.url), "utf8");
      const measured = await measure({ html, mode });

      expect(measured.js.requests).toBeGreaterThan(0);
      expect(measured.js.requests).toBeLessThanOrEqual(limits.requests);
      expect(measured.js.depth).toBeLessThanOrEqual(limits.depth);
      expect(measured.js.brotli).toBeLessThanOrEqual(limits.brotli);
      expect(measured.css.requests).toBeLessThanOrEqual(limits.css.requests);
      expect(measured.css.depth).toBeLessThanOrEqual(limits.css.depth);
    });
  }
}
