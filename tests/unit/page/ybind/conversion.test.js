import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { prepareHybridConversion, migrateHybridValues, YMigrationError, blocksFromYValue } from "../../../../src/page/ybind/core.js";
import { RECORD } from "../fixtures/all-kinds.js";

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const originalEncoder = Object.getOwnPropertyDescriptor(globalThis, "TextEncoder");
beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder, configurable: true });
});
afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
  else delete globalThis.crypto;
  if (originalEncoder) Object.defineProperty(globalThis, "TextEncoder", originalEncoder);
  else delete globalThis.TextEncoder;
});

const source = (text = "AAAA") => ({ blocks: { p: { t: "paragraph", pos: "A", c: text } } });
const golden = "86de735acd3fac0b168b165cc6b11ef496df121aec0b51023f4fb55c81044fb5";
const reverseKeys = (value) => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseKeys(value[key])])) : value;

test("pairs the exact SHA-256 baseline with the existing deterministic conversion", async () => {
  const input = source();
  const result = await prepareHybridConversion([["page", input]]);
  expect(result.baseline).toBe(golden);
  expect(result.value).toEqual(migrateHybridValues([input]));
  expect(blocksFromYValue(result.value).p.c).toBe("AAAA");
  expect(input).toEqual(source());
});

test("keeps DOM tag order and the converter's multi-tag precedence", async () => {
  const tags = [["page.2", source("first")], ["page.1", source("second")]];
  const forward = await prepareHybridConversion(tags);
  const reverse = await prepareHybridConversion([...tags].reverse());
  expect(blocksFromYValue(forward.value).p.c).toBe("second");
  expect(blocksFromYValue(reverse.value).p.c).toBe("first");
  expect(forward.baseline).not.toBe(reverse.baseline);
});

test("includes names, tombstones and raw hidden records in baseline identity", async () => {
  const plain = await prepareHybridConversion([["page", source()]]);
  const renamed = await prepareHybridConversion([["page.1", source()]]);
  const deleted = await prepareHybridConversion([["page", { ...source(), deleted: { absent: true } }]]);
  const hidden = await prepareHybridConversion([["page", { blocks: { ...source().blocks, gone: { t: "paragraph", pos: "B", c: "hidden" } }, deleted: { gone: true } }]]);
  expect(new Set([plain.baseline, renamed.baseline, deleted.baseline, hidden.baseline]).size).toBe(4);
  expect(renamed.value).toEqual(plain.value);
  expect(deleted.value).toEqual(plain.value);
  expect(hidden.value).toEqual(plain.value);
});

test("canonicalizes nested object keys without losing the complete source data", async () => {
  const record = JSON.parse(JSON.stringify(RECORD));
  const first = await prepareHybridConversion([["page", record]]);
  const second = await prepareHybridConversion([["page", reverseKeys(record)]]);
  expect(second).toEqual(first);
  expect(first.value).toEqual(migrateHybridValues([RECORD]));
});

test("owns its source before asynchronous hashing and leaves the caller free to edit", async () => {
  const tags = [["page", source()]];
  const pending = prepareHybridConversion(tags);
  tags[0][0] = "page.9";
  tags[0][1].blocks.p.c = "BBBB";
  tags.push(["page", source("later")]);
  const result = await pending;
  expect(result.baseline).toBe(golden);
  expect(blocksFromYValue(result.value).p.c).toBe("AAAA");
  expect(tags[0][1].blocks.p.c).toBe("BBBB");
});

test.each([
  ["no tags", []],
  ["not a list", {}],
  ["unnamed value", [source()]],
  ["extra tuple field", [["page", source(), "extra"]]],
  ["duplicate name", [["page", source()], ["page", source()]]],
  ["unrelated store", [["counter", source()]]],
  ["non-numeric suffix", [["page.other", source()]]],
  ["empty block type", [["page", { blocks: { p: { t: "", pos: "A" } } }]]],
  ["non-JSON value", [["page", { blocks: { p: { t: "paragraph", pos: "A", c: undefined } } }]]],
  ["non-finite number", [["page", { blocks: { p: { t: "paragraph", pos: "A", c: Infinity } } }]]],
])("refuses %s without returning a conversion", async (label, tags) => {
  await expect(prepareHybridConversion(tags)).rejects.toBeInstanceOf(YMigrationError);
});

test("refuses an already converted page and cyclic input", async () => {
  await expect(prepareHybridConversion([["page", migrateHybridValues([source()])]])).rejects.toBeInstanceOf(YMigrationError);
  const cyclic = source();
  cyclic.self = cyclic;
  await expect(prepareHybridConversion([["page", cyclic]])).rejects.toBeInstanceOf(YMigrationError);
});

test("the public helper executes in a real Node process without DOM globals", () => {
  const module = new URL("../../../../src/page/ybind/core.js", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    assert.equal(typeof window, "undefined");
    assert.equal(typeof document, "undefined");
    const { prepareHybridConversion, blocksFromYValue } = await import(${JSON.stringify(module)});
    const result = await prepareHybridConversion(${JSON.stringify([["page", source()]])});
    assert.equal(blocksFromYValue(result.value).p.c, "AAAA");
    process.stdout.write(result.baseline);
  `;
  expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" })).toBe(golden);
});
