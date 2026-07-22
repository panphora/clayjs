import {
  captureForSave,
  captureForSaveAndComparison,
  onPrepareForSave,
} from "../../src/core/snapshot.js";

// Regression for snapshot-algorithm step 7: save-time hooks run BEFORE the
// [no-save] strip. The real [freeze]/[save-freeze] restore hook re-injects an
// element's original innerHTML into the clone AFTER capture; if that original
// contained a [no-save] element and the strip ran first, the content would leak
// to disk. Here a stand-in hook re-injects a [no-save] element after capture and
// the saved document must not contain it.
onPrepareForSave((clone) => {
  const body = clone.querySelector("body");
  if (!body) return;
  const leak = document.createElement("div");
  leak.setAttribute("no-save", "");
  leak.textContent = "HOOKINJECTEDNOSAVE";
  body.appendChild(leak);
});

beforeEach(() => {
  document.body.innerHTML = `<div id="keep">KEEPME</div>`;
  window.__hyperclaySnapshotHtml = null;
});

test("captureForSave strips a [no-save] element a prepare hook injected after capture", () => {
  const forSave = captureForSave({ emitForSync: false });
  expect(forSave).toContain("KEEPME");
  expect(forSave).not.toContain("HOOKINJECTEDNOSAVE");
});

test("captureForSaveAndComparison strips hook-injected [no-save] from the saved document", () => {
  const { forSave } = captureForSaveAndComparison({ emitForSync: false });
  expect(forSave).toContain("KEEPME");
  expect(forSave).not.toContain("HOOKINJECTEDNOSAVE");
});
