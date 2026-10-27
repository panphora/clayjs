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
 * `shrink` reduces a failing case to the smallest schedule that still reaches the same
 * preconditions and fails the same oracle properties, and `prove` runs a case and its
 * reduced schedule against two exact runtime copies: it must fail before and pass after.
 *
 * Every case reads ClayJS from one runtime root, the checkout unless
 * `CLAY_COUNTEREXAMPLE_RUNTIME` names another directory laid out like it, so the same
 * corpus can be run against a fault and against the fix.
 *
 * `selftest` plants one defect per scratch copy of the runtime and names the cases that
 * feel each, so the corpus' sensitivity is proved rather than assumed.
 *
 * `sweep` is the hunt: it draws fresh schedules from one seed over the fixtures and
 * boundaries the driver supports, weighted towards the shapes the corpus has not caught a
 * defect in yet, and keeps every schedule the oracle fails as a case file shrunk by the
 * same `shrink` the corpus uses. The same seed draws the same schedules byte for byte.
 *
 * `fence` belongs to a later step and says so.
 */

import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { validateCase } from "../tests/mode-counterexamples/driver.mjs";
import { FIXTURES } from "../tests/mode-counterexamples/fixtures.mjs";

const SELF = fileURLToPath(import.meta.url);
// The platform's own timer, taken before a page's clock replaces the global: a drain
// that only turned microtasks would starve whatever the page scheduled outside the
// case's clock, and an import that needs a real turn would look like a hang.
const realTimeout = setTimeout;
const COMMANDS = new Set(["check", "shrink", "prove", "selftest", "sweep", "fence"]);
const NOT_YET = new Set(["fence"]);
const ROOT = path.dirname(path.dirname(SELF));
const CORPUS = path.join(ROOT, "tests/mode-counterexamples/cases");

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

function childEnv(runtime) {
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-vm-modules"].filter(Boolean).join(" "),
  };
  if (typeof runtime === "string") env.CLAY_COUNTEREXAMPLE_RUNTIME = runtime;
  return env;
}

// The verdict a child writes as its last JSON line. A child that wrote none produced no
// verdict, which is its own answer: never a pass.
function verdictOf(output) {
  const line = String(output ?? "")
    .split("\n")
    .reverse()
    .find((candidate) => candidate.trim().startsWith("["));
  try {
    return line ? JSON.parse(line)[0] ?? null : null;
  } catch {
    return null;
  }
}

// One case, one process: the jsdom document, the deterministic clock and the module
// registry a boot needs belong to the child, and so does the runtime root it reads ClayJS
// from. `cases` stays the corpus the case came from, so a control it names is still found.
function runCaseProcess({ cases, file, runtime = null }) {
  const child = spawnSync(process.execPath, [SELF, "check", "--cases", cases, "--case-file", file, "--json"], {
    encoding: "utf8",
    env: childEnv(runtime),
  });
  return { outcome: verdictOf(child.stdout), child };
}

const propertyNames = (outcome) => [...new Set((outcome?.failures ?? []).map((failure) => failure.property))].sort();

// A failure's shape is its message with the run's own words taken out: the values a case
// types and the numbers it counts are what a reduction may change, so a reduction is only
// the same failure when the words around them still read the same.
const messageShape = (failure) => (failure.detail ?? "").replace(/"[^"]*"/g, '""').replace(/\d+/g, "0");

const failureShapes = (outcome) => (outcome?.failures ?? []).map(messageShape);

