// Isolated file: NOT in edit mode (is-edit-mode.js reads the global once, at import).
// The gate's feeds only start in edit mode, but the sync plugin still loads this module
// on a viewer's page, so `clay.markDirty()` is reachable there. A page that cannot save
// has nothing to announce.

test("view mode: clay.markDirty() dispatches no clay:dirty", async () => {
  window.clay = {};
  const gate = await import("../../src/lib/dirty-gate.js");
  expect(typeof window.clay.markDirty).toBe("function");

  const seen = [];
  const onEvent = (event) => seen.push(event.type);
  document.addEventListener("clay:dirty", onEvent);
  document.addEventListener("clay:clean", onEvent);
  try {
    window.clay.markDirty();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The counter still counts it; the announcement is what is gated.
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(seen).toEqual([]);

    window.clay.markDirty();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([]);
  } finally {
    document.removeEventListener("clay:dirty", onEvent);
    document.removeEventListener("clay:clean", onEvent);
  }
});
