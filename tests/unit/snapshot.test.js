import {
  captureForSave,
  captureForSaveAndComparison,
} from "../../src/core/snapshot.js";

beforeEach(() => {
  document.body.innerHTML = `
    <div id="keep">KEEPME</div>
    <nav clay="no-save">NOSAVEREGION</nav>
    <aside save-remove>LEGACYREMOVE</aside>
    <span clay="no-snapshot">NOSNAPREGION</span>
    <p onbeforesave="this.textContent='CHANGED'">beforetext</p>
    <grammarly-extension>EXTNOISE</grammarly-extension>
  `;
  window.__hyperclaySnapshotHtml = null;
  document.documentElement.removeAttribute("clay-save-transport");
});

test("strips no-save (clay + legacy), no-snapshot, and extension noise; keeps content; runs onbeforesave", () => {
  const forSave = captureForSave({ emitForSync: false });

  expect(forSave).toContain("KEEPME");
  expect(forSave).not.toContain("NOSAVEREGION");
  expect(forSave).not.toContain("LEGACYREMOVE");
  expect(forSave).not.toContain("NOSNAPREGION");
  expect(forSave).not.toContain("EXTNOISE");
  expect(forSave).toContain("CHANGED");
  expect(forSave).not.toContain("beforetext");
});

// The unstripped snapshot exists for one consumer: a host that declared the
// desktop JSON envelope. It used to be captured on any localhost page, which is
// most of them in development and none of the hosts that wanted it.
test("a declared desktop transport sets window.__hyperclaySnapshotHtml", () => {
  document.documentElement.setAttribute("clay-save-transport", "desktop-json-v1");
  const { forSave, forComparison } = captureForSaveAndComparison();
  expect(typeof window.__hyperclaySnapshotHtml).toBe("string");
  expect(window.__hyperclaySnapshotHtml.startsWith("<!DOCTYPE html>")).toBe(true);
  expect(forSave).toContain("KEEPME");
  // comparison additionally strips the no-snapshot region (via snapshot-remove) and no-save
  expect(forComparison).not.toContain("NOSAVEREGION");
});

test("no declared transport leaves the snapshot uncaptured, even on localhost", () => {
  expect(window.location.hostname).toBe("localhost");
  captureForSaveAndComparison();
  expect(window.__hyperclaySnapshotHtml).toBeNull();
});
