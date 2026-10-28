/**
 * @jest-environment jsdom
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { runCase } from "../mode-counterexamples/driver.mjs";
import { judge } from "../mode-counterexamples/oracle.mjs";

/**
 * The fence around the permanent corpus.
 *
 * `tests/mode-counterexamples/fence.json` names every permanent case and the canonical
 * template fixtures beside this repo. This file refuses a manifest that lost an entry, an
 * entry whose target is gone, a run that says nothing, and a status that disagrees with what
 * the case actually does, so the corpus cannot shrink without a person editing the manifest
 * and the run saying so.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST = path.join(ROOT, "tests/mode-counterexamples/fence.json");
const CORPUS = path.join(ROOT, "tests/mode-counterexamples/cases");

const STATUSES = new Set(["pass", "known-failing"]);

// A case file is a target by its path from the repository root, with forward slashes, in the
// order a reader sorts them. A case may live in a subfolder of the corpus, and a walk that
// stopped at the top level would never list it.
function caseFiles(corpus, root = ROOT) {
  return readdirSync(corpus, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(corpus, entry.name);
      if (entry.isDirectory()) return caseFiles(file, root);
      return entry.name.endsWith(".json") ? [path.relative(root, file).split(path.sep).join("/")] : [];
    })
    .sort();
}

function loadCase(root, entry) {
  return JSON.parse(readFileSync(path.join(root, entry.path), "utf8"));
}

// A known failing case names what it is known for, the same token the corpus test reads.
function knownToken(json) {
  return json.knownFailing.split(":")[0].trim();
}

const isEmpty = (run) =>
  !run ||
  typeof run !== "object" ||
  typeof run.status !== "string" ||
  !Array.isArray(run.trace) ||
  run.trace.length === 0 ||
  run.result === undefined ||
  run.result === null;

/**
 * Check one manifest: every entry exists, every case on disk is entered, and every runnable
 * entry produces a result that agrees with the status it is filed under.
 *
 * @returns {Promise<string[]>} one line per case, for the log
 */
async function checkFence(manifest, { root = ROOT, corpus = CORPUS, run = runCase } = {}) {
  const problems = [];
  const refuse = () => {
    throw new Error(`mode-fence:\n${problems.join("\n")}`);
  };

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    problems.push("the manifest is not an object");
    refuse();
  }
  if (manifest.version !== 1) problems.push(`the manifest's version is ${manifest.version}, not 1`);

  const entries = Array.isArray(manifest.cases) ? manifest.cases : null;
  if (!entries) problems.push("the manifest has no cases list");
  else if (!entries.length) problems.push("the manifest lists no cases");
  if (!Array.isArray(manifest.templates)) problems.push("the manifest has no templates list");
  else if (!manifest.templates.length) problems.push("the manifest lists no templates");

  const listed = new Set();
  const loaded = [];
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.path !== "string" || !entry.path) {
      problems.push(`an entry has no path: ${JSON.stringify(entry)}`);
      continue;
    }
    if (listed.has(entry.path)) problems.push(`${entry.path}: listed twice`);
    listed.add(entry.path);
    if (!STATUSES.has(entry.status)) problems.push(`${entry.path}: status ${JSON.stringify(entry.status)} is not pass or known-failing`);
    if (entry.runner !== undefined && entry.runner !== "cli") problems.push(`${entry.path}: runner ${JSON.stringify(entry.runner)} is not cli`);
    const file = path.join(root, entry.path);
    if (!existsSync(file)) {
      problems.push(`${entry.path}: the case file does not exist`);
      continue;
    }
    const json = loadCase(root, entry);
    // The corpus command files a case known failing when the case says so; an entry that
    // disagrees would hide a regression behind a stale status or bury a known failure.
    const expected = json.knownFailing ? "known-failing" : "pass";
    if (entry.status !== expected) problems.push(`${entry.path}: the manifest says ${entry.status}, the case says ${expected}`);
    loaded.push({ entry, json });
  }

  for (const file of caseFiles(corpus, root)) {
    if (!listed.has(file)) problems.push(`${file}: on disk but not listed in the manifest`);
  }

  if (problems.length) refuse();

  const runs = new Map();
  for (const { entry, json } of loaded) {
    if (entry.runner === "cli") continue;
    runs.set(json.id, await run(json));
  }

  const lines = [];
  for (const { entry, json } of loaded) {
    if (entry.runner === "cli") {
      lines.push(`${entry.path}: ${entry.status} (checked through the corpus command)`);
      continue;
    }
    const outcome = runs.get(json.id);
    if (isEmpty(outcome)) {
      problems.push(`${entry.path}: the run produced no result`);
      continue;
    }
    const control = json.control && runs.has(json.control) ? { case: loaded.find((item) => item.json.id === json.control)?.json, run: runs.get(json.control) } : null;
    const verdict = judge({ case: json, run: outcome, control });
    lines.push(`${entry.path}: ${verdict.status}${entry.status === "known-failing" ? " (known)" : ""}`);
    if (entry.status === "pass") {
      if (verdict.status !== "passed") problems.push(`${entry.path}: the manifest says pass, the run says ${verdict.status}`);
      for (const failure of verdict.failures) problems.push(`${entry.path}: ${failure.property}: ${failure.detail}`);
      continue;
    }
    const token = knownToken(json);
    if (token === "invalid") {
      if (verdict.status !== "invalid") problems.push(`${entry.path}: the manifest says known failing invalid, the run says ${verdict.status}`);
      if (!outcome.result?.errors?.length) problems.push(`${entry.path}: the run stopped with no reason`);
      continue;
    }
    const properties = verdict.failures.map((failure) => failure.property);
    if (verdict.status !== "failed" || !properties.includes(token)) {
      problems.push(`${entry.path}: the manifest says known failing ${token}, the run says ${verdict.status} ${JSON.stringify(properties)}`);
    }
  }

  if (problems.length) refuse();
  return lines;
}

