/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RUNTIME_ALIASES } from "../../src/core/runtime-aliases.js";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const lock = JSON.parse(readFileSync(path.join(ROOT, "compat/journal-assets.lock.json"), "utf8"));

test("the client's runtime aliases are exactly the lock's aliases", () => {
  const expected = Object.fromEntries(
    Object.entries(lock.aliases).map(([url, entry]) => [url, entry.path]),
  );
  expect({ ...RUNTIME_ALIASES }).toEqual(expected);
});
