import clayInternals from "../../src/internals/index.js";
import { captureForSave, addDocumentTransform } from "../../src/core/snapshot.js";
import { PERSIST, REGION_ATTRS, STRIP_FROM_SAVE } from "../../src/lib/region-policy.js";

beforeEach(() => {
  document.body.innerHTML = `<div id="keep">KEEPME</div>`;
});

describe("the clay.internals surface", () => {
  test("importing the module attaches clay.internals and returns that same object", () => {
    expect(window.clay.internals).toBe(clayInternals);
  });

  test("the snapshot group holds its two documented functions", () => {
    for (const name of ["captureSnapshot", "captureForSave"]) {
      expect(typeof clayInternals[name]).toBe("function");
    }
  });

  test("the region group holds its four functions, two constants, and four selectors", () => {
    const region = clayInternals.region;
    for (const name of ["addRegionToken", "resolveRegionPolicy", "isInert", "isSnapshotRemoved"]) {
      expect(typeof region[name]).toBe("function");
    }
    expect(region.PERSIST).toBe(PERSIST);
    expect(region.REGION_ATTRS).toBe(REGION_ATTRS);
    for (const name of ["stripFromSave", "stripFromComparison", "snapshotRemove", "freeze"]) {
      expect(typeof region.selectors[name]).toBe("string");
    }
  });

  test("the save group holds its three documented functions", () => {
    for (const name of ["saveHtml", "replacePageWith", "isSaveInProgress"]) {
      expect(typeof clayInternals.save[name]).toBe("function");
    }
  });
});

test("a transform registered through core runs in a capture driven by clay.internals", () => {
  addDocumentTransform((clone) => {
    clone.querySelector("#keep").textContent = "HOOKRAN";
  });

  const html = captureForSave({ emitForSync: false });

  expect(html).toContain("HOOKRAN");
  expect(html).not.toContain("KEEPME");
});

test("the re-exported strip selector is region-policy's own constant", () => {
  expect(clayInternals.region.selectors.stripFromSave).toBe(STRIP_FROM_SAVE);
});
