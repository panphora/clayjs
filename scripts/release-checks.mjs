// Runs a release suite's lanes one after another and keeps going after a failure, so one
// box run reports every failing lane instead of stopping at the first like an `&&` chain.
//
//   node scripts/release-checks.mjs --script test          lanes are package.json's "test" chain
//   node scripts/release-checks.mjs "npm test" "npm run x" lanes given directly
//
// --gate-first stops at once when the first lane fails: it is a guard, not a test.
// Each lane's output goes to stdout and to <out>/lanes/<n>-<lane>.log, and the verdicts to
// <out>/release-checks.json. <out> is --out, else $TESTBOX_OUT, else test-results/release-checks.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function chainLanes(script) {
  return script.split(" && ").map((lane) => lane.trim()).filter(Boolean);
}

export function parseArgs(argv, readPackage = () => JSON.parse(readFileSync("package.json", "utf8"))) {
  const lanes = [];
  let gateFirst = false;
  let out = process.env.TESTBOX_OUT || "test-results/release-checks";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--gate-first") gateFirst = true;
    else if (arg === "--out") out = argv[++i];
    else if (arg === "--script") {
      const name = argv[++i];
      const script = readPackage().scripts?.[name];
      if (!script) throw new Error(`package.json has no "${name}" script`);
      lanes.push(...chainLanes(script));
    } else lanes.push(arg);
  }
  if (lanes.length === 0) throw new Error("no lanes to run");
  if (lanes.some((lane) => /[|;<>`$&]/.test(lane))) throw new Error(`a lane needs a shell: ${lanes.find((l) => /[|;<>`$&]/.test(l))}`);
  return { lanes, gateFirst, out: resolve(out) };
}

function slug(lane) {
  return lane.replace(/^npm run /, "").replace(/[^A-Za-z0-9._-]+/g, "_");
}

function runLane(lane, log) {
  const [command, ...args] = lane.split(/\s+/);
  return new Promise((done) => {
    const started = Date.now();
    const file = createWriteStream(log);
    let child;
    try {
      child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      file.end(String(error));
      return done({ exit: null, error: String(error), seconds: 0 });
    }
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => { process.stdout.write(chunk); file.write(chunk); });
    }
    child.on("error", (error) => { file.end(String(error)); done({ exit: null, error: String(error), seconds: (Date.now() - started) / 1000 }); });
    child.on("close", (code, signal) => {
      file.end();
      done({ exit: code, signal, seconds: (Date.now() - started) / 1000 });
    });
  });
}

export async function runChecks({ lanes, gateFirst, out }, run = runLane) {
  mkdirSync(join(out, "lanes"), { recursive: true });
  const results = [];
  for (const [index, lane] of lanes.entries()) {
    const log = join(out, "lanes", `${String(index + 1).padStart(2, "0")}-${slug(lane)}.log`);
    console.log(`\n=== lane ${index + 1}/${lanes.length}: ${lane}`);
    const result = await run(lane, log);
    results.push({ lane, log, status: result.exit === 0 ? "passed" : "failed", ...result });
    if (gateFirst && index === 0 && result.exit !== 0) {
      for (const rest of lanes.slice(1)) results.push({ lane: rest, status: "blocked", reason: `the guard "${lane}" failed` });
      break;
    }
  }
  const failed = results.filter((r) => r.status !== "passed");
  const record = join(out, "release-checks.json");
  writeFileSync(`${record}.tmp`, JSON.stringify({ lanes: results }, null, 2) + "\n");
  renameSync(`${record}.tmp`, record);
  console.log(`\n=== ${results.length - failed.length} of ${results.length} lanes passed`);
  for (const r of failed) console.log(`  ${r.status}: ${r.lane}${r.log ? `  (${r.log})` : ""}`);
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`release-checks: ${error.message}`);
    process.exit(2);
  }
  process.exit(await runChecks(options));
}
