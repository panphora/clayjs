// Scenario: the [refetch-on-save] replacement element must MERGE its policy
// tokens into an author-set clay attribute, not clobber it (review finding:
// setAttribute replaced clay="freeze" wholesale, dropping the author's policy).

test("refetch-on-save merges clay tokens instead of replacing them", async () => {
  document.body.innerHTML = '<img refetch-on-save clay="freeze" src="/pic.png">';

  await import("../../src/attrs/refetch-on-save.js");

  document.dispatchEvent(new CustomEvent("clay:save-saved"));

  const imgs = document.querySelectorAll("img");
  expect(imgs.length).toBe(2);
  const newEl = imgs[1];
  const tokens = (newEl.getAttribute("clay") || "").split(/\s+/);
  expect(tokens).toEqual(
    expect.arrayContaining(["freeze", "no-trigger-autosave", "no-undo"])
  );
  expect(newEl.getAttribute("src")).toContain("v=");
});
