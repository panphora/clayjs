import { jest } from "@jest/globals";
import { effect } from "../../src/lib/effect.js";

const tick = () => new Promise((r) => setTimeout(r, 10));

let Mutation;
beforeAll(async () => {
  Mutation = (await import("../../src/lib/mutation.js")).default;
  window.clay = { Mutation };
});

// The hub observes document.body continuously, so a body write made just before
// an effect subscribes would otherwise be delivered to it as a first change.
const setBody = async (html) => {
  document.body.innerHTML = html;
  await tick();
};

test("runs once after a tick, not synchronously", async () => {
  await setBody("");
  const fn = jest.fn();
  const stop = effect(fn);
  expect(fn).not.toHaveBeenCalled();
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  stop();
});

test("re-runs once after several synchronous changes", async () => {
  await setBody('<div id="a"></div>');
  const fn = jest.fn();
  const stop = effect(fn);
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  document.getElementById("a").setAttribute("data-x", "1");
  document.getElementById("a").setAttribute("data-y", "2");
  await tick();
  await tick();
  expect(fn).toHaveBeenCalledTimes(2);
  stop();
});

test("a write made inside fn does not re-trigger it", async () => {
  await setBody('<div id="out"></div>');
  const fn = jest.fn(() => {
    document.getElementById("out").textContent = String(fn.mock.calls.length);
  });
  const stop = effect(fn);
  await tick();
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  stop();
});

test("clay:sync-applied causes a run", async () => {
  await setBody("");
  const fn = jest.fn();
  const stop = effect(fn);
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));
  await tick();
  expect(fn).toHaveBeenCalledTimes(2);
  stop();
});

test("after stop, neither a change nor clay:sync-applied runs it", async () => {
  await setBody('<div id="b"></div>');
  const fn = jest.fn();
  const stop = effect(fn);
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
  stop();
  document.getElementById("b").setAttribute("data-z", "1");
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));
  await tick();
  await tick();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("an async fn runs at most twice and stops the effect with an error", async () => {
  await setBody("");
  const out = document.createElement("div");
  document.body.appendChild(out);
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const fn = jest.fn(async () => {
      await null;
      out.textContent = String(Math.random());
    });
    const stop = effect(fn);
    await tick();
    await tick();
    await tick();
    expect(fn.mock.calls.length).toBeGreaterThan(0);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("synchronous"));
    stop();
  } finally {
    error.mockRestore();
  }
});