const sameProperties = (outcome, names, shapes = null) => {
  const seen = propertyNames(outcome);
  if (seen.length !== names.length || !seen.every((name, index) => name === names[index])) return false;
  if (!shapes) return true;
  const now = failureShapes(outcome);
  return now.length === shapes.length && now.every((shape, index) => shape === shapes[index]);
};

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
  // reach are kept as Node's: taking its timers would make it call itself, and the case's
  // clock owns them from installClock on anyway.
  const kept = { queueMicrotask: globalThis.queueMicrotask, setImmediate: globalThis.setImmediate };
  const SKIP = new Set(["globalThis", "queueMicrotask", "setTimeout", "clearTimeout", "setInterval", "clearInterval"]);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (SKIP.has(key)) continue;
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
  const real = {};
  let installed = false;
  // A page that builds its editor imports modules while the case is running, and an
  // import only lands on a real turn of the event loop: the drain takes both, so a boot
  // that downloads is not mistaken for one that hung.
  const drain = async (turns = 12) => {
    for (let index = 0; index < turns; index++) {
      await new Promise((resolve) => process.nextTick(resolve));
      if (index % 2 === 1) await new Promise((resolve) => realTimeout(resolve, 0));
    }
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
  // The page boots on the platform's own timers, as it does under Jest: the clock is
  // installed when the driver starts the case, after the boot it lent real time. The
  // page reads wall time too — the autosave scheduler decides when it may save by
  // comparing performance.now() with the moment it noted the edit — so the clock moves
  // the wall clocks along with the timers, as Jest's fake timers do.
  const realNow = Date.now;
  const realPerformanceNow = [globalThis, window]
    .map((owner) => [owner.performance, owner.performance?.now])
    .filter(([, now]) => typeof now === "function");
  api.install = () => {
    for (const owner of [globalThis, window]) {
      for (const name of ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]) {
        if (!installed) real[name] ??= owner[name];
        owner[name] = api[name];
      }
    }
    Date.now = () => now;
    for (const [performance] of realPerformanceNow) performance.now = () => now;
    installed = true;
  };
  api.stop = () => {
    for (const owner of [globalThis, window]) {
      for (const name of ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]) {
        if (real[name]) owner[name] = real[name];
      }
    }
    Date.now = realNow;
    for (const [performance, performanceNow] of realPerformanceNow) performance.now = performanceNow;
    installed = false;
  };
  return api;
}

