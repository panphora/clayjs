/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants } from "node:zlib";
import os from "node:os";
import path from "node:path";

/**
 * What the live-switch foundation costs a reader, measured on a scratch single-graph
 * build of this release.
 *
 * A document that signs `<html clay-mode-switch="live">`, with or without participants
 * queued before boot, and with the owner upgrade metadata a starter template copy carries,
 * must measure exactly what the plain reader measures: the declaration is one attribute
 * read, and the decision, the controller and the adapters behind it are dynamic targets
 * fetched by the first switch.
 *
 * The first entry's requests are measured from the release's own files, and the second
 * entry's from the module cache: zero new requests, because every file the first entry
 * fetched is one the page already holds.
 */

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const fixture = readFileSync(path.join(root, "tests/fixtures/load/document.html"), "utf8");
const budget = JSON.parse(readFileSync(path.join(root, "scripts/load-budget.json"), "utf8"))["built"]["document.html"].view;
let measureBuilt;
let emitChunks;
let emitBootstraps;
const SEARCH = "?plugins=page";
const CEILING = 46080;

const declared = (html) => html.replace('<html lang="en">', '<html lang="en" clay-mode-switch="live">');
const upgraded = (html) => html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="hyper-source" content="https://hyperclay.com/templates/document.html">');
const PARTICIPANT =
  '<script>window.clay = window.clay || {}; (window.clay.modeParticipants = window.clay.modeParticipants || []).push({ id: "template:document", order: 1000, prepare: function () { return { enable: function () {}, quiesce: function () {}, resume: function () {}, dispose: function () {} }; } });</script>';
const withParticipant = (html) => html.replace("<body>", `<body>\n${PARTICIPANT}`);

let outdir;
let built;
let manifest;
let supplement;

const paths = (measured) => measured.js.files.map((file) => file.path);

// The supplement's own index: the entries a resolved edit or draft may name, which the
// main manifest deliberately does not carry.
function indexOf(text) {
  return JSON.parse(text.slice(text.indexOf("export default ") + "export default ".length).trim().replace(/;$/, ""));
}

// A chunk's static import closure, given what the page already holds.
function closureOf(starts, into) {
  const seen = new Set(into);
  const added = [];
  const stack = [...starts];
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    added.push(file);
    stack.push(...(manifest.files[file]?.imports ?? []));
  }
  return added;
}

const brotliOf = async (files) => {
  let total = 0;
  for (const file of files) {
    const bytes = await readFile(path.join(outdir, "m", file));
    total += brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
    }).length;
  }
  return total;
};

async function viewOf(html) {
  return measureBuilt({ html, mode: "view", dir: outdir, search: SEARCH, owner: true });
}

beforeAll(async () => {
  ({ measureBuilt } = await import("../../scripts/measure-load.mjs"));
  ({ emitChunks, emitBootstraps } = await import("../../scripts/build-chunks.mjs"));
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-mode-budget-"));
  built = await emitChunks({ root, outdir: path.join(outdir, "m") });
  await emitBootstraps({ root, outdir, manifest: built.manifest, satellites: built.satellites });
  await writeFile(path.join(outdir, "package.json"), '{ "type": "module" }\n');
  manifest = JSON.parse(await readFile(path.join(outdir, "m/manifest.json"), "utf8"));
  supplement = indexOf(await readFile(path.join(outdir, "m", built.manifest.edit), "utf8"));
}, 180000);

afterAll(async () => {
  await rm(outdir, { recursive: true, force: true });
});

// The corrected actual-boot baseline: an owner reading the standard Document with the
// menu late and no edit-only module before ready.
test("the plain reader measures the recorded Document baseline", async () => {
  const plain = await viewOf(fixture);

  expect(plain.js.requests).toBeLessThanOrEqual(budget.requests);
  expect(plain.js.depth).toBe(3);
  expect(plain.js.brotli).toBeLessThanOrEqual(CEILING);
});

// The declaration, the participants queued before boot, and the owner's upgrade metadata
// are each free at ready and after every idle loader stage: the same requests, the same
// bytes, the same files.
test("a declaration, a preboot participant and upgrade metadata add no request and no byte", async () => {
  const variants = [
    ["declared", declared(fixture), fixture, true],
    ["declared with a participant", withParticipant(declared(fixture)), withParticipant(fixture), true],
    ["declared with owner upgrade metadata", declared(upgraded(fixture)), upgraded(fixture), false],
    [
      "declared with a participant and owner upgrade metadata",
      withParticipant(declared(upgraded(fixture))),
      withParticipant(upgraded(fixture)),
      false,
    ],
  ];

  for (const [name, live, plain, withinReaderCeiling] of variants) {
    const liveView = await viewOf(live);
    const plainView = await viewOf(plain);

    expect({ name, requests: liveView.js.requests }).toEqual({ name, requests: plainView.js.requests });
    expect({ name, brotli: liveView.js.brotli }).toEqual({ name, brotli: plainView.js.brotli });
    expect({ name, files: paths(liveView) }).toEqual({ name, files: paths(plainView) });
    // Idle work: the late stage is the menu, unchanged.
    expect({ name, late: liveView.js.late }).toEqual({ name, late: plainView.js.late });
    // The upgrade plugin is a ready-stage request of its own on a copy with a source meta,
    // and predates this foundation; the declaration adds nothing on top of it, which is
    // what the equality above says.
    if (withinReaderCeiling) expect(liveView.js.brotli).toBeLessThanOrEqual(CEILING);
  }
});

// Nothing the switch needs loads until a switch: no lifecycle module is in the ready
// closure for any of those documents either.
test("no lifecycle module is fetched before a switch", async () => {
  const lifecycle = ["core/mode-switch.js", "core/mode-lifecycle.js", "core/mode-resources.js"].map(
    (entry) => `m/${supplement.entries[entry] ?? manifest.entries[entry]}`
  );
  for (const html of [fixture, declared(fixture), withParticipant(declared(upgraded(fixture)))]) {
    const loaded = paths(await viewOf(html));
    for (const chunk of lifecycle) expect(loaded).not.toContain(chunk);
  }
});

// The first entry's own requests: the decision module, the adapters and the controller,
// with the chunk they share with the reader counted once.
test("the first entry fetches the switch and the controller once, and a repeat entry fetches nothing", async () => {
  const switchChunk = supplement.entries["core/mode-switch.js"];
  const controllerChunk = supplement.entries["core/mode-lifecycle.js"];
  expect(switchChunk).toBeTruthy();
  expect(controllerChunk).toBeTruthy();
  // The decision is reached through the controller, not through a static import of it.
  expect(manifest.files[controllerChunk].dynamicImports).toContain(switchChunk);

  const ready = new Set(paths(await viewOf(declared(fixture))));
  const first = closureOf([switchChunk, controllerChunk], ready);

  expect(first.length).toBeGreaterThan(0);
  expect(await brotliOf(first)).toBeGreaterThan(0);
  for (const chunk of first) expect(ready.has(chunk)).toBe(false);

  // Every later entry asks for modules the page already holds, so it requests nothing.
  const repeat = closureOf([switchChunk, controllerChunk], new Set([...ready, ...first]));
  expect(repeat).toEqual([]);
});
