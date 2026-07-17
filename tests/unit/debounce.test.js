import { jest } from "@jest/globals";
import debounce from "../../src/utils/debounce.js";

test("collapses rapid calls into one, using the latest args", async () => {
  jest.useFakeTimers();
  const spy = jest.fn();
  const fn = debounce(spy, 100);

  fn("a");
  fn("b");
  fn("c");
  expect(spy).not.toHaveBeenCalled();

  jest.advanceTimersByTime(100);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith("c");
  jest.useRealTimers();
});

test("resolves the returned promise with the callback's value", async () => {
  const fn = debounce((x) => x * 2, 10);
  await expect(fn(21)).resolves.toBe(42);
});
