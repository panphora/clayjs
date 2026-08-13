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
// most of them in development and none of the hosts that wanted it. It is returned
// from the capture rather than parked on a window global, so it can only ever be
// paired with the content captured alongside it.
test("a declared desktop transport returns the unstripped snapshot", () => {
  document.documentElement.setAttribute("clay-save-transport", "desktop-json-v1");
  const { forSave, forComparison, snapshotHtml } = captureForSaveAndComparison();
  expect(typeof snapshotHtml).toBe("string");
  expect(snapshotHtml.startsWith("<!DOCTYPE html>")).toBe(true);
  // Unstripped: it still holds what the save copy dropped.
  expect(snapshotHtml).toContain("NOSAVEREGION");
  expect(forSave).toContain("KEEPME");
  // comparison additionally strips the no-snapshot region (via snapshot-remove) and no-save
  expect(forComparison).not.toContain("NOSAVEREGION");
});

test("no declared transport leaves the snapshot uncaptured, even on localhost", () => {
  expect(window.location.hostname).toBe("localhost");
  const { snapshotHtml } = captureForSaveAndComparison();
  expect(snapshotHtml).toBeNull();
});

test("the global the snapshot used to live on is gone", () => {
  document.documentElement.setAttribute("clay-save-transport", "desktop-json-v1");
  captureForSaveAndComparison();
  expect(window.__hyperclaySnapshotHtml).toBeUndefined();
});
