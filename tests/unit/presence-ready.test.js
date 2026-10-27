test("clay:presence-ready fires once, when the presence facade attaches", async () => {
  const seen = [];
  document.addEventListener("clay:presence-ready", (e) => seen.push(e.detail.presence));
  expect(window.clay?.presence).toBeUndefined();
  const { presence } = await import("../../src/sync/presence-store.js");
  expect(window.clay.presence).toBe(presence);
  expect(seen).toEqual([presence]);
});
