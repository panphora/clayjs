#!/usr/bin/env node
/**
 * The counterexample corpus command.
 *
 * `check` runs every case in a directory through the driver and the oracle and says what
 * each one is: passed, failed or invalid. It exits nonzero on any failure the corpus has
 * not recorded as known, on an invalid case that is not known, and on a case directory it
 * cannot read, so a corpus run can gate a change.
 *
 * The corpus needs a page, so each case gets its own process with a jsdom document and a
 * deterministic clock of its own: the driver is the same code the Jest entry runs, and
 * only the clock and the module registry are lent by this command instead of by Jest.
 *
 * The other subcommands belong to later steps and say so.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SELF = fileURLToPath(import.meta.url);
const COMMANDS = new Set(["check", "shrink", "prove", "selftest", "sweep", "fence"]);
const NOT_YET = new Set(["shrink", "prove", "selftest", "sweep", "fence"]);

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    if (rest[index + 1] === undefined || rest[index + 1].startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = rest[++index];
  }
  return { command, flags };
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function readCases(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    fail(`check: cannot read the case directory "${dir}": ${error.message}`);
  }
  if (!names.length) fail(`check: "${dir}" holds no cases`);
  return names.map((name) => ({ name, file: path.join(dir, name) }));
}

// The page the driver drives, outside Jest: one document, a clock a case can advance, and
// the globals the loader and the modules read.
async function browserEnvironment() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    url: "http://localhost/notes.html",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // jsdom's own scheduling calls back into the global, so the few globals it needs to
  // reach are kept as Node's: taking its `queueMicrotask` would make it call itself.
  const kept = { queueMicrotask: globalThis.queueMicrotask, setImmediate: globalThis.setImmediate };
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key === "globalThis" || key === "queueMicrotask") continue;
    try {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: window[key] });
    } catch {}
  }
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.queueMicrotask = kept.queueMicrotask;
  globalThis.setImmediate = kept.setImmediate;
  return { window, dom };
}

function installClock(window) {
  let sequence = 0;
  let now = 0;
  const timers = new Map();
  const drain = async (turns = 12) => {
    for (let index = 0; index < turns; index++) await new Promise((resolve) => process.nextTick(resolve));
  };
  const schedule = (callback, delay, args, every) => {
    const id = ++sequence;
    timers.set(id, { at: now + Math.max(0, Number(delay) || 0), callback, args, every });
    return id;
  };
  const cancel = (id) => timers.delete(id);
  const advance = async (ms) => {
    const target = now + Math.max(0, Number(ms) || 0);
    await drain();
    for (;;) {
      let earliest = null;
      for (const [id, timer] of timers) {
        if (timer.at > target) continue;
        if (!earliest || timer.at < earliest.timer.at) earliest = { id, timer };
      }
      if (!earliest) break;
      const { id, timer } = earliest;
      now = timer.at;
      if (timer.every === null) timers.delete(id);
      else timer.at = now + Math.max(1, timer.every);
      timer.callback(...timer.args);
      await drain();
    }
    now = target;
    await drain();
  };
  const api = {
    setTimeout: (callback, delay = 0, ...args) => schedule(callback, delay, args, null),
    clearTimeout: (id) => cancel(id),
    setInterval: (callback, delay = 0, ...args) => schedule(callback, delay, args, Math.max(1, Number(delay) || 1)),
    clearInterval: (id) => cancel(id),
    advance,
  };
  for (const owner of [globalThis, window]) {
    owner.setTimeout = api.setTimeout;
    owner.clearTimeout = api.clearTimeout;
    owner.setInterval = api.setInterval;
    owner.clearInterval = api.clearInterval;
  }
  return api;
}

async function runOne(flags) {
  const dir = flags.cases;
  const files = readCases(dir);
  const target = flags.case;
  const loaded = files.map((entry) => ({ ...entry, json: JSON.parse(readFileSync(entry.file, "utf8")) }));
  const byId = new Map(loaded.map((entry) => [entry.json.id, entry]));
  const chosen = loaded.filter((entry) => target === undefined || entry.file === target || entry.name === target);
  if (!chosen.length) fail(`check: no case named "${target}" in "${dir}"`);

  const { window } = await browserEnvironment();
  const clock = installClock(window);
  const { setHarness } = await import("../tests/mode-counterexamples/driver.mjs");
  const { judge } = await import("../tests/mode-counterexamples/oracle.mjs");
  const { runCase } = await import("../tests/mode-counterexamples/driver.mjs");
  setHarness({
    resetModules: () => {},
    startClock: () => {},
    stopClock: () => {},
    advance: (ms) => clock.advance(ms),
  });

  const results = [];
  for (const entry of chosen) {
    const json = entry.json;
    const run = await runCase(json);
    let control = null;
    if (json.control) {
      const twin = byId.get(json.control);
      control = twin ? { case: twin.json, run: await runCase(twin.json) } : null;
    }
    const verdict = judge({ case: json, run, control });
    results.push({
      id: json.id,
      status: verdict.status,
      failures: verdict.failures,
      requires: json.requires ?? [],
      knownFailing: json.knownFailing ?? null,
    });
  }
  process.stdout.write(`\n${JSON.stringify(results)}\n`);
}

async function check(flags) {
  if (typeof flags.cases !== "string") fail("check: name the corpus, as --cases tests/mode-counterexamples/cases");
  const entries = readCases(flags.cases);
  let passed = 0;
  let failed = 0;
  let invalid = 0;
  let known = 0;

  for (const entry of entries) {
    const child = spawnSync(process.execPath, [SELF, "check", "--cases", flags.cases, "--case", entry.name, "--json"], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" ") },
    });
    const output = String(child.stdout ?? "");
    const line = output.split("\n").reverse().find((candidate) => candidate.trim().startsWith("["));
    let outcome = null;
    try {
      outcome = line ? JSON.parse(line)[0] : null;
    } catch {
      outcome = null;
    }
    if (!outcome) {
      console.log(`${entry.name.replace(/\.json$/, "").padEnd(32)} invalid  (the run produced no verdict)`);
      console.log(String(child.stderr ?? "").trim().split("\n").slice(-3).join("\n"));
      invalid++;
      continue;
    }
    const label = outcome.status === "invalid" && outcome.knownFailing ? "invalid (known)" : outcome.status;
    const detail = outcome.failures.length ? `  ${outcome.failures.map((failure) => `${failure.property}: ${failure.detail}`).join("; ")}` : "";
    console.log(`${outcome.id.padEnd(32)} ${label}${detail}`);
    console.log(`${" ".repeat(33)}requires: ${outcome.requires.join(", ") || "none"}`);
    if (outcome.knownFailing) known++;
    else if (outcome.status === "passed") passed++;
    else if (outcome.status === "invalid") invalid++;
    else failed++;
  }

  console.log("");
  console.log(`${entries.length} cases: ${passed} passed, ${failed} failed, ${invalid} invalid, ${known} known failing`);
  if (failed || invalid) process.exitCode = 1;
}

const { command, flags } = parseArgs(process.argv.slice(2));
if (!COMMANDS.has(command)) {
  fail(
    [
      "usage: node scripts/mode-counterexamples.mjs <command>",
      "  check --cases <dir>   run every case and judge it",
      "  shrink, prove, selftest, sweep, fence   not yet (later steps)",
    ].join("\n"),
    2,
  );
}
if (NOT_YET.has(command)) {
  console.error(`${command}: not yet`);
  process.exit(2);
}
if (flags.json) await runOne(flags);
else await check(flags);
