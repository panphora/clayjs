/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

// Scenario: a response that says which version of the file it was built from gives this
// tab provenance it can never reconstruct afterwards. The file can change between the
// navigation and the first discovery answer, and both hosts answer discovery by reading
// the file AGAIN, so that answer describes a later moment than this page does. Adopting
// it would claim bytes this tab has never received and erase the only evidence that they
// are missing.
//
// Two values, and the difference matters: `lastSeen` is what the next save compares
// with, and `represented` is what this tab is actually looking at. Discovery may move
// the first only when a person asks to overwrite, and moves the second never.

let etagMod;
let metaMod;
let metaAnswer;

const diskMeta = (etag) => ({
  spec: 1,
  extensions: ["conditional"],
  document: etag ? { etag } : null,
});

const applied = (etag) =>
  new CustomEvent("clay:sync-applied", { detail: { source: "disk", etag } });

beforeAll(async () => {
  // The view lane, deliberately: it is the lane startup repair runs in, and the lane
  // where nothing else is allowed to move the stamp on this tab's behalf.
  window.clayEditMode = false;
  document.documentElement.setAttribute("documentetag", "served-A");

  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    if (!target.includes("/_/meta")) throw new Error(`unexpected fetch: ${target}`);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(metaAnswer),
    };
  });

  etagMod = await import("../../src/core/etag.js");
  metaMod = await import("../../src/core/host-meta.js");
});

test("the served stamp is captured once and survives a later change to the root", async () => {
  const { servedDocumentEtag } = await import("../../src/core/host-attrs.js");
  expect(servedDocumentEtag).toBe("served-A");

  // A morph, a stream restart, or the host rewriting the attribute on a later response
  // must not be able to change what THIS page says it was built from.
  document.documentElement.setAttribute("documentetag", "later-B");

  expect((await import("../../src/core/host-attrs.js")).servedDocumentEtag).toBe("served-A");
  expect(etagMod.lastSeenEtag()).toBe("served-A");
  expect(etagMod.representedEtag()).toBe("served-A");
});

test("the response stamp is response metadata, not a credential", async () => {
  const { saveToken, hasSaveToken } = await import("../../src/core/host-attrs.js");
  const { SAVE_TOKEN_ATTRS, LEGACY_SAVE_TOKEN_ATTRS, HOST_IDENTITY_ATTRS } = await import(
    "../../src/lib/root-attrs.js"
  );

  expect(SAVE_TOKEN_ATTRS).not.toContain("documentetag");
  expect(LEGACY_SAVE_TOKEN_ATTRS).not.toContain("documentetag");
  expect(HOST_IDENTITY_ATTRS).not.toContain("documentetag");
  expect(saveToken()).toBe(null);
  expect(hasSaveToken()).toBe(false);
});

test("discovery reports the capability without moving the stamp this tab holds", async () => {
  metaMod.resetHostMeta();
  metaAnswer = diskMeta("disk-B");

  await etagMod.seedEtag();

  expect(etagMod.conditionalSaves()).toBe(true);
  expect(etagMod.lastSeenEtag()).toBe("served-A");
  expect(etagMod.representedEtag()).toBe("served-A");
});

test("an explicit overwrite takes the host's answer for the next save, and only that", async () => {
  metaMod.resetHostMeta();
  metaAnswer = diskMeta("disk-B");

  await etagMod.seedEtag({ fresh: true });

  expect(etagMod.lastSeenEtag()).toBe("disk-B");
  // `fresh` asks the host to be believed about the stamp a save compares with. It says
  // nothing about content this tab has received, and none has arrived.
  expect(etagMod.representedEtag()).toBe("served-A");
});

test("a background refresh that may not clear an answer cannot move the stamp either", async () => {
  metaMod.resetHostMeta();
  // A host answering with no stamp at all, which is the case the clearing rule exists
  // for: clearing fails OPEN, so a refresh nobody asked for must not turn the guard off.
  metaAnswer = diskMeta(null);

  await etagMod.seedEtag({ fresh: true, clearIfMissing: false });

  expect(etagMod.lastSeenEtag()).toBe("disk-B");
  expect(etagMod.representedEtag()).toBe("served-A");
});

test("a recorded save stamp is also what the tab represents", () => {
  etagMod.recordEtag("stored-C");

  expect(etagMod.lastSeenEtag()).toBe("stored-C");
  expect(etagMod.representedEtag()).toBe("stored-C");
});

test("a disk frame carrying its own stamp leaves the represented stamp alone", () => {
  document.dispatchEvent(applied("frame-D"));

  expect(etagMod.representedEtag()).toBe("stored-C");
  expect(etagMod.lastSeenEtag()).toBe("stored-C");
});

test("an unstamped disk frame drops what this tab represents, in the view lane too", () => {
  document.dispatchEvent(applied(null));

  expect(etagMod.representedEtag()).toBe(null);
  // The save stamp is the edit lane's business, and this tab never sends one.
  expect(etagMod.lastSeenEtag()).toBe("stored-C");
});

test("a forgotten represented stamp leaves the save stamp where it was", () => {
  etagMod.recordEtag("stored-E");

  etagMod.forgetRepresentedEtag();

  expect(etagMod.representedEtag()).toBe(null);
  expect(etagMod.lastSeenEtag()).toBe("stored-E");
});