// The templates live in the starter-templates checkout, which a box that receives this repo
// alone does not carry. STARTER_TEMPLATES names a checkout elsewhere, the way
// tests/unit/build/offline-journal.test.js resolves it; beside this repo is the default.
function templateRoot(manifest) {
  const dirs = [
    process.env.STARTER_TEMPLATES,
    path.join(ROOT, "../starter-templates"),
    path.join(os.homedir(), "Documents/GitHub/hyper/starter-templates"),
  ].filter(Boolean).filter((dir) => existsSync(dir));
  if (!dirs.length) return null;
  // A checkout that is here but does not carry every template is a failure, not a skip: the
  // first one that carries them all is read, and the first one that exists is read when none
  // does, so the test names every template path that is missing.
  return dirs.find((dir) => manifest.templates.every((template) => existsSync(path.join(dir, template.path)))) ?? dirs[0];
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const templates = templateRoot(manifest);

test("the manifest names every case on disk, and every run produces a result that matches its status", async () => {
  const lines = await checkFence(manifest);
  console.log(lines.join("\n"));
  expect(lines.length).toBe(manifest.cases.length);
}, 120000);

test("an empty manifest is refused", async () => {
  await expect(checkFence({ version: 1, cases: [], templates: [] })).rejects.toThrow(/lists no cases/);
});

test("a manifest naming a case file that is not there is refused", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mode-fence-"));
  try {
    const corpus = path.join(root, "tests/mode-counterexamples/cases");
    const present = path.join(corpus, "present.json");
    mkdirSync(corpus, { recursive: true });
    writeFileSync(present, readFileSync(path.join(CORPUS, "cycles-one-write.json")));
    const missing = "tests/mode-counterexamples/cases/missing.json";
    await expect(
      checkFence({ version: 1, cases: [{ path: missing, status: "pass" }], templates: [] }, { root, corpus, run: async () => ({ status: "passed", trace: [{}], result: {} }) }),
    ).rejects.toThrow(/the case file does not exist/);
    expect(caseFiles(corpus, root)).toEqual(["tests/mode-counterexamples/cases/present.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a case on disk that the manifest does not list is refused", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mode-fence-"));
  try {
    const corpus = path.join(root, "tests/mode-counterexamples/cases");
    mkdirSync(corpus, { recursive: true });
    const bytes = readFileSync(path.join(CORPUS, "cycles-one-write.json"));
    writeFileSync(path.join(corpus, "listed.json"), bytes);
    writeFileSync(path.join(corpus, "unlisted.json"), bytes);
    await expect(
      checkFence(
        { version: 1, cases: [{ path: "tests/mode-counterexamples/cases/listed.json", status: "pass" }], templates: [] },
        { root, corpus, run: async () => ({ status: "passed", trace: [{}], result: {} }) },
      ),
    ).rejects.toThrow(/unlisted\.json: on disk but not listed in the manifest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a case whose run produces no result is refused", async () => {
  await expect(checkFence(manifest, { run: async () => null })).rejects.toThrow(/produced no result/);
});

// The canonical templates stay where they are written; the manifest names them, it does not
// copy them. Only a box with no starter-templates checkout at all skips this test; a checkout
// that is present and missing a template fails it, naming each path that is not there.
if (templates === null) {
  console.info("mode-fence: no starter-templates checkout is here; skipping the template check");
}

(templates === null ? test.skip : test)("every canonical template fixture the manifest names is in the starter-templates checkout", () => {
  const lines = [];
  const missing = [];
  for (const template of manifest.templates) {
    if (template.repo !== "starter-templates" || !existsSync(path.join(templates, template.path))) {
      missing.push(`${template.repo} ${template.path}`);
    }
    lines.push(`${template.repo} ${template.path}`);
  }
  console.log(lines.join("\n"));
  expect({ checkout: templates, missing }).toEqual({ checkout: templates, missing: [] });
});
