/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

// Scenario: a host that stamps no version on the response, which is every host that has
// not adopted the response attribute yet. There is no provenance to protect, so discovery
// has to keep working exactly as it did: it is the only source of a save stamp this tab
// has, and the guard added for stamped responses must be inert here.

let etagMod;
let metaAnswer;

beforeAll(async () => {
  window.clayEditMode = false;

  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(metaAnswer),
  }));

  etagMod = await import("../../src/core/etag.js");
});

test("a host that supplies no response stamp leaves this tab representing nothing", async () => {
  const { servedDocumentEtag } = await import("../../src/core/host-attrs.js");

  expect(servedDocumentEtag).toBe(null);
  expect(etagMod.lastSeenEtag()).toBe(null);
  // Nothing was ever served with a version on it, so there is no version to claim.
  expect(etagMod.representedEtag()).toBe(null);
});

test("discovery still seeds the save stamp on a host that served none", async () => {
  metaAnswer = { spec: 1, extensions: [], document: { etag: "disk-B" } };

  await etagMod.seedEtag();

  expect(etagMod.lastSeenEtag()).toBe("disk-B");
});

test("a later explicit refresh still replaces it, as it always did", async () => {
  metaAnswer = { spec: 1, extensions: [], document: { etag: "disk-C" } };

  await etagMod.seedEtag({ fresh: true });

  expect(etagMod.lastSeenEtag()).toBe("disk-C");
});
