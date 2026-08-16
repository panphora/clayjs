/**
 * captureForMerge: one snapshot, two domains, one bridge.
 *
 * The comparison clone strips every autosave-off region (that is the domain
 * lastSavedContents lives in), the save clone keeps them (that is the domain
 * the file on disk lives in), and pairMap bridges comparison elements to
 * their save twins so a dirty root found on one side can be spliced from the
 * other. The capture is also side-effect free: no snapshot-ready emission
 * (which would feed the live-sync send pipeline) and no undo flush (it runs
 * per incoming frame, not per save boundary).
 */

let snapshot;

beforeAll(async () => {
  window.clayEditMode = true;
  snapshot = await import("../../src/core/snapshot.js");
});

beforeEach(() => {
  document.body.innerHTML = `
    <section data-id="cards">
      <div class="filterbar" clay="no-trigger-autosave no-undo"><input value="filter"></div>
      <p>card text</p>
    </section>
    <aside no-save>runtime chrome</aside>`;
});

test("the comparison clone strips autosave-off regions; the save clone keeps them", () => {
  const { saveClone, compareClone } = snapshot.captureForMerge();
  expect(compareClone.querySelector(".filterbar")).toBeNull();
  expect(compareClone.querySelector("[no-save]")).toBeNull();
  expect(saveClone.querySelector(".filterbar")).not.toBeNull();
  expect(saveClone.querySelector("[no-save]")).toBeNull(); // no-save never reaches disk
  expect(saveClone.querySelector("p").textContent).toBe("card text");
});

test("pairMap bridges a comparison element to its save-clone twin", () => {
  const { saveClone, compareClone, pairMap } = snapshot.captureForMerge();
  const compareSection = compareClone.querySelector('[data-id="cards"]');
  const saveSection = pairMap.get(compareSection);
  expect(saveSection).toBeDefined();
  expect(saveSection.ownerDocument).toBe(saveClone.ownerDocument);
  expect(saveSection.getAttribute("data-id")).toBe("cards");
  // The save twin still carries the stripped-from-comparison child.
  expect(saveSection.querySelector(".filterbar")).not.toBeNull();
});

test("captureForMerge never emits snapshot-ready", () => {
  let fired = false;
  const listener = () => { fired = true; };
  document.addEventListener("clay:snapshot-ready", listener);
  snapshot.captureForMerge();
  document.removeEventListener("clay:snapshot-ready", listener);
  expect(fired).toBe(false);
});

test("flushUndo:false captures do not shatter the undo batch", () => {
  const calls = [];
  window.clay = { undo: { flush: () => calls.push(1) } };
  snapshot.captureSnapshot({ flushUndo: false });
  snapshot.captureForComparison({ flushUndo: false });
  expect(calls.length).toBe(0);
  snapshot.captureSnapshot();
  expect(calls.length).toBe(1);
  delete window.clay;
});
