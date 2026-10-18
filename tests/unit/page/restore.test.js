/**
 * @jest-environment node
 */
// Restore against a running room, on the real hyperclay room code
// (server-lib/live-data-rooms.js, read-only import). Proves three things: the
// bug exists today (restoring the version file as written is undone by the
// replay); S1's fix (strip live-at from the restored file, or reset the room)
// keeps the restored content; and the last-second edit that no file holds
// survives the unstamped restore.
//
// Stand-in: the test calls rooms.fileWritten and rooms.reset directly, standing
// in for hyperclay's restoreDocumentVersion, which is where the fix will live.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HYPERCLAY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../hyperclay/server-lib");
const present = existsSync(path.join(HYPERCLAY, "live-data-rooms.js"));
if (!present) console.log("restore.test.js: skipped, the sibling hyperclay checkout is not here");
const suite = present ? describe : describe.skip;

let createRooms, serializeLive, stampOf;
beforeAll(async () => {
  if (!present) return;
  ({ createRooms } = await import(pathToFileURL(path.join(HYPERCLAY, "live-data-rooms.js")).href));
  ({ serializeLive, stampOf } = await import(pathToFileURL(path.join(HYPERCLAY, "live-data-ops.js")).href));
});

const KEY = "u:doc.html";
const fileOf = (value, stamp) => `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live"${stamp ? ` live-at="${stamp}"` : ""}>${serializeLive(value)}</script></head><body></body></html>`;
const text = (room) => Object.fromEntries(Object.entries(room.stores.get("page").value.blocks).map(([id, b]) => [id, b.c]));

function scenario(name, restoreHow) {
  let n = 0;
  const rooms = createRooms({ newEpoch: () => "E1" });
  const v0 = { blocks: { a: { t: "paragraph", pos: "1", c: "draft" }, b: { t: "paragraph", pos: "2", c: "keep" } }, deleted: {} };
  const room = rooms.open(KEY, fileOf(v0, null));
  const edit = (id, c) => rooms.apply(room, "tab1", { name: "page", n: ++n, ops: [{ op: "set", path: ["blocks", id, "c"], value: c }] });
  edit("a", "version one");                       // seq 1
  // The writer checkpoints: this file is the version the person later restores.
  const v1 = JSON.parse(JSON.stringify(room.stores.get("page").value));
  const v1File = fileOf(v1, stampOf(room.epoch, room.seq, serializeLive(v1)));
  rooms.fileWritten(KEY, v1File);
  edit("a", "version two, regretted");            // seq 3
  edit("b", "keep, edited later");                // seq 4
  const v2 = JSON.parse(JSON.stringify(room.stores.get("page").value));
  rooms.fileWritten(KEY, fileOf(v2, stampOf(room.epoch, room.seq, serializeLive(v2))));
  edit("b", "typed in the last second");          // seq 6: not in any file yet
  const before = text(room);
  restoreHow(rooms, room, v1File);
  const after = text(rooms.get(KEY) ?? room);
  console.log(`${name}\n  before restore: ${JSON.stringify(before)}\n  after restore:  ${JSON.stringify(after)}`);
  return after;
}

suite("restore against a running room", () => {
  test("today: restoring the version file as written is undone by the replay", () => {
    // Flips when S1's fix (strip live-at in restoreDocumentVersion) lands; then change this to expect the restored text.
    const asIs = scenario("1. restore as today (the version's own live-at stamp)", (rooms, room, file) => rooms.fileWritten(KEY, file));
    expect(asIs.a).not.toBe("version one");
  });

  test("with live-at removed, the restored text is kept and the last-second edit survives", () => {
    const unstamped = scenario("2. restore with live-at removed", (rooms, room, file) => rooms.fileWritten(KEY, file.replace(/ live-at="[^"]*"/, "")));
    expect(unstamped.a).toBe("version one");
    expect(unstamped.b).toBe("typed in the last second");
  });

  test("after rooms.reset, the restored text is kept", () => {
    const reset = scenario("3. restore then rooms.reset", (rooms, room, file) => rooms.reset(KEY, file));
    expect(reset.a).toBe("version one");
  });
});
