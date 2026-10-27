// The long session outside Jest: the same two-tab run as
// tests/unit/page/long-session.test.js, on the seeded fixture, reporting what the
// step asks for: the machine, the fixture's counts, delivered and refused
// operations by type, dispatch samples, compacted bytes, cache high-water counts
// and whether a reopen equals the live document.
import os from "node:os";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";

const USAGE = `usage: node scripts/measure-page-session.mjs [--blocks 2000] [--operations 2000] [--seed 20261026] [--json <file>]

  --blocks      top-level blocks in the fixture (the fixture defines 2000)
  --operations  seeded operations to run (a positive integer)
  --seed        fixture and operation-log seed
  --json        write the report to this file as well as stdout`;

function usage(message) {
  if (message) process.stderr.write(`measure-page-session: ${message}\n`);
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

function count(name, value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) usage(`--${name} takes a whole number, not ${JSON.stringify(value)}`);
  const n = Number(value);
  if (!(n > 0)) usage(`--${name} must be greater than zero`);
  return n;
}

function parse(argv) {
  const args = { blocks: 2000, operations: 2000, seed: 20261026, json: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") { process.stdout.write(`${USAGE}\n`); process.exit(0); }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage(`${flag} needs a value`);
    i++;
    if (flag === "--blocks") { args.blocks = count("blocks", value, 2000); continue; }
    if (flag === "--operations") { args.operations = count("operations", value, 2000); continue; }
    if (flag === "--seed") {
      if (!/^-?\d+$/.test(String(value))) usage(`--seed takes a whole number, not ${JSON.stringify(value)}`);
      args.seed = Number(value);
      continue;
    }
    if (flag === "--json") { args.json = value; continue; }
    usage(`unknown option ${flag}`);
  }
  return args;
}

// Not Jest's toEqual: the same deep comparison, without the key order mattering.
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

const show = (value) => {
  try { return JSON.stringify(value); } catch { return String(value); }
};

function expect(actual) {
  const fail = (want, verb) => {
    throw new Error(`expect(${show(actual)}).${verb}(${show(want)})`);
  };
  return {
    toBe: (want) => { if (!Object.is(actual, want)) fail(want, "toBe"); },
    toEqual: (want) => { if (!deepEqual(actual, want)) fail(want, "toEqual"); },
    toContain: (want) => { if (!actual.includes(want)) fail(want, "toContain"); },
    toBeLessThanOrEqual: (want) => { if (!(actual <= want)) fail(want, "toBeLessThanOrEqual"); },
    toBeGreaterThan: (want) => { if (!(actual > want)) fail(want, "toBeGreaterThan"); },
    toBeTruthy: () => { if (!actual) fail(true, "toBeTruthy"); },
    toBeNull: () => { if (actual !== null) fail(null, "toBeNull"); },
  };
}

// The page the harness drives: one jsdom document and the globals the editor, the
// binding and the journal read. Node keeps its own timers, so a settle is real.
async function browserEnvironment(url) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, { url, pretendToBeVisual: true });
  const { window } = dom;
  const SKIP = new Set(["globalThis", "queueMicrotask", "setTimeout", "clearTimeout", "setInterval", "clearInterval"]);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (SKIP.has(key)) continue;
    try {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: window[key] });
    } catch {}
  }
  globalThis.window = window;
  globalThis.document = window.document;
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(type, init = {}) { super(type, init); this.clipboardData = init.clipboardData ?? null; } };
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
  return dom;
}

function machine() {
  const cpu = os.cpus()[0];
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    cpu: cpu ? cpu.model.trim() : "unknown",
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
    v8: process.versions.v8,
  };
}

async function main() {
  const args = parse(process.argv.slice(2));
  const dom = await browserEnvironment("https://example.test/long-session.html");
  const { runLongSession } = await import("../tests/unit/page/helpers/long-session.js");
  const { LONG_DOCUMENT, LONG_DOCUMENT_SEED } = await import("../tests/unit/page/helpers/long-document.js");
  if (args.blocks !== LONG_DOCUMENT.blocks) {
    usage(`the seeded fixture is ${LONG_DOCUMENT.blocks} top-level blocks; --blocks ${args.blocks} is not a fixture this run can build`);
  }
  const seed = args.seed ?? LONG_DOCUMENT_SEED;
  const startedAt = performance.now();
  let report;
  try {
    report = await runLongSession({ seed, operations: args.operations, expect });
  } finally {
    dom.window.close();
  }
  const runtimeMs = performance.now() - startedAt;
  const output = {
    machine: machine(),
    runtime: { milliseconds: Math.round(runtimeMs), seconds: Number((runtimeMs / 1000).toFixed(1)), operations: report.operations, blocks: report.blocks },
    ...report,
  };
  const text = JSON.stringify(output, null, 2);
  if (args.json) await writeFile(args.json, `${text}\n`);
  process.stdout.write(`${text}\n`);
  const delivered = Object.values(report.deliveredOperations).reduce((a, b) => a + b, 0);
  const refused = Object.values(report.refusedOperations).reduce((a, b) => a + b, 0);
  const summary = [
    `blocks ${report.blocks} ${show(report.counts)}`,
    `operations ${report.operations} delivered ${delivered} refused ${refused} (${report.batches} batches)`,
    `dispatch median ${report.medianMs.toFixed(2)} ms p95 ${report.p95Ms.toFixed(2)} ms max ${report.maximumMs.toFixed(2)} ms`,
    `compacted ${report.compactedBytes} B (${report.compactedUtf8Bytes} B UTF-8) journal records ${report.journalRecords}`,
    `cache high-water ${show(report.cacheHighWater)}`,
    `reopen checkpoint ${report.reopen.checkpointEqual} recovered ${report.reopen.recoveredEqual}`,
    `fold violations ${report.foldViolations} mismatches ${report.mismatches} in ${(runtimeMs / 1000).toFixed(1)} s`,
  ];
  process.stdout.write(`${summary.join("\n")}\n`);
}

await main();
