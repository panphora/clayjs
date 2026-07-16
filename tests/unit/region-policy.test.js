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
