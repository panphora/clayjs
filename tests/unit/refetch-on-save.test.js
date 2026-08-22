// The [refetch-on-save] replacement element must carry the author's clay
// attribute through untouched (review finding: setAttribute replaced
// clay="freeze" wholesale, dropping the author's policy).
//
// It no longer ADDS policy tokens of its own. Marking the replacement
// no-trigger-autosave / no-undo was how the rewrite used to be hidden from the
// dirty check, and it only ever worked from the second save on. The URL is kept
// out of the file by authored-url.js now, so the region model stays the
// author's to declare.

test("refetch-on-save carries the author's clay tokens through, and adds none", async () => {
  document.body.innerHTML = '<img refetch-on-save clay="freeze" src="/pic.png">';

  await import("../../src/attrs/refetch-on-save.js");

  document.dispatchEvent(new CustomEvent("clay:save-saved"));

  const imgs = document.querySelectorAll("img");
  expect(imgs.length).toBe(2);
  const newEl = imgs[1];
  expect(newEl.getAttribute("clay")).toBe("freeze");
  expect(newEl.getAttribute("src")).toContain("v=");
});
