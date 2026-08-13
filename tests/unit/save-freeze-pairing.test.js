/**
 * [freeze] pairs a cloned element with its OWN authored content.
 *
 * The prepare phase used to pair live and cloned [freeze] elements by list index.
 * By then the clone has lost every [no-snapshot] subtree, so a [freeze] inside one
 * shifts every later index and each surviving region is filled with a different
 * element's authored content — destroyed in the saved file, permanently.
 */

import {
  captureForSave,
  captureForSaveAndComparison,
  captureSnapshot,
} from "../../src/core/snapshot.js";

// save-freeze records each region's authored innerHTML at import time, so the
// document has to look like a freshly served page before the module loads.
beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = `
    <div clay="freeze" id="a">AUTHORED-A</div>
    <div clay="no-snapshot">
      <div clay="freeze" id="b">AUTHORED-B</div>
    </div>
    <div clay="freeze" id="c">AUTHORED-C</div>
  `;
  await import("../../src/attrs/save-freeze.js");
});

beforeEach(() => {
  document.getElementById("a").innerHTML = "AUTHORED-A";
  document.getElementById("b").innerHTML = "AUTHORED-B";
  document.getElementById("c").innerHTML = "AUTHORED-C";
});

test("a [freeze] inside [no-snapshot] does not shift its siblings' content", () => {
  document.getElementById("a").innerHTML = "RUNTIME-A";
  document.getElementById("c").innerHTML = "RUNTIME-C";

  const forSave = captureForSave({ emitForSync: false });

  // C is saved with C's authored content, not B's, and not its runtime content.
  expect(forSave).toContain("AUTHORED-C");
  expect(forSave).not.toContain("RUNTIME-C");
  expect(forSave).toContain("AUTHORED-A");
  expect(forSave).not.toContain("RUNTIME-A");
  // B lived inside a [no-snapshot] region, so it is not in the file at all.
  expect(forSave).not.toContain("AUTHORED-B");
});

test("the same holds through the combined save+comparison capture", () => {
  document.getElementById("c").innerHTML = "RUNTIME-C";

  const { forSave } = captureForSaveAndComparison({ emitForSync: false });

  expect(forSave).toContain("AUTHORED-C");
  expect(forSave).not.toContain("RUNTIME-C");
});

test("an [onbeforesave] handler cannot un-freeze a region", () => {
  const c = document.getElementById("c");
  c.setAttribute("onbeforesave", "this.innerHTML = 'HANDLER-C'");

  const forSave = captureForSave({ emitForSync: false });

  // Match the element's content, not the handler attribute that mentions it.
  expect(forSave).toContain(">AUTHORED-C<");
  expect(forSave).not.toContain(">HANDLER-C<");
  c.removeAttribute("onbeforesave");
});

// The pairing must never be spelled as an attribute on the clone: clay:snapshot-ready
// fires between the two freeze phases and its consumers (live-sync, demo mode)
// serialize the clone on the spot, so anything stamped there gets broadcast and, on
// a host whose live-sync lane persists, written to disk.
test("the snapshot-ready clone carries no library-injected attributes", () => {
  const html = captureSnapshot().outerHTML;

  expect(html).not.toMatch(/data-clay-/);
  expect(html).not.toMatch(/data-freeze/);
});
