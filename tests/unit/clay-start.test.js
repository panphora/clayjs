import { readFileSync } from "node:fs";
import { join } from "node:path";

// Load entries/clay.js's clay.start without booting: only the bootstrap block
// that defines it is evaluated, against a stub clay whose ready has resolved.
const ROOT = new URL("../../", import.meta.url).pathname;
const src = readFileSync(join(ROOT, "entries/clay.js"), "utf8");

const startMarker = "if (!clay.start) {";
const endMarker = "    };\n  }";
const from = src.indexOf(startMarker);
const to = src.indexOf(endMarker, from);
if (from < 0 || to < 0) throw new Error("clay.start block not found in entries/clay.js");
const block = src.slice(from, to + endMarker.length);

const mount = () => {
  const clay = {};
  clay.ready = Promise.resolve(clay);
  new Function("clay", block)(clay);
  return clay;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

test("clay.start(fn) calls fn once after ready; a second call does not", async () => {
  const clay = mount();
  const seen = [];
  clay.start(() => seen.push("fn"));
  clay.start(() => seen.push("fn2"));
  await flush();
  expect(seen).toEqual(["fn"]);
});

test("named starts are independent and a repeated name does not run", async () => {
  const clay = mount();
  const seen = [];
  clay.start("a", () => seen.push("a"));
  clay.start("b", () => seen.push("b"));
  clay.start("a", () => seen.push("h"));
  await flush();
  expect(seen).toEqual(["a", "b"]);
});

test("names that live on Object.prototype each run their callback", async () => {
  const clay = mount();
  const seen = [];
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    clay.start(name, () => seen.push(name));
  }
  await flush();
  expect(seen).toEqual(["constructor", "toString", "__proto__", "hasOwnProperty"]);
});

test("a start made before a failed boot waits for the retried boot", async () => {
  const clay = {};
  let fail;
  const first = new Promise((_, reject) => {
    fail = reject;
  });
  first.catch(() => {});
  clay.ready = first;
  new Function("clay", block)(clay);

  const seen = [];
  clay.start("app", () => seen.push("fn"));
  let settle;
  clay.ready = new Promise((resolve) => {
    settle = resolve;
  });
  fail(new Error("boot failed"));
  await flush();
  expect(seen).toEqual([]);

  settle(clay);
  await flush();
  expect(seen).toEqual(["fn"]);

  clay.start("app", () => seen.push("g"));
  await flush();
  expect(seen).toEqual(["fn"]);
});