async function runOne(flags) {
  const dir = flags.cases;
  const files = readCases(dir);
  const target = flags.case;
  const loaded = files.map((entry) => ({ ...entry, json: JSON.parse(readFileSync(entry.file, "utf8")) }));
  const byId = new Map(loaded.map((entry) => [entry.json.id, entry]));
  const single = typeof flags["case-file"] === "string" ? flags["case-file"] : null;
  const chosen = single
    ? [{ name: path.basename(single), file: single, json: JSON.parse(readFileSync(single, "utf8")) }]
    : loaded.filter((entry) => target === undefined || entry.file === target || entry.name === target);
  if (!chosen.length) fail(`check: no case named "${target}" in "${dir}"`);

  const { window } = await browserEnvironment();
  const clock = installClock(window);
  const { setHarness } = await import("../tests/mode-counterexamples/driver.mjs");
  const { judge } = await import("../tests/mode-counterexamples/oracle.mjs");
  const { runCase } = await import("../tests/mode-counterexamples/driver.mjs");
  setHarness({
    resetModules: () => {},
    startClock: () => clock.install(),
    stopClock: () => clock.stop(),
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
    const { outcome, child } = runCaseProcess({ cases: flags.cases, file: entry.file });
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

function readCaseFile(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read the case "${file}": ${error.message}`);
  }
}

async function shrink(flags) {
  if (typeof flags.case !== "string") fail("shrink: name the case, as --case tests/mode-counterexamples/cases/<id>.json");
  if (typeof flags.out !== "string") fail("shrink: name the file to write, as --out <json>");
  const file = path.resolve(flags.case);
  const cases = path.dirname(file);
  const original = readCaseFile(file);
  const runtime = process.env.CLAY_COUNTEREXAMPLE_RUNTIME ?? null;

  const first = runCaseProcess({ cases, file, runtime });
  if (!first.outcome) {
    fail(`shrink: ${original.id} produced no verdict: ${String(first.child.stderr ?? "").trim().split("\n").slice(-3).join("\n")}`);
  }
  if (first.outcome.status !== "failed") {
    fail(`shrink: ${original.id} is ${first.outcome.status}, and only a failed case can be shrunk`);
  }
  const properties = propertyNames(first.outcome);
  const shapes = failureShapes(first.outcome);

  const scratch = mkdtempSync(path.join(os.tmpdir(), "clay-shrink-"));
  const candidateFile = path.join(scratch, "candidate.json");
  let runs = 1;
  let steps = original.steps;
  const trySteps = (next) => {
    const json = { ...original, steps: next };
    if (!validateCase(json).ok) return null;
    writeFileSync(candidateFile, JSON.stringify(json));
    runs++;
    const { outcome } = runCaseProcess({ cases, file: candidateFile, runtime });
    if (!outcome || outcome.status !== "failed" || !sameProperties(outcome, properties, shapes)) return null;
    return next;
  };

  try {
    let shrinking = true;
    while (shrinking) {
      shrinking = false;
      for (const width of [1, 2]) {
        let index = 0;
        while (index + width <= steps.length) {
          const next = [...steps.slice(0, index), ...steps.slice(index + width)];
          const kept = trySteps(next);
          if (kept) {
            steps = kept;
            shrinking = true;
          } else {
            index++;
          }
        }
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const reduced = { ...original, id: `${original.id}-reduced`, reducedFrom: original.id, steps };
  writeFileSync(flags.out, `${JSON.stringify(reduced, null, 2)}\n`);
  console.log(`shrink: ${original.id}: ${properties.join(", ") || "no property"}`);
  console.log(`shrink: ${original.steps.length} steps -> ${reduced.steps.length} steps (${runs} runs)`);
  console.log(`shrink: wrote ${flags.out}`);
}

// sha256 over the sorted relative paths of a runtime directory and the bytes of each file:
// two copies that differ by one byte are two different runtimes, and the proof names both.
function hashRuntime(dir) {
  const root = path.resolve(dir);
  const hash = createHash("sha256");
  const walk = (rel) => {
    const entries = readdirSync(path.join(root, rel), { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const child = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        hash.update(`d\0${child}\0`);
        walk(child);
      } else if (entry.isFile()) {
        hash.update(`f\0${child}\0`);
        hash.update(readFileSync(path.join(root, child)));
        hash.update("\0");
      }
    }
  };
  try {
    walk("");
  } catch (error) {
    fail(`prove: cannot read the runtime "${root}": ${error.message}`);
  }
  return hash.digest("hex");
}

async function prove(flags) {
  if (typeof flags.case !== "string") fail("prove: name the case, as --case <json>");
  if (typeof flags.before !== "string" || typeof flags.after !== "string") {
    fail("prove: name the runtime before and after, as --before <dir> --after <dir>");
  }
  const file = path.resolve(flags.case);
  const cases = path.dirname(file);
  const original = readCaseFile(file);
  const before = { hash: hashRuntime(flags.before) };
  const after = { hash: hashRuntime(flags.after) };
  if (before.hash === after.hash) fail(`prove: --before and --after are the same runtime (${before.hash})`);

  const reducedFile = typeof flags.reduced === "string" ? path.resolve(flags.reduced) : null;
  const reduced = reducedFile ? readCaseFile(reducedFile) : null;
  const schedules = [{ name: original.id, file }];
  if (reducedFile) schedules.push({ name: reduced.id, file: reducedFile });

  const results = [];
  for (const schedule of schedules) {
    for (const [runtime, dir, wanted] of [
      ["before", flags.before, "failed"],
      ["after", flags.after, "passed"],
    ]) {
      const { outcome } = runCaseProcess({ cases, file: schedule.file, runtime: path.resolve(dir) });
      const status = outcome?.status ?? "no-verdict";
      results.push({ schedule: schedule.name, runtime, status, failures: outcome?.failures ?? [] });
      if (status !== wanted) {
        fail(`prove: ${schedule.name} under ${runtime} (${path.resolve(dir)}) was ${status}, not ${wanted}`);
      }
    }
  }

  const out = typeof flags.out === "string" ? flags.out : path.join(cases, `${original.id}.proof.json`);
  const proof = {
    case: original.id,
    reduced: reduced?.id ?? null,
    before,
    after,
    results,
  };
  writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`prove: ${original.id}${reduced ? ` and ${reduced.id}` : ""} failed before and passed after`);
  console.log(`prove: before ${before.hash}`);
  console.log(`prove: after  ${after.hash}`);
  console.log(`prove: wrote ${out}`);
}

// The sensitivity check: six defects, each planted in a runtime copy of its own, run
// against the permanent corpus. A defect that no case feels is a gap in the corpus and is
// named, never smoothed over: the checkout's `src/` is untouched, and the copies are made
// under `--scratch` so the run leaves the evidence behind.
async function selftest(flags) {
  if (typeof flags.scratch !== "string") fail("selftest: name the scratch directory, as --scratch <dir>");
  const { MUTATIONS } = await import("../tests/mode-counterexamples/mutations.mjs");
  const cases = typeof flags.cases === "string" ? flags.cases : CORPUS;
  const entries = readCases(cases);
  const scratch = path.resolve(flags.scratch);
  const runtime = path.resolve(process.env.CLAY_COUNTEREXAMPLE_RUNTIME || ROOT);

  // What every case is with no defect planted: only a case that passes here can catch
  // anything, and a corpus that passes nothing would call every defect caught.
  const known = new Map();
  for (const entry of entries) {
    const { outcome } = runCaseProcess({ cases, file: entry.file, runtime });
    known.set(outcome?.id ?? entry.name.replace(/\.json$/, ""), outcome?.status ?? "no-verdict");
  }
  const watched = [...known].filter(([, status]) => status === "passed").map(([id]) => id);
  if (!watched.length) fail("selftest: no case passes on the clean runtime, so no defect could be told from a broken corpus");

  const gaps = [];
  let caught = 0;
  for (const mutation of MUTATIONS) {
    const dir = path.join(scratch, mutation.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(runtime, "src"), path.join(dir, "src"), { recursive: true });
    const target = path.join(dir, mutation.file);
    const source = readFileSync(target, "utf8");
    const seen = source.split(mutation.find).length - 1;
    if (seen !== 1) fail(`selftest: ${mutation.id}: its find matches ${seen} times in ${mutation.file}, not exactly once`);
    writeFileSync(target, source.replace(mutation.find, mutation.replace));

    const felt = [];
    for (const entry of entries) {
      const { outcome } = runCaseProcess({ cases, file: entry.file, runtime: dir });
      const id = outcome?.id ?? entry.name.replace(/\.json$/, "");
      if (!watched.includes(id)) continue;
      const status = outcome?.status ?? "no-verdict";
      if (status !== "passed") felt.push(`${id} ${status}`);
    }
    if (felt.length) caught++;
    else gaps.push(mutation.id);
    console.log(`${mutation.id.padEnd(32)} ${felt.length ? `caught by ${felt.join(", ")}` : "NOT CAUGHT"}`);
  }

  console.log("");
  console.log(`${MUTATIONS.length} mutations: ${caught} caught, ${gaps.length} not caught`);
  if (gaps.length) {
    console.log(`selftest: the corpus does not feel ${gaps.join(", ")}`);
    process.exitCode = 1;
  }
}

// The fixtures a sweep draws from. `page-host` is left out on purpose: its editor owns the
// page, and an `input` step cannot type into it, so every schedule over it would be invalid
// rather than a hunt. `draft-host` boots in draft mode, which is a shape of its own.
const SWEEP_FIXTURES = [
  "persist-host",
  "persist-host",
  "persist-host",
  "freeze-host",
  "freeze-host",
  "lane-peer",
  "lane-peer",
  "unsent-host",
  "unsent-host",
  "draft-host",
];
const SWEEP_DRAFT = "draft-host";
const SWEEP_TARGETS = ["title", "content"];
const SWEEP_VALUES = ["Kept text", "Late edit", "Fresh words", "Second pass"];
// The two shapes a host page is hunted in: an edit typed while the exit's write is held,
// and a generation change while a write is on the wire. Most of the weight is here because
// these are the shapes the corpus does not feel yet.
const SWEEP_HOST_FAMILIES = [
  "late-edit",
  "late-edit",
  "late-edit",
  "late-edit",
  "generation-change",
  "generation-change",
  "generation-change",
];

// One integer seed, one stream of draws: a generator, so a seed is a promise the same
// schedules come back and a finding can be reproduced from the seed alone.
function sweepStream(seed) {
  const low = seed >>> 0;
  const high = Math.floor(seed / 4294967296) >>> 0;
  let state = (low ^ Math.imul(high, 0x9e3779b9) ^ 0x85ebca6b) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let word = state;
    word = Math.imul(word ^ (word >>> 15), word | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

const drawn = (roll, list) => list[Math.min(list.length - 1, Math.floor(roll() * list.length))];

function sweepSchedule(roll, tag, index, fixtures) {
  const id = (family) => `sweep-${tag}-${String(index).padStart(4, "0")}-${family}`;
  const fixture = drawn(roll, fixtures);
  const target = drawn(roll, SWEEP_TARGETS);
  const first = drawn(roll, SWEEP_VALUES);
  const second = drawn(roll, SWEEP_VALUES.filter((value) => value !== first));
  // Every schedule boots in view and enters edit as a step: an edit-mode boot spends a
  // real timer's worth of time before the case's own clock owns the page.
  const boot = { mode: "view", live: true, destination: "host" };
  const enter = [{ op: "enter" }];

  if (fixture === SWEEP_DRAFT) {
    return {
      schema: 1,
      id: id("draft-boot"),
      fixture,
      boot,
      steps: [
        { op: "settle", ms: 200 },
        { op: "input", target, value: first },
        { op: "settle", ms: 2000 },
        ...(roll() < 0.5
          ? [
              { op: "leave", await: false },
              { op: "settle", ms: 200 },
            ]
          : []),
      ],
      requires: ["input-admitted"],
    };
  }

  const boundary = drawn(roll, ["save.request", "save.response"]);
  const result = drawn(roll, ["accepted", "accepted", "rejected", "unknown"]);
  const family = drawn(roll, SWEEP_HOST_FAMILIES);

  if (family === "generation-change") {
    return {
      schema: 1,
      id: id("generation-change"),
      fixture,
      boot,
      steps: [
        ...enter,
        { op: "input", target, value: first },
        { op: "hold", boundary },
        { op: "leave", await: false },
        ...(roll() < 0.5 ? [{ op: "input", target, value: second }] : []),
        { op: "release", boundary, result },
        { op: "settle" },
        { op: "enter" },
        { op: "input", target, value: second },
        { op: "leave" },
      ],
      requires: ["input-admitted", "save-request-sent"],
    };
  }
  return {
    schema: 1,
    id: id("late-edit"),
    fixture,
    boot,
    steps: [
      ...enter,
      { op: "input", target, value: first },
      { op: "hold", boundary },
      { op: "leave", await: false },
      { op: "input", target, value: second },
      { op: "release", boundary, result },
    ],
    requires: ["input-admitted", "save-request-sent"],
  };
}

// The draw is only a hunt if the driver would accept what it drew: a schedule the grammar
// refuses is a bug in this generator, and it is refused here rather than run as an invalid.
function sweepSchedules(seed, count, fixtures) {
  const roll = sweepStream(seed);
  const tag = `${seed < 0 ? "sn" : "s"}${Math.abs(seed)}`;
  const schedules = [];
  for (let index = 0; index < count; index++) {
    const json = sweepSchedule(roll, tag, index + 1, fixtures);
    const verdict = validateCase(json);
    if (!verdict.ok) {
      fail(`sweep: drew an invalid schedule ${json.id}: ${verdict.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
    }
    schedules.push(json);
  }
  return schedules;
}

// Work that belongs to its own process, a few processes at a time: each schedule boots its
// own page, and each shrink runs its own cases, so the pool is the only thing shared and
// results come back in the order they were drawn. A child that hangs is killed rather than
// allowed to hold a round open.
function sweepChild(args, runtime, timeoutMs = 300000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SELF, ...args], { env: childEnv(runtime) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}\n` });
    });
  });
}

async function pooled(items, limit, worker) {
  const results = new Array(items.length).fill(null);
  let next = 0;
  const run = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// The sweep: schedules from one seed, and every failing one kept. A schedule that never
// reached its preconditions is invalid, which is not a pass; a sweep where nothing reached
// them found nothing and says so with a nonzero exit. Everything that failed is written as
// the case the sweep drew and as the case `shrink` reduces it to, so a round leaves evidence
// a person can re-run from the seed alone.
async function sweep(flags) {
  const seed = Number(flags.seed);
  if (!/^-?\d+$/.test(String(flags.seed ?? "")) || !Number.isSafeInteger(seed)) {
    fail("sweep: name the seed, as --seed <integer>");
  }
  const count = Number(flags.schedules);
  if (!/^\d+$/.test(String(flags.schedules ?? "")) || !Number.isSafeInteger(count) || count < 1) {
    fail("sweep: name how many schedules to draw, as --schedules <integer>");
  }
  let fixtures = SWEEP_FIXTURES;
  if (flags.fixtures !== undefined) {
    const named = String(flags.fixtures)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const unknown = named.filter((name) => !Object.hasOwn(FIXTURES, name));
    if (!named.length || unknown.length) {
      fail(`sweep: unknown fixture ${unknown.join(", ") || "(none named)"}, as --fixtures <names>`);
    }
    fixtures = named;
  }

  const runtime = path.resolve(process.env.CLAY_COUNTEREXAMPLE_RUNTIME || ROOT);
  const tag = `${seed < 0 ? "sn" : "s"}${Math.abs(seed)}`;
  const out = typeof flags.out === "string" ? path.resolve(flags.out) : path.join(os.tmpdir(), "clay-sweep", tag);
  const casesDir = path.join(out, "cases");
  mkdirSync(casesDir, { recursive: true });

  const schedules = sweepSchedules(seed, count, fixtures);
  writeFileSync(path.join(out, "schedules.json"), `${JSON.stringify({ seed, schedules }, null, 2)}\n`);
  console.log(`sweep: seed ${seed}, ${count} schedules drawn from ${fixtures.join(", ")}`);
  console.log(`sweep: wrote ${path.join(out, "schedules.json")}`);
  console.log(`sweep: runtime ${runtime}`);

  const entries = schedules.map((json) => {
    const file = path.join(casesDir, `${json.id}.json`);
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    return { json, file };
  });

  const limit = Math.max(1, Math.min(8, os.availableParallelism?.() ?? os.cpus().length));
  const verdicts = await pooled(entries, limit, async (entry) => {
    const child = await sweepChild(["check", "--cases", CORPUS, "--case-file", entry.file, "--json"], runtime);
    return verdictOf(child.stdout);
  });

  const counts = { passed: 0, failed: 0, invalid: 0 };
  const byProperty = new Map();
  const failures = [];
  for (const [index, entry] of entries.entries()) {
    const outcome = verdicts[index];
    const status = outcome?.status ?? "invalid";
    counts[status] = (counts[status] ?? 0) + 1;
    if (status !== "failed") {
      // A schedule that passed, or never reached its preconditions, is not evidence: the
      // file would be a case that says nothing, so it leaves the output directory.
      rmSync(entry.file, { force: true });
      continue;
    }
    for (const property of propertyNames(outcome)) byProperty.set(property, (byProperty.get(property) ?? 0) + 1);
    failures.push({ ...entry, outcome });
  }

  const shrunk = await pooled(failures, limit, async (entry) => {
    const reduced = path.join(casesDir, `${entry.json.id}-reduced.json`);
    const child = await sweepChild(["shrink", "--case", entry.file, "--out", reduced], runtime);
    const lastLine = String(child.stderr ?? "").trim().split("\n").slice(-1)[0];
    return { reduced, ok: child.code === 0, detail: lastLine };
  });

  const written = failures.map((entry, index) => {
    const detail = entry.outcome.failures.map((failure) => `${failure.property}: ${failure.detail}`).join("; ") || "no property";
    console.log(`${entry.json.id.padEnd(44)} failed  ${detail}`);
    const shrunkHere = shrunk[index];
    if (!shrunkHere.ok) console.log(`sweep: ${entry.json.id}: shrink failed, keeping the schedule as drawn (${shrunkHere.detail})`);
    return shrunkHere.ok ? shrunkHere.reduced : entry.file;
  });

  const valid = counts.passed + counts.failed;
  const properties = [...byProperty]
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .map(([property, total]) => `${property} ${total}`);

  console.log("");
  console.log(`sweep: ${valid} valid, ${counts.invalid} invalid, ${counts.passed} passed, ${counts.failed} failed`);
  if (properties.length) console.log(`sweep: failed by property: ${properties.join(", ")}`);
  for (const file of written) console.log(`sweep: wrote ${file}`);
  console.log(`sweep: ${written.length} failing schedule(s) in ${casesDir}`);
  if (!valid) {
    console.log(`sweep: no schedule reached its preconditions: 0 valid of ${count}; an invalid schedule is never a pass`);
    process.exitCode = 1;
    return;
  }
  if (counts.failed) {
    console.log(`sweep: ${counts.failed} failing schedule(s) from seed ${seed}: ${failures.map((entry) => entry.json.id).join(", ")}`);
    process.exitCode = 1;
  }
}

const { command, flags } = parseArgs(process.argv.slice(2));
if (!COMMANDS.has(command)) {
  fail(
    [
      "usage: node scripts/mode-counterexamples.mjs <command>",
      "  check --cases <dir>   run every case and judge it",
      "  shrink --case <json> --out <json>   reduce a failing case to its smallest schedule",
      "  prove --case <json> --before <dir> --after <dir> [--reduced <json>] [--out <json>]",
      "  selftest --scratch <dir> [--cases <dir>]   plant six defects in scratch runtime copies and say which cases catch each",
      "  sweep --seed <integer> --schedules <integer> [--out <dir>] [--fixtures <names>]   draw fresh schedules and keep every failure",
      "  fence   not yet (a later step)",
    ].join("\n"),
    2,
  );
}
if (NOT_YET.has(command)) {
  console.error(`${command}: not yet`);
  process.exit(2);
}
if (command === "shrink") await shrink(flags);
else if (command === "prove") await prove(flags);
else if (command === "selftest") await selftest(flags);
else if (command === "sweep") await sweep(flags);
else if (flags.json) await runOne(flags);
else await check(flags);
