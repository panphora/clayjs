import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chainLanes, parseArgs, runChecks } from "./release-checks.mjs";

const out = () => mkdtempSync(join(tmpdir(), "release-checks-"));

function fake(exits) {
  const ran = [];
  return { ran, run: async (lane) => { ran.push(lane); return { exit: exits[lane] ?? 0, seconds: 0 }; } };
}

test("a failing lane does not stop the lanes after it", async () => {
  const dir = out();
  const { ran, run } = fake({ "npm run first": 1, "npm run last": 1 });
  const lanes = ["npm run first", "npm run middle", "npm run last"];
  const code = await runChecks({ lanes, gateFirst: false, out: dir }, run);
  assert.equal(code, 1);
  assert.deepEqual(ran, lanes);
  const record = JSON.parse(readFileSync(join(dir, "release-checks.json"), "utf8"));
  assert.deepEqual(record.lanes.map((l) => [l.lane, l.status]),
    [["npm run first", "failed"], ["npm run middle", "passed"], ["npm run last", "failed"]]);
});

test("a failed guard blocks the rest", async () => {
  const dir = out();
  const { ran, run } = fake({ "node scripts/test-guard.mjs": 2 });
  const code = await runChecks({ lanes: ["node scripts/test-guard.mjs", "npm run a"], gateFirst: true, out: dir }, run);
  assert.equal(code, 1);
  assert.deepEqual(ran, ["node scripts/test-guard.mjs"]);
  const record = JSON.parse(readFileSync(join(dir, "release-checks.json"), "utf8"));
  assert.equal(record.lanes[1].status, "blocked");
});

test("all green exits 0", async () => {
  assert.equal(await runChecks({ lanes: ["npm run a"], gateFirst: false, out: out() }, fake({}).run), 0);
});

test("the real lane runner records a real exit code and log", async () => {
  const dir = out();
  const lanes = [`${process.execPath} -e process.exit(3)`, `${process.execPath} --version`];
  assert.equal(await runChecks({ lanes, gateFirst: false, out: dir }), 1);
  const record = JSON.parse(readFileSync(join(dir, "release-checks.json"), "utf8"));
  assert.deepEqual(record.lanes.map((l) => l.exit), [3, 0]);
  assert.match(readFileSync(record.lanes[1].log, "utf8"), /^v\d+/);
});

test("--script expands the package.json chain, and lanes needing a shell are refused", () => {
  const pkg = () => ({ scripts: { test: "node g.mjs && npm run a && npm run b" } });
  assert.deepEqual(parseArgs(["--script", "test", "--gate-first", "--out", "/x"], pkg),
    { lanes: ["node g.mjs", "npm run a", "npm run b"], gateFirst: true, out: "/x" });
  assert.throws(() => parseArgs(["npm test | tee x"], pkg), /needs a shell/);
  assert.throws(() => parseArgs(["--script", "nope"], pkg), /no "nope" script/);
  assert.deepEqual(chainLanes("a &&  b"), ["a", "b"]);
});
