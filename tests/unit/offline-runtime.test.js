/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import {
  canonicalizeRuntimeURL,
  resolveRuntimeURL,
} from "../../src/lib/offline-runtime.js";
import {
  canonicalizeRuntimeHTML,
  projectRuntimeHTML,
} from "../../src/server/offline-runtime/index.js";
import { buildServerOfflineRuntime } from "../../scripts/build-server-offline-runtime.mjs";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/offline-runtime");
const load = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));

const { selectedVersion, documentURL, releases } = load("releases.json");
const urlVectors = load("urls.json").cases;
const htmlVectors = load("html.json");

const options = { releases, selectedVersion, documentURL };

test("the fixtures cover positive and negative resolution", () => {
  expect(urlVectors.filter((entry) => entry.expect !== null).length).toBeGreaterThanOrEqual(10);
  expect(urlVectors.filter((entry) => entry.expect === null).length).toBeGreaterThanOrEqual(15);
});

test("every URL vector matches the resolver exactly", () => {
  for (const entry of urlVectors) {
    const actual = entry.fn === "resolve"
      ? resolveRuntimeURL(entry.input, options)
      : canonicalizeRuntimeURL(entry.input, {
        descriptor: entry.descriptor ?? null,
        releases: entry.noReleases ? undefined : releases,
        documentURL,
      });
    expect({ name: entry.name, value: actual }).toEqual({ name: entry.name, value: entry.expect });
  }
});

test("every HTML vector projects, canonicalizes and round-trips exactly", () => {
  for (const entry of htmlVectors.cases) {
    const project = projectRuntimeHTML(entry.input, options);
    expect({ name: entry.name, project }).toEqual({ name: entry.name, project: entry.project });
    const canonical = canonicalizeRuntimeHTML(project.html, { releases, documentURL }).html;
    expect({ name: entry.name, canonical }).toEqual({ name: entry.name, canonical: entry.canonical });
    if (project.mappings.length) {
      expect({ name: entry.name, html: canonical }).toEqual({ name: entry.name, html: entry.input });
    }
  }
});

test("every canonical-only vector canonicalizes exactly", () => {
  for (const entry of htmlVectors.canonicalOnly) {
    const actual = canonicalizeRuntimeHTML(entry.input, { releases, documentURL }).html;
    expect({ name: entry.name, html: actual }).toEqual({ name: entry.name, html: entry.canonical });
  }
});

test("a document with no local URL and no descriptor is byte-identical", () => {
  const input = htmlVectors.cases.find((entry) => entry.name === "no-runtime-url").input;
  expect(canonicalizeRuntimeHTML(input, { releases, documentURL })).toEqual({
    html: input,
    changed: 0,
    descriptorRemoved: false,
  });
});

test("the pure resolver imports nothing and touches no DOM", () => {
  const source = readFileSync(path.join(ROOT, "src/lib/offline-runtime.js"), "utf8");
  expect(/^\s*import\s/m.test(source)).toBe(false);
  expect(/\bdocument\b/.test(source)).toBe(false);
  expect(/\bwindow\b/.test(source)).toBe(false);
});

// Built here rather than read from dist/, so the test never depends on a build another test ran.
test("the built CommonJS entry exports both HTML functions", async () => {
  const outdir = mkdtempSync(path.join(tmpdir(), "clay-offline-runtime-"));
  await buildServerOfflineRuntime(outdir);
  const require = createRequire(import.meta.url);
  const built = require(path.join(outdir, "offline-runtime.cjs"));
  expect(typeof built.projectRuntimeHTML).toBe("function");
  expect(typeof built.canonicalizeRuntimeHTML).toBe("function");
});
