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

describe("edit-mode warnings", () => {
  let warn;
  let stops = [];
  const fx = (fn) => { const s = effect(fn); stops.push(s); return s; };
  beforeEach(async () => {
    const { resolveRegionPolicy } = await import("../../src/lib/region-policy.js");
    window.clay = { Mutation, isEditMode: true, region: { resolveRegionPolicy } };
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    stops.forEach((s) => s());
    stops = [];
    warn.mockRestore();
    window.clay = { Mutation };
  });
  const warnings = () => warn.mock.calls.map((c) => String(c[0]));

  test("a write to saved, dirty-tracked content warns once", async () => {
    await setBody('<p id="count"></p>');
    const stop = fx(() => { document.getElementById("count").textContent = String(Math.random()); });
    await tick();
    document.body.setAttribute("data-poke", "1");
    await tick();
    expect(warnings().filter((m) => m.includes("<p#count>"))).toHaveLength(1);
    stop();
  });

  test("writes inside no-dirty or editor-ui do not warn", async () => {
    await setBody('<p id="a" clay="no-dirty"></p><div clay="editor-ui"><span id="b"></span></div>');
    const stop = fx(() => {
      document.getElementById("a").textContent = "1";
      document.getElementById("b").setAttribute("title", "x");
    });
    await tick();
    expect(warnings()).toEqual([]);
    stop();
  });

  test("view mode never warns", async () => {
    window.clay.isEditMode = false;
    await setBody('<p id="c"></p>');
    const stop = fx(() => { document.getElementById("c").textContent = "1"; });
    await tick();
    expect(warnings()).toEqual([]);
    stop();
  });

  test("creating an effect inside an effect warns", async () => {
    await setBody("");
    const inner = [];
    const stop = fx(() => { inner.push(fx(() => {})); });
    await tick();
    expect(warnings().some((m) => m.includes("inside another effect"))).toBe(true);
    stop();
    inner.forEach((s) => s());
  });

  test("effect.running is true only while fn runs", async () => {
    await setBody("");
    let seen;
    const stop = fx(() => { seen = effect.running; });
    await tick();
    expect(seen).toBe(true);
    expect(effect.running).toBe(false);
    stop();
  });

  test("an effect re-triggered by its own timer warns about a loop", async () => {
    await setBody('<div id="t"></div>');
    let n = 0;
    const stop = fx(() => {
      if (n++ < 60) setTimeout(() => document.getElementById("t").setAttribute("data-n", String(n)), 0);
    });
    for (let i = 0; i < 70; i++) await new Promise((r) => setTimeout(r, 1));
    await tick();
    expect(warnings().some((m) => m.includes("times in a second"))).toBe(true);
    stop();
  });
});
