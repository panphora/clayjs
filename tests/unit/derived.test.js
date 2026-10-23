import { jest } from "@jest/globals";

/**
 * lib/derived.js: what ClayJS treats as painted output, and the hooks a derive
 * engine uses. The merge and baseline behaviour is in derived-paints.test.js.
 */

let derivedLib;
let Mutation;

beforeAll(async () => {
  derivedLib = await import("../../src/lib/derived.js");
  Mutation = (await import("../../src/lib/mutation.js")).default;
});

beforeEach(() => {
  document.body.innerHTML = "";
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("isDerivedChange: painted attributes, painted tokens and painted text, never records", () => {
  document.body.innerHTML = `<main sap><p id="p" state="data-status" data-status="done" attr:data-state="1" class:done="1" css:pct="1" text="1">x</p><p id="q" data-x="1">y</p></main>`;
  const p = document.getElementById("p");
  const q = document.getElementById("q");
  const { isDerivedChange } = derivedLib;
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "data-state" })).toBe(true);
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "data-status" })).toBe(false);
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "class", oldValue: "step", newValue: "step done" })).toBe(true);
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "class", oldValue: "step", newValue: "card" })).toBe(false);
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "style", oldValue: "color: red", newValue: "color: red; --pct: 5%" })).toBe(true);
  expect(isDerivedChange({ type: "attribute", element: p, attribute: "style", oldValue: "color: red", newValue: "color: blue" })).toBe(false);
  expect(isDerivedChange({ type: "characterData", element: p })).toBe(true);
  expect(isDerivedChange({ type: "characterData", element: q })).toBe(false);
  expect(isDerivedChange({ type: "attribute", element: q, attribute: "data-x" })).toBe(false);
});

test("the hub hands a clobbered paint to observers only, and a record edit to everyone", async () => {
  document.body.innerHTML = `<main sap><p id="p" state="data-status" data-status="done" attr:data-state="1" data-state="a"></p></main>`;
  const observed = [];
  const dirty = [];
  const offObserved = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => observed.push(...changes.map((c) => c.attribute)));
  const offDirty = Mutation.onAnyChange({ debounce: 0, require: "dirty" }, (changes) => dirty.push(...changes.map((c) => c.attribute)));
  const p = document.getElementById("p");
  p.setAttribute("data-state", "b");
  p.setAttribute("data-status", "todo");
  await tick();
  offObserved();
  offDirty();
  expect(observed).toEqual(expect.arrayContaining(["data-state", "data-status"]));
  expect(dirty).toEqual(["data-status"]);
});

test("repaintDerived runs every registered engine, and an engine that throws does not stop the rest", () => {
  const { derived, repaintDerived } = derivedLib;
  const calls = [];
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const offA = derived.register(() => { calls.push("a"); throw new Error("boom"); });
  const offB = derived.register(() => calls.push("b"));
  repaintDerived();
  offA();
  repaintDerived();
  offB();
  repaintDerived();
  expect(calls).toEqual(["a", "b", "b"]);
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});

test("afterDerivedMount waits for the engine's first pass on a page with an app, and no longer", async () => {
  const { derived, afterDerivedMount } = derivedLib;
  const plain = jest.fn();
  afterDerivedMount(plain, 1000);
  expect(plain).toHaveBeenCalledTimes(1);

  document.body.innerHTML = `<main sap></main>`;
  const waiting = jest.fn();
  afterDerivedMount(waiting, 1000);
  expect(waiting).not.toHaveBeenCalled();
  derived.mounted();
  expect(waiting).toHaveBeenCalledTimes(1);

  const after = jest.fn();
  afterDerivedMount(after, 1000);
  expect(after).toHaveBeenCalledTimes(1);
});
