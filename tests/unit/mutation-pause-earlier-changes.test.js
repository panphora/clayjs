test("a change made just before a pause still reaches pausable callbacks", async () => {
  const Mutation = (await import("../../src/lib/mutation.js")).default;
  const seen = [];
  Mutation.onAnyChange({ debounce: 0 }, (changes) => {
    for (const change of changes) if (change.element.id) seen.push(change.element.id);
  });

  const before = document.createElement("div");
  before.id = "before";
  document.body.append(before);

  Mutation.pause();
  const during = document.createElement("div");
  during.id = "during";
  document.body.append(during);
  Mutation.resume();

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(seen).toContain("before");
  expect(seen).not.toContain("during");
});
