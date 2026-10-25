/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createRooms, checkPageWriteAdmission, documentEtag, ifMatchSatisfied, inspectPage, PageConversionError } from "../../../src/server/rooms/index.js";
import { articleOf } from "../../../src/server/rooms/page-rebase.js";
import { seedLineage } from "../../../src/page/ybind/lineage.js";
import { fileOf } from "../../../scripts/build-page-lineage-vectors.mjs";

const FILE = new URL("../../fixtures/offline-runtime/page-lineage.json", import.meta.url);
const vectors = JSON.parse(readFileSync(FILE, "utf8"));
const createDocument = () => new JSDOM("").window.document;
const byName = new Map(vectors.writes.map((write) => [write.name, write]));

const stampFor = (write) => {
  if (write.ifMatchOf === "current") return documentEtag(write.current);
  if (write.ifMatchOf === "T") return documentEtag(byName.get("seed-only-v1").current);
  return undefined;
};

const decision = (write) => {
  const ifMatch = stampFor(write);
  if (ifMatch !== undefined && !ifMatchSatisfied(ifMatch, write.current)) return "412";
  try {
    return checkPageWriteAdmission({ currentHtml: write.current, html: write.body, ifMatch, pageWrite: write.pageWrite ?? null, createDocument });
  } catch (error) {
    if (error instanceof PageConversionError) return error.reason;
    throw error;
  }
};

const initialOf = (write) => createRooms().reservePageInitial("k", {
  nodeId: 1,
  currentHtml: write.current,
  html: write.body,
  ifMatch: stampFor(write),
  pageWrite: write.pageWrite ?? null,
  createDocument,
});

const reasonOf = (fn) => {
  try {
    fn();
    return "admitted";
  } catch (error) {
    if (error instanceof PageConversionError) return error.reason;
    throw error;
  }
};

test("every vector decision is the one the host must make", () => {
  expect(vectors.writes.length).toBeGreaterThanOrEqual(24);
  for (const write of vectors.writes) expect({ name: write.name, decision: decision(write) }).toEqual({ name: write.name, decision: write.expect.js });
});

test("every initial vector reserves a room without a refusal", () => {
  for (const write of vectors.writes.filter((entry) => entry.expect.js === "initial")) {
    let token = null;
    expect(() => { token = initialOf(write); }).not.toThrow();
    expect(token?.key).toBe("k");
  }
});

const initialLane = (write) => inspectPage(write.current).kind === "none";

test("an initial refusal is the same reason from the reservation", () => {
  const refused = vectors.writes.filter((entry) => (entry.expect.js === "seed-lineage" || entry.expect.js === "nothing-to-write") && initialLane(entry));
  expect(refused.length).toBeGreaterThanOrEqual(5);
  for (const write of refused) {
    expect({ name: write.name, reason: reasonOf(() => initialOf(write)) }).toEqual({ name: write.name, reason: write.expect.js });
  }
});

test("seedLineage reports the client the seed itself carries", () => {
  const doc = createDocument();
  for (const entry of vectors.seeds) {
    const found = articleOf(fileOf(entry), doc);
    expect({ name: entry.name, client: found ? seedLineage(found.article).client : null }).toEqual({ name: entry.name, client: entry.client });
  }
});

test("a first write over a page document without a factory throws a TypeError", () => {
  const currentHtml = fileOf(vectors.seeds.find((entry) => entry.name === "irregular-entities"));
  const write = byName.get("first-edit");
  expect(() => createRooms().reservePageInitial("k", { nodeId: 1, currentHtml, html: write.body, ifMatch: documentEtag(currentHtml), pageWrite: write.pageWrite })).toThrow(TypeError);
});

test("a refused reservation leaves none behind", () => {
  const rooms = createRooms();
  const write = byName.get("stale-seed-edit");
  expect(reasonOf(() => rooms.reservePageInitial("k", { nodeId: 1, currentHtml: write.current, html: write.body, ifMatch: stampFor(write), pageWrite: write.pageWrite, createDocument }))).toBe("seed-lineage");
  expect(rooms.pageReserved("k")).toBe(false);
});
