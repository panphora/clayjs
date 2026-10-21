// Pack @panphora/clayjs and load @panphora/clayjs/server/rooms from the tarball
// in a throwaway consumer, with no node_modules of the checkout in reach. The
// two entries are loaded in one process each, so an error thrown through one is
// checked with instanceof through the other.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUBPATH = "@panphora/clayjs/server/rooms";

const shared = `
const tag = (name, value, ephemeral = false) =>
  \`<script type="application/json" merge="\${name}" clay="live\${ephemeral ? " ephemeral" : ""}">\${JSON.stringify(value)}</script>\`;
const doc = (...parts) => \`<!doctype html><html><body>\${parts.join("")}</body></html>\`;
const ROOM = doc(tag("game", { score: 0 }), tag("lobby", { cursors: {} }, true));
const BAD = doc(tag("lobby", { cursors: {} }, true));
const GOOD = doc(tag("game", { score: 4 }), tag("lobby", { cursors: {} }, true));

function exercise(rooms, core, foreign, entry) {
  const checked = { entry, operations: 0, frames: 0, refusals: 0 };
  if (core.PersistentReservationError !== foreign.PersistentReservationError) {
    throw new Error("the import and require entries must share one error class");
  }
  const room = rooms.open("/packed.html", ROOM, { nodeId: "packed-node" });
  checked.operations += 1;
  const frame = rooms.apply(room, "client", { name: "game", n: 1, ops: [{ op: "add", path: ["score"], n: 1 }] });
  if (frame.seq !== 1) throw new Error("the packed room refused a real frame");
  checked.frames += 1;
  checked.operations += 1;
  checked.score = room.stores.get("game").value.score;

  const token = rooms.holdPersistent("/packed.html", { nodeId: "packed-node" });
  checked.operations += 1;
  checked.held = rooms.apply(room, "client", { name: "game", n: 2, ops: [{ op: "add", path: ["score"], n: 1 }] }).error;
  if (checked.held !== "checkpointing") throw new Error("a held room must refuse frames");

  let refusal = null;
  try {
    rooms.checkPersistent(token, { html: BAD });
  } catch (err) {
    refusal = err;
  }
  if (!(refusal instanceof foreign.PersistentReservationError)) {
    throw new Error("a refusal from one entry must satisfy instanceof through the other");
  }
  checked.refusals += 1;
  checked.operations += 1;
  checked.refusal = refusal.code;

  const bound = rooms.checkPersistent(token, { html: GOOD });
  checked.operations += 1;
  checked.bound = bound.html === GOOD && Object.isFrozen(bound);
  checked.written = rooms.writtenPersistent(token, { html: GOOD }).valueChanged;
  checked.operations += 1;
  checked.released = rooms.releasePersistent(token);
  checked.operations += 1;
  checked.value = room.stores.get("game").value.score;
  checked.used = rooms.used();
  if (!(checked.operations > 0 && checked.frames > 0 && checked.refusals > 0)) throw new Error("no operations ran");
  return checked;
}
`;

const esmConsumer = `import { createRequire } from "node:module";
import * as core from "${SUBPATH}";
const require = createRequire(import.meta.url);
const foreign = require("${SUBPATH}");
${shared}
process.stdout.write(JSON.stringify(exercise(core.createRooms({ now: () => 1, newEpoch: () => "packed" }), core, foreign, "esm")) + "\\n");
`;

const cjsConsumer = `const core = require("${SUBPATH}");
${shared}
import("${SUBPATH}").then((foreign) => {
  process.stdout.write(JSON.stringify(exercise(core.createRooms({ now: () => 1, newEpoch: () => "packed" }), core, foreign, "cjs")) + "\\n");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const work = mkdtempSync(join(tmpdir(), "clayjs-rooms-pack-"));
let consumer = null;
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], {
    cwd: ROOT,
    encoding: "utf8",
  }))[0];

  consumer = mkdtempSync(join(tmpdir(), "clayjs-rooms-consumer-"));
  const installed = join(consumer, "node_modules/@panphora/clayjs");
  mkdirSync(installed, { recursive: true });
  execFileSync("tar", ["-xzf", join(work, packed.filename), "-C", installed, "--strip-components", "1"]);

  writeFileSync(join(consumer, "consumer.mjs"), esmConsumer);
  writeFileSync(join(consumer, "consumer.cjs"), cjsConsumer);

  const env = { ...process.env, NODE_PATH: "" };
  const run = (file) => JSON.parse(execFileSync(process.execPath, [file], { cwd: consumer, env, encoding: "utf8" }));
  const esm = run("consumer.mjs");
  const cjs = run("consumer.cjs");

  console.log(JSON.stringify({
    tarball: packed.filename,
    tarballBytes: packed.size,
    unpackedBytes: packed.unpackedSize,
    entryCount: packed.entryCount,
    files: packed.files.map((file) => ({ path: file.path, bytes: file.size })),
  }, null, 2));
  console.log(JSON.stringify({ esm, cjs, operations: esm.operations + cjs.operations }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
  if (consumer) rmSync(consumer, { recursive: true, force: true });
}
