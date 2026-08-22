import {
  resolveRegionPolicy,
  isInert,
  isSnapshotRemoved,
  STRIP_FROM_COMPARISON,
  STRIP_FROM_SAVE,
  FREEZE_SELECTOR,
  SNAPSHOT_REMOVE_SELECTOR,
} from "../../src/lib/region-policy.js";

function el(attrs = {}) {
  const node = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

describe("region-policy clay tokens", () => {
  test("no-save resolves via clay token and legacy bare attr", () => {
    expect(resolveRegionPolicy(el({ clay: "no-save" })).persist).toBe("none");
    expect(resolveRegionPolicy(el({ "no-save": "" })).persist).toBe("none");
  });

  test("no-save / freeze imply not autosave-triggered", () => {
    expect(resolveRegionPolicy(el({ clay: "no-save" })).autosaveTriggered).toBe(false);
    expect(resolveRegionPolicy(el({ clay: "freeze" })).autosaveTriggered).toBe(false);
  });

  test("freeze resolves to frozen persist (clay + legacy)", () => {
    expect(resolveRegionPolicy(el({ clay: "freeze" })).persist).toBe("frozen");
    expect(resolveRegionPolicy(el({ freeze: "" })).persist).toBe("frozen");
  });

  test("no-trigger-autosave resolves (clay + legacy)", () => {
    const clay = resolveRegionPolicy(el({ clay: "no-trigger-autosave" }));
    expect(clay.autosaveTriggered).toBe(false);
    expect(clay.undoable).toBe(true);
    expect(clay.persist).toBe("full");
    expect(resolveRegionPolicy(el({ "no-trigger-autosave": "" })).autosaveTriggered).toBe(false);
  });

  test("no-undo resolves (clay + legacy)", () => {
    expect(resolveRegionPolicy(el({ clay: "no-undo" })).undoable).toBe(false);
    expect(resolveRegionPolicy(el({ "no-undo": "" })).undoable).toBe(false);
  });

  test("no-watch implies not autosave-triggered and not undoable (clay + legacy)", () => {
    const clay = resolveRegionPolicy(el({ clay: "no-watch" }));
    expect(clay.watched).toBe(false);
    expect(clay.autosaveTriggered).toBe(false);
    expect(clay.undoable).toBe(false);
    const legacy = resolveRegionPolicy(el({ "no-watch": "" }));
    expect(legacy.watched).toBe(false);
  });

  test("combined clay tokens resolve both axes", () => {
    const p = resolveRegionPolicy(el({ clay: "freeze no-undo" }));
    expect(p.persist).toBe("frozen");
    expect(p.undoable).toBe(false);
  });

  test("whitespace variants (tab/newline) resolve", () => {
    expect(resolveRegionPolicy(el({ clay: "freeze\tno-undo" })).undoable).toBe(false);
    expect(resolveRegionPolicy(el({ clay: "no-save\nfreeze" })).persist).toBe("none");
  });

  test("freeze alone stays undoable, save-freeze does not", () => {
    expect(resolveRegionPolicy(el({ clay: "freeze" })).undoable).toBe(true);
    expect(resolveRegionPolicy(el({ freeze: "" })).undoable).toBe(true);
    expect(resolveRegionPolicy(el({ "save-freeze": "" })).undoable).toBe(false);
  });

  test("legacy bundles map as before", () => {
    const saveRemove = resolveRegionPolicy(el({ "save-remove": "" }));
    expect(saveRemove.persist).toBe("none");
    expect(saveRemove.undoable).toBe(false);
    const saveIgnore = resolveRegionPolicy(el({ "save-ignore": "" }));
    expect(saveIgnore.autosaveTriggered).toBe(false);
    expect(saveIgnore.undoable).toBe(false);
    expect(resolveRegionPolicy(el({ "mutations-ignore": "" })).watched).toBe(false);
  });

  test("unknown clay tokens are ignored", () => {
    const p = resolveRegionPolicy(el({ clay: "bogus whatever" }));
    expect(p).toEqual({
      watched: true,
      autosaveTriggered: true,
      dirtyTracked: true,
      undoable: true,
      persist: "full",
      extension: false,
    });
  });

  test("isInert honors no-watch / mutations-ignore via clay + legacy", () => {
    expect(isInert(el({ clay: "no-watch" }))).toBe(true);
    expect(isInert(el({ "no-watch": "" }))).toBe(true);
    expect(isInert(el({ "mutations-ignore": "" }))).toBe(true);
    expect(isInert(el({}))).toBe(false);
  });

  test("isSnapshotRemoved honors clay no-snapshot + legacy", () => {
    expect(isSnapshotRemoved(el({ clay: "no-snapshot" }))).toBe(true);
    expect(isSnapshotRemoved(el({ "no-snapshot": "" }))).toBe(true);
    expect(isSnapshotRemoved(el({ "snapshot-remove": "" }))).toBe(true);
    expect(isSnapshotRemoved(el({}))).toBe(false);
  });

  test("selector constants match clay-token elements", () => {
    expect(el({ clay: "no-save" }).matches(STRIP_FROM_SAVE)).toBe(true);
    expect(el({ clay: "freeze" }).matches(FREEZE_SELECTOR)).toBe(true);
    expect(el({ clay: "no-snapshot" }).matches(SNAPSHOT_REMOVE_SELECTOR)).toBe(true);
  });

  test("STRIP_FROM_COMPARISON matches autosave-off clay tokens", () => {
    expect(el({ clay: "no-trigger-autosave" }).matches(STRIP_FROM_COMPARISON)).toBe(true);
    expect(el({ clay: "no-watch" }).matches(STRIP_FROM_COMPARISON)).toBe(true);
    expect(el({ clay: "freeze" }).matches(STRIP_FROM_COMPARISON)).toBe(true);
    expect(el({ clay: "no-save" }).matches(STRIP_FROM_COMPARISON)).toBe(true);
    expect(el({}).matches(STRIP_FROM_COMPARISON)).toBe(false);
  });
});

describe("one region shape, served to both surfaces", () => {
  test("clay.region and clay.internals.region are the same object", async () => {
    const { regionShape, windowRegionShape } = await import("../../src/lib/region-policy.js");
    expect(windowRegionShape).toBe(regionShape);
  });

  // Both spellings are documented (README and website/docs.html), so the cleanup
  // is an additive union. Dropping either would be a compatibility break dressed
  // up as tidying.
  test("it carries both the flat and the nested selector spellings", async () => {
    const { regionShape } = await import("../../src/lib/region-policy.js");

    expect(typeof regionShape.STRIP_FROM_SAVE).toBe("string");
    expect(typeof regionShape.STRIP_FROM_COMPARISON).toBe("string");
    expect(typeof regionShape.SNAPSHOT_REMOVE_SELECTOR).toBe("string");
    expect(typeof regionShape.FREEZE_SELECTOR).toBe("string");

    expect(regionShape.selectors.stripFromSave).toBe(regionShape.STRIP_FROM_SAVE);
    expect(regionShape.selectors.stripFromComparison).toBe(regionShape.STRIP_FROM_COMPARISON);
    expect(regionShape.selectors.snapshotRemove).toBe(regionShape.SNAPSHOT_REMOVE_SELECTOR);
    expect(regionShape.selectors.freeze).toBe(regionShape.FREEZE_SELECTOR);
  });

  test("it exposes every helper both surfaces published, plus the token list", async () => {
    const { regionShape, TOKENS } = await import("../../src/lib/region-policy.js");

    for (const name of ["resolveRegionPolicy", "isInert", "isSnapshotRemoved",
                        "skipForPolicy", "strictestPolicy", "addRegionToken"]) {
      expect(typeof regionShape[name]).toBe("function");
    }
    expect(regionShape.TOKENS).toBe(TOKENS);
    expect(TOKENS).toEqual(expect.arrayContaining([
      "no-save", "no-snapshot", "no-trigger-autosave", "no-watch", "no-undo", "freeze",
    ]));
  });
});

// The strip removes a marked element WITH its subtree, so a descendant is just
// as absent from every snapshot as the region itself.
test("isSnapshotRemoved is ancestor-aware", async () => {
  const { isSnapshotRemoved } = await import("../../src/lib/region-policy.js");
  document.body.innerHTML = '<div clay="no-snapshot"><p id="kid">x</p></div><span id="free">y</span>';

  expect(isSnapshotRemoved(document.getElementById("kid"))).toBe(true);
  expect(isSnapshotRemoved(document.getElementById("free"))).toBe(false);
});
