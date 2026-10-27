#!/usr/bin/env node
/**
 * The published-version compatibility matrix of Document 11 Step 7.
 *
 *   node scripts/verify-page-format-compat.mjs --legacy-cache .version-cache \
 *     --legacy 1.15.0,1.15.1,1.15.2 --current . --phase tolerance
 *
 * Every cohort runs in a child process of its own (tests/fixtures/page/formats/
 * worker.mjs) that imports its own copy of the runtime, and the cohorts exchange
 * serialized article HTML, canonical page values and encoded Yjs updates only.
 * No cohort can see another's ProseMirror or Yjs objects, and no old codec is
 * patched to make a pass: the published 1.15.x packages are read from the cache
 * as they were shipped.
 *
 * The rows are Step 7's matrix:
 *
 *   floor-zero       legacy and R interoperate on an ordinary floor-0 document,
 *                    both ways, and R's article, revision and page value for the
 *                    existing formats equal the published codec's bytes.
 *   floor-refusal    a legacy stale save into a floor-1 document is refused
 *                    before mutation, the stored file and the legacy tab's own
 *                    work are unchanged and readable, and the legacy runtime
 *                    refuses floor-1 content rather than dropping it.
 *   newer-preserve   R keeps the fixture newer writer's unknown marks, blocks and
 *                    attributes through a neighbouring edit, Undo, a server
 *                    checkpoint, a tagless reopen and migration.
 *   offline-reader   R's offline reader shows a readable fallback for a newer
 *                    saved file, its inert envelopes carry whole records, and
 *                    commands that would rewrite them are refused.
 *   invalid-content  an invalid update or envelope is refused, adopting nothing
 *                    and leaving the source as it stood.
 *
 * The command fails when a listed package is unavailable or its recorded digest
 * does not match, when the version list is empty, when a cohort reports no
 * positive or no negative case, and on any failed cell. It never edits the cache.
 *
 * `--phase features` belongs to Step 9: it runs R and F against each other from
 * `--tolerance-lock`, the published R artifact's own tarball and digest. That
 * artifact cannot exist before R is published, so asking for it here fails
 * instead of passing a gate it never ran.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURES = path.join(ROOT, "tests/fixtures/page/formats");
const WORKER = path.join(FIXTURES, "worker.mjs");
const LOCK = path.join(FIXTURES, "legacy-lock.json");
const ROWS = ["floor-zero", "floor-refusal", "newer-preserve", "offline-reader", "invalid-content"];

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    if (argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = argv[++index];
  }
  return flags;
}

function fail(message, code = 1) {
  console.error(`page-format-compat: ${message}`);
  process.exit(code);
}

const flags = parseArgs(process.argv.slice(2));
const phase = flags.phase ?? "tolerance";
if (phase !== "tolerance" && phase !== "features") fail(`unknown --phase ${JSON.stringify(phase)}`, 2);
const cache = path.resolve(ROOT, flags["legacy-cache"] ?? ".version-cache");
const currentRoot = path.resolve(ROOT, flags.current ?? ".");
const versions = String(flags.legacy ?? "").split(",").map((value) => value.trim()).filter(Boolean);
if (!versions.length) fail("--legacy needs a nonempty, comma-separated list of published versions", 2);
if (phase === "features") {
  fail("--phase features is Document 11 Step 9's R/F matrix and needs the published R artifact in --tolerance-lock; it is not implemented before R exists", 2);
}

const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const fixture = JSON.parse(readFileSync(path.join(FIXTURES, "floor-zero.json"), "utf8"));

// The extracted cache tree, read in a fixed order so the digest is the same on
// every machine: a path, its size, and its bytes.
function extractedDigest(dir) {
  const hash = createHash("sha512");
  let files = 0;
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        hash.update(`d:${path.relative(dir, full)}\n`);
        walk(full);
        continue;
      }
      files += 1;
      hash.update(`f:${path.relative(dir, full)}:${stat.size}\n`);
      hash.update(readFileSync(full));
    }
  };
  walk(dir);
  return { files, sha512: hash.digest("hex") };
}

function tarballIn(dir, version) {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter((name) => name.endsWith(".tgz") && name.includes(version));
  return names.length ? path.join(dir, names[0]) : null;
}

// A listed package is available only when the cache holds that exact published
// version and it still matches what the lock recorded. A missing version, a
// different version or an edited tree fails the whole run.
const display = (target) => {
  const relative = path.relative(ROOT, target);
  return relative && !relative.startsWith("..") ? relative : target;
};

function verifyPackage(version) {
  const dir = path.join(cache, version);
  if (!existsSync(dir)) fail(`@panphora/clayjs@${version} is unavailable: ${display(dir)} does not exist`);
  const recorded = lock.packages[version];
  if (!recorded) fail(`@panphora/clayjs@${version} has no recorded digest in ${display(LOCK)}; record it before listing the version`, 2);
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  if (pkg.name !== lock.package || pkg.version !== version) {
    fail(`@panphora/clayjs@${version} is unavailable: ${display(dir)} holds ${pkg.name}@${pkg.version}`);
  }
  const extracted = extractedDigest(dir);
  if (extracted.sha512 !== recorded.extracted.sha512) {
    fail(`@panphora/clayjs@${version} does not match its lock: ${display(dir)} digests to ${extracted.sha512}, recorded ${recorded.extracted.sha512}`);
  }
  const tarball = tarballIn(cache, version);
  let basis = "extracted tree";
  if (tarball) {
    const sha512 = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
    if (sha512 !== recorded.integrity) fail(`@panphora/clayjs@${version} tarball digest ${sha512} does not match ${recorded.integrity}`);
    basis = "tarball and extracted tree";
  }
  return { version, dir, integrity: recorded.integrity, extracted, basis };
}

const packages = versions.map(verifyPackage);
if (new Set(versions).size !== versions.length) fail("--legacy lists the same version twice", 2);

// One child, one cohort, one job. The answer is one JSON line; the run fails when
// the child cannot be started, exits nonzero, or says a case failed.
function child(cohort, root, scenario, input, kind = "package") {
  const run = spawnSync(process.execPath, [WORKER, "--root", root, "--kind", kind], {
    cwd: ROOT,
    input: JSON.stringify({ scenario, input }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  if (run.error) fail(`${cohort} ${scenario}: the child did not run: ${run.error.message}`);
  if (run.status !== 0) fail(`${cohort} ${scenario}: the child exited ${run.status}\n${run.stderr}`);
  const line = run.stdout.split("\n").filter(Boolean).pop();
  let answer;
  try {
    answer = JSON.parse(line);
  } catch {
    fail(`${cohort} ${scenario}: the child printed no answer\n${run.stderr}`);
  }
  const tally = cohorts.get(cohort);
  for (const entry of answer.cases) {
    if (entry.kind === "positive") tally.positive += 1;
    else tally.negative += 1;
    if (!entry.ok) tally.failed.push({ scenario, ...entry });
  }
  return answer;
}

const cohorts = new Map();
const record = (cohort) => {
  if (!cohorts.has(cohort)) cohorts.set(cohort, { positive: 0, negative: 0, failed: [] });
  return cohort;
};
const cells = [];
function cell(row, cohort, name, run) {
  try {
    const detail = run();
    cells.push({ row, cohort, name, ok: true, detail: detail ?? null });
  } catch (error) {
    cells.push({ row, cohort, name, ok: false, detail: `${error?.name ?? "Error"}: ${error?.message ?? error}` });
  }
}
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canon = (value) =>
  Array.isArray(value) ? `[${value.map(canon).join(",")}]`
    : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canon(value[key])).join(",")}}`
      : JSON.stringify(value ?? null);
const textOf = (html) => html.replace(/<[^>]*>/g, "");

const current = record("R");
const newerBlocks = JSON.parse(readFileSync(path.join(FIXTURES, "newer-format.json"), "utf8"));

// Row 1: an ordinary floor-0 document, both ways, against the published codec.
function floorZero(version) {
  const cohort = record(version);
  const legacyRoot = packages.find((entry) => entry.version === version).dir;
  const legacy = child(cohort, legacyRoot, "write", { blocks: fixture.blocks, malformed: fixture.malformed });
  const r = child(current, currentRoot, "write", { blocks: fixture.blocks, malformed: fixture.malformed });

  cell("floor-zero", cohort, "R's article for the existing formats equals the published codec's bytes", () => {
    must(legacy.output.articleHtml === r.output.articleHtml,
      `the articles differ:\n  legacy ${legacy.output.articleHtml}\n  R      ${r.output.articleHtml}`);
    return r.output.articleHtml;
  });
  cell("floor-zero", cohort, "R's revision for the existing formats equals the published codec's", () => {
    must(legacy.output.rev === r.output.rev, `revisions differ: legacy ${legacy.output.rev}, R ${r.output.rev}`);
    return r.output.rev;
  });
  cell("floor-zero", cohort, "R's page value for the existing formats equals the published codec's", () => {
    must(canon(legacy.output.value) === canon(r.output.value), "the page values differ");
    return canon(r.output.value);
  });
  cell("floor-zero", cohort, "R reads the legacy writer's article and Yjs updates", () => {
    const read = child(current, currentRoot, "read", {
      articleHtml: legacy.output.articleHtml,
      rev: legacy.output.rev,
      expected: r.output.parsed,
      updates: legacy.output.updates,
      expectedBlocks: legacy.output.decoded,
    });
    must(canon(read.output.model) === canon(r.output.parsed), "R read a different model from the legacy article");
    must(canon(read.output.blocks) === canon(legacy.output.decoded), "R decoded different blocks from the legacy updates");
    return `${read.output.model.length} items`;
  });
  cell("floor-zero", cohort, "the legacy writer reads R's article and Yjs updates", () => {
    const read = child(cohort, legacyRoot, "read", {
      articleHtml: r.output.articleHtml,
      rev: r.output.rev,
      expected: legacy.output.parsed,
      updates: r.output.updates,
      expectedBlocks: r.output.decoded,
    });
    must(canon(read.output.model) === canon(legacy.output.parsed), "the legacy writer read a different model from R's article");
    must(canon(read.output.blocks) === canon(r.output.decoded), "the legacy writer decoded different blocks from R's updates");
    return `${read.output.model.length} items`;
  });
}

// Row 2: a legacy stale save into a floor-1 document is refused before mutation,
// and the legacy runtime refuses the floor-1 content instead of dropping it.
function floorRefusal(version) {
  const cohort = record(version);
  const legacyRoot = packages.find((entry) => entry.version === version).dir;
  const stored = child(current, currentRoot, "write", { blocks: newerBlocks.blocks, floor: 1, malformed: null });
  const legacyBefore = child(cohort, legacyRoot, "write", { blocks: fixture.blocks, malformed: fixture.malformed });
  const legacyAfter = child(cohort, legacyRoot, "write", { blocks: fixture.blocks, malformed: fixture.malformed });
  const visible = [newerBlocks.blocks.a.c, newerBlocks.blocks.t.c, newerBlocks.blocks.z.c];

  const admitted = child(current, currentRoot, "admit", {
    currentHtml: stored.output.fileHtml,
    html: legacyBefore.output.fileHtml,
    legacyHtml: legacyBefore.output.fileHtml,
    floorZeroHtml: legacyBefore.output.fileHtml,
    capability: 0,
    admitted: [0],
    visible,
  });
  cell("floor-refusal", cohort, "the host refuses the legacy stale save before mutation", () => {
    const refusal = admitted.output.refusal;
    must(refusal, "the legacy capture was admitted into a floor-1 document");
    must(refusal.code === "page-format-upgrade-required", `the refusal is ${JSON.stringify(refusal.code)}`);
    must(refusal.statusCode === 409, `the refusal status is ${JSON.stringify(refusal.statusCode)}`);
    must(refusal.minimum === 1, `the refusal minimum is ${JSON.stringify(refusal.minimum)}`);
    return `${refusal.code} (${refusal.statusCode}, floor ${refusal.minimum})`;
  });
  cell("floor-refusal", cohort, "the stored floor-1 file is unchanged and still reads", () => {
    must(admitted.output.floors.current === 1, "the stored file was not at floor 1");
    must(admitted.output.floors.capture === 0, "the legacy capture gained a marker");
    must(admitted.output.currentHtml === stored.output.fileHtml, "the stored file changed while the legacy save was refused");
    const read = child(current, currentRoot, "read", { articleHtml: stored.output.articleHtml, rev: stored.output.rev, expected: stored.output.parsed });
    must(canon(read.output.model) === canon(stored.output.parsed), "the stored file no longer reads back");
    return "floor 1, no marker on the capture";
  });
  cell("floor-refusal", cohort, "the legacy tab's unsaved work is intact and still its own", () => {
    must(legacyBefore.output.fileHtml === legacyAfter.output.fileHtml, "the legacy tab's capture changed while it was refused");
    const read = child(cohort, legacyRoot, "read", { articleHtml: legacyAfter.output.articleHtml, rev: legacyAfter.output.rev, expected: legacyAfter.output.parsed });
    must(canon(read.output.model) === canon(legacyAfter.output.parsed), "the legacy tab can no longer read its own unsaved work");
    return `${read.output.model.length} items`;
  });
  cell("floor-refusal", cohort, "the stored file still renders readable HTML", () => {
    const readable = admitted.output.readable ?? "";
    const text = textOf(readable);
    for (const wanted of visible) must(text.includes(wanted), `the readable article no longer shows ${JSON.stringify(wanted)}`);
    return visible.join(" | ");
  });
  cell("floor-refusal", cohort, "the legacy runtime refuses floor-1 content instead of dropping it", () => {
    const read = child(cohort, legacyRoot, "read-newer", {
      blocks: newerBlocks.blocks,
      articleHtml: stored.output.articleHtml,
      rev: stored.output.rev,
      updates: stored.output.updates,
      keeps: null,
    });
    must(read.ok === true, "the legacy writer neither refused nor kept the floor-1 content");
    return "refused";
  });
}

// Rows 3 to 5 need the fixture newer writer's floor-1 document.
function newerContent() {
  const newer = child(record("fixture newer writer"), currentRoot, "newer-save", {}, "newer");
  return newer.output;
}

function newerPreserve(newer) {
  const preserved = child(current, currentRoot, "preserve", {
    blocks: newer.blocks,
    articleHtml: newer.articleHtml,
    rev: newer.rev,
    keeps: newer.keeps,
    neighbour: { id: newer.neighbour.id, add: newer.neighbour.add },
  });
  for (const stage of ["reopened", "migrated", "edited", "undone", "checkpoint"]) {
    cell("newer-preserve", current, `R keeps the newer writer's records through ${stage}`, () => {
      const blocks = preserved.output.stages[stage];
      must(blocks, `the ${stage} stage did not run`);
      for (const id of newer.keeps) must(blocks[id], `the block ${id} is missing after ${stage}`);
      return newer.keeps.join(",");
    });
  }
  cell("newer-preserve", current, "a neighbouring edit landed and Undo restored it", () => {
    const edited = preserved.output.stages.edited[newer.neighbour.id].c;
    const undone = preserved.output.stages.undone[newer.neighbour.id].c;
    must(edited === newer.blocks[newer.neighbour.id].c + newer.neighbour.add, `the edit produced ${JSON.stringify(edited)}`);
    must(undone === newer.blocks[newer.neighbour.id].c, `Undo produced ${JSON.stringify(undone)}`);
    return `${JSON.stringify(edited)} then ${JSON.stringify(undone)}`;
  });
  cell("newer-preserve", current, "the newer writer still reads its own records in R's checkpointed file", () => {
    const verify = child(record("fixture newer writer"), currentRoot, "newer-verify", { fileHtml: preserved.output.checkpointHtml }, "newer");
    must(verify.output.neighbour, "the newer writer cannot see the neighbour edit");
    for (const id of newer.keeps) must(verify.output.records[id], `the newer writer cannot find its record ${id}`);
    return `${newer.keeps.join(",")} + ${JSON.stringify(verify.output.neighbour)}`;
  });
}

function offlineReader(newer) {
  const offline = child(current, currentRoot, "offline", { fileHtml: newer.fileHtml, blocks: newer.blocks });
  cell("offline-reader", current, "a newer saved file reads with a readable fallback", () => {
    must(offline.output.fallback, "the reader has no fallback for the block it cannot draw");
    return offline.output.fallback;
  });
  cell("offline-reader", current, "the inert envelope carries the whole record", () => {
    const record = offline.output.envelopes.toc;
    must(record && record.t === "toc" && record.maxLevel === 3, "the envelope lost the record");
    return canon(record);
  });
  cell("offline-reader", current, "commands that would rewrite the block are refused", () => {
    must(offline.output.refused.includes("t"), "the opaque block was not refused a rewrite");
    return offline.output.refused.join(",");
  });
}

function invalidContent(newer) {
  const invalid = child(current, currentRoot, "invalid", { fileHtml: newer.fileHtml, updates: newer.updates });
  cell("invalid-content", current, "an invalid update or envelope is refused explicitly", () => {
    const kinds = invalid.output.refusals.map((entry) => entry.input);
    for (const wanted of ["update", "value", "envelope"]) must(kinds.includes(wanted), `no refusal was reported for ${wanted}`);
    return invalid.output.refusals.map((entry) => `${entry.input}:${entry.code ?? entry.name}`).join(", ");
  });
  cell("invalid-content", current, "a refusal adopts nothing and leaves the source as it stood", () => {
    must(invalid.output.unchangedBytes === true, "the refused update changed the document's bytes");
    must(canon(invalid.output.before) === canon(invalid.output.after), "the refused update changed the decoded document");
    must(invalid.output.source === invalid.output.sourceAfter, "the source file changed");
    return `${Object.keys(invalid.output.before).length} blocks unchanged`;
  });
}

const started = Date.now();
console.log(`page-format-compat: phase ${phase}`);
console.log(`  cache   ${display(cache)}`);
console.log(`  current ${display(currentRoot)}`);
for (const entry of packages) {
  console.log(`  cohort  @panphora/clayjs@${entry.version}  ${entry.integrity}`);
  console.log(`          ${display(entry.dir)}  ${entry.extracted.files} files, extracted sha512 ${entry.extracted.sha512}  (verified against the ${entry.basis})`);
}

try {
  for (const version of versions) floorZero(version);
  for (const version of versions) floorRefusal(version);
  const newer = newerContent();
  newerPreserve(newer);
  offlineReader(newer);
  invalidContent(newer);
} catch (error) {
  fail(`${error?.message ?? error}`);
}

// Every cohort has to have exercised both sides of its contract: a scenario that
// quietly did nothing cannot pass, and neither can one whose negative case was
// accepted.
for (const [cohort, tally] of cohorts) {
  if (!tally.positive || !tally.negative) {
    cells.push({ row: "cohort", cohort, name: "the cohort ran positive and negative cases", ok: false, detail: `${tally.positive} positive, ${tally.negative} negative` });
  }
  for (const failure of tally.failed) cells.push({ row: "case", cohort, name: failure.name, ok: false, detail: failure.detail });
}

for (const row of ROWS) {
  const inRow = cells.filter((entry) => entry.row === row);
  const failed = inRow.filter((entry) => !entry.ok);
  console.log(`row ${row}: ${inRow.length - failed.length}/${inRow.length} cells${failed.length ? " FAILED" : ""}`);
  for (const entry of failed) console.log(`  FAIL ${entry.cohort} ${entry.name}\n       ${entry.detail}`);
}
for (const entry of cells.filter((item) => !item.ok && !ROWS.includes(item.row))) {
  console.log(`CASE ${entry.cohort} ${entry.name}\n     ${entry.detail}`);
}
for (const [cohort, tally] of cohorts) {
  console.log(`cohort ${cohort}: ${tally.positive} positive, ${tally.negative} negative, ${tally.failed.length} failed`);
}

const failed = cells.filter((entry) => !entry.ok);
const summary = {
  phase,
  ok: failed.length === 0,
  packages: packages.map(({ version, integrity, extracted, basis }) => ({ version, integrity, extracted, basis })),
  cohorts: [...cohorts].map(([cohort, tally]) => ({ cohort, positive: tally.positive, negative: tally.negative, failed: tally.failed.length })),
  rows: ROWS.map((row) => ({ row, cells: cells.filter((entry) => entry.row === row).length, failed: cells.filter((entry) => entry.row === row && !entry.ok).length })),
  cells: cells.length,
  failed,
  ms: Date.now() - started,
};
if (flags.json) console.log(`PAGE_FORMAT_COMPAT_JSON ${JSON.stringify(summary)}`);

if (failed.length) {
  console.error(`page-format-compat: ${failed.length} cell(s) failed`);
  process.exit(1);
}
console.log(`page-format-compat: ${cohorts.size} cohorts, ${ROWS.length} rows, ${cells.length} cells, ${summary.cohorts.reduce((sum, entry) => sum + entry.positive, 0)} positive and ${summary.cohorts.reduce((sum, entry) => sum + entry.negative, 0)} negative cases — ok`);
