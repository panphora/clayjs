/**
 * captureForMerge: one snapshot, two domains, one bridge.
 *
 * The compare clone is the LOSS domain (the domain lastSavedDirty lives in),
 * not the autosave domain: the merge asks "would this frame destroy work?", so
 * it keeps no-trigger-autosave content and drops only what is declared
 * disposable with no-dirty. The save clone is the disk domain and keeps both.
 * pairMap bridges compare elements to their save twins so a dirty root found
 * on one side can be spliced from the other. The capture is also side-effect
 * free: no snapshot-ready emission (which would feed the live-sync send
 * pipeline) and no undo flush (it runs per incoming frame, not per save).
 */

let snapshot;

beforeAll(async () => {
  window.clayEditMode = true;
  snapshot = await import("../../src/core/snapshot.js");
});

beforeEach(() => {
  document.body.innerHTML = `
    <section data-id="cards">
      <div class="filterbar" clay="no-dirty no-undo"><input value="filter"></div>
      <div class="editor" clay="no-trigger-autosave"><p>batched draft</p></div>
      <p>card text</p>
    </section>
    <aside no-save>runtime chrome</aside>`;
});

test("the compare clone drops disposable regions and keeps batched work", () => {
  const { saveClone, compareClone } = snapshot.captureForMerge();
  // Declared disposable: out of the loss domain, so its churn can never
  // produce a dirty root and hold every incoming frame.
  expect(compareClone.querySelector(".filterbar")).toBeNull();
  expect(compareClone.querySelector("[no-save]")).toBeNull();
  // Durable work awaiting a manual save: IN the loss domain, which is what
  // lets the merge protect it from an incoming frame.
  expect(compareClone.querySelector(".editor")).not.toBeNull();
  expect(saveClone.querySelector(".filterbar")).not.toBeNull();
  expect(saveClone.querySelector(".editor")).not.toBeNull();
  expect(saveClone.querySelector("[no-save]")).toBeNull(); // no-save never reaches disk
  expect(saveClone.querySelector("section > p").textContent).toBe("card text");
});

test("pairMap bridges a comparison element to its save-clone twin", () => {
  const { saveClone, compareClone, pairMap } = snapshot.captureForMerge();
  const compareSection = compareClone.querySelector('[data-id="cards"]');
  const saveSection = pairMap.get(compareSection);
  expect(saveSection).toBeDefined();
  expect(saveSection.ownerDocument).toBe(saveClone.ownerDocument);
  expect(saveSection.getAttribute("data-id")).toBe("cards");
  // The save twin still carries the child the loss domain strips.
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
