import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Every clayjs URL carries a version prefix. The unversioned ones were retired at 1.0
// and 404, so a page still asking for one is a page that silently does not boot.
//
// The list of entry names is READ FROM DISK, never written here. Both misses this test
// exists to catch came from a hand-written pattern that guessed the names: a sweep for
// `clay*.js` and `sap.js` did not match `all.js`, so the homepage and a fixture kept
// loading a 404 while a green suite said the migration was complete.

const ROOT = new URL("../..", import.meta.url).pathname;
const ENTRIES = readdirSync(join(ROOT, "entries"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.slice(0, -3));

const SEARCHED = ["website", "examples", "docs", "tests/fixtures", "conformance/fixtures"];
const READABLE = new Set([".html", ".htm", ".md", ".js", ".json", ".txt"]);
// The one path segment immediately before the filename must be a version prefix.
const VERSIONED = /^(v\d+|\d+\.\d+\.\d+|entries)$/;

function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === "tmp" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (READABLE.has(extname(abs))) out.push(abs);
  }
  return out;
}

test("no file references an entry script without a version prefix", () => {
  const names = ENTRIES.map((n) => n.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|");
  // Capture the single path segment before the filename and judge that, rather than
  // trying to describe every legal URL shape. A bare "clay.js" in prose has no slash
  // and never matches.
  const pattern = new RegExp(`([^/\\s"'<>()\`]*)/(?:${names})\\.js\\b`, "g");
  const offenders = [];

  for (const file of SEARCHED.flatMap((d) => walk(join(ROOT, d)))) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(pattern)) {
        if (VERSIONED.test(m[1])) continue;
        // Prose naming a retired URL in order to say it is retired is the point.
        if (/retired|404|no unversioned|was removed/i.test(line)) continue;
        offenders.push(`${file.slice(ROOT.length)}:${i + 1}: ${line.trim().slice(0, 110)}`);
      }
    });
  }

  expect(offenders).toEqual([]);
});
