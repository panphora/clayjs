/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { entriesOf } from "../../../src/page/ybind/parts.js";
import { articleOf } from "../../../src/server/rooms/page-rebase.js";
import { buildVectors, fileOf } from "../../../scripts/build-page-lineage-vectors.mjs";

const FILE = new URL("../../fixtures/offline-runtime/page-lineage.json", import.meta.url);
const vectors = buildVectors();

const clientsOf = (value) => {
  const clients = new Set();
  for (const [, text] of entriesOf(value.y)) for (const c of Y.decodeStateVector(Y.encodeStateVectorFromUpdateV2(Y.fromBase64(text))).keys()) clients.add(c);
  return [...clients].sort((a, b) => a - b);
};

test("the stored vectors are exactly what the generator builds", () => {
  expect(JSON.stringify(vectors, null, 2) + "\n").toBe(readFileSync(FILE, "utf8"));
});

test("every seed entry reads the same client in the browser and on the host", () => {
  const hostDocument = new JSDOM("").window.document;
  for (const entry of vectors.seeds) {
    const file = fileOf(entry);
    const browser = seedPageFromArticle(new JSDOM(file).window.document.querySelector("article[data-page]"));
    const found = articleOf(file, hostDocument);
    expect(found).not.toBeNull();
    const host = seedPageFromArticle(found.article);
    const expected = entry.client === null ? [] : [entry.client];
    expect({ name: entry.name, browser: clientsOf(browser) }).toEqual({ name: entry.name, browser: expected });
    expect({ name: entry.name, host: clientsOf(host) }).toEqual({ name: entry.name, host: expected });
  }
});

test("the vectors cover every decision a host has to make", () => {
  expect(vectors.seeds.length).toBeGreaterThanOrEqual(20);
  expect(vectors.writes.length).toBeGreaterThanOrEqual(24);
  const decisions = ["initial", "ordinary", "seed-lineage", "nothing-to-write", "invalid-capture", "412"];
  for (const decision of decisions) expect({ decision, covered: vectors.writes.some((write) => write.expect.js === decision) }).toEqual({ decision, covered: true });
  for (const write of vectors.writes) {
    expect(decisions).toContain(write.expect.js);
    expect([...decisions, "ordinary"]).toContain(write.expect.htmlclay);
  }
});
